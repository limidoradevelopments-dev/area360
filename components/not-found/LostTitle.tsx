import RevealLine from "@/components/ui/RevealLine";

import { LOST_STATUS, type LostTitle as Title } from "./content";

/**
 * ─── LostTitle ───
 *
 * The headline: Cormorant Garamond semibold italic, the whole white, a line
 * to a mask. The frames break it differently (two lines wide, three on a
 * phone), so both breaks are laid and the stylesheet shows one
 * (not-found.css); a reader hears neither — the heading's text is the page's
 * state and the sentence, once.
 *
 * Server component: markup and data- hooks only.
 */
export default function LostTitle({ id, title }: { id: string; title: Title }) {
  return (
    <h1 id={id} data-lost-title>
      <span className="sr-only">
        {LOST_STATUS} {title.sentence}
      </span>
      <span data-lost-lines="wide" aria-hidden="true">
        {title.wide.map((line) => (
          <RevealLine key={line}>{line}</RevealLine>
        ))}
      </span>
      <span data-lost-lines="narrow" aria-hidden="true">
        {title.narrow.map((line) => (
          <RevealLine key={line}>{line}</RevealLine>
        ))}
      </span>
    </h1>
  );
}
