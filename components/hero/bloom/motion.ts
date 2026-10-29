/**
 * ─── Bloom · motion ───
 *
 * Every rate and threshold in the cut flower, with the reason for each.
 *
 * NOTHING HERE IS ANIMATED BY HAND. The flower lies still on the stone; it
 * moves only as the air at it moves — the same simulated air the visitor's
 * hand stirs (atmosphere/; its push kept on the CPU: atmosphere/hand.ts):
 * their rays tremble, the cloth's tails sway, and they let go of their
 * pollen into that air. Nothing loops; nothing is keyed.
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
 * THE CLOTH IN THE AIR (2026-10-29, the user: the tie should move with the
 * hand too, "it adds the emotional effect and the realistic look"). What a
 * strip of cotton does when a breath passes it, and no more (sway.ts): the
 * wrap and the knot are pulled snug and never move; what lies flat on the
 * top is held there by its own weight; what hangs or stands free answers
 * the air AT ITSELF (read where it hangs, not at the heads ~40 cm away: a
 * hand passing the flowers leaves the cloth still, one passing the cloth
 * finds it) — the long tail's end below the arris (~17 cm), the short
 * tail's loose flap over the knot and its curled end.
 *
 *   `held`     a sample is held where it lies within `gap` m of the stone
 *              (fully by the first, free past the second) on a surface
 *              that carries its weight (the stone's normal's up share,
 *              `up`: free on a face, held on the top)
 *   `lean`     how far the air leans a free span, as radians off its rest
 *              at its end: `most` of it in strong air, half at `half` m/s,
 *              growing with the SQUARE of the air's speed below that, as
 *              drag does — a gentle pass (~0.3 m/s) leans the long tail's
 *              end ~1 cm, ~2 px at 1440, a brisk one (~0.9 m/s) ~2.4 cm,
 *              and as the air dies it lets the cloth go sooner than it
 *              dies itself (in proportion, a hanging tail followed the
 *              wake's last breaths for ~7 s). A loop held at both ends (the
 *              short tail's flap) leans only across its own plane: it rocks
 *              about where it stands, and pushed within its plane it would
 *              have to stretch (it did, by up to 13%)
 *   `lift`     of the air pushing a hanging span up toward where it hangs
 *              from, the share that lifts it off the stone instead (a
 *              hanging strip cannot be pushed shorter: it bows out)
 *   `billow`   of a hanging span's lean, the share that lifts it off the
 *              face it hangs against, whichever way the air goes (cloth in
 *              moving air stands off a surface)
 *   `clear`    m it may come back to the stone, at most (its curled margins
 *              stand ~4 mm off its spine: nearer, they cut into the face)
 *   `swing`    a free span swings as a hanging strip does, a compound
 *              pendulum: ω² = `stiffness`·g ÷ its length (the long tail
 *              ~1.4 Hz, the flap ~1.7), never faster than `most` rad/s;
 *              `damping` its ratio — air and cotton take a swing in ~2
 *              (a gust that comes at once carries it a third past where it
 *              holds it; at 0.28 two-fifths, and it bounced)
 *   `ripple`   the flutter a strip makes in moving air, a wave running out
 *              to its free end: `depth` m off its face at full air, its
 *              `wavelength` (m), quicker as the air quickens (`hz`, gentle
 *              and full); `twist` radians of its margins lifting in turn
 *              (on a second wave, its rate at the golden ratio to the
 *              first: never in step) — what the light shows most, the
 *              dome's white running along it
 *   `follow`   seconds over which the ripple swells with the air and dies
 *              after it (a gust starts it at once, and it settles slowly)
 *   `visible`  m of movement under which the cloth holds its rest pose
 *              and its pose is not sent to the GPU (~0.1 px at 1440, as
 *              FLUTTER.visible): in still air it costs nothing
 *   `step`     the swing's fixed step (s), and the longest frame honoured
 */
export const SWAY = {
  held: { gap: [0.0015, 0.004] as const, up: [0.3, 0.8] as const },
  lean: { most: 0.15, half: 0.45 },
  lift: 0.8,
  billow: 0.25,
  clear: 0.004,
  swing: { stiffness: 1.5, most: 2 * Math.PI * 5, damping: 0.32 },
  ripple: { depth: 0.0035, wavelength: 0.12, hz: [2.2, 4.2] as const, twist: 0.3 },
  follow: { attack: 0.12, release: 0.6 },
  visible: 0.0004,
  step: { dt: 1 / 120, most: 0.1 },
  ratio: PHI,
} as const;

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
