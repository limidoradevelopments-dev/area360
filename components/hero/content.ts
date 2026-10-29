/**
 * ─── Hero · content ───
 *
 * The words over the scene (the user's frames, 2026-10-30). Lines are
 * authored, not wrapped: each is its own reveal mask, and every break is
 * the frame's — the same on a phone as on the desktop.
 */

export interface HeroTitleLine {
  /** The words that hang out to the left of the copy's axis, in reading
   *  order: the frame hangs both on the desktop, only the first on a phone
   *  (copy/copy.css). */
  readonly hang: readonly string[];
  /** The rest of the line, which stands on the axis. */
  readonly text: string;
}

/** The headline, the section's h1. Its first line hangs: "Visceral,"
 *  stands on the axis over "Not Just The Visible." and the copy, with
 *  "Designing The" out to the left of it. */
export const HERO_TITLE: readonly HeroTitleLine[] = [
  { hang: ["Designing", "The"], text: "Visceral," },
  { hang: [], text: "Not Just The Visible." },
];

/** The copy under the headline. */
export const HERO_LEDE: readonly string[] = [
  "I create digital experiences that",
  "leave a feeling long after the",
  "screen goes dark.",
];

/** The note at the left margin, on the copy's row. */
export const HERO_AVAILABILITY = "Available for Q1 2027";

/** The byline at the right margin. The "&" is held to the word after it,
 *  so a narrow column never leaves it hanging at a line's end. */
export const HERO_BYLINE = {
  role: "A Creative Designer & Developer",
  copyright: "© 2026",
} as const;
