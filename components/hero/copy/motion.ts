/**
 * ─── Hero · the words' motion ───
 *
 * Tween, not spring: the words arrive once and stay. ON THE COMPOSITOR
 * (ui/raiseLines.ts), as the scene's own fade is (hero/motion.ts
 * ENTRANCE): they arrive over the scene's first seen frames, which the
 * engine draws on the main thread, and a tween ticked there hitched.
 *
 * Every `at` is seconds after the curtain begins to lift (StageReveal);
 * the cues are the page's (ui/stageCues.ts), shared with the header and
 * the dock so the chrome arrives as one.
 */

import { LINE_DROP, REVEAL_EASE_CSS } from "@/components/ui/motion";
import { STAGE_CUES } from "@/components/ui/stageCues";

export const COPY_ENTRANCE = {
  ease: REVEAL_EASE_CSS,
  /* Every line comes DOWN into its mask from above it, 1 s (the user,
   * 2026-10-30: "top to bottom"; ui/motion.ts LINE_DROP). */
  line: LINE_DROP,

  /* THE STONE FIRST, then the headline as the place settles. */
  title: { at: STAGE_CUES.words, stagger: LINE_DROP.stagger },

  /* The copy follows the headline's first line, not its last (as the
   * intro's support copy does): waiting for both makes two beats of one
   * gesture. */
  lede: { at: STAGE_CUES.words + 0.25, stagger: 0.08 },

  /* The notes are the frame's chrome: they arrive with it, near the end of
   * the opening shot, on the copy's row — after the header above them,
   * before the dock below (ui/stageCues.ts) — left to right, then down. */
  notes: { at: STAGE_CUES.chrome.row, stagger: 0.08 },
} as const;

/** Reduced motion: no travel, a short fade (the scene's own, hero/motion.ts
 *  REDUCED). */
export const COPY_REDUCED = {
  fadeSeconds: 0.4,
} as const;
