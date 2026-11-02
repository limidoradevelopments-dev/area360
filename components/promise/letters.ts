/**
 * ─── Promise · the passages' letters ───
 *
 * A passage's paragraphs split into a span a letter (data-promise-letter),
 * so each can be let go of the moment it leaves its line: the scroll hides
 * a letter (data-gone) in the same frame the canvas starts drawing it.
 * The spaces stay text between them, so the paragraph wraps exactly as it
 * did: a line can only break where its text could.
 *
 * THE COPY STAYS THE COPY: a gone letter is transparent, not removed nor
 * hidden from the accessibility tree, so the passage is read, found and
 * copied as it is.
 *
 * Measured where they stand, relative to the section: each letter's box,
 * the line it is on, and its word.
 */

export interface PassageLetters {
  /** Every letter (not the spaces), in reading order through the
   *  passage's paragraphs. */
  readonly spans: readonly HTMLElement[];
  readonly chars: readonly string[];
  /** Which paragraph each letter is in. */
  readonly paragraph: readonly number[];
  /** The passage's words, as indices into its letters. */
  readonly words: readonly (readonly number[])[];
  readonly paragraphs: readonly HTMLElement[];
  /** Puts each paragraph's own text back. */
  restore(): void;
}

export function splitLetters(passage: HTMLElement): PassageLetters {
  const paragraphs = Array.from(passage.querySelectorAll<HTMLElement>("[data-promise-text]"));
  const spans: HTMLElement[] = [];
  const chars: string[] = [];
  const paragraph: number[] = [];
  const words: number[][] = [];
  const own = paragraphs.map((p) => Array.from(p.childNodes));

  paragraphs.forEach((p, index) => {
    const text = (p.textContent ?? "").trim();
    const nodes: Node[] = [];
    text.split(/\s+/).forEach((word, w) => {
      if (w > 0) nodes.push(document.createTextNode(" "));
      const letters: number[] = [];
      /* By code point: a letter outside the BMP is one letter. */
      for (const char of word) {
        const span = document.createElement("span");
        span.setAttribute("data-promise-letter", "");
        span.textContent = char;
        letters.push(spans.length);
        spans.push(span);
        chars.push(char);
        paragraph.push(index);
        nodes.push(span);
      }
      words.push(letters);
    });
    p.replaceChildren(...nodes);
  });

  return {
    spans,
    chars,
    paragraph,
    words,
    paragraphs,
    restore() {
      paragraphs.forEach((p, index) => p.replaceChildren(...own[index]));
    },
  };
}

/** A letter's box where it stands, CSS px from the section's top left. */
export interface LetterBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Every letter's box, read in one layout. */
export function measureLetters(letters: PassageLetters, section: HTMLElement): LetterBox[] {
  const origin = section.getBoundingClientRect();
  return letters.spans.map((span) => {
    const box = span.getBoundingClientRect();
    return { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height };
  });
}

/** The lines a passage's letters stand on: each letter's line (0 at the
 *  top), by its box's top (half a line of slack, as splitLines reads
 *  them), and each line's top. */
export function linesOf(boxes: readonly LetterBox[]): { line: number[]; tops: number[] } {
  const line: number[] = [];
  const tops: number[] = [];
  for (const box of boxes) {
    const last = tops.length - 1;
    if (last < 0 || box.top > tops[last] + box.height / 2) tops.push(box.top);
    line.push(tops.length - 1);
  }
  return { line, tops };
}
