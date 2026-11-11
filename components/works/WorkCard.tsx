import { workHref, type Work, type WorkSpan } from "./content";

/**
 * ─── WorkCard ───
 *
 * One work: its numeral over its picture — ( I ), ( II ), ( III ), as a
 * book numbers its plates (the user's frame, 2026-11-11) — its picture in
 * its frame (in black and white, whatever its own colours), its name, its
 * scope under it — the picture and the words a link to the work's page.
 *
 * THREE ROWS OF THE SECTION'S GRID (a subgrid, works.css): the numerals of
 * a row share one track, its pictures another, its words a third, so a
 * row lines up whatever its words wrap to.
 *
 * THE FRAME IS THE GLASS, THE DEPTH LAYER WHAT IS BEHIND IT. The frame
 * clips; the layer inside it is taller by the parallax's travel and moved
 * by the scroll on the compositor (works.css, THE DEPTH); the breath's
 * canvas is laid in the frame, over it, while the hand is there
 * (breath.ts). Without a picture the frame is the frame's empty card.
 *
 * A PLAIN LINK, A WHOLE PAGE LOAD (as the 404's way home): the work's page
 * is a fresh document with its own entrance, and the way back to the home
 * page must be one too — its first screen is built for a fresh document.
 *
 * NO HOVER STYLE (the user, 2026-11-06): the breath is the card's answer
 * to the hand.
 *
 * Server component: markup and data- hooks only.
 */
export interface WorkCardProps {
  work: Work;
  span: WorkSpan;
  /** Its numeral, in Roman figures (content.ts numeralOf). */
  numeral: string;
}

export default function WorkCard({ work, span, numeral }: WorkCardProps) {
  const { cover } = work;
  return (
    <article data-work={span}>
      {/* The plate's number: an ornament of the order the grid already
          shows, hidden from a reader of the page. Its spaces never break. */}
      <span data-work-numeral aria-hidden="true">
        {`( ${numeral} )`}
      </span>
      <a href={workHref(work)} data-work-link>
        <div data-work-media>
          <div data-work-depth>
            {cover ? (
              /* A static export: nothing to optimise; the box is reserved
                 by the frame, the picture only fills it. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img data-work-image src={cover.src} alt={cover.alt} width={cover.width} height={cover.height} loading="lazy" decoding="async" />
            ) : null}
          </div>
        </div>
        <div data-work-caption>
          <h3 data-work-title>{work.title}</h3>
          <p data-work-scope>{work.scope}</p>
        </div>
      </a>
    </article>
  );
}
