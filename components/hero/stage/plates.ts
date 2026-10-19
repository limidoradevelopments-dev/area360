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
  /** The low mist's veil (R8, mipmapped), or none. */
  readonly mist: WebGLTexture | null;
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function loadBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`stage: ${url} (${response.status})`);
  /* Decoded exactly as stored: the depth is data, and the photograph's
     print values are undone by the film, not by the browser. */
  return createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
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
  if (plates.mist) gl.deleteTexture(plates.mist);
}

/**
 * `alive`: false once the stage is gone; `signal` cancels the downloads.
 * Whatever was decoded is closed on every way out, so no bitmap outlives
 * the build — one image failing no longer leaves the other decoded and
 * held.
 */
export async function buildPlates(gl: WebGL2RenderingContext, alive: () => boolean, signal?: AbortSignal): Promise<Plates | null> {
  const settled = await Promise.allSettled([
    loadBitmap(BACKDROP.plateUrl, signal),
    loadBitmap(BACKDROP.depthUrl, signal),
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
  /* One channel, mipmapped, as the photograph is. */
  const mist = veil ? createBackdrop(gl, veil) : null;
  close();
  await yieldToMain();
  if (!alive()) {
    gl.deleteTexture(backdrop);
    gl.deleteTexture(depth);
    if (mist) gl.deleteTexture(mist);
    return null;
  }
  return { backdrop, depth, mist };
}
