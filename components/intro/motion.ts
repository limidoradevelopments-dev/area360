/**
 * ─── Intro · motion ───
 *
 * Every duration, delay and threshold for this feature, with the reason for
 * each. Nothing in a component file is a magic number.
 *
 * Tween, not spring: every motion here has a fixed job — reveal once and
 * arrive. Nothing can be retargeted mid-flight, so GSAP is the right tool.
 */

import { CARD_ENTRANCE, LINE_ENTRANCE, REVEAL_EASE_FN } from "@/components/ui/motion";

/** How much of the section must be on screen before the entrance fires. */
export const INTRO_THRESHOLD = 0.2;

export const INTRO_MOTION = {
  ease: REVEAL_EASE_FN,

  /* Headline lines slide up out of their masks, one line after another. */
  line: LINE_ENTRANCE,

  /* The eyebrow and body follow the headline's first line rather than its
   * last: waiting for the whole headline makes two beats out of one gesture.
   * 0.25s is the point where line one is mostly up. */
  supportDelay: 0.25,
  supportSeconds: 0.8,
  supportLiftRem: 0.75,

  /* Cards start as the body lands, so the eye travels headline → body →
   * cards, left to right across the grid. */
  cardDelay: 0.45,
  card: CARD_ENTRANCE,
} as const;

/** Reduced motion keeps the arrival but drops travel, scale and blur. */
export const INTRO_REDUCED = {
  seconds: 0.2,
} as const;
