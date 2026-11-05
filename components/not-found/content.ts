/**
 * ─── 404 · the words ───
 *
 * The user's frames (2026-11-05, their 1920 desktop frame and 390 phone
 * frame): the headline, its link home, and the strip of "404 Error" that
 * falls down the page.
 */

export interface LostTitle {
  /** The sentence as a reader hears it: the heading's text. */
  readonly sentence: string;
  /** Its lines as the wide frame breaks it, and as the phone frame does:
   *  each line its own mask (AGENTS.md: a headline's breaks are authored). */
  readonly wide: readonly string[];
  readonly narrow: readonly string[];
}

export const LOST_TITLE: LostTitle = {
  sentence: "It Looks Like You Lost Somewhere You Won’t Have To Stay",
  wide: ["It Looks Like You Lost Somewhere", "You Won’t Have To Stay"],
  narrow: ["It Looks Like You Lost", "Somewhere You Won’t", "Have To Stay"],
};

/** What a reader hears before the headline: the page's state, which the
 *  strip shows only as decoration. */
export const LOST_STATUS = "Error 404: page not found.";

/** Home: a plain link, a whole page load (NotFoundSection). */
export const LOST_LINK = { href: "/", label: "Go back to home" } as const;

/**
 * THE STRIP: the frame's words, line after line, in two columns. As many
 * lines a run as the tallest screen needs to stay covered while it falls
 * one run (a portrait 4K screen's ~70 at its root size): the run is laid
 * twice and slid by exactly one (motion.ts STRIP).
 */
export const LOST_STRIP = { word: "404 Error", lines: 72 } as const;
