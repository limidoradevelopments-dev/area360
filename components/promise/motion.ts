/**
 * ─── Promise · motion ───
 *
 * The passages' entrance (2026-10-30, the user: "a one-time appear
 * animation, just like the hero's text, top to bottom"): every line comes
 * DOWN into its mask from above, as the hero's do (ui/motion.ts
 * LINE_DROP), once, as its passage comes into view.
 *
 * ON THE COMPOSITOR (ui/raiseLines.ts), as the hero's words are: the
 * passage above arrives while the hero's scene is still drawing on the
 * main thread behind it (the descent), and a tween ticked there would
 * hitch with its frames.
 *
 * Tween, not spring: the lines arrive once and stay.
 */

import { LINE_DROP, REVEAL_EASE_CSS } from "@/components/ui/motion";

export const PROMISE_REVEAL = {
  /* How much of a passage is on screen before its lines fall: a third.
   * The passage above then comes in while the dark rises over the hero's
   * scene, its first lines clear of the screen's foot. */
  threshold: 0.35,
  ease: REVEAL_EASE_CSS,
  /* 1 s a line, from a line above its mask: the hero's. */
  line: LINE_DROP,
  /* Down the passage, line after line through both its paragraphs: the
   * hero's copy's stagger. */
  stagger: 0.08,
} as const;

/** Reduced motion: no travel, a short fade (the hero's words' own). */
export const PROMISE_REDUCED = {
  fadeSeconds: 0.4,
} as const;
