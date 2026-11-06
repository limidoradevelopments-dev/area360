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
    /* Off: the user's own value, 2026-10-29 (tuner; ×1.45 since
       2026-10-20). See RIPPLES_DRAWN. */
    gain: 0,
  } satisfies WaveBand & { gain: number },
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
   *
   * THE RINGS STAY (2026-11-06, the user, after a build that replaced them:
   * "keep that previous ripple around the stone"): `count`, `wavelengths`,
   * `slope` and `reach` draw them exactly as before.
   */
  lapping: {
    count: 3,
    wavelengths: [0.1, 0.3],
    slope: 0.08,
    reach: 0.45,
    /**
     * AND OVER THEM, THE LAKE'S OWN WAVES THROWN BACK (2026-11-06, the
     * user: "the water should react to the object"). The rings alone are
     * the stone's: alike on every face, in step all round, a diamond round
     * its foot. A stone standing in a lake also RETURNS the lake's waves
     * (water/shaders/water.ts lapSlope): each of these is one of its short
     * wind waves (`spread` round the wind, as the ripples' band), sent back
     * off a face it runs into, mirrored, its phase meeting the incoming
     * wave's at the wall — a vertical wall reflects a wave whole, and the
     * two cross in the wall's own cross-hatch (the clapotis gaufré of a
     * harbour wall: https://en.wikipedia.org/wiki/Clapotis); round a
     * corner, an arc; past a face it leaves, only `lee` of it, what bends
     * round the corners into the stone's shelter. Laid over the rings they
     * break their diamond where the water comes from and leave it calmer in
     * the lee. The lake's undulation, too slow and too low to draw a
     * wavelet of its own, sets their rhythm: short waves steepen on a
     * longer wave's crest and slacken in its trough (Longuet-Higgins &
     * Stewart, JFM 1960), so as each of its bands reaches the stone they
     * rise by up to `swell` and fall again. `slope` under the rings': at
     * the rings' own it doubled the stir at the stone's foot.
     */
    returns: {
      count: 4,
      slope: 0.05,
      /* Round the wind, ± radians: the ripples' band's. Narrower and every
         wave strikes the same face; wider and the lee is lost. */
      spread: 1.1,
      /* What a face the wave leaves keeps of it: the share that diffracts
         round the corners. At 0 the shaded sides lie glassy, a cut. */
      lee: 0.3,
      /* How far the undulation's bands lift and drop them at the wall, as
         a share at one standard deviation of the lake's height. */
      swell: 0.45,
    },
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
    /* the user's own values, 2026-10-29 (tuner): a little over half
       averaged, the rest drawn (0.3 and 1.6 since 2026-10-20). */
    averaged: 0.56,
    smear: 1.95,
  },
  catsPaws: {
    /* Size of a patch, metres, and how fast the patches drift with the air
     * (m/s): they wander, they do not race. */
    scale: 11,
    drift: 0.22,
    /* How much of the lake is under a paw at once (0–1), and how soft a
     * paw's edge is. */
    /* 0: the user's own value, 2026-10-29 (tuner; 0.13 since 2026-10-20).
       The paws only ever moved the ripples, and the ripples are off: not
       drawn (RIPPLES_DRAWN). */
    coverage: 0,
    softness: 0.22,
    /* What the ripples keep between paws. Not glass: the reference's water
     * is alive everywhere, and its reflections soft everywhere — at 0.12
     * the stone's reflection kept every seam. The paws are the rougher
     * patches over that. */
    /* 0: the user's own value, 2026-10-29 (tuner; 0.44 since 2026-10-20). */
    glass: 0,
  },
} as const;

/**
 * THE HAND ON THE WATER (2026-11-06, the user: "a small ripple effect when
 * mouse movement on water … noticeable … it needs to feel to the user …
 * don't make it very subtle, but don't make it flashy"). Where the
 * pointer's ray meets the lake it touches the water, as a fingertip
 * trailed across it does, and each touch sends out a RING TRAIN: on deep
 * water a touch's waves part by length — the long ones lead at their
 * group speed, the shorter follow, and new rings rise at the back and
 * run out through the front (the Cauchy–Poisson problem: at r metres, t
 * seconds after, the phase is g·t²/(4r) and the wavenumber g·t²/(4r²);
 * Lamb, Hydrodynamics §255). So a touch is a widening ring of two or
 * three crests that becomes five as it spreads and dies — not a circle
 * drawn outward. Drawn only between `wavelengths` (shorter is under a
 * pixel at the stone's distance, longer too slow to read as a touch).
 *
 * Drawn by a small program of its own (water/ripples.ts, shaders/
 * ripples.ts) into a picture the three programs that draw the lake read
 * at their pixel — only while a ring lives, only over the rect the rings
 * cover; nothing read back, and nothing at all once they are gone. Laid
 * inside the lake's surface instead, it cost the open water's cold
 * compile ~0.3 s and the mirror's ~0.15 s; as its own program it compiles
 * in ~60 ms, and a pass with 21 trains live costs within the timer's noise
 * at 1080p (2026-11-06, AMD integrated GPU).
 * THE STONE IS IN THE WATER: a ring is cut off behind it (with a soft edge
 * where it bends round a corner) and thrown back off its two front faces
 * (an image of the touch behind each face, seen only through it), `echo`
 * of it. Mouse and pen only: on touch, a finger's movement is the page's
 * scroll. None under reduced motion.
 */
export const HAND_RIPPLES = {
  /* Touches alive at once. Laid every `gap` at most, 24 cover the last
     ~2.4 s of a fast pass, and the oldest, overwritten, has faded to ~8%
     (at 16, laid every 0.08 s and fading faster, a ring went out ~1.3 s
     on at ~12% of its light: seen to blink off). */
  count: 24,
  /* Drawn between these lengths (m): a hand's ripples, not a fingertip's.
     At the stone's distance the lake is seen at ~6°, a ring there ten
     times wider than it is tall; a fingertip's (5–25 cm) were a few
     pixels tall and read as nothing. */
  wavelengths: [0.04, 0.4] as const,
  /* A HAND IS NOT A POINT. From a point the train opens with no crest at
     all and gains ~2.4 a second over these lengths; with the longer band
     first tried (8–40 cm, ~1.4 a second) each touch opened as one thin
     ellipse, read as a ring drawn on the water. A touch the size of a hand
     has already sent out its first crests as it lands: its rings are drawn
     as if it fell `head` seconds before, faded in over `land`, so it opens
     as one or two and is three within half a second. */
  head: 0.3,
  land: 0.12,
  /* The slope a full touch's rings start at (radians); the stone's
     lapping is 0.08 at its waterline. At 0.12, with a fingertip's lengths,
     a pass at the stone's distance left nothing anyone would notice. */
  slope: 0.22,
  /* A touch every `spacing` CSS px of the pointer's travel over the
     water, never more often than `gap` (s): a trail, not a spray. */
  spacing: 28,
  gap: 0.1,
  /* Its strength by the pointer's speed (CSS px/s): full at `fast`, never
     under `least` — a slow drag still leaves rings, a flick more. */
  fast: 900,
  least: 0.35,
  /* How a touch dies: its rings spread their energy over a growing ring
     (falling as 1/(1 + t/spread)) and the water takes it (e^(−t/life)). */
  spread: 1,
  life: 1.8,
  /* What a front face of the stone throws back (a wall returns nearly all
     of a wave; its corners and its rough face take a little), and how soft
     the stone's shadow is at its edges, in shares of its plan. */
  echo: 0.8,
  soft: 0.12,
  /* No touch further than this (m): past it a ripple is under a pixel
     tall. */
  farthest: 30,
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
const TUNING = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tune");
const SWELL_DRAWN = WATER_MOTION.swell.gain > 0 || TUNING;

/**
 * NOR THE RIPPLES, NOR THEIR CAT'S PAWS, WHILE THEY ARE OFF (2026-10-29,
 * the user: the ripples, the paws' cover and the glass between them all at
 * 0 on the tuner — "remove them completely"). At a gain of 0 the ripples'
 * 14 waves added exactly nothing, and their share of the long exposure's
 * smear is their gain times their slope, nothing too; the cat's paws only
 * ever scaled those two. Still they were summed, and the paws' noise
 * worked out, at every pixel of the lake in three programs. Left out, the
 * frame is the same to the bit (a phone's and 1080p, at rest and leaning)
 * and the lake's three programs ~0.7 ms cheaper a frame at a phone's size
 * (AMD integrated GPU). The tuner keeps them, to be turned on again.
 */
export const RIPPLES_DRAWN = WATER_MOTION.ripples.gain > 0 || TUNING;

/** The swell (where drawn), the undulation, then the ripples (where drawn;
 *  the shader tells them apart by index). */
export const WAVES: readonly Wave[] = [
  ...(SWELL_DRAWN ? band(WATER_MOTION.swell, 101) : []),
  ...band(WATER_MOTION.undulation, 503),
  ...(RIPPLES_DRAWN ? band(WATER_MOTION.ripples, 907) : []),
];
export const SWELL_COUNT = SWELL_DRAWN ? WATER_MOTION.swell.count : 0;

/** The lapping's rings: wavenumber (rad/m), amplitude (m) and phase, as the
 *  waves are drawn, but running out from the stone's faces. (As they were
 *  before 2026-11-06, to the bit.) */
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

/** The lake's short waves the stone throws back (lapping.returns) —
 *  wavenumber (rad/m, x and z), amplitude (m) and phase, as the waves are
 *  drawn (water/shaders/water.ts lapSlope returns them off its faces), over
 *  the rings' lengths. Their directions are spread evenly across the band,
 *  each jittered within its share, so with four there is always one coming
 *  at each face the camera sees, and never two in step. */
export const RETURNS: readonly Wave[] = (() => {
  const spec = WATER_MOTION.lapping.returns;
  const slope = spec.slope * Math.sqrt(2 / spec.count);
  const [shortest, longest] = WATER_MOTION.lapping.wavelengths;
  return Array.from({ length: spec.count }, (_, i) => {
    const t = (i + 0.2 + 0.6 * hash(1401 + i * 2)) / spec.count;
    const k = (2 * Math.PI) / (shortest * (longest / shortest) ** t);
    /* Across the spread in a shuffled order (1, 0, 3, 2 of four), so the
       longest and the shortest do not come from the same side. */
    const slot = (((i * 3 + 1) % spec.count) + 0.25 + 0.5 * hash(1403 + i * 2)) / spec.count;
    const angle = WATER_MOTION.wind + (slot * 2 - 1) * spec.spread;
    return [k * Math.cos(angle), k * Math.sin(angle), slope / k, hash(1402 + i * 2) * 2 * Math.PI] as const;
  });
})();
export const UNDULATION_COUNT = WATER_MOTION.undulation.count;

/**
 * THE RETURNED WAVES' RHYTHM IS READ FROM THE UNDULATION'S LONGEST ONLY.
 * Every wave has the same slope, so its height goes with its length: the
 * three longest of the six hold ~84% of the lake's height variance, and
 * reading all six cost each of the three programs that draw the lake
 * three more cosines a pixel round the stone (measured 2026-11-06, the
 * open water at 1080p, AMD integrated GPU: +0.05–0.15 ms for the whole
 * new lapping, swapped in and out frame by frame). The band is laid out
 * shortest first (band()), so they are its last three.
 */
export const RHYTHM_COUNT = Math.min(3, UNDULATION_COUNT);

/** One over the standard deviation of those waves' height, at their
 *  designed amplitudes (√(Σ A²/2)): what turns the height at the stone into
 *  the share `lapping.returns.swell` is a share of. The gain cancels out. */
export const UNDULATION_HEIGHT = (() => {
  const end = SWELL_COUNT + UNDULATION_COUNT;
  let sum = 0;
  for (let i = end - RHYTHM_COUNT; i < end; i += 1) sum += WAVES[i][2] ** 2 / 2;
  return 1 / Math.sqrt(sum);
})();
