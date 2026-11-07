import { workHref, type Work, type WorkSpan } from "./content";

/**
 * ─── WorkCard ───
 *
 * One work: its picture in its frame (in black and white, whatever its
 * own colours), its name, its scope under it (the user's frame; its
 * dotted rule taken out, 2026-11-07) — the whole card a link to the
 * work's page.
 *
 * THE FRAME IS THE GLASS, THE DEPTH LAYER WHAT IS BEHIND IT. The frame
 * clips; the layer inside it is taller by the parallax's travel and moved
 * by the scroll on the compositor (works.css, THE DEPTH); the breath's
 * canvas is laid in the frame, over it, while the hand is there
 * (breath.ts). Without a picture the frame is the frame's empty card.
 *
 * A PLAIN LINK, A WHOLE PAGE LOAD (as the 404's way home): the home page's
 * first screen is built for a fresh document — its curtain, its scene's
 * engine starting before the page hydrates — and the router would bring
 * it back mid-visit on the way back. The shared scripts are cached.
 *
 * NO HOVER STYLE (the user, 2026-11-06): the breath is the card's answer
 * to the hand.
 *
 * Server component: markup and data- hooks only.
 */
export interface WorkCardProps {
  work: Work;
  span: WorkSpan;
}

export default function WorkCard({ work, span }: WorkCardProps) {
  const { cover } = work;
  return (
    <article data-work={span} data-reveal-card>
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
