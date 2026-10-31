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
  /* Every line comes DOWN into its mask from above it (the user,
   * 2026-10-30: "top to bottom"; ui/motion.ts LINE_DROP). */
  line: LINE_DROP,

  /* THE CHROME WAITS FOR THE SHOT. Seconds after the curtain begins to lift
   * (StageReveal): the stone first, the headline and copy as the place
   * settles, and near the end of the opening shot the frame's chrome, down
   * the page — the header first, at its top (ui/stageCues.ts). */
  at: STAGE_CUES.chrome.top,

  /* In reading order across the grid: the mark, the clock and its zone,
   * then the nav down its rule. Tighter than a headline's 0.1: seven small
   * lines at 0.1 would still be arriving after the dock at the foot. */
  stagger: 0.06,
} as const;

/** Reduced motion: no travel, a short fade (the scene's own, hero/motion.ts
 *  REDUCED). The rule fades in with the words; the scroll cue never runs. */
export const HEADER_REDUCED = {
  fadeSeconds: 0.4,
} as const;

/**
 * THE RULE AND ITS SCROLL CUE (scrollCue.ts, header.css).
 *
 * THE DRAW: the rule comes down from its top as the nav's words come down
 * into their masks — from the first word's cue until the last word lands
 * (SiteHeader reads both off the words' own cues), on the reveal curve: the
 * curtain's axis draws in exactly so (preloader/motion.ts ENTRANCE).
 *
 * THE CUE: a soft gap runs down the line, top to bottom, on the WIPE curve
 * — the curtain's exit gesture, held back, drawn through the middle, a
 * short tail — so it reads as a pull downward, not a bounce. Not on a
 * metronome: ON THE CURTAIN'S OWN PULSE (preloader/motion.ts RHYTHM), its
 * steady bottom word's two changes a loop (at 120 and 1440 ms of 2000),
 * stretched as the curtain stretches it (×7 ÷ its PACE 1.5): 6.16 s, then
 * 3.17 s, then 6.16 s… The page keeps the curtain's heartbeat after it has
 * gone. A golden-ratio swing of a few per cent on each interval keeps it
 * from ever coming round the same (AGENTS.md: ambient loops never repeat).
 */
export const SCROLL_CUE = {
  draw: { ease: REVEAL_EASE_CSS },
  run: { seconds: 1.8, ease: WIPE_EASE_CSS },
  /* The rule is seen whole, drawn and still, this long before its first
   * cue: a line that starts moving the moment it lands reads as loading. */
  lead: 1.2,
  /* Seconds from one cue's start to the next, in turn. Each is longer than
   * a run, so one gap is down the line before the next begins. */
  beats: [6.16, 3.17],
  swing: 0.06,
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
