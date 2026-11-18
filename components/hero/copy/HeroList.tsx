import RevealLine from "@/components/ui/RevealLine";

import type { HeroLink } from "../content";

/**
 * ─── HeroList ───
 *
 * A short numbered list under its label, in the supporting voice: what the
 * work is ("Specialized") or where else it is ("Social"). Each item a line
 * to a mask, its roman numeral in a column of its own so the words stand on
 * one edge whatever the numeral's width (copy.css).
 *
 * The numerals are the list's look, not its words: an ordered list already
 * says its order to a reader, so they are hidden from one. A link takes the
 * whole line, its mask INSIDE it: the mask clips the words, never the
 * link, so the link's widened press area stays whole (copy.css). Links
 * leave the site, so they open beside it, and say so to a reader; each is
 * the same person's own profile elsewhere, so it says that too (rel "me",
 * the web's identity link, as the structured data's sameAs does).
 *
 * Server component: markup and data- hooks only.
 */
export interface HeroListProps {
  /** Its place on the grid (copy.css), and its label's id: hero-<name>. */
  name: string;
  label: string;
  /** Plain words, or links. */
  items: readonly (string | HeroLink)[];
  /** A list of links is a nav. */
  nav?: boolean;
}

export default function HeroList({ name, label, items, nav = false }: HeroListProps) {
  const Root = nav ? "nav" : "div";
  const id = `hero-${name}`;
  return (
    <Root aria-labelledby={id} data-hero-list={name}>
      <p id={id} data-hero-list-label>
        <RevealLine>{label}</RevealLine>
      </p>
      <ol>
        {items.map((item, k) => {
          const line = (
            <RevealLine>
              <span data-hero-numeral aria-hidden="true">
                {roman(k + 1)}.
              </span>
              <span>{typeof item === "string" ? item : item.label}</span>
            </RevealLine>
          );
          return (
            <li key={typeof item === "string" ? item : item.href}>
              {typeof item === "string" ? (
                line
              ) : (
                <a href={item.href} target="_blank" rel="me noopener" data-hero-link>
                  {line}
                  <span className="sr-only">, opens in a new tab</span>
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </Root>
  );
}

const ROMAN: readonly [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** 1 → "I", 4 → "IV", 12 → "XII": enough for any list this short. */
function roman(n: number): string {
  let out = "";
  for (const [value, numeral] of ROMAN) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}
