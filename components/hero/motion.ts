/**
 * ─── Hero · motion ───
 *
 * The section's own timings: how the scene arrives over the static paint.
 * Everything inside the scene has its own motion.ts beside its code:
 *
 *   stage/motion.ts        the camera's lean
 *   atmosphere/motion.ts   the air and the fog
 *   water/motion.ts        the lake's surface
 *   weather/motion.ts      the stillness clock
 */

import { REVEAL_EASE_FN } from "@/components/ui/motion";

/**
 * The canvas fades in over the still once its first frame exists. The
 * still IS that frame (HeroStill), so the fade only hands over: what shows
 * is the fog beginning to move. 1.8 s was for fading in over flat grey;
 * over the still it read as waiting. Long enough that a frame a pixel off
 * (an unusual screen shape) is never seen to jump.
 * A placeholder for the phase 5 entrance (white fog, then the stone).
 */
export const ENTRANCE = {
  ease: REVEAL_EASE_FN,
  fadeSeconds: 0.8,
} as const;

/** Reduced motion keeps what the visitor does and drops what the scene does. */
export const REDUCED = {
  fadeSeconds: 0.2,
} as const;
