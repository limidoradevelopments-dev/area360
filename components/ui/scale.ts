/**
 * ─── scale ───
 *
 * The site's two scales in CSS px, for a script (AGENTS.md, Scaling
 * System): THE PRINT (tokens.css --print), what is looked at — a drawing,
 * a picture, the structure; and THE READER (the root's font size: a rem),
 * what is read or pressed. A script that sizes something in units says
 * which it means, as a stylesheet does: a breath across a card is the
 * print's, a line's travel in its mask the reader's.
 *
 * Read when a size is needed (on entry, on resize), never once for the
 * visit: both answer to the window's width.
 */

const rootStyle = () => getComputedStyle(document.documentElement);

/** One print unit (the things looked at): 16px on the 1600 artboard, 19.2
 *  at 1920, 13.6 under 1360; the phone's own from its 390 frame. --print
 *  is a registered <length>, so the computed value is already px. */
export function printPx(): number {
  return Number.parseFloat(rootStyle().getPropertyValue("--print")) || 16;
}

/** One reader unit (a rem): the visitor's own font size, never less, one
 *  with the line from 1600 up (on a phone, from 390). */
export function readerPx(): number {
  return Number.parseFloat(rootStyle().fontSize) || 16;
}
