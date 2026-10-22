/**
 * ─── Hero · motion ───
 *
 * The section's own timings: how the scene arrives out of its ground (the
 * preloader's #111111).
 * Everything inside the scene has its own motion.ts beside its code:
 *
 *   stage/motion.ts        the camera's lean, and its arrival
 *   atmosphere/motion.ts   the air and the fog, and the arrival's air
 *   water/motion.ts        the lake's surface
 *   weather/motion.ts      the stillness clock, the rain
 */

import { cubicBezier } from "@/components/ui/easing";

/**
 * THE SCENE COMES UP OUT OF THE GROUND (2026-10-20, the user: no static
 * picture first — dark until it is ready, then the scene, moving). The
 * canvas fades in over the ground once its first frame exists and the
 * preloader has begun to lift (StageReveal), while the camera
 * settles into place (stage/motion.ts ARRIVAL, 3 s) and the air rolls
 * (atmosphere/motion.ts ARRIVAL_AIR).
 *
 * SLOW TO START, SLOW TO LAND: the camera moves fastest in its first half
 * second, where the photograph of the shores smears a little at its edges
 * as it warps; the fade keeps the frame dark there and gives it light as
 * the camera slows. An even sine-like in-out over `fadeSeconds`, ending
 * before the camera does, so the last of the settling is seen in full
 * light — the motion that says it is a place, not a picture.
 */
export const ENTRANCE = {
  ease: cubicBezier(0.45, 0, 0.4, 1),
  fadeSeconds: 1.8,
} as const;

/** Reduced motion keeps what the visitor does and drops what the scene does:
 *  no camera arrival, and a short fade. */
export const REDUCED = {
  fadeSeconds: 0.4,
} as const;
