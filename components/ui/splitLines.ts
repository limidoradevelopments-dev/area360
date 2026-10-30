/**
 * ─── splitLines ───
 *
 * A paragraph wrapped by its box (not authored line by line) split into
 * the lines the browser broke it into, each in its own reveal mask
 * (data-reveal-mask → data-reveal-line), for the house's masked-line
 * reveal (raiseLines). MEASURED, NOT GUESSED: every word's line is read
 * from the layout as it stands, so the lines are the ones on the screen
 * at this width, in this face.
 *
 * LET GO WHEN DONE: `revert` puts the paragraph's own nodes back (the very
 * ones React made, so it still owns them) and it wraps with its box again.
 * Split, its lines are fixed blocks, right only at the width they were
 * measured at: they exist only while they move.
 *
 * THE PRE-STATE: a paragraph to be split carries data-reveal-lines (empty)
 * and waits unseen until it is (utilities.css): it has no lines yet to
 * hold in their masks. Transparent, not hidden: a screen reader still
 * reads it. Split, it is marked "split"; reverted, "done".
 */

export interface SplitLines {
  /** The lines, top to bottom: each a data-reveal-line in its mask. */
  readonly lines: readonly HTMLElement[];
  /** The paragraph as it was, wrapping with its box. */
  revert(): void;
}

export function splitLines(paragraph: HTMLElement): SplitLines {
  const own = Array.from(paragraph.childNodes);
  const words = (paragraph.textContent ?? "").split(/\s+/).filter(Boolean);

  /* Each word in a span of its own, the spaces between as they were: the
     same wrapping as the text, and a box per word to read its line from. */
  const spans = words.map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    return span;
  });
  paragraph.replaceChildren(...spans.flatMap((span, k) => (k > 0 ? [" ", span] : [span])));

  /* A word that starts lower than the line before it begins a new line.
     Half a line of slack: a word's box sits on its line wherever its
     glyphs reach. */
  const half = Number.parseFloat(getComputedStyle(paragraph).lineHeight) / 2 || 1;
  const rows: string[][] = [];
  let lineTop = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    const top = span.getBoundingClientRect().top;
    if (top > lineTop + half) {
      rows.push([]);
      lineTop = top;
    }
    rows[rows.length - 1].push(span.textContent ?? "");
  }

  const lines = rows.map((row) => {
    const line = document.createElement("span");
    line.setAttribute("data-reveal-line", "");
    line.textContent = row.join(" ");
    return line;
  });
  /* A space between the lines for a reader of the text and for copying;
     between two blocks it takes no room on the screen. */
  paragraph.replaceChildren(
    ...lines.flatMap((line, k) => {
      const mask = document.createElement("span");
      mask.setAttribute("data-reveal-mask", "");
      mask.append(line);
      return k > 0 ? [" ", mask] : [mask];
    }),
  );
  paragraph.setAttribute("data-reveal-lines", "split");

  return {
    lines,
    revert() {
      paragraph.replaceChildren(...own);
      paragraph.setAttribute("data-reveal-lines", "done");
    },
  };
}
