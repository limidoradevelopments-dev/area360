/**
 * ─── Stage cues ───
 *
 * When the page's parts arrive over the hero's opening shot, in seconds
 * after the curtain begins to lift (StageReveal). One table, so the parts
 * that arrive together stay together: each feature reads its cue here and
 * keeps its own durations and staggers in its own motion.ts.
 *
 * THE SHOT (hero/stage/motion.ts ARRIVAL): the scene comes up out of the
 * curtain's black over 1.8 s while the camera cranes down for 3 s and the
 * lens widens off the stone for 4.2 s, slow in and slow out.
 *
 * THE ORDER (the user, 2026-10-30): the stone first; then the words — the
 * headline and the copy under it — as the place settles; then, near the
 * end of the shot, the chrome, down the page from top to bottom: the
 * header, the notes on the copy's row, the dock at the foot. Every line
 * then lands as the lens does, and nothing on the page moves after it.
 */
export const STAGE_CUES = {
  /* The scene four-fifths up, the camera still craning: any earlier and
   * white type stands out of a frame still near black, seen before the
   * stone. */
  words: 1.2,

  /* At 3.4 s the lens is ~90% of its way out (an in-out over 4.2 s): the
   * chrome's one-second lines land with it. A fifth of a second between
   * the frame's places, so the arrival reads as one fall down the page. */
  chrome: {
    top: 3.4,
    row: 3.6,
    foot: 3.8,
  },
} as const;
