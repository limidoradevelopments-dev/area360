/**
 * ─── Work detail · content ───
 *
 * The words of a work's page that are the page's, not the work's (those
 * are in components/works/content.ts, one entry a work).
 */

/** The way back: to the works on the home page (a whole page load, as
 *  every way onto the home page is: its first screen is built for a fresh
 *  document). */
export const WORK_BACK = {
  href: "/#works",
  label: "Back to works",
} as const;

/** Said of a picture-less work's empty frame to a reader of the page. */
export const WORK_EMPTY = "Pictures of this work are still to come.";
