/**
 * ─── Hero · the words' motion ───
 *
 * Tween, not spring: the words arrive once and stay. ON THE COMPOSITOR
 * (ui/raiseLines.ts), as the scene's own fade is (hero/motion.ts
 * ENTRANCE): they arrive over the scene's first seen frames, which the
 * engine draws on the main thread, and a tween ticked there hitched.
 *
 * Every `at` is seconds after the curtain begins to lift (StageReveal);
 * the cues are the page's (ui/stageCues.ts), shared with the header so the
 * chrome arrives as one.
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

  /* The words under it follow the headline's first line, not its last:
   * waiting for both makes two beats of one gesture. */
  lede: { at: STAGE_CUES.words + 0.25, stagger: 0.08 },

  /* THE LISTS AND THE PLACE are the frame's chrome: they arrive with the
   * header's contact, near the end of the opening shot, as one WAVEFRONT
   * from their top left (AGENTS.md: reveals ordered by geometry, not by
   * the DOM) — down the lines at `down` seconds a line of the reader (a
   * rem), and across the band at `across` seconds over its whole width. So
   * on a desktop the three blocks' first lines fall almost together, left
   * to right, and each list runs down; on a phone, stacked, the blocks
   * come one after another. A rem, not a px: the reader holds where the
   * screen narrows, and the pace of a list must hold with it. */
  band: { at: STAGE_CUES.chrome.top, down: 0.05, across: 0.24 },

  /* The foot, last: the mark and the byline at the bottom of the frame. */
  foot: { at: STAGE_CUES.chrome.foot, down: 0.05, across: 0.24 },
} as const;

/** Reduced motion: no travel, a short fade (the scene's own, hero/motion.ts
 *  REDUCED). */
export const COPY_REDUCED = {
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
  /* How far off the screen the clock starts ticking again (an
     IntersectionObserver rootMargin): a quarter of the screen above and
     below, so a scroll back up has written the time before the box is
     seen. Any less and a fast flick could draw one frame of a stale
     time; the cost of more is ticks no one sees. */
  wakeMargin: "25% 0px",
} as const;
