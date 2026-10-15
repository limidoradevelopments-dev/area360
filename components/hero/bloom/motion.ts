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
 *
 * BEGUN AS THE SCENE ARRIVES (the user's note of 2026-10-05: it started
 * blooming "after few more seconds"). It waited 2.5 s, and every tepal's
 * creep starts from rest, so the first movement anyone could see came ~6–7 s
 * after the scene showed. Now `delay` ends within the canvas's own fade-in
 * (hero/motion.ts ENTRANCE), and `stir` gives the bud a first sign within
 * ~2 s: the outermost tepals' tips (`outer`: that share of the spiral)
 * loosen off it, `tip` radians at the tip, by `until` of the opening — as
 * a real bud's outer scales lift first as it swells — and each tepal's
 * own opening takes the loosening over as it comes; and the outermost
 * peel back in `outer.quick` of the others' time, so the crown is seen
 * opening by ~4 s (at the others' pace, ~8 s). The pace after is
 * unchanged: full open ~26 s in.
 */
export const OPENING = {
  delay: 0.6,
  seconds: 26,
  lift: [0.0, 0.55] as const,
  swell: [0.0, 0.3] as const,
  outer: { first: 0.0, last: 0.4, each: 0.42, quick: 0.55 },
  inner: { first: 0.36, last: 0.56, each: 0.42 },
  heart: [0.52, 0.98] as const,
  lag: 0.38,
  stray: 0.05,
  stir: { until: 0.07, tip: 0.45, outer: 0.3 },
} as const;

/**
 * THE GLOW: how much of its light the flower holds (optics.ts BLOOM.glow:
 * the cup lit from within, and the soft light it leaves in the fog round
 * it), 0–1 over the visit. What draws the eye without asking for it: it
 * comes up as the cup shows and the heart comes out (`rise`: that share of
 * the opening), so it is strongest as the flower completes; then, open, it
 * settles over `settle.seconds` to `settle.to` of that — a steady light,
 * never a pulse (a light that keeps changing keeps pulling the eye from the
 * title).
 */
export const GLOW = {
  rise: [0.35, 0.95] as const,
  settle: { to: 0.7, seconds: 9 },
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
 * ~0.75 m/s for about a second. At drag 0.85 the head leaned ~1.3 cm (2–3
 * px at 1440) and nobody saw the flower answer the hand (the user's note
 * of 2026-10-05: "too much subtle to notice"); now ~4 cm (~8 px), swinging
 * back through two or three dying beats, and a stem's tip ~1.4 cm. (At
 * drag 9 the head was flung to its limit and pinned there.) `most`: the
 * farthest it is let go (m), so a violent gust bends rather than flings
 * it. Integrated on a fixed 1/120 s step (the house rule for springs).
 */
export const SWAY = {
  step: 1 / 120,
  maxFrame: 0.1,
  head: { hz: 1.1, damping: 0.22, drag: 2.4, most: 0.05 },
  stem: { hz: 2.1, damping: 0.35, drag: 3.0, most: 0.025 },
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
   * past the flower; `hz` their own quick quiver. (Most 0.06 was lost
   * under the head's own sway.)
   */
  flutter: { rest: 0.004, most: 0.14, full: 0.4, hz: 3.2 },
} as const;

/**
 * THE POLLEN: faint gold motes that hold a little light (optics.ts
 * BLOOM.pollen; the user's choice of 2026-10-05, pale gold over white).
 * What makes the hand's touch legible: shaken loose when the air at the
 * open flower moves, and carried by that same air, they trace the visitor's
 * own wake through the mist for a few seconds. The flower stirred, never
 * away from it; the air must reach it (`from`).
 *   `from`, `full`  m/s of air past the flower at which it begins, and at
 *                   which it is shed at `rate` motes a second — a gentle
 *                   pass is enough (at 0.08 it took a brisk sweep)
 *   `ripe`          how open the flower must be (the heart's share): a bud
 *                   has no pollen
 *   `idle`          motes a second it lets go in still air once ripe,
 *                   the rate wandering on two terms at the golden ratio
 *                   (`hz`): one or two at a time, so the open flower always
 *                   shows a little life — and that it can be stirred
 *   `life`          seconds, shortest and longest: long enough to see
 *                   where the air takes them (at 1.4–2.4 they were gone
 *                   before anyone looked)
 *   `fade`          seconds of fading in
 *   `settle`        m/s it falls through still air: specks this fine
 *                   hang in it
 *   `wander`        m/s of its own drift, so a puff spreads instead of
 *                   riding the air as one blob
 *   `reach`         m from the flower past which it has faded out: a
 *                   little way into the mist, never across the frame
 *   `glint`         each mote turning as it goes, its light rising and
 *                   falling by `depth`, at its own rate (`hz`, slowest and
 *                   quickest): soft, never a sparkle
 *   `most`          the most alive at once
 */
export const POLLEN = {
  from: 0.03,
  full: 0.3,
  rate: 45,
  ripe: 0.8,
  idle: { rate: 0.9, hz: 0.13 },
  life: [2.8, 4.6] as const,
  fade: 0.35,
  settle: 0.006,
  wander: 0.018,
  reach: 0.7,
  glint: { depth: 0.45, hz: [0.5, 1.4] as const },
  most: 220,
  ratio: PHI,
} as const;
