/**
 * ─── 404 · how the camera frames the ruin ───
 *
 * EXACTLY AS THE HERO FRAMES ITS STONE (2026-11-05, the user: "exactly hero
 * section placements, its sizing and everything"): the hero's lens and
 * axis on every screen — its close-in on a wide one, its phone crop on an
 * upright one (hero/stage/camera.ts focalPx, frameCenter). The broken
 * stone stands where the whole one stands, the same size, to the pixel.
 */

import { focalPx, frameCenter } from "@/components/hero/stage/camera";

export interface LostFraming {
  /** The lens at rest (CSS px). */
  focal: number;
  /** Where its axis meets the frame (uv, y up). */
  center: [number, number];
}

/** The lens and the axis for a frame `width × height` (CSS px), into `out`. */
export function lostFraming(width: number, height: number, out: LostFraming): LostFraming {
  out.focal = focalPx(width, height);
  frameCenter(width, height, out.focal, out.center);
  return out;
}
