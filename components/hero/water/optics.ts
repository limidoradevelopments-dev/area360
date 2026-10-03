/**
 * ─── Water · optics ───
 *
 * How the lake LOOKS. How it moves is in ./motion.ts; the dark body under
 * the reflection is a CSS token (hero.css, --color-hero-water).
 *
 * Every reflection is traced through the SAME set and the SAME fog as the
 * thing reflected (a tree's reflection is exactly as fogged as the tree),
 * at the angle the waves tilt the surface to. How much the water reflects
 * follows Fresnel at that angle: almost everything toward the horizon,
 * about a third at the foot of the frame, where the dark body of the lake
 * shows through — and a little more or less on each face of a ripple,
 * which is what makes the foreground's faint level lines.
 */
export const WATER = {
  /* Refractive index of water. Reflectance looking straight down is
   * ((n − 1)/(n + 1))² ≈ 2%; Schlick's curve carries it to 1 at grazing. */
  ior: 1.333,
  /* A reflected ray is never let dip below this share of its mirror
   * elevation. At grazing angles a wave's face can tilt the mirror past the
   * horizon; in the real lake the wave in front hides that face, and the
   * eye sees the next one up. */
  minElevation: 0.3,
  /**
   * HOW FAR INTO IT YOU SEE. A northern lake in a conifer forest is stained
   * with peat: dark, clear enough to see a stone go down into it, never its
   * bed. Its visibility (a Secchi disc) is ~1.2 m, and the two attenuations
   * follow from that by the usual rules of thumb: `beam`, per metre of the
   * look into it (≈ 2.5–3 / Secchi depth), and `down`, per metre of depth
   * for the daylight reaching down (≈ 1.4 / Secchi depth). So the stone's
   * foot shows for a hand's depth under the surface, wavering with it, and
   * is gone by half a metre: which is what says the stone goes on down.
   */
  clarity: { beam: 2.4, down: 1.2 },
  /**
   * What a vertical face under the water takes of the daylight there: in
   * water the light is no longer a dome with a bright side but a glow from
   * above, spread round evenly — about a third of what a level surface
   * takes, on every side alike.
   */
  side: 0.35,
  /**
   * How much more a tilt of the water moves the stone's reflection than its
   * half-metre path to the stone gives (scene.ts): enough that it wavers in
   * step with the shores' reflections a frame-width away, and is broken by
   * the same bands at the foot of the frame. At 1 it is the true path, and
   * the stone's reflection stands still in a moving lake; past ~10 it tears
   * off the stone's foot.
   */
  waver: 4,
} as const;

/** Reflectance at normal incidence, from the index. */
export const WATER_R0 = ((WATER.ior - 1) / (WATER.ior + 1)) ** 2;

/** What of the sky's light, per unit reflectance, a face just under the
 *  water sends back up out of it (before the surface's own transmission on
 *  the way out): the light that gets in — all but the ~7% the dome loses at
 *  the surface — the share a vertical face takes of it (`side`), and
 *  radiance falls by 1/n² as it leaves the water, the cone it fills opening
 *  n² wider. */
export const WATER_UNDER = (0.93 * WATER.side) / WATER.ior ** 2;
