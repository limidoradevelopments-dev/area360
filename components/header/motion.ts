/**
 * ─── Header · motion ───
 *
 * Tween, not spring: the header arrives once and stays. On the compositor
 * (ui/raiseLines.ts): it arrives over the hero's first seen frames, the
 * main thread's busiest.
 */

import { LINE_DROP, REVEAL_EASE_CSS, WIPE_EASE_CSS } from "@/components/ui/motion";
import { STAGE_CUES } from "@/components/ui/stageCues";

export const HEADER_ENTRANCE = {
  ease: REVEAL_EASE_CSS,
  /* The line comes DOWN into its mask from above it (the user,
   * 2026-10-30: "top to bottom"; ui/motion.ts LINE_DROP). */
  line: LINE_DROP,

  /* THE CHROME WAITS FOR THE SHOT. Seconds after the curtain begins to lift
   * (StageReveal): the stone first, the statement as the place settles,
   * and near the end of the opening shot the frame's chrome
   * (ui/stageCues.ts). The contact stands at the far right of the top row,
   * so it comes as the end of the row's wavefront does (hero/copy/motion.ts
   * `band`: its 0.24 s across the lists and the place, and a little more
   * for the columns past them). */
  at: STAGE_CUES.chrome.top + 0.3,

  /* THE RULE UNDER IT is drawn in from the left with the house's wipe once
   * the word is most of the way down: the line underlines what has
   * arrived, never an empty place. */
  rule: { after: 0.5, seconds: 0.9, ease: WIPE_EASE_CSS },
} as const;

/** Reduced motion: no travel, a short fade (the scene's own, hero/motion.ts
 *  REDUCED). The rule fades in with the word. */
export const HEADER_REDUCED = {
  fadeSeconds: 0.4,
} as const;
