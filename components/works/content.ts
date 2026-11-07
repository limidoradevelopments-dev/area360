/**
 * ─── Works · content ───
 *
 * The works (the user's 1920 frame, 2026-11-06): a title over the cards,
 * each a work's picture, its name and its scope, linking to the work's own
 * page (app/works/[slug]: one template for every work).
 *
 * NO PICTURES YET (the user: "you don't have to add images, just build the
 * layout"): a work without a `cover` shows the frame's empty card. Give it
 * one and the card draws it, in its parallax and under the breath.
 *
 * TO ADD A WORK: add it to WORKS, in the order the grid should show it.
 * Its place in the grid is its place in the list (WORKS_PATTERN), and its
 * page is made at the build from its `slug`.
 */

/** A picture of a work, as the browser will lay it out before it loads:
 *  its own pixel size (the box is reserved, nothing jumps) and its words
 *  for a reader who cannot see it. */
export interface WorkImage {
  /** From /public, e.g. "/works/kavi-klavis/cover.webp". */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface Work {
  /** Its page's address, /works/<slug>: lower case, words joined by "-",
   *  and never the same as another work's. */
  readonly slug: string;
  /** Its name, over its card and as its page's title. */
  readonly title: string;
  /** What was done, under its name. */
  readonly scope: string;
  /** The card's picture. None: the frame's empty card. */
  readonly cover?: WorkImage;
  /** Its page's pictures, in order (the page's design is still to come). */
  readonly images?: readonly WorkImage[];
}

/** The section's title, on the page's axis. */
export const WORKS_HEADING = "Piece Of Unforgettable Memories";

/** The works, in the grid's order. The frame's names; the fourth and
 *  fifth were "Kavi Klavis" again there, numbered here so each has its own
 *  page. */
export const WORKS: readonly Work[] = [
  {
    slug: "kavi-klavis", title: "Kavi Klavis", scope: "Art Direction / Web Design & Development",
    cover: {
      src: "/works/kavi-klavis/cover.png",
      width: 1840,
      height: 1560,
      alt: "A stone in a misty lake with two tied chamomiles",
    },
  },
  { slug: "island-hopes-travels", title: "Island Hopes Travels", scope: "Art Direction / Web Design & Development" },
  { slug: "project-3", title: "Project 3", scope: "Art Direction / Web Design & Development" },
  { slug: "project-4", title: "Project 4", scope: "Art Direction / Web Design & Development" },
  { slug: "project-5", title: "Project 5", scope: "Art Direction / Web Design & Development" },
];

/**
 * How wide each card is, in the grid's order, repeating (the frame): a row
 * of a wide card and two narrow ones, then a row of two wide ones. Wide is
 * six of the twelve columns, narrow three (four and two of a phone's
 * four). A sixth work starts the pattern again.
 */
export type WorkSpan = "wide" | "narrow";

export const WORKS_PATTERN: readonly WorkSpan[] = ["wide", "narrow", "narrow", "wide", "wide"];

/** A work's card width, by its place in the list. */
export function spanOf(index: number): WorkSpan {
  return WORKS_PATTERN[index % WORKS_PATTERN.length];
}

/** A work by its page's address. */
export function workBySlug(slug: string): Work | undefined {
  return WORKS.find((work) => work.slug === slug);
}

/** A work's page. */
export function workHref(work: Work): string {
  return `/works/${work.slug}`;
}
