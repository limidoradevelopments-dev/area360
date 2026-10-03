/**
 * ─── Stage · plates ───
 *
 * Builds every image the set stands on and hands it to the GPU: the backdrop
 * photograph and its depth.
 *
 * The backdrop is built offline (scripts/hero-plates/backdrop.py, `npm run
 * backdrop`) and served from public/hero/backdrop: the photograph as lossy
 * WebP, its depth and shoreline as lossless WebP. Both are fetched and
 * decoded off the main thread (createImageBitmap) while the static paint is
 * up; the depth is unpacked from its bytes once, and each upload yields to
 * the main thread.
 *
 * If the backdrop cannot be fetched or decoded, there is no stage: the
 * static paint stays, rather than a lake with no shore.
 */

import { createBackdrop, createDataTexture } from "./gl";
import { BACKDROP } from "./layers";

export interface Plates {
  /** The photograph, B&W (R8, mipmapped). */
  readonly backdrop: WebGLTexture;
  /** Its inverse depth (red) and land (green), RG16F. */
  readonly depth: WebGLTexture;
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
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
  const out = new Float32Array(width * height * 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 2) {
    out[j] = (bytes[i] * 256 + bytes[i + 1]) / 65535;
    out[j + 1] = bytes[i + 2] / 255;
  }
  return out;
}

export async function buildPlates(gl: WebGL2RenderingContext, alive: () => boolean): Promise<Plates | null> {
  let photo: ImageBitmap;
  let depthMap: ImageBitmap;
  try {
    [photo, depthMap] = await Promise.all([loadBitmap(BACKDROP.plateUrl), loadBitmap(BACKDROP.depthUrl)]);
  } catch (error) {
    console.warn(error);
    return null;
  }
  const close = () => {
    photo.close();
    depthMap.close();
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
  close();
  await yieldToMain();
  if (!alive()) {
    gl.deleteTexture(backdrop);
    gl.deleteTexture(depth);
    return null;
  }
  return { backdrop, depth };
}
