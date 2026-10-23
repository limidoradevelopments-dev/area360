/**
 * ─── Water · motion ───
 *
 * How the lake moves, with the reason for each number. How it looks
 * (Fresnel, the dark body) is in ./optics.ts.
 *
 * STILL WATER ON A STILL MORNING. Almost nothing moves it. What does:
 *
 *   the swell       long, low undulations left over from whatever stirred
 *                   the lake last: metres long, millimetres high. They are
 *                   what makes a reflected trunk sway slowly, as a whole.
 *   the undulation  the water's own slow breathing, a hand's span to an arm's
 *                   length, everywhere. It is what the eye reads as the
 *                   SURFACE: soft level bands across the foreground, and a
 *                   reflection broken into them — dark where the mirror
 *                   still sees the stone, pale where it tips past it to the
 *                   fog. Without it the lake is a sheet of glass, and the
 *                   stone's reflection a second stone.
 *   the ripples     capillary and short gravity waves, centimetres long,
 *                   raised by air too light to feel. Most of them are far
 *                   finer than a pixel: what they do is SOFTEN a reflection,
 *                   mostly vertically (a ripple tilts the mirror toward and
 *                   away from the camera far more than across), not move it.
 *   cat's paws      the ripples come and go in patches, where a breath of
 *                   air touches the water: duller patches drifting over the
 *                   lake. A still lake is never uniformly still, and a
 *                   uniform one reads as a shader.
 *
 * MEASURED, THEN CALMED. The user's reference footage (a misty pond on a
 * tripod, assets/sources/water movement) moves its reflections by a local
 * ~0.15% of the frame width in 0.2 s, in cells ~1.4% of the width across,
 * with a dominant period near 2 s (a coot's wake crossing). The brief is
 * calmer than that: no wake, the swell at about a third of the footage's.
 * The SURFACE is the user's frame's (a bench in still floodwater, in fog):
 * level bands about half a metre apart in the foreground, at a slope the
 * frame's texture puts near a hundredth of a radian.
 *
 * Every wave obeys the dispersion relation of real water,
 *   ω² = g·k + (σ/ρ)·k³,
 * so a long wave is slow and a short one quick, in the proportion the eye
 * knows. Amplitudes are given as SLOPES (radians), because a slope is what
 * moves a reflection; a wave's height is its slope over its wavenumber.
 */

/** Gravity (m/s²) and water's surface tension over its density (m³/s²). */
export const GRAVITY = 9.81;
export const TENSION = 7.28e-5;

export interface WaveBand {
  /** How many waves the band is drawn with. */
  readonly count: number;
  /** Shortest and longest wavelength, metres (log-spaced between). */
  readonly wavelengths: readonly [number, number];
  /** RMS slope of the whole band, radians. */
  readonly slope: number;
  /** Spread of directions around the wind, ± radians. */
  readonly spread: number;
}

export const WATER_MOTION = {
  /* Where the air drifts from: off the left shore, slightly toward the
   * camera. Waves running toward the camera draw their crests as level
   * lines across the frame, which is how the reference's foreground reads. */
  wind: Math.PI * 0.62,
  swell: {
    count: 6,
    wavelengths: [2.2, 9],
    /* 0.0018 rad: a reflected trunk at 34 m sways by about a pixel and a
     * half over two seconds. The footage's swell is ~3× this. */
    slope: 0.0018,
    spread: 0.6,
    /* Off: the user's own value, 2026-10-20 (tuner). See SWELL_DRAWN. */
    gain: 0,
  } satisfies WaveBand & { gain: number },
  undulation: {
    count: 6,
    /* Long enough to be slow (periods 0.45–1 s, so the bands drift rather
     * than flicker) and to be drawn, not filtered, out to the stone. */
    wavelengths: [0.3, 1.5],
    /* The reference frame's texture. Halved, the stone's reflection closes
     * back into a solid block; doubled, the bands read as a breeze. */
    slope: 0.01,
    spread: 0.8,
  } satisfies WaveBand,
  ripples: {
    count: 14,
    wavelengths: [0.03, 0.3],
    /* Inside a cat's paw. Past ~0.006 the foreground reads as a breeze, not
     * as a still morning. */
    slope: 0.0045,
    spread: 1.1,
  } satisfies WaveBand,
  /**
   * THE LAKE LAPPING AT THE STONE. Where water meets a wall it is never
   * quite still: the slight movement of the lake is thrown back off the
   * stone's faces as small wavelets, a hand's length, that die within half
   * a metre (`reach`, the distance over which they fall to a third). They
   * soften and stir the water hugging its foot and break its reflection
   * there — and stop, with no rings running out across the lake (those read
   * as a disturbance, not a still morning). `slope` at the waterline: 0.08
   * since 2026-10-17, the user's own setting (4× the 0.02 first designed,
   * on the tuner), so the stone's foot reads as standing in moving water.
   */
  lapping: {
    count: 3,
    wavelengths: [0.1, 0.3],
    slope: 0.08,
    reach: 0.45,
  },
  /**
   * THE LONG EXPOSURE (2026-10-19, the user's reference
   * assets/sources/grade/reference-3.webp: "use the water"). Their lake is a
   * fine-art print's: a mirror, its reflections drawn down in long soft
   * streaks, its open water as light as the fog it mirrors, no level bands.
   * That is what a shutter held open over this same lake gives: the
   * undulation and the ripples move too fast to be drawn, and what they do
   * to a reflection in that time is SMEAR it, mostly up and down (a tilt
   * toward the camera moves a reflection ~2× the tilt; across, only the
   * grazing sine of it). So `averaged` of those two bands is no longer drawn
   * but kept as the spread of every reflection — by its own slope, the
   * physical smear of a held shutter — times `smear` (2.5: at 1, a shutter
   * of a second or so, the streaks were a third as long as the
   * reference's); under a cat's paw, as
   * the ripples are, so the duller patches still drift. The swell (whole
   * trunks swaying, slowly) and the lapping at the stone (the user: "keep
   * that water ripple on stone placement") are slow or close enough to be
   * drawn, and stay. At 0 the lake of before.
   */
  exposure: {
    /* the user's own values, 2026-10-20 (tuner): a third averaged, the rest drawn. */
    averaged: 0.3,
    smear: 1.6,
  },
  catsPaws: {
    /* Size of a patch, metres, and how fast the patches drift with the air
     * (m/s): they wander, they do not race. */
    scale: 11,
    drift: 0.22,
    /* How much of the lake is under a paw at once (0–1), and how soft a
     * paw's edge is. */
    /* 0.13: the user's own values, 2026-10-20 (tuner). */
    coverage: 0.13,
    softness: 0.22,
    /* What the ripples keep between paws. Not glass: the reference's water
     * is alive everywhere, and its reflections soft everywhere — at 0.12
     * the stone's reflection kept every seam. The paws are the rougher
     * patches over that. */
    /* 0.44: the user's own values, 2026-10-20 (tuner). */
    glass: 0.44,
  },
} as const;

/** One wave: wavenumber vector (rad/m), amplitude (m) and phase (rad). */
export type Wave = readonly [number, number, number, number];

/* A small, well-mixed integer hash (lowbias32) → [0, 1): the same lake on
   every visit. */
function hash(n: number): number {
  let x = n >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function band(spec: WaveBand, seed: number): Wave[] {
  const waves: Wave[] = [];
  /* Equal slope per wave: the band's RMS slope is √(Σ s²/2). */
  const slope = spec.slope * Math.sqrt(2 / spec.count);
  const [shortest, longest] = spec.wavelengths;
  for (let i = 0; i < spec.count; i += 1) {
    /* Log-spaced, each jittered within its step, so no two waves beat in
       step with each other and the surface never visibly repeats. */
    const t = (i + 0.2 + 0.6 * hash(seed + i * 3)) / spec.count;
    const wavelength = shortest * (longest / shortest) ** t;
    const k = (2 * Math.PI) / wavelength;
    const angle = WATER_MOTION.wind + (hash(seed + i * 3 + 1) * 2 - 1) * spec.spread;
    const phase = hash(seed + i * 3 + 2) * 2 * Math.PI;
    waves.push([k * Math.cos(angle), k * Math.sin(angle), slope / k, phase]);
  }
  return waves;
}

/**
 * THE SWELL IS NOT DRAWN WHILE IT IS OFF (2026-10-23). At a gain of 0 its
 * waves added exactly nothing — each one's slope and blur its amplitude
 * times 0 — and were still summed at every pixel of the lake, in each of
 * the three programs that draw it (6 of the 26 waves), and compiled into
 * each. Off, they are left out, and the sums of the rest are what they
 * were. The tuner (`?tune`), where it can be turned back on, always has it.
 */
const SWELL_DRAWN =
  WATER_MOTION.swell.gain > 0 || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tune"));

/** The swell (where drawn), the undulation, then the ripples (the shader
 *  tells them apart by index). */
export const WAVES: readonly Wave[] = [
  ...(SWELL_DRAWN ? band(WATER_MOTION.swell, 101) : []),
  ...band(WATER_MOTION.undulation, 503),
  ...band(WATER_MOTION.ripples, 907),
];
export const SWELL_COUNT = SWELL_DRAWN ? WATER_MOTION.swell.count : 0;

/** The lapping: wavenumber (rad/m), amplitude (m) and phase, as the waves
 *  are drawn, but running out from the stone's faces. */
export const LAPS: readonly (readonly [number, number, number])[] = (() => {
  const spec = WATER_MOTION.lapping;
  const slope = spec.slope * Math.sqrt(2 / spec.count);
  const [shortest, longest] = spec.wavelengths;
  return Array.from({ length: spec.count }, (_, i) => {
    const t = (i + 0.2 + 0.6 * hash(1301 + i * 2)) / spec.count;
    const k = (2 * Math.PI) / (shortest * (longest / shortest) ** t);
    return [k, slope / k, hash(1302 + i * 2) * 2 * Math.PI] as const;
  });
})();
export const UNDULATION_COUNT = WATER_MOTION.undulation.count;
