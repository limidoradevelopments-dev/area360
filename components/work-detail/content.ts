/**
 * ─── Work detail · content ───
 *
 * The words of a work's page that are the page's, not the work's (those
 * are in components/works/content.ts, one entry a work: its name, about,
 * services, result and pictures).
 */

/** The mark: home (a whole page load, as every way onto the home page is:
 *  its first screen is built for a fresh document). */
export const WORK_HOME = {
  href: "/",
  label: "kavi, home",
} as const;

/** The way back, at the foot: to the works on the home page. */
export const WORK_BACK = {
  href: "/#works",
  label: "Back home",
} as const;

/** The way on, at the foot: the next work in the grid's order (the first
 *  after the last). Said with its name to a reader of the page. */
export const WORK_NEXT = {
  label: "Next Project",
  said: (title: string) => `Next project: ${title}`,
} as const;

/** The details' headings. */
export const WORK_LABELS = {
  about: "About",
  services: "Services",
  result: "Result",
} as const;

/** The phone's toggle, said to a reader of the page (its drawing is an
 *  arrow open, a dash folded). */
export const WORK_TOGGLE = {
  open: "Show the details",
  close: "Hide the details",
} as const;

/** Said of a picture-less work's empty frame to a reader of the page. */
export const WORK_EMPTY = "Pictures of this work are still to come.";

/** Said of the foot's links together. */
export const WORK_NAV_LABEL = "Works";
