/**
 * ─── Bloom · motion ───
 *
 * Every duration, rate and threshold in the plant, with the reason for each.
 *
 * NOTHING HERE IS ANIMATED BY HAND. The flower opens on one clock (the
 * visit's), each tepal on its own share of it, base before tip, as a real
 * one does in a time-lapse; the plant moves only as the air at it moves —
 * the same simulated air the visitor's hand stirs (atmosphere/), read back
 * where the plant stands (atmosphere/sampler.ts) — through springs with a
 * plant's own stiffness and damping. Nothing loops; nothing is keyed.
 */

/** Golden ratio: idle terms at this ratio never repeat. */
const PHI = 1.618033988749895;

/**
 * THE OPENING. A kadupul opens over an hour or two after dark; here, over
 * `seconds` of the visit, beginning `delay` after the scene first shows — a
 * bud first, so the change is noticed rather than watched: slow enough never
 * to pull the eye from the title (a slow change is missed outright by ~40%
 * of people; a fast one is seen by all). Measured on the stage's own clock,
 * which stops while the hero is off screen or the tab hidden: the opening
 * waits for its visitor.
 *
 * As a time-lapse shows it: the bud swells and lifts its head (`lift`: the
 * share of the opening over which it turns from its bud's facing to the
 * flower's, optics.ts budFacing → facing); the outer tepals peel back first,
 * outermost first (`outer`: the share of the opening at which the first and
 * the last of them begins, and how long each takes); then the inner loosen
 * at their tips and open into the cup (`inner`); the filaments splay out of
 * the throat and the style stands out of them (`heart`). Within a tepal its
 * base bends first and its tip follows (`lag`: the share of the tepal's own
 * opening by which the tip trails the base). `stray`: how far a tepal's
 * start strays from its place in the order — a flower is not a clock.
 */
export const OPENING = {
  delay: 2.5,
  seconds: 26,
  lift: [0.0, 0.55] as const,
  swell: [0.0, 0.3] as const,
  outer: { first: 0.04, last: 0.4, each: 0.42 },
  inner: { first: 0.36, last: 0.56, each: 0.42 },
  heart: [0.52, 0.98] as const,
  lag: 0.38,
  stray: 0.05,
} as const;

/**
 * THE SWAY. The plant answers the air at it — the simulated air's velocity
 * where it stands, read back each frame — through a damped spring each:
 *   `head`  the flower on its tube: heavy (a kadupul flower is ~30 g of
 *           water) on a long, springy stalk — slow, and lightly damped
 *   `stem`  each stem's tip: a stiff, fleshy blade — quicker, firmer
 * `hz`: its natural frequency; `damping`: share of critical; `drag`: how
 * hard the air pushes it (1/s); held in a steady wind it leans drag·v/ω²:
 * measured, a brisk sweep of the hand past the flower moves the air there
 * ~0.75 m/s for about a second, and the head leans ~1.3 cm (2–3 px at 1440)
 * and swings back through two or three dying beats; a stem's tip ~0.6 cm.
 * (At drag 9 the head was flung to its limit and pinned there.) `most`:
 * the farthest it is let go (m), so a violent gust bends rather than flings
 * it. Integrated on a fixed 1/120 s step (the house rule for springs).
 */
export const SWAY = {
  step: 1 / 120,
  maxFrame: 0.1,
  head: { hz: 1.1, damping: 0.22, drag: 0.85, most: 0.022 },
  stem: { hz: 2.1, damping: 0.35, drag: 1.4, most: 0.012 },
  /**
   * IDLE: never quite still. A real plant in still air still moves with
   * the convection round it; frozen, it reads as a picture pasted on. Two
   * terms at the golden ratio (they never repeat), `amount` m at the head,
   * half at the stems, under a pixel at 1440: felt, never seen moving.
   */
  idle: { amount: 0.0009, hz: 0.21, ratio: PHI },
  /**
   * THE TEPALS TREMBLE in moving air, each its own way, on top of the
   * head's sway: `rest` radians in still air, `most` at `full` m/s of air
   * past the flower; `hz` their own quick quiver.
   */
  flutter: { rest: 0.004, most: 0.06, full: 0.6, hz: 3.2 },
} as const;

/**
 * THE POLLEN. Shaken loose only when the air at the open flower moves hard
 * enough — never in still air, never away from the flower — and carried by
 * that same air, settling as it goes, gone within ~2 s (the fog's own churn
 * dies in about that: atmosphere/motion.ts TURBULENCE). Lit by the fog's
 * light as everything else is, never glowing.
 *   `from`, `full`  m/s of air past the flower at which it begins, and at
 *                   which it is shed at `rate` specks a second
 *   `ripe`          how open the flower must be (the heart's share)
 *   `life`          seconds, shortest and longest
 *   `fade`          seconds of fading in
 *   `settle`        m/s it falls through still air
 *   `wander`        m/s of its own drift, so a puff spreads instead of
 *                   riding the air as one blob
 *   `reach`         m from the flower past which it has faded out: it
 *                   never wanders far enough to read as dust in the frame
 *   `most`          the most alive at once
 */
export const POLLEN = {
  from: 0.08,
  full: 0.5,
  rate: 70,
  ripe: 0.8,
  life: [1.4, 2.4] as const,
  fade: 0.18,
  settle: 0.025,
  wander: 0.012,
  reach: 0.3,
  most: 160,
} as const;
