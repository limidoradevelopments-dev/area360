/**
 * ─── 404 · the page's entrance and its strip ───
 *
 * The page opens on the site's black (the curtain's #111111, the hero's
 * ground), and the ruin comes up out of it as the hero's scene does; then
 * the words come DOWN into their masks, as every word over the hero does
 * (ui/motion.ts LINE_DROP), and the strip of "404 Error" fades in already
 * falling.
 *
 * ALL OF IT ON THE COMPOSITOR (Web Animations on transform and opacity):
 * the page's one script-driven thing is the scene's frame loop.
 */

import { LINE_DROP, REVEAL_EASE_CSS } from "@/components/ui/motion";

export const ENTRANCE = {
  /**
   * THE SCENE: up out of the black over 1.6 s, slow in and slow out (the
   * hero's 1.8 s, a little shorter: there is no curtain before it here).
   */
  scene: { seconds: 1.6, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },

  /**
   * IF THE SCENE IS LATE (a slow device still compiling, or none at all),
   * the words do not wait for it past this (s from the page's start): the
   * page's one job is the way home, readable at once.
   */
  wait: 1.2,

  /** Every line drops into its mask, as over the hero. */
  line: { ...LINE_DROP, easing: REVEAL_EASE_CSS },

  /** The headline as the place settles (s after the scene begins), its
   *  link a beat after the headline's last line. */
  title: { at: 0.55, stagger: LINE_DROP.stagger },
  link: { after: 0.2 },

  /** The strip: fading in with the headline, over this long (s). */
  strip: { at: 0.75, seconds: 1.4 },
} as const;

/**
 * THE STRIP FALLS one line every `secondsPerLine` (the user: "slowly moving
 * down like a strip"): ~15 px a second at the frame's size — slow enough to
 * read as drift, never as scrolling. A run of lines falls in the run's
 * length of seconds and the strip starts again on the copy laid above it,
 * the same picture: no seam, no end.
 */
export const STRIP = {
  secondsPerLine: 2.5,
} as const;

/** Reduced motion (when the page is asked to respect it): no travel, a
 *  short fade; the strip stands. */
export const REDUCED = { fadeSeconds: 0.4 } as const;
