import { workHref, type Work, type WorkSlot } from "./content";

/**
 * ─── WorkCard ───
 *
 * One work: its picture in its frame (in black and white, whatever its own
 * colours), and under it its numeral — ( I ), ( II ), ( III ), as a book
 * numbers its plates — its name and its scope; the whole of it a link to
 * the work's page (the user's frames, 2026-11-12).
 *
 * ON THE SECTION'S OWN GRID, BOTH WAYS (a subgrid, works.css): its columns
 * are the page's, so the numeral stands in the card's first column and the
 * words from its second; its rows are the section's, so a row's pictures
 * share one track and its words another, whatever they wrap to. On a phone
 * the numeral stands in the first column beside the picture's top, the
 * picture and its words on the three after it.
 *
 * THE FRAME IS THE GLASS, THE DEPTH LAYER WHAT IS BEHIND IT. The frame
 * clips; the layer inside it is taller by the parallax's travel and moved
 * by the scroll on the compositor (works.css, THE DEPTH); the breath's
 * canvas is laid in the frame, over it, while the hand is there
 * (breath.ts). Without a picture the frame is the frame's empty card.
 *
 * A SQUARE CARD SINKS (works.css, THE SINK): the link — numeral, picture
 * and words together — is moved by the scroll on the compositor, the card
 * itself standing still in the grid as the timeline it is measured on.
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
  /** Its place in the grid's pattern (content.ts slotOf). */
  slot: WorkSlot;
  /** Its numeral, in Roman figures (content.ts numeralOf). */
  numeral: string;
}

export default function WorkCard({ work, slot, numeral }: WorkCardProps) {
  const { cover } = work;
  return (
    <article data-work={slot.shape} data-work-end={slot.end ? "" : undefined}>
      <a href={workHref(work)} data-work-link>
        {/* The plate's number: an ornament of the order the grid already
            shows, hidden from a reader of the page. Its spaces never break. */}
        <span data-work-numeral aria-hidden="true">
          {`( ${numeral} )`}
        </span>
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
