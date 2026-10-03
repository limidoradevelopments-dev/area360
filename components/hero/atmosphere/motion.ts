/**
 * ─── Atmosphere · motion ───
 *
 * Every duration, rate and threshold in the fog, with the reason for each.
 * Two kinds of length live here, and the comment on each says which:
 *
 *   CELLS of the simulated air (one cell is `--size-hero-cell`, 4px at the
 *   1440 origin), on the stone's plane, 10 m out. The air is simulated
 *   there because that is where a visitor's hand is: in front of the stone.
 *
 *   METRES in the world, for the fog sheets at their own depths (optics.ts
 *   SHEETS). A bank 125 m out drifting at 0.5 m/s crawls across the screen;
 *   a wisp 5 m out at 0.12 m/s slides past. Nothing here fakes that: it is
 *   what a real camera sees of one wind at different distances.
 *
 * The simulation is Stam's stable fluids with vorticity confinement, carrying
 * a field of fog. Nothing here says how a curl of smoke should look. It says
 * how the air behaves, and the fog follows.
 */

/** Golden ratio. Every idle loop is two terms at this ratio, so it never repeats. */
export const PHI = 1.618033988749895;

/* ── The clock ─────────────────────────────────────────────────────────── */

export const AIR_CLOCK = {
  /* One fluid step per 1/60s, on a fixed clock drained from wall time.
   * NOT the house 1/120: that rule is for explicit springs, which go unstable
   * on long steps. Stable fluids are unconditionally stable; the step rate
   * only sets how finely a moving hand is sampled, and 60 already matches the
   * display. 120 would double the pressure solve for nothing visible. */
  tick: 1 / 60,
  /* With no touch for this long the air is only drifting, and drifting air
   * is slow: it steps every other tick (dt doubled — still stable). The
   * frame still repaints every frame, because the camera and the analytic
   * drift of the far banks are cheaper than the air and must stay smooth. */
  calmAfter: 10,
  calmEvery: 2,
  /* Where the air's clock starts, seconds. The fog's pattern is fixed in
   * the world, so its opening moment is the same on every visit and every
   * screen: at 0 a near wisp sits across the stone for the first ~12 s and
   * the first frame greys it. At 100 the air in front of the stone is
   * clear for the first ~15 s — the design's dark tones — and the banks
   * stand near the design's tones, before the first strand drifts by.
   * (Reduced motion holds this frame.) */
  start: 100,
} as const;

/* ── The air ───────────────────────────────────────────────────────────── */

export const FLUID = {
  /* The grid runs this far past the frame on every side, so a swirl carries
   * fog OUT of view instead of piling it against an invisible wall. */
  marginCells: 24,
  /* Share of last step's pressure kept as the starting guess, so the Jacobi
   * solve (iterations per quality tier: stage/optics.ts RENDER.tiers) starts
   * close and 20 iterations hold the error under what the eye can see. */
  pressureCarry: 0.8,
  /* Seconds for motion to halve. Fog is lazy: a gesture's swirl should
   * outlive the gesture by about a second, then settle into the drift. */
  velocityHalfLife: 0.9,
  /* Vorticity confinement ε: puts back the small curls that grid advection
   * smears out. Low on purpose: fog lives in STABLY STRATIFIED air, which
   * suppresses eddies. At 14 a stirred region boiled like smoke from a fire;
   * at 5 it curls once and lies back down. */
  vorticity: 5,
  /* Seconds (τ) for parted fog to close again. */
  healSeconds: 3.2,
  /* Seconds each set of carried billow coordinates lives before it snaps
   * back. Long enough for a stir to wind into the fog; short enough that the
   * drift never shears it into streaks. */
  carrySeconds: 4,
} as const;

/**
 * THE AIR AT REST: what the simulated field heals back toward.
 *
 * NEARLY UNIFORM, on purpose. The field is shared by every fog sheet, so any
 * pattern in it would sit at the same screen position at every depth — a
 * stencil laid over the frame, the flatness that gives 2D fog away. The
 * sheets carry their own structure, in metres, at their own depths (optics.ts
 * SHEETS). The field only carries what the visitor and the wind DO to the
 * air: a stir, a lane, a gust.
 */
export const FOG = {
  base: 1,
  /* A slow, broad swell of the whole air, ± around the base. */
  variation: 0.12,
  /* One swell per ~90 cells (~360px): larger than any sheet's billows. */
  frequency: 1 / 90,
  evolve: 0.012,
  /* No height profile in the field. The frame's fall from bright sky to dark
   * water is the light (the march through the fog above) and the water's
   * reflectance, not a gradient painted into the air. */
  lowBoost: 0,
  thinAbove: 1,
} as const;

/**
 * HOW REAL FOG MOVES — the research this is built on.
 *
 *   Fog forms in a stable boundary layer: cool, dense air under warmer air.
 *   Stratification suppresses vertical mixing, so the motion is mostly
 *   horizontal and close to laminar; what turbulence survives is small and
 *   FLATTENED (Boundary-Layer Meteorology, DNS of fog formation, 2025).
 *   Wind grows with height, so layers slide over one another and features
 *   are drawn out into long horizontal banks. And stratified air carries
 *   internal gravity waves: fog layers rise and fall quasi-periodically,
 *   with periods of 10–20 minutes in the field (valley-fog case studies).
 */
export const STRATIFICATION = {
  /* Fog features are this many times wider than they are tall. */
  stretch: 2.6,
  /* Wind shear in the simulated air: the wind at the top of the grid is
   * (1 + shear/2) of the drift, at the water (1 − shear/2). */
  shear: 0.8,
  /* Vertical share of the wandering currents: stratified air barely rises. */
  verticalCurrents: 0.25,
  /* Thin wisps stream faster than the body of the fog (they ride higher,
   * where the wind is stronger): extra drift, as a share of the wind. */
  wispDrift: 0.5,
} as const;

/**
 * THE WIND AT EACH DEPTH, metres per second, one per fog sheet (near → far).
 * Negative: right to left, the way the simulated air drifts. Calm near the
 * water and the shore; a breath of real wind over the open lake, where the
 * banks travel. Screen speed is this ÷ depth: ~40 px/s for the nearest
 * wisps, under 10 px/s for the far banks.
 */
export const SHEET_WIND = [-0.12, -0.22, -0.38, -0.55] as const;

/**
 * THE LAYERS' WAVES: internal gravity waves, compressed from the field's
 * 10–20 minutes to half a minute so a visitor sees the fog breathe up and
 * down without ever seeing it repeat (periods at the golden ratio).
 * Amplitude and wavelength are shares of the FRAME at each sheet's depth, so
 * every sheet heaves by the same share of the picture.
 */
export const FOG_WAVES = [
  { amplitude: 0.018, wavelength: 1.3, period: 26 },
  { amplitude: 0.011, wavelength: 0.75, period: 42 },
] as const;

/**
 * THE WIND IN THE SIMULATED AIR: the fog rolls slowly right to left, with
 * slow, wandering, mostly horizontal currents on top. Currents are a noise
 * FORCE; the pressure solve keeps only their swirling part, so they never
 * pump. Cells per second.
 */
export const WIND = {
  /* ~9px/s: slow enough to feel like weather. */
  drift: [-2.3, 0.15] as const,
  /* Per second: an extra pull toward the wind, on top of motion dying back
   * into it (FLUID.velocityHalfLife), for air a gesture has flung far. */
  pull: 0.12,
  /* Cells/s² of wandering current. */
  currents: 4,
  frequency: 1 / 80,
  evolve: 0.02,
} as const;

/* ── Touch ─────────────────────────────────────────────────────────────── */

/**
 * TURBULENCE: what a hand leaves in fog. Kinetic energy in small eddies,
 * carried on the wind, churning and mixing the fog, dying fast.
 *
 * Fog has almost no momentum of its own; a hand through it stirs, it does
 * not push. Stably stratified air also drains turbulence quickly (its energy
 * goes into waves), so the churn is brief.
 */
export const TURBULENCE = {
  /* Seconds for the ENERGY to halve (eddy speed halves in twice that).
   * Short: a hand's wake in real fog closes within a second or so. At 0.7
   * the churn it left lingered ~4 s, a trail behind the hand. */
  halfLife: 0.35,
  /* Eddy force per unit of eddy speed u′, per second. */
  eddyForce: 1.2,
  /* Eddies ~8 cells (~32px): hand-sized and smaller, never a whirlpool. */
  eddySize: 8,
  /* How fast the eddy pattern re-forms, per second: churn, not rotation. */
  churn: 1.4,
  /* Mixing per unit u′: the fog softens and opens where it is stirred. */
  mixing: 0.5,
  /* Thinning per unit u′, per second: clearer air mixed in. Slight. */
  thinning: 0.015,
  /* HOW IT IS SEEN. Turbulence in fog is seen as energy cascading into small
   * structure, so the energy tears the near banks into fine wisps
   * (shaders/sheets.ts):
   *   eddy speed (cells/s) at which the tearing is fully visible, */
  visibleAt: 9,
  /*   how far it departs the fog from the smooth bank, */
  tearing: 0.9,
  /*   the wisps' scale against the banks' (~3.5× finer), */
  wispScale: 3.5,
  /*   and how fast they re-form, per second: they churn. */
  wispRate: 0.9,
} as const;

/**
 * A TAP IS A TOUCH: a pinch of turbulent energy where the finger met the
 * fog, and the barest puff of displaced air. The fog shivers there, churns
 * and settles — no hole is punched.
 */
export const TOUCH = {
  sigma: 8,
  /* Energy per second at the centre, at the envelope's peak. */
  energy: 2200,
  seconds: 0.3,
  /* The puff: a trace of air moved by the finger, a few px of give. Air
   * added thins the fog (continuity): at 2.5 it thinned the spot by ~40%,
   * a hole in the trees under a click. */
  puffSigma: 5,
  puffRate: 0.6,
} as const;

/**
 * A HOLD IS WARMTH. A hand held still in cold fog is a small heat source:
 * the droplets over the palm evaporate and the warmed air rises in a
 * thermal, drawing fog in at its base and lifting it in a slow, widening
 * column of curling wisps.
 */
export const SPELL = {
  /* Seconds before a press becomes a hold. Below ~150ms a quick tap would
   * start one it never finishes; above ~250ms the hold feels ignored. */
  delay: 0.18,
  /* Touch only: travel before the hold starts means a scroll. */
  moveTolerancePx: 10,
  /* Seconds to full strength, on smoothstep. Warmth builds slowly. */
  ramp: 2.4,
  /* The palm and the base of the column (~36px). */
  width: 9,
  /* Upward acceleration at full warmth, cells/s²: a thermal, not a jet. */
  lift: 16,
  /* How far the column reaches before it spends itself, in widths. */
  height: 7,
  /* Turbulent energy per second fed into the column. */
  energy: 320,
  /* Fog lost per second at the palm at full warmth. */
  thinning: 0.8,
  /* e-folds per second of the hand toward the pointer. The air drags. */
  follow: 6,
  /* Letting go: warm air keeps rising a while. */
  releaseSeconds: 1.2,
} as const;

/**
 * THE WAKE: a hand passing through fog drags the air with it. Force along
 * the pointer's velocity, so a still cursor disturbs nothing; the curls it
 * leaves come from vorticity confinement, not from here.
 * Mouse and pen only: on touch, movement is scrolling.
 */
export const WAKE = {
  sigma: 5,
  /* Entrainment: acceleration per unit of pointer velocity, per second.
   * The near bank now shows moving everywhere (optics.ts MIST_SEEN), so
   * the air a hand drags is what the visitor sees: the mist carried along
   * with the hand, dying back into the wind within ~1 s
   * (FLUID.velocityHalfLife). Push, not carve: no lane is left behind. */
  gain: 3,
  /* Turbulent energy per second along the path at full speed, scaled by the
   * square of the speed: a slow pass barely stirs, a quick one churns. */
  energy: 3200,
  /* Pointer speed ceiling, cells/s, so a flick doesn't tear the fog open. */
  maxSpeed: 220,
  /**
   * A passing hand thins the fog a little, per second at full speed.
   * MEASURED BY THE PASS, NOT THE SECOND: a hand crossing a cell spends
   * only ~σ√(2π)/speed there (0.06 s at full speed), so this is ~0.08 of
   * optical depth per pass: a breath. Stronger, the thinned path lingered
   * behind the hand as a tail while the fog healed (FLUID.healSeconds); at
   * 7.5 it pooled where the hand stopped and printed a hole.
   */
  thinning: 1.4,
  /* PRESENCE: a resting hand thins the fog under it, per second, as if by
   * its warmth — healing back over FLUID.healSeconds, it settles at about a
   * seventh gone: felt, not seen. At 0.16 (a third gone) it printed as a
   * dark blot on the trees under a resting cursor: a hole, not a breath. It
   * feeds no turbulence (a still hand stirs nothing). */
  presence: 0.05,
} as const;

/* ── Life, when nobody touches it ──────────────────────────────────────── */

/**
 * GUSTS: now and then the lake breathes — a broad, slow thinning of the fog
 * somewhere in the frame, so the idle visitor is granted a glimpse of the
 * far shore, then watches it close again. Gaps and places come from
 * low-discrepancy sequences (golden ratio in time, R2 in space): never
 * repeating, never clumping, nothing random.
 */
export const GUST = {
  sigma: 55,
  rate: 0.9,
  seconds: 3.5,
  minGap: 10,
  maxGap: 22,
  firstAfter: 12,
  /* After a touch the fog is yours; the lake waits this long. */
  quietAfterTouch: 10,
  /* Where gusts fall, as shares of the frame (y from the top): over the
   * shores and the open water above the stone, where a glimpse means depth. */
  region: { x: [0.08, 0.92], y: [0.22, 0.55] },
} as const;

/**
 * THE BREATH OF THE FOG: its overall thickness rises and falls, barely.
 * Two sines at the golden ratio, so the swell never loops.
 */
export const BREATHING = {
  period: 9.4,
  secondWeight: 0.38,
  /* ± share of the fog's density. */
  amount: 0.06,
} as const;
