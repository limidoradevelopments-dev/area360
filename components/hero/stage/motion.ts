/**
 * ─── Stage · motion ───
 *
 * The camera's motion, with the reason for each number. The fog's motion is
 * in atmosphere/motion.ts; the weather's in weather/motion.ts.
 */

/**
 * THE PARALLAX: the visitor leans, the camera leans with them.
 *
 * The camera ORBITS the stone: it moves a few centimetres toward the
 * pointer's side and turns to keep the stone exactly where it stands in the
 * frame. That is what a head does when it leans while looking at something,
 * so the world reads the way the eye expects: everything behind the stone
 * slides WITH the lean, everything in front of it (the near fog, the near
 * water) slides against it, and it holds still. A sway with no turn would
 * slide it too, and the frame would read as a picture being panned.
 *
 * On a 1440×810 frame, a full lean of 5 cm moves the shores ~7–9 px and
 * the nearest fog ~9 px the other way; the stone moves 0. Felt, not seen.
 */
export const PARALLAX = {
  /* The lean at the frame's edge, metres: sideways, and up/down. Vertical is
   * smaller: a person leans sideways far more readily than they bob. */
  sway: [0.05, 0.02] as const,
  /* +1: the camera leans toward the pointer. −1 inverts it. */
  lean: 1,
  /* The spring, rad/s. Critically damped: it arrives and stops, no
   * overshoot. At 4.5 the camera settles in ~1s — the weight of a head, not
   * the snap of a UI. A tween cannot do this: the target moves mid-flight
   * with every pointer event, and a curve interrupted halfway restarts its
   * easing; a spring just keeps the velocity it has. */
  frequency: 4.5,
  damping: 1,
  /* Fixed step, drained from wall time (the house rule for springs), and
   * the longest frame honoured before the rest is dropped. */
  step: 1 / 120,
  maxFrame: 0.1,
  /* Below this (metres, m/s) the camera is at rest and costs nothing. */
  restEpsilon: 1e-5,
} as const;
