/**
 * ─── 404 · what moves in the scene ───
 *
 * Little, on purpose: the flowers are dead and the air is still (the
 * user's frame: no mist, no rain). What lives is THE HERO'S LAKE — its
 * undulation under the long exposure, the lapping at the stone's foot, on
 * the hero's own values and clock (hero/water/motion.ts) — the grain, and
 * the camera as the hand leans it (the hero's own lean, hero/stage/
 * motion.ts PARALLAX), so the two scenes answer the hand alike.
 */

export const SCENE_MOTION = {
  /**
   * DRAWN 30 TIMES A SECOND WHILE THE CAMERA IS STILL: the water moves a
   * few millimetres a frame (under a pixel), the grain is 24 a second, so
   * a faster rate shows nothing and costs the GPU and the battery. While
   * the camera moves (the lean), every frame the display gives. `early`
   * (ms): a frame due this soon is drawn now, not a display frame late.
   */
  stillRate: 30,
  early: 4,

  /**
   * THE SET IS TRACED ONLY WHEN THE CAMERA HAS MOVED: the stone and what
   * lies on it are still, so their picture is kept and only the water and
   * the grain are drawn again. A pose this close (m, rad) to the last one
   * traced is the same picture.
   */
  poseEpsilon: 2e-5,

  /** The longest frame the clocks honour (s): a stalled tab resumes where
   *  it was, it does not jump. */
  maxFrame: 0.1,
} as const;
