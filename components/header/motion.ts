/**
 * ─── Header · motion ───
 *
 * Tween, not spring: the header arrives once and stays. On the compositor
 * (ui/raiseLines.ts): it arrives over the hero's first seen frames, the
 * main thread's busiest.
 */

import { LINE_ENTRANCE, REVEAL_EASE_CSS } from "@/components/ui/motion";

export const HEADER_ENTRANCE = {
  ease: REVEAL_EASE_CSS,
  line: LINE_ENTRANCE,

  /* THE CHROME WAITS FOR THE SCENE, AND ARRIVES WITH THE DOCK. Seconds after
   * the curtain begins to lift (StageReveal): the stone is seen first, then
   * the headline (hero/copy/motion.ts, 1.2 s), then the frame's chrome —
   * the header, the hero's notes and the settings dock's button
   * (settings/motion.ts enterDelay, 1.6 s) together, while the opening shot
   * is still widening. */
  at: 1.6,

  /* In reading order across the grid: the mark, the clock and its zone,
   * then the nav down its rule. Tighter than a headline's 0.1: seven small
   * lines at 0.1 would still be arriving a second after the dock. */
  stagger: 0.06,
} as const;

/** Reduced motion: no travel, a short fade (the scene's own, hero/motion.ts
 *  REDUCED). */
export const HEADER_REDUCED = {
  fadeSeconds: 0.4,
} as const;

/**
 * THE CLOCK TICKS ON THE SECOND, NOT EVERY 1000 ms: each tick is set for
 * the next whole second, a few ms late so it never lands just before it
 * and shows the same second twice. An interval drifts off the second and
 * then skips one.
 */
export const CLOCK = {
  lateMs: 15,
} as const;
