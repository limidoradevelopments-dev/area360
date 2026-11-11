import EmbossRule from "@/components/ui/EmbossRule";
import MarkGlyph from "@/components/ui/MarkGlyph";
import RevealLine from "@/components/ui/RevealLine";
import type { Work } from "@/components/works/content";

import { WorkFoldMark, WorkPointer } from "./WorkArrows";
import { WORK_HOME, WORK_LABELS, WORK_TOGGLE } from "./content";

/**
 * ─── WorkPanel ───
 *
 * The work's words (the user's frame, 2026-11-11): the mark, a row of
 * embossed dots, the work's name, and its details — About, then Services
 * and Result side by side.
 *
 * ON A WIDE SCREEN it is the page's left five columns, held at the top of
 * the screen while the pictures scroll past it. ON A PHONE it is the top
 * of the page, and stays there: THE BAR (the mark, the dots, the name and
 * the toggle) over the pictures, and the details under it, which fold
 * away as the pictures come up (WorkDetailSection, fold.ts).
 *
 * Every line waits in its mask for the entrance (data-reveal-drop: they
 * drop in from above); the paragraphs, wrapped by their box, are split
 * into their lines when it plays (data-reveal-lines).
 *
 * Server component: markup and data- hooks only.
 */
export interface WorkPanelProps {
  work: Work;
  titleId: string;
  detailsId: string;
}

export default function WorkPanel({ work, titleId, detailsId }: WorkPanelProps) {
  const { about, services, result } = work;
  const hasFacts = Boolean(services?.length || result);
  const hasDetails = Boolean(about || hasFacts);
  return (
    <header data-wp-panel data-reveal-drop>
      <div data-wp-bar>
        <a href={WORK_HOME.href} aria-label={WORK_HOME.label} data-wp-mark>
          <RevealLine>
            <MarkGlyph />
          </RevealLine>
        </a>
        <EmbossRule reveal />
        <div data-wp-heading>
          <h1 id={titleId} data-wp-title>
            <RevealLine>
              {work.title}
              <WorkPointer />
            </RevealLine>
          </h1>
          {hasDetails ? (
            /* The phone's: opens and folds the details. Its state is
               written by fold.ts as the fold plays, not by React. */
            <button type="button" aria-expanded="true" aria-controls={detailsId} aria-label={WORK_TOGGLE.close} data-wp-toggle>
              <WorkFoldMark />
            </button>
          ) : null}
        </div>
      </div>
      {hasDetails ? (
        <div id={detailsId} data-wp-details>
          {about ? (
            <section data-wp-about>
              <h2 data-wp-label>
                <RevealLine>{WORK_LABELS.about}</RevealLine>
              </h2>
              <p data-wp-copy data-reveal-lines="">
                {about}
              </p>
            </section>
          ) : null}
          {hasFacts ? (
            <dl data-wp-facts>
              {services?.length ? (
                <div data-wp-fact>
                  <dt data-wp-label>
                    <RevealLine>{WORK_LABELS.services}</RevealLine>
                  </dt>
                  {services.map((service) => (
                    <dd key={service} data-wp-copy>
                      <RevealLine>{service}</RevealLine>
                    </dd>
                  ))}
                </div>
              ) : null}
              {result ? (
                <div data-wp-fact>
                  <dt data-wp-label>
                    <RevealLine>{WORK_LABELS.result}</RevealLine>
                  </dt>
                  <dd data-wp-copy data-reveal-lines="">
                    {result}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
