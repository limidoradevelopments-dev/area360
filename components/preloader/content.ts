/**
 * ─── Preloader · content ───
 *
 * The words, and the six places the user's frame sets them in.
 */

/** The three words the preloader turns over. */
export const PRELOADER_WORDS = ["Designing", "Meaningful", "Perfection"] as const;

export type PreloaderSlotId = "a" | "b" | "c" | "d" | "e" | "f";

export interface PreloaderSlot {
  id: PreloaderSlotId;
  /** The word it holds in the frame: an index into PRELOADER_WORDS. */
  word: number;
  /** One of the frame's faint words: further off, so it surfaces and
   *  sinks more slowly. */
  far: boolean;
}

/**
 * The places, top to bottom as the frame sets them beside the axis. Where
 * each stands, its size, face, tracking and grey are the stylesheet's
 * (preloader.css), keyed by id.
 */
export const PRELOADER_SLOTS: readonly PreloaderSlot[] = [
  /* Meaningful, italic, turned to read downward and mirrored (a
   * reflection): as large as the largest, a fifth of the ink (the user's
   * mock, 2026-10-23). */
  { id: "f", word: 1, far: true },
  /* Perfection, italic, the frame's largest. */
  { id: "a", word: 2, far: false },
  /* Meaningful, italic, small, hung off the line above's end. */
  { id: "b", word: 1, far: false },
  /* Designing, upright. */
  { id: "c", word: 0, far: false },
  /* Meaningful, italic, a fifth of the ink: the echo under it. */
  { id: "d", word: 1, far: true },
  /* Perfection, upright, against the axis. */
  { id: "e", word: 2, far: false },
];

/** What the count is, for assistive technology. */
export const PRELOADER_LABEL = "Loading";

/** The count as the frame sets it: the figure, a space that never breaks,
 *  the sign. */
export const formatCount = (percent: number) => `${percent} %`;
