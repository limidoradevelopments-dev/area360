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
  /* Pointer travel under this (CSS px) is a tremor, not a movement. */
  tremorPx: 2,
} as const;
