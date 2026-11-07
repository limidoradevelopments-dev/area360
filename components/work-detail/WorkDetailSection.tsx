import type { Work, WorkImage } from "@/components/works/content";

import { WORK_BACK, WORK_EMPTY } from "./content";

/**
 * ─── WorkDetailSection ───
 *
 * A work's own page: ONE TEMPLATE FOR EVERY WORK (app/works/[slug]), made
 * at the build from its entry in components/works/content.ts — its name,
 * its scope and its pictures, in order.
 *
 * A SCAFFOLD (2026-11-06): the user is drawing this page; until their
 * frame, it lays the work out plainly in the site's voices on the page's
 * black — the way back, the name (the title voice), the scope (the copy),
 * and the pictures down the page's grid — so every card already leads
 * somewhere real.
 *
 * Server component: markup only; no script of its own.
 */
export interface WorkDetailSectionProps {
  work: Work;
}

const TITLE_ID = "work-title";

export default function WorkDetailSection({ work }: WorkDetailSectionProps) {
  const pictures: readonly (WorkImage | null)[] = work.images?.length ? work.images : work.cover ? [work.cover] : [null];
  return (
    <article aria-labelledby={TITLE_ID} data-work-page>
      <a href={WORK_BACK.href} data-work-page-back>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-work-page-arrow>
          <path d="M6 8L2 12L6 16" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d="M2 12H22" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <span>{WORK_BACK.label}</span>
      </a>
      <header data-work-page-head>
        <h1 id={TITLE_ID} data-work-page-title>
          {work.title}
        </h1>
        <p data-work-page-scope>{work.scope}</p>
      </header>
      <div data-work-page-pictures>
        {pictures.map((picture, k) =>
          picture ? (
            <figure key={picture.src} data-work-page-picture>
              {/* A static export: nothing to optimise; the box is reserved. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture.src} alt={picture.alt} width={picture.width} height={picture.height} loading={k === 0 ? "eager" : "lazy"} decoding="async" />
            </figure>
          ) : (
            <figure key="empty" data-work-page-picture="empty" role="img" aria-label={WORK_EMPTY} />
          ),
        )}
      </div>
    </article>
  );
}
