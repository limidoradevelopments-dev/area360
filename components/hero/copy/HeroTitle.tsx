import type { ReactNode } from "react";

import RevealLine from "@/components/ui/RevealLine";

import type { HeroTitleLine } from "../content";

/**
 * ─── HeroTitle ───
 *
 * The headline: Cormorant Garamond semibold italic, the whole white, a line
 * to a mask.
 *
 * THE HANG. The frame sets the headline, the copy and the clock on ONE left
 * edge — the copy's axis, column 7 (2 on a phone) — and lets the first
 * line's opening words stand out to the left of it: "Designing The" on the
 * desktop, "Designing" alone on a phone. So those words are not placed by
 * a measure of their own width: each hung word is laid just left of what
 * follows it (copy.css), and "Visceral," lands on the axis at any size, in
 * any face the browser has.
 *
 * Nested, so a breakpoint can let a word back in: the second word wraps
 * the first, and on a phone stands in the line again with the first still
 * hanging off it. The spaces are no-break spaces, kept at a hung word's
 * end, where a plain one would be dropped.
 *
 * Server component: markup and data- hooks only.
 */
export interface HeroTitleProps {
  id: string;
  lines: readonly HeroTitleLine[];
}

const NBSP = " ";

export default function HeroTitle({ id, lines }: HeroTitleProps) {
  return (
    <h1 id={id} data-hero-title>
      {lines.map((line, k) => (
        <RevealLine key={line.text}>
          <Hang words={line.hang} />
          {line.text}
          {/* A space between the lines for a reader of the text; dropped at
              a line's end on the screen. */}
          {k < lines.length - 1 ? " " : null}
        </RevealLine>
      ))}
    </h1>
  );
}

/** ["Designing", "The"] → the second word's span, holding the first's. */
function Hang({ words }: { words: readonly string[] }) {
  return words.reduce<ReactNode>(
    (inner, word, k) => (
      <span data-hero-hang={k + 1}>
        {inner}
        {word}
        {NBSP}
      </span>
    ),
    null,
  );
}
