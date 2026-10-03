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
 * The canvas fades in over the static paint once its first frame exists.
 * A placeholder for the phase 5 entrance (white fog, then the stone).
 */
export const ENTRANCE = {
  ease: REVEAL_EASE_FN,
  fadeSeconds: 1.8,
} as const;

/** Reduced motion keeps what the visitor does and drops what the scene does. */
export const REDUCED = {
  fadeSeconds: 0.2,
} as const;
