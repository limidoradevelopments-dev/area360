import type { Work, WorkMedia } from "@/components/works/content";

import { WORK_EMPTY } from "./content";

/**
 * ─── WorkPictures ───
 *
 * The work's pictures down the page, a step apart (the user's frame,
 * 2026-11-11): on a wide screen the right seven columns, scrolling past
 * the held panel; on a phone the whole width, under it. Each is laid as
 * its entry says (works/content.ts WorkMedia): a photograph to the
 * column's edges, or a screen on a mat. In black and white, as every
 * work's picture is. Each floats up as it comes into view. Each is behind
 * its own GLASS (data-wp-glass, the picture's box): where a hand can
 * hover, the visitor's breath fogs it as it does a card's
 * (works/breath.ts, started by WorkDetailSection).
 *
 * Without pictures: the cover alone; without a cover, the works' empty
 * grey, said to be still to come.
 *
 * Server component: markup and data- hooks only.
 */
export interface WorkPicturesProps {
  work: Work;
}

export default function WorkPictures({ work }: WorkPicturesProps) {
  const media: readonly WorkMedia[] = work.media?.length ? work.media : work.cover ? [{ image: work.cover }] : [];
  return (
    <div data-wp-media>
      {media.length ? (
        media.map(({ image, lay = "bleed" }, k) => (
          <figure key={`${image.src}-${k}`} data-wp-figure={lay} data-reveal-card>
            {/* A static export: nothing to optimise; the box is reserved by
                the picture's own size. The first is the page's first
                screen: asked for at once. */}
            <span data-wp-glass>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                loading={k === 0 ? "eager" : "lazy"}
                fetchPriority={k === 0 ? "high" : undefined}
                decoding="async"
                data-wp-image
              />
            </span>
          </figure>
        ))
      ) : (
        <figure data-wp-figure="empty" role="img" aria-label={WORK_EMPTY} data-reveal-card />
      )}
    </div>
  );
}
