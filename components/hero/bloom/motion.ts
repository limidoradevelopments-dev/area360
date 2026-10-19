/**
 * ─── Bloom · motion ───
 *
 * Every rate and threshold in the cut flower, with the reason for each.
 *
 * NOTHING HERE IS ANIMATED BY HAND. The flower lies still on the stone; it
 * moves only as the air at it moves — the same simulated air the visitor's
 * hand stirs (atmosphere/; its push kept on the CPU: atmosphere/hand.ts):
 * their rays tremble, and they let go of their pollen into that air. Nothing
 * loops; nothing is keyed.
 */

/** Golden ratio: idle terms at this ratio never repeat. */
const PHI = 1.618033988749895;

/**
 * THE RAYS TREMBLE in moving air, each its own way: `most` radians at `full`
 * m/s of air past the heads; `hz` their own quick quiver. Where a ray lies
 * on the stone it is held there (shape.ts: it is laid on after it moves).
 * `smooth`: seconds over which the air's speed is followed, so a gust
 * swells the tremble and lets it die rather than switching it.
 * STILL IN STILL AIR (`rest` 0; it was 0.004, so a flower is never frozen):
 * at 0.004 rad a ray's tip moved ~0.16 mm, 0.03 px at 1440 — nothing anyone
 * could see — and posing every ray for it held the main thread ~0.8 ms a
 * frame. Under `visible` radians (~0.1 px at 1440, ~0.3 at 4K) the rays
 * hold the pose they have, and the pose is not sent to the GPU again
 * (bloom.ts); the fog and the pollen moving round them keep them alive.
 */
export const FLUTTER = { rest: 0, most: 0.14, full: 0.4, hz: 3.2, smooth: 0.15, visible: 0.012 } as const;

/**
 * THE POLLEN: faint gold motes that hold a little light (optics.ts
 * BLOOM.pollen; the user's choice of 2026-10-05, pale gold over white, and
 * kept for the cut flower: "this glowing powder thing"). What makes the
 * hand's touch legible: shaken loose when the air at the flower moves, and
 * carried by that same air, they trace the visitor's own wake through the
 * mist for a few seconds. The flower stirred, never away from it; the air
 * must reach it (`from`).
 *   `from`, `full`  m/s of air past the flower at which it begins, and at
 *                   which it is shed at `rate` motes a second — a gentle
 *                   pass is enough (at 0.08 it took a brisk sweep)
 *   `idle`          motes a second it lets go in still air, the rate
 *                   wandering on two terms at the golden ratio (`hz`): one
 *                   or two at a time, so the flower always shows a little
 *                   life — and that it can be stirred
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
