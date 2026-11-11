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

  /* ── Its page (app/works/[slug], components/work-detail) ── */
  /** What it is, in a paragraph: under "About". */
  readonly about?: string;
  /** What was done, a line each: under "Services". */
  readonly services?: readonly string[];
  /** What came of it: under "Result". */
  readonly result?: string;
  /** Its page's pictures, in order, down the page. None: the cover alone,
   *  or the frame's empty picture. */
  readonly media?: readonly WorkMedia[];
}

/**
 * One of a work's page's pictures, and how it is laid:
 *
 *   "bleed"   a photograph, to the column's edges (the page's default);
 *   "matted"  a screen — a page of the work as it was seen — laid on a
 *             mat a shade off the black, a margin round it, as a print is
 *             mounted (the user's frame, 2026-11-11).
 */
export type WorkMediaLay = "bleed" | "matted";

export interface WorkMedia {
  readonly image: WorkImage;
  readonly lay?: WorkMediaLay;
}

/** The section's title, on the page's axis, line by line as the frame
 *  breaks it (2026-11-11, the user's frame; it was "Piece Of Unforgettable
 *  Memories"). Each line drops into its own mask. */
export const WORKS_HEADING: readonly string[] = ["Settling Is Easy", "The Work Here Isn’t Built For That"];

/** The eye tag at the left margin, beside the title (ui/EyeTag): its lead
 *  line by line as the frame breaks it, and the word it spells in tiles. */
export const WORKS_TAG = {
  lines: ["Every work has a meaning", "& communicates with"],
  word: "Feelings",
} as const;

/** A card's numeral over its picture, by its place in the list: ( I ),
 *  ( II ), ( III )… Roman, as a book numbers its plates. */
export function numeralOf(index: number): string {
  const steps: readonly [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = index + 1;
  let roman = "";
  for (const [value, letters] of steps) {
    while (n >= value) {
      roman += letters;
      n -= value;
    }
  }
  return roman;
}

/** The works, in the grid's order. The frame's names; the fourth and
 *  fifth were "Kavi Klavis" again there, numbered here so each has its own
 *  page. */
export const WORKS: readonly Work[] = [
  {
    slug: "kavi-klavis", title: "Kavi Klavis", scope: "Art Direction / Web Design & Development",
    cover: {
      src: "/works/kavi-klavis/cover.png",
      width: 2822,
      height: 1994,
      alt: "A stone in a misty lake with two tied chamomiles",
    },
    /* The frame's words (2026-11-11), its repeated sentence as drawn. */
    about:
      "From the first concept to the final interaction, I bring together design and technology to transform a brand’s quietest strengths into its most unforgettable qualities. From the first concept to the final interaction, I bring together design and technology to",
    services: ["Web Design", "Web Development"],
    result: "From the first concept to the final interaction,",
    /* Screens of this site as it stands, taken at 1920 × 1080 (headless
       Chrome, 2026-11-11), between its photographs. */
    media: [
      {
        image: { src: "/works/kavi-klavis/cover.png", width: 2822, height: 1994, alt: "A stone in a misty lake with two tied chamomiles" },
      },
      {
        lay: "matted",
        image: { src: "/works/kavi-klavis/screen-promise.webp", width: 1920, height: 1080, alt: "The site’s promise: its words gathered into the shape of a moth" },
      },
      {
        image: { src: "/works/kavi-klavis/lake.webp", width: 2376, height: 1080, alt: "The misty lake between its two dark shores, the stone in the still water" },
      },
      {
        lay: "matted",
        image: { src: "/works/kavi-klavis/screen-home.webp", width: 1920, height: 1080, alt: "The site’s first screen: the lake, the stone and the headline over them" },
      },
    ],
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

/** The work after this one in the grid's order; the first after the last. */
export function nextWork(work: Work): Work {
  const at = WORKS.indexOf(work);
  return WORKS[(at + 1) % WORKS.length];
}
