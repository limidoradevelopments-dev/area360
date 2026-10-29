/**
 * ─── Stage · plates ───
 *
 * Builds every image the set stands on and hands it to the GPU: the backdrop
 * photograph and its depth, and the low mist's veil (atmosphere/optics.ts
 * MIST, built by scripts/hero-plates/mist.py, `npm run mist`).
 *
 * The backdrop is built offline (scripts/hero-plates/backdrop.py, `npm run
 * backdrop`) and served from public/hero/backdrop: the photograph as lossy
 * WebP, its depth and shoreline as lossless WebP. Both are fetched and
 * decoded off the main thread (createImageBitmap) while the static paint is
 * up; the depth is unpacked from its bytes once, and each upload yields to
 * the main thread.
 *
 * If the backdrop cannot be fetched or decoded, there is no stage: the
 * static paint stays, rather than a lake with no shore. If only the mist's
 * veil cannot, the stage runs without it.
 */

import { MIST } from "../atmosphere/optics";
import { createBackdrop, createDataTexture } from "./gl";
import { BACKDROP } from "./layers";

export interface Plates {
  /** The photograph, B&W (R8, mipmapped). */
  readonly backdrop: WebGLTexture;
  /** Its inverse depth (red) and land (green), RG16F. */
  readonly depth: WebGLTexture;
  /** Where land nearer than the sky stands, per column (createSkyBand). */
  readonly skyBand: WebGLTexture;
  /** The low mist's veil (R8, mipmapped), or none. */
  readonly mist: WebGLTexture | null;
}

/**
 * THE LAKE'S SHORTCUT TO THE SKY (water/shaders/lake.ts reachesSky,
 * 2026-10-29). Per column of the depth map, the rows where a reflected ray
 * could meet land nearer than the sky: every texel nearer than `SKY_LIKE`
 * metres — the trees and banks stand within ~250 m; the far bank's smudge
 * shares the sky's depth, ~890 — widened a texel each way, for the
 * bilinear read. A ray whose image on the photograph crosses none of those
 * rows can only meet the sky, so the lake meets it there without its march
 * (~44 dependent reads a pixel). Kept as a 1D pyramid, the rows' top and
 * bottom over 2^L columns at level L, so any span of columns is two reads.
 */
const SKY_LIKE = 850;

function createSkyBand(gl: WebGL2RenderingContext, data: Float32Array, width: number, height: number): WebGLTexture {
  /* The depth map holds near/z: a texel is nearer than SKY_LIKE past this. */
  const nearer = BACKDROP.depthNear / SKY_LIKE;
  const top = new Float32Array(width).fill(1e9);
  const bottom = new Float32Array(width).fill(-1e9);
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 2;
    for (let x = 0; x < width; x += 1) {
      if (data[row + 2 * x] > nearer) {
        if (y < top[x]) top[x] = y;
        bottom[x] = y;
      }
    }
  }
  /* Widened a texel each way, padded to a power of two with empty columns. */
  let size = 1;
  while (size < width) size *= 2;
  let level = new Float32Array(size * 2);
  for (let x = 0; x < size; x += 1) {
    let t = 1e9;
    let b = -1e9;
    for (let n = Math.max(0, x - 1); n <= Math.min(width - 1, x + 1); n += 1) {
      t = Math.min(t, top[n]);
      b = Math.max(b, bottom[n]);
    }
    level[2 * x] = t - 1;
    level[2 * x + 1] = b + 1;
  }
  const tex = gl.createTexture();
  if (!tex) throw new Error("stage: sky band allocation failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  for (let l = 0, w = size; ; l += 1, w /= 2) {
    gl.texImage2D(gl.TEXTURE_2D, l, gl.RG32F, w, 1, 0, gl.RG, gl.FLOAT, level);
    if (w === 1) break;
    const next = new Float32Array(w);
    for (let x = 0; x < w / 2; x += 1) {
      next[2 * x] = Math.min(level[4 * x], level[4 * x + 2]);
      next[2 * x + 1] = Math.max(level[4 * x + 1], level[4 * x + 3]);
    }
    level = next;
  }
  /* Read with texelFetch only; NEAREST, so a 32-bit float texture is
     complete without being filterable. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function loadBitmap(url: string, signal?: AbortSignal, onBytes?: (fraction: number) => void): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`stage: ${url} (${response.status})`);
  /* Read in chunks where its length is known, for the page's loading
     count; the same bytes as the whole body at once. */
  const total = Number(response.headers.get("content-length")) || 0;
  let blob: Blob;
  if (onBytes && total > 0 && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onBytes(Math.min(loaded / total, 1));
    }
    blob = new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
  } else {
    blob = await response.blob();
  }
  onBytes?.(1);
  /* Decoded exactly as stored: the depth is data, and the photograph's
     print values are undone by the film, not by the browser. */
  return createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
}

/**
 * The depth map's bytes → floats: red and green are a 16-bit inverse depth
 * (high byte first), blue is land. Read back through a 2D canvas, which
 * leaves an opaque, untagged image's bytes as they are.
 */
function unpackDepth(bitmap: ImageBitmap): Float32Array {
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("stage: no 2D context to unpack the depth");
  ctx.drawImage(bitmap, 0, 0);
  const bytes = ctx.getImageData(0, 0, width, height).data;
  /* Its backing store (the whole depth map, read-back friendly) is let go
     now, not whenever the collector reaches the element. */
  canvas.width = canvas.height = 0;
  const out = new Float32Array(width * height * 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 2) {
    out[j] = (bytes[i] * 256 + bytes[i + 1]) / 65535;
    out[j + 1] = bytes[i + 2] / 255;
  }
  return out;
}

/** Lets the plates' textures go. */
export function deletePlates(gl: WebGL2RenderingContext, plates: Plates): void {
  gl.deleteTexture(plates.backdrop);
  gl.deleteTexture(plates.depth);
  gl.deleteTexture(plates.skyBand);
  if (plates.mist) gl.deleteTexture(plates.mist);
}

/**
 * `alive`: false once the stage is gone; `signal` cancels the downloads.
 * Whatever was decoded is closed on every way out, so no bitmap outlives
 * the build — one image failing no longer leaves the other decoded and
 * held.
 */
export async function buildPlates(
  gl: WebGL2RenderingContext,
  alive: () => boolean,
  signal?: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<Plates | null> {
  /* The two downloads' shares, the photograph the larger (~3:1 by bytes). */
  const got = [0, 0];
  const share = (i: number) => (f: number) => {
    got[i] = f;
    onProgress?.(0.75 * got[0] + 0.25 * got[1]);
  };
  const settled = await Promise.allSettled([
    loadBitmap(BACKDROP.plateUrl, signal, share(0)),
    loadBitmap(BACKDROP.depthUrl, signal, share(1)),
    /* Not fetched while the low mist is off (MIST.on). */
    MIST.on
      ? loadBitmap(MIST.url, signal).catch((error: unknown) => {
          if (!signal?.aborted) console.warn(error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const [photoResult, depthResult, veilResult] = settled;
  if (photoResult.status !== "fulfilled" || depthResult.status !== "fulfilled") {
    for (const r of settled) if (r.status === "fulfilled") r.value?.close();
    const failure = photoResult.status === "rejected" ? photoResult.reason : depthResult.status === "rejected" ? depthResult.reason : null;
    if (!signal?.aborted) console.warn(failure);
    return null;
  }
  const photo = photoResult.value;
  const depthMap = depthResult.value;
  const veil = veilResult.status === "fulfilled" ? veilResult.value : null;
  const close = () => {
    photo.close();
    depthMap.close();
    veil?.close();
  };
  await yieldToMain();
  if (!alive()) {
    close();
    return null;
  }
  const depthData = unpackDepth(depthMap);
  await yieldToMain();
  if (!alive()) {
    close();
    return null;
  }
  const backdrop = createBackdrop(gl, photo);
  const depth = createDataTexture(gl, depthData, depthMap.width, depthMap.height);
  const skyBand = createSkyBand(gl, depthData, depthMap.width, depthMap.height);
  /* One channel, mipmapped, as the photograph is. */
  const mist = veil ? createBackdrop(gl, veil) : null;
  close();
  await yieldToMain();
  if (!alive()) {
    gl.deleteTexture(backdrop);
    gl.deleteTexture(depth);
    gl.deleteTexture(skyBand);
    if (mist) gl.deleteTexture(mist);
    return null;
  }
  return { backdrop, depth, skyBand, mist };
}
