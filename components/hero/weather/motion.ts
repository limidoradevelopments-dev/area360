/**
 * ─── Weather · motion ───
 *
 * THE STILLNESS CLOCK. The weather answers the visitor's stillness: stay,
 * and it turns (light rain arrives in phase 4); move, and it eases back.
 * Phase 0 builds only the clock, so everything that will read it — the rain,
 * the wet stone, the fog thinning — has one number to read from the start.
 *
 * Stillness is NO INPUT: no pointer movement, no press, no scroll, no key.
 * A visitor reading the headline is still, so most visitors get the weather
 * without being asked to wait for it.
 */
export const STILLNESS = {
  /* Seconds of stillness before the weather starts to turn. About as long
   * as reading the headline and the line under it. */
  onsetAfter: 5,
  /* Seconds (τ) for the weather to come in: slow, the way weather does —
   * about two-thirds there after this long, nearly all there after three. */
  arriveSeconds: 6,
  /* Seconds (τ) for it to ease back when the visitor moves: quicker than it
   * came, but never a switch — the rain does not stop because a hand moved. */
  recedeSeconds: 2.5,
  /* Pointer travel under this (CSS px) is a tremor, not a movement: a hand
   * resting on a trackpad or a mouse drifts by more than 2 px (the first
   * setting) without anyone moving it, and reset the clock. */
  tremorPx: 12,
} as const;

/**
 * THE RAIN'S FALL (2026-10-19, the user's reference assets/sources/grade/
 * reference-3.webp: "exact rain like effect"). Fine rain, ~1 mm drops,
 * falls at ~3 m/s; at the reference's ~40 m, through the lens, that is a
 * fifth of the frame's height a second, and on a shutter of a film frame
 * (1/48 s) a dash about 0.4% of the height long — the reference's own
 * dashes (4–6 px of a 2000 px frame). Each layer (weather/optics.ts RAIN)
 * falls at its own distance's rate: the nearer drops quicker and longer.
 * SLOWED AND THINNED (2026-10-20, the user: "too fast and too much — very
 * subtle, coming little by little, not repeatedly fast"): at 3 m/s every
 * drop crossed the frame in a few seconds, a stream of them always moving;
 * now a drizzle's drift, and each drop is seen only for a little of its
 * fall — catching the light, then gone — and the rain itself arrives over
 * the visit's first seconds.
 */
export const RAIN_MOTION = {
  /* Metres per second: a drizzle's drift (its drops a fifth of a
   * millimetre fall at ~0.7 m/s; fine rain's ~3 read as a downpour). */
  fall: 1,
  /* Seconds a drop is seen, shortest and longest: it brightens and fades
   * over that, and its slot may hold another, later — or none. */
  life: [2.5, 5] as const,
  /* The rain's arrival on the visit's clock, seconds: none for `delay`,
   * then coming in over `over` (eased). It was 4 s and then 24: at 8 s a
   * thirtieth of it, half by 16 s, and most visitors had gone before they
   * saw a drop (2026-10-20). Now it is falling as the scene settles (the
   * arrival, stage/motion.ts, 3 s), and in full within ~7 s — still a
   * drop at a time: each one fades in and out over its own seconds
   * (`life`). */
  onset: { delay: 1, over: 6 },
  /* The lean of the fall, as a tangent: blown a little right to left, as
   * the mist drifts along the shores (atmosphere/motion.ts). The
   * reference's dashes lean ~17° (the other way); ~12° here. */
  slant: -0.2,
  /* The shutter that draws each drop as a dash, seconds: a film frame's. */
  shutter: 1 / 48,
} as const;
