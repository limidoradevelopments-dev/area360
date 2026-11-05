/**
 * ─── 404 · the scene's look ───
 *
 * The stone, the flowers and the lake are THE HERO'S, lit by the hero's own
 * values (hero/stone/optics.ts, hero/bloom/optics.ts, hero/water/), their
 * colours the hero's CSS variables (hero.css) and the dead ones this
 * page's (not-found.css). The fog, the banks and the water's tone are the
 * user's own 404 frame (plate.ts, scripts/lost/plate.mjs). What is here is
 * what joins them into one print.
 */

/** sRGB level (0–255) → linear light. */
export function linear(level: number): number {
  const c = level / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export const LOOK = {
  /**
   * THE FOG behind the stone: the frame's 130 over the lake, the light the
   * stone fades into with distance, and the share of it that lies between
   * the camera and the stone, per metre: all but clear (1% at 10 m; the
   * hero's own stone prints as dark as 18 in its fog).
   */
  fog: { level: 130, perMetre: 0.001 },

  /**
   * THE PRINT. `hero`: the hero's light carried into this print — scale,
   * power and lift of its luminance (shaders/common.ts heroToPrint) —
   * REGISTERED ON THE HERO'S OWN FRAME (2026-11-05: its stone's top, its
   * faces up and down both sides, read off the live hero at 1920 × 1080
   * and fitted against this stone at the same pixels). `tone` is the
   * user's frame's warm grey (plate.ts PLATE_TONE). `grain`: the frame's
   * own, ± levels at mid-grey, at the screen's CSS pixels, a new frame of
   * it `grainRate` times a second (film's 24) from `grainCycle` seeds.
   */
  print: { hero: [0.6, 1.525, 0.004] as const, grain: 2.4, grainRate: 24, grainCycle: 997 },

  /**
   * THE CRACKS (ruin.ts lays them): how dark their core prints (a share of
   * the face's light taken away), how far their shadow reaches either side
   * (× their half-width) and how dark it is, and how far their line
   * wanders off its course (m: a crack in granite runs jagged, never ruled).
   */
  crack: { core: 0.93, shadowReach: 2.4, shadow: 0.35, wander: 0.005 },

  /**
   * THE BREAK'S CONTACT SHADE: where a chunk lies on the fracture, where a
   * bite turns in — the set's own distance field sampled out along the
   * normal. `reach` m, `strength` its share.
   */
  occlusion: { reach: 0.07, strength: 1.6 },

  /**
   * THE FLOWERS' CONTACT SHADE on the stone, as the hero lays it under its
   * flowers and cloth (flowers.ts SHADE): how near it reaches (m) and how
   * dark it is at its darkest.
   */
  contact: { reach: 0.012, strength: 0.45 },

  /**
   * THE FLOWERS DEAD: the hero's light on them, as a dried flower takes it —
   * the rays no longer lit through (`transmit`, × the hero's), their satin
   * and sheen dulled (`sheen`), the stems' wax gone (`wax`). `noStone`: the
   * hero's flower program hides a flower behind the hero's WHOLE stone, and
   * this one is broken — so it is told its stone stands here, far off, and
   * the stone's own depth hides the flowers instead. `domeFittedUnder`: the
   * stone's top light the hero's flower dome was fitted under (hero/bloom/
   * bloom.ts), which it scales by.
   */
  dead: { transmit: 0.25, sheen: 0.2, wax: 0.3, noStone: 1e4, domeFittedUnder: 0.8 },

  /**
   * THE WATER. Its tone is the frame's (plate.ts); its surface the hero's.
   * `base` is the light the lake gives back of itself (linear): fitted so
   * the stone's reflection prints the frame's ~24 where the open water
   * beside it is ~46 (base + mirror share × the stone's foot). `rings`:
   * how much of the hero's surface — its lapping and its undulation, as a
   * change in what it mirrors and how much — the print shows, REGISTERED
   * ON THE HERO'S FRAME: its rings left of the stone's foot 1.65 levels rms
   * over their trend (2026-11-05, 1920 × 1080), this lake's 1.73 at 2.
   */
  water: { base: 0.0081, rings: 2 },
} as const;
