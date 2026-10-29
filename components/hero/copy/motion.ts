/**
 * ─── Hero · the words' motion ───
 *
 * Tween, not spring: the words arrive once and stay. ON THE COMPOSITOR
 * (ui/raiseLines.ts), as the scene's own fade is (hero/motion.ts
 * ENTRANCE): they arrive over the scene's first seen frames, which the
 * engine draws on the main thread, and a tween ticked there hitched.
 *
 * Every `at` is seconds after the curtain begins to lift (StageReveal),
 * which is when the scene starts coming up (1.8 s, slow in and out) and its
 * opening shot starts widening off the stone (4.2 s).
 */

import { LINE_ENTRANCE, REVEAL_EASE_CSS } from "@/components/ui/motion";

export const COPY_ENTRANCE = {
  ease: REVEAL_EASE_CSS,
  /* Every line slides up out of its mask: 110%, 1 s (ui/motion.ts). */
  line: LINE_ENTRANCE,

  /* THE STONE FIRST. At 1.2 s the scene is four-fifths up and the camera
   * still craning down: the headline rises as the place settles. Any
   * earlier and white type stands out of a frame still near black, the
   * first thing seen instead of the stone. */
  title: { at: 1.2, stagger: LINE_ENTRANCE.stagger },

  /* The copy follows the headline's first line, not its last (as the
   * intro's support copy does): waiting for both makes two beats of one
   * gesture. */
  lede: { at: 1.45, stagger: 0.08 },

  /* The notes are the frame's chrome: they arrive with the header and the
   * dock (header/motion.ts, 1.6 s), left to right, then down. */
  notes: { at: 1.6, stagger: 0.08 },
} as const;

/** Reduced motion: no travel, a short fade (the scene's own, hero/motion.ts
 *  REDUCED). */
export const COPY_REDUCED = {
  fadeSeconds: 0.4,
} as const;
