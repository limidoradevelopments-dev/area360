/**
 * ─── Stage · engine ───
 *
 * Owns the WebGL2 context, the clock and the passes. Lives entirely outside
 * React: the component mounts it, forwards pointer events, and otherwise
 * never hears from it again. Per-frame work writes to the GPU and nowhere
 * else.
 *
 * PER FRAME:
 *   camera      the lean spring (camera.ts), on its own fixed 1/120s step
 *   weather     the stillness clock (weather/clock.ts)
 *   air         the simulated air, fixed 1/60s steps (atmosphere/)
 *   sheets      the fog between the planes, a quarter resolution (atmosphere/)
 *   bloom       the two cut flowers on the stone and their cloth, and in
 *               the lake (bloom/): their rays posed on the CPU from the air
 *               the hand moves (atmosphere/hand.ts)
 *   stone       the stone as the camera sees it and as the lake mirrors
 *               it, over rects round it (stone/)
 *   lake        the photograph reflected in the lake (water/lake.ts)
 *   water       the open water's light, the lake laid in (water/open.ts)
 *   scene       the set, the water and the fog, front to back, as linear
 *               light, at the scene's resolution, reading the three above
 *               (shaders/scene.ts)
 *   diffusion   the frame softened over five levels, for the lens's glow
 *   film        at the screen's own resolution: the photograph's detail put
 *               back, the glow, the film and the grain (shaders/post.ts)
 *
 * The loop stops outright when the hero is off screen or the tab is hidden.
 */

import { Atmosphere, type FogLook, type HandGains } from "../atmosphere/atmosphere";
import { createWisps } from "../atmosphere/wisps";
import type { AirParams } from "../atmosphere/fluid";
import { FLUID, WIND } from "../atmosphere/motion";
import { BloomPass, type AirAt } from "../bloom/bloom";
import { BLOOM } from "../bloom/optics";
import { AERIAL, CLARITY, EXTINCTION, MIST, MIST_SEEN, SOFT_BLACK, LIGHT, OVER_PHOTO, SHEETS, VOLUME } from "../atmosphere/optics";
import { STONE } from "../stone/optics";
import { createStoneNoise } from "../stone/noise";
import { SLOT_UNIFORMS, StonePass } from "../stone/stone";
import { LakePass } from "../water/lake";
import { OpenWaterPass } from "../water/open";
import { WATER_MOTION } from "../water/motion";
import { WATER } from "../water/optics";
import { StillnessClock } from "../weather/clock";
import { STILLNESS } from "../weather/motion";
import { RainPass } from "../weather/rain";
import { CAMERA, CAMERA_UNIFORMS, CameraRig, focalPx, frameCenter, setCameraUniforms, type CameraFrame, type SwayParams } from "./camera";
import {
  bindTexture,
  createProgram,
  createTarget,
  deleteTarget,
  discardBound,
  drawsInTiles,
  parseColor,
  programsLinked,
  sendChangedStateOnly,
  setTiledGpu,
  srgbToLinear,
  supportsHalfFloatTargets,
  type Program,
  type Target,
} from "./gl";
import { CLOCKS, PARALLAX } from "./motion";
import { FILM, RENDER } from "./optics";
import { buildPlates, deletePlates, type Plates } from "./plates";
import { DOWN_FRAG, FILM_FRAG, UP_FRAG } from "./shaders/post";
import { SCENE_FRAG } from "./shaders/scene";
import {
  DEVELOP_UNIFORMS,
  FOG_UNIFORMS,
  MIST_UNIFORMS,
  PLATE_UNIFORMS,
  SHEET_UNIFORMS,
  STONE_UNIFORMS,
  UNITS,
  WATER_UNIFORMS,
  setDevelopUniforms,
  setFogUniforms,
  setMistUniforms,
  setPlateUniforms,
  setSheetUniforms,
  setStoneUniforms,
  setWaterUniforms,
  type SetFrame,
} from "./uniforms";

/* ── Public surface ───────────────────────────────────────────────────── */

/** Everything the tuning panel may move. Defaults are the designed values. */
export interface StageParams extends AirParams, HandGains, FogLook, SwayParams {
  nearExtinction: number;
  farExtinction: number;
  bankFrom: number;
  bankTo: number;
  lift: number;
  /** Sheet 0's wisps: veil (optical depth) and sharpness. */
  veil: number;
  wisps: number;
  /** How much of the fog's movement shows over the photograph (OVER_PHOTO). */
  fogLife: number;
  /** The still fog of distance over the photograph, per metre (AERIAL). */
  aerial: number;
  exposure: number;
  /** The foot's burn: where it begins (share of the height), stops at the foot. */
  footFrom: number;
  footStops: number;
  /** The lake's own burn, stops: just under the horizon, at the foot. */
  lakeBurnHorizon: number;
  lakeBurnFoot: number;
  lakeBurnShape: number;
  lakeContrast: number;
  vignette: number;
  /** The afternoon paper's white and gamma (FILM.paper). */
  paperWhite: number;
  paperGamma: number;
  /** The user's regrade over the paper (FILM.regrade): 0 none, 1 theirs. */
  regrade: number;
  /** The lens's glow: strength, and how far it reaches (FILM.diffusion). */
  diffusion: number;
  /** Bright air spilling over the photograph's dark edges (FILM.halation). */
  halation: number;
  /** Fog thickened in front of the near bank's darkest trees (SOFT_BLACK.amount). */
  softBlack: number;
  /** The photograph's own haze taken back, optical depth (CLARITY.amount). */
  clarity: number;
  spread: number;
  shadows: number;
  highlights: number;
  toe: number;
  knee: number;
  grain: number;
  /** The rain (weather/optics.ts RAIN): 0 none, 1 designed. */
  rain: number;
  /** The stone's light (stone/optics.ts STONE): irradiance on the top, the
   *  face turned from the light and the one turned to it; the sheen's sky
   *  on the top and on a face; what each face's foot keeps. */
  stoneTop: number;
  stoneAway: number;
  stoneToward: number;
  sheenTop: number;
  sheenFace: number;
  footAway: number;
  footToward: number;
  /** The lake: swell, undulation and ripple gains (1 = designed), and the
   *  cat's paws' coverage and the glass left between them. */
  swell: number;
  undulation: number;
  ripples: number;
  /** How much more the stone's reflection wavers than its path gives (WATER.waver). */
  waver: number;
  /** The lake lapping at the stone, as a gain (1 = designed: water/motion.ts lapping). */
  lapping: number;
  /** The long exposure (water/motion.ts exposure): how much of the
   *  undulation and ripples it averages (0 = the lake of before), and the
   *  smear it leaves, 1 = their own slope. */
  longExposure: number;
  smear: number;
  paws: number;
  glass: number;
  /** The near bank's drifting self-shade over the open fog (MIST_SEEN.grey). */
  mistSeen: number;
  /** The low mist (atmosphere/optics.ts MIST): how much of it, 1 = the
   *  user's reference; and how far it moves with the fog, 1 = designed
   *  (0 holds it still: the fit in scripts/hero-plates/mist.py). */
  mistAmount: number;
  mistMotion: number;
  /** Its light, from the fog's shadow (0) to its glow (1): MIST.light. */
  mistLight: number;
  /** How much of it lies round the stone, 1 = designed (MIST.stone). */
  mistStone: number;
  /** How much it is lit as a volume, 1 = designed (MIST.volume). */
  mistVolume: number;
  /** The cut flowers (bloom/): which ones, 0–1 (BLOOM.seed: the same on
   *  every visit, as the first paint is). */
  bloomSeed: number;
  /** How much the cloth's tails sway in the hand's air, 1 = designed
   *  (bloom/motion.ts SWAY; 0 holds them still). */
  clothSway: number;
}

export function defaultParams(): StageParams {
  return {
    vorticity: FLUID.vorticity,
    velocityHalfLife: FLUID.velocityHalfLife,
    healSeconds: FLUID.healSeconds,
    currents: WIND.currents,
    breath: 1,
    spell: 1,
    wake: 1,
    detail: 1,
    /* 3: the user's own value, 2026-10-20 (tuner). */
    form: 3,
    selfShadow: VOLUME.selfShadow,
    lightExtinction: LIGHT.extinction,
    ambient: LIGHT.ambient,
    nearExtinction: EXTINCTION.near,
    farExtinction: EXTINCTION.far,
    bankFrom: EXTINCTION.bankFrom,
    bankTo: EXTINCTION.bankTo,
    lift: EXTINCTION.lift,
    veil: SHEETS[0].veil,
    wisps: SHEETS[0].sharpness,
    mistSeen: MIST_SEEN.grey,
    mistAmount: 1,
    mistMotion: 0.95,
    mistLight: MIST.light,
    mistStone: 1,
    mistVolume: 1,
    fogLife: OVER_PHOTO.amount,
    aerial: AERIAL.perMetre,
    swayX: PARALLAX.sway[0],
    swayY: PARALLAX.sway[1],
    swayRate: PARALLAX.frequency,
    followMix: PARALLAX.follow.mix,
    exposure: FILM.exposure,
    footFrom: FILM.foot.from,
    footStops: FILM.foot.stops,
    lakeBurnHorizon: FILM.lakeBurn.atHorizon,
    lakeBurnFoot: FILM.lakeBurn.atFoot,
    lakeBurnShape: FILM.lakeBurn.shape,
    lakeContrast: FILM.lakeBurn.contrast,
    vignette: FILM.vignette.amount,
    paperWhite: FILM.paper.white,
    paperGamma: FILM.paper.gamma,
    /* 0.81 of the way to it: the user's own setting (2026-10-18), a touch
       lighter than their print; 0.92 since 2026-10-20, theirs again. */
    regrade: 0.92,
    diffusion: FILM.diffusion.amount,
    halation: FILM.halation,
    softBlack: SOFT_BLACK.amount,
    clarity: CLARITY.amount,
    spread: FILM.diffusion.spread,
    shadows: FILM.print.shadows,
    highlights: FILM.print.highlights,
    toe: FILM.print.toe,
    knee: FILM.print.knee,
    grain: FILM.grain,
    /* The user's own values (tuner): the rain ×1.25 (2026-10-20); the
       lake's swell and ripples off, undulation ×0.70, lapping ×0.95
       (2026-10-29; undulation ×0.45 and ripples ×1.45 since 2026-10-20). */
    rain: 1.25,
    stoneTop: STONE.light.top,
    stoneAway: STONE.light.sideAway,
    stoneToward: STONE.light.sideToward,
    sheenTop: STONE.sheen.top,
    sheenFace: STONE.sheen.face,
    footAway: STONE.foot.away,
    footToward: STONE.foot.toward,
    swell: WATER_MOTION.swell.gain,
    undulation: 0.7,
    ripples: WATER_MOTION.ripples.gain,
    waver: WATER.waver,
    lapping: 0.95,
    longExposure: WATER_MOTION.exposure.averaged,
    smear: WATER_MOTION.exposure.smear,
    paws: WATER_MOTION.catsPaws.coverage,
    glass: WATER_MOTION.catsPaws.glass,
    bloomSeed: BLOOM.seed,
    clothSway: 1,
  };
}

export interface StageEngineOptions {
  canvas: HTMLCanvasElement;
  /** The element the stage fills; measured for size, read for tokens. */
  frame: HTMLElement;
  reducedMotion: boolean;
  /** The first frame exists; the canvas may be shown. */
  onFirstFrame: () => void;
  /** The context is gone; the static paint must come back. */
  onLost: () => void;
  /** How far the stage has got toward its first frame, 0–1: the shores'
   *  downloads, the shaders compiled, the device measured in the dark. */
  onProgress?: (fraction: number) => void;
  /** Even the slowest rung cannot keep up here (stage/optics.ts RENDER):
   *  what stands in is the page's to decide. Called once; without it the
   *  slowest rung stays. */
  onFloor?: () => void;
  /** The visitor's quality: a tier of RENDER.tiers (0 best) held for the
   *  visit, only the frame rate giving way; null or absent, the device is
   *  measured and watched (RENDER). Changed later by `setQuality`. */
  quality?: number | null;
  /** The tier the scene is drawing at, on the reveal and on every change
   *  after it (the ladder's, or the visitor's). */
  onTier?: (tier: number) => void;
  /** Started before the page has hydrated (StageCanvas): it compiles and
   *  loads at once, but neither sizes the canvas nor draws until `attach`. */
  detached?: boolean;
}

export interface StageEngine {
  readonly params: StageParams;
  setParams(next: Partial<StageParams>): void;
  setReducedMotion(reduced: boolean): void;
  /** The visitor's quality (StageEngineOptions.quality): a tier, or null for
   *  the device's own. Takes effect on the next frame; compiles nothing. */
  setQuality(tier: number | null): void;
  setVisible(visible: boolean): void;
  /** Re-measure the frame and the tokens. */
  resize(): void;
  pointerDown(clientX: number, clientY: number, pointerType: string): void;
  pointerMove(clientX: number, clientY: number, pointerType: string): void;
  pointerUp(): void;
  pointerLeave(): void;
  /** The visitor did something that is not a pointer (scroll, a key). */
  activity(): void;
  /** The page lets the scene come up (its curtain has begun to lift): the
   *  arrival begins — at once if the stage is ready, else as soon as it is.
   *  Until then a ready stage holds, drawing nothing. */
  start(): void;
  /** The page has hydrated (an engine started `detached`): the frame may now
   *  be measured and the canvas sized. */
  attach(): void;
  /** Development only: run `seconds` of stage time synchronously, then paint. */
  advance(seconds: number): void;
  /** Development only: lean the camera toward a frame point (−1…1, y up). */
  lean(nx: number, ny: number): void;
  /** Development only: paint, read the frame back, and return the mean
   *  brightness (0–255, Rec. 709 luma) of `bands` horizontal bands, over the
   *  columns between `from` and `to` (shares of the width). */
  measure(bands?: number, from?: number, to?: number): number[];
  /** Development only: paint, and return the mean brightness (0–255) of a
   *  `columns` × `rows` grid over the frame, row by row from the top. For
   *  comparing the frame with the reference cell by cell. */
  grid(columns: number, rows: number): number[][];
  /** Development only: paint, and return the mean brightness (0–255) of
   *  every CSS-px column between rows `from` and `to` (shares of the height
   *  from the top). For measuring how far a depth slides in the parallax. */
  profile(from: number, to: number): number[];
  /** Development only: each fog sheet's mean density and light, by third
   *  of the frame (see Atmosphere.probe). */
  probe(): { density: number[][]; light: number[][] };
  /** Development only: GPU time of each pass (ms, median of `frames`), from
   *  timer queries. Null where the extension is not offered. */
  gpuTimings(frames?: number): Promise<{ air: number; sheets: number; scene: number; film: number } | null>;
  /** The weather's level, 0–1 (stillness clock). */
  readonly weather: number;
  dispose(): void;
}

/**
 * Returns null when the stage cannot run here (no WebGL2, no half-float
 * render targets, a shader that will not compile). The caller keeps the
 * static paint.
 */
export function createStageEngine(options: StageEngineOptions): StageEngine | null {
  const gl = options.canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    /* The faster GPU where there are two and the browser lets a page
       choose: a dual-GPU Mac (Safari, Chrome). Chrome and Edge on Windows
       ignore it — the GPU process takes one adapter for every page
       (measured 2026-10-23: the integrated one, asked either way). */
    powerPreference: "high-performance",
  });
  if (!gl || !supportsHalfFloatTargets(gl)) return null;
  /* Phones' tiles: the passes say what they overwrite (gl.ts discardBound). */
  setTiledGpu(drawsInTiles(gl));
  /* A uniform, a binding, the viewport: sent only when it changes (gl.ts). */
  sendChangedStateOnly(gl);
  /* Asked for before the first shader, so every compile can run on the
     browser's own threads (gl.ts programsLinked). */
  gl.getExtension("KHR_parallel_shader_compile");
  try {
    return new Stage(gl, options);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

/* ── Implementation ───────────────────────────────────────────────────── */

type Rgb = readonly [number, number, number];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The film's print curve (film.ts printCurve), on an encoded value. */
function printCurve(c: number, pivot: number, shadows: number, highlights: number, toe: number, knee: number): number {
  const e = c - pivot;
  let v = Math.max(pivot + e * (shadows + (highlights - shadows) * smoothstep(-0.08, 0.08, e)), 0);
  const room = 1 - knee;
  v = Math.min(v, knee) + room * Math.tanh(Math.max(v - knee, 0) / room);
  v += toe * (1 - smoothstep(0, 0.25, v));
  return v;
}

/** A measured curve (print values, 0–255 knots), on a print value 0–1. */
function throughKnots(knots: readonly (readonly [number, number])[], x: number): number {
  const v = x * 255;
  for (let i = 1; i < knots.length; i += 1) {
    const [x1, y1] = knots[i];
    if (v <= x1) {
      const [x0, y0] = knots[i - 1];
      return (y0 + ((v - x0) / (x1 - x0)) * (y1 - y0)) / 255;
    }
  }
  return knots[knots.length - 1][1] / 255;
}

/** The design's grade (FILM.grade), on a print value 0–1. */
function grade(x: number): number {
  return throughKnots(FILM.grade, x);
}

/**
 * The user's regrade (FILM.regrade) as 65 samples of the print value (film.ts
 * regrade reads them): `amount` of the way from the afternoon paper alone
 * (0) to the regrade (1).
 */
function regradeTable(amount: number): Float32Array<ArrayBuffer> {
  const table = new Float32Array(65);
  for (let i = 0; i <= 64; i += 1) {
    const x = i / 64;
    table[i] = x + (throughKnots(FILM.regrade, x) - x) * amount;
  }
  return table;
}

/**
 * The photograph's print value → the encoded value the film must start
 * from to print it as the design graded it: 65 samples (film.ts undevelop
 * reads them). The grade, then the print curve inverted — the curve only
 * rises, so each is found by halving; a value below the toe, which no
 * radiance prints as, takes the curve's black.
 */
function unprintTable(pivot: number, shadows: number, highlights: number, toe: number, knee: number): Float32Array<ArrayBuffer> {
  const table = new Float32Array(65);
  for (let i = 0; i <= 64; i += 1) {
    const target = grade(i / 64);
    let lo = 0;
    let hi = 3;
    for (let k = 0; k < 40; k += 1) {
      const mid = 0.5 * (lo + hi);
      if (printCurve(mid, pivot, shadows, highlights, toe, knee) < target) lo = mid;
      else hi = mid;
    }
    table[i] = 0.5 * (lo + hi);
  }
  return table;
}

/* The diffusion's pyramid: half the scene, then each level half again. */
const GLOW_LEVELS = 5;

/** EXT_disjoint_timer_query_webgl2's two names this engine uses. */
type TimerQueries = { readonly TIME_ELAPSED_EXT: GLenum; readonly GPU_DISJOINT_EXT: GLenum };

/**
 * The slowest rung's interval, in display frames: the display's frame
 * nearest RENDER.floorFps, as the cap at 30 has always drawn (every other
 * frame at 60 Hz, every fourth at 120, every fifth at 144).
 */
function floorEvery(vsync: number): number {
  return Math.max(1, Math.ceil(1000 / RENDER.floorFps / vsync - 0.5));
}

/** A visitor's quality → a tier of RENDER.tiers, or null for the device's
 *  own. */
function fixedTier(quality: number | null | undefined): number | null {
  if (quality === null || quality === undefined || !Number.isFinite(quality)) return null;
  return Math.min(RENDER.tiers.length - 1, Math.max(0, Math.round(quality)));
}

/** The `q` quantile of `values` (sorts a copy). */
function quantile(values: readonly number[], q: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

const COLOR_TOKENS = ["lit", "shade", "stone", "water", "petal", "disc", "stem", "cloth", "pollen"] as const;
type ColorToken = (typeof COLOR_TOKENS)[number];

class Stage implements StageEngine {
  readonly params = defaultParams();

  private readonly gl: WebGL2RenderingContext;
  private readonly options: StageEngineOptions;
  private readonly vao: WebGLVertexArrayObject;
  private readonly scene: Program;
  private readonly film: Program;
  private readonly down: Program;
  private readonly up: Program;
  private readonly atmosphere: Atmosphere;
  private readonly bloom: BloomPass;
  private readonly stone: StonePass;
  private readonly lake: LakePass;
  private readonly water: OpenWaterPass;
  private readonly rain: RainPass;
  /* The steam's patches, drifting through the low mist (atmosphere/wisps.ts):
     not made while it is off (MIST.on). */
  private readonly wisps: WebGLTexture | null;
  /* The stone's noise lattice (stone/noise.ts). */
  private readonly stoneNoise: WebGLTexture;
  private readonly camera = new CameraRig();
  private readonly stillness = new StillnessClock();
  private plates: Plates | null = null;

  /* Frame, in CSS px, and what was read from it. */
  private cssW = 1;
  private cssH = 1;
  private cellPx = 4;
  private dpr = 1;
  /* The scene's light, and the diffusion's levels (down, then back up). */
  private sceneTarget: Target | null = null;
  private glowDown: Target[] = [];
  private glowUp: Target[] = [];
  /* Device px per scene px. */
  private upscale = 1;
  /* Raised by the adaptive watcher and never lowered, so neither a resize
     nor a good second undoes a step-down the frame rate asked for. */
  private tier = 0;
  /* The visitor's tier (StageEngineOptions.quality), held whatever the
     frame rate does; null: the device's own, measured and watched. */
  private fixed: number | null = null;
  /* What the dark measured, for a visitor going back to Auto after the
     reveal (nothing can be measured in the dark then: it is in view). */
  private measured: { tier: number; every: number } | null = null;
  /* The tier last told to the page (onTier). */
  private reportedTier = -1;
  /* The diffusion's pyramid holds this frame's light (RENDER.tiers
     glowEvery), and the frames drawn since it was made. */
  private glowValid = false;
  private glowAge = 0;
  /* Development only: the scene's pixel cap raised past the tier's, for
     close-up stills of the plant (set from the console, then resize()). */
  private sceneCap = 0;
  private colors: Record<ColorToken, Rgb> = {
    lit: [1, 1, 1],
    shade: [0.5, 0.5, 0.5],
    stone: [0.25, 0.25, 0.25],
    water: [0, 0, 0],
    petal: [0.8, 0.8, 0.8],
    disc: [0.5, 0.4, 0.1],
    stem: [0.2, 0.25, 0.1],
    cloth: [0.7, 0.7, 0.7],
    pollen: [0.8, 0.65, 0.35],
  };

  /* Clock. `time` only advances while the loop runs; the lake's own time
     stands still under reduced motion (the water holds its last shape). */
  private time = 0;
  private waterTime = 0;
  /* The low mist's drift: slowed as the air's is under reduced motion. */
  private mistTime = 0;
  /* The rain's clock: it stands still under reduced motion, a print of
     rain (weather/). */
  private rainTime = 0;
  /* The shores' downloads, cancelled if the stage is torn down first. */
  private readonly fetches = new AbortController();
  /* Seconds the scene has been on screen this visit: the pollen's idle
     shedding wanders on it. */
  private bloomClock = 0;
  private lastTime = 0;
  private raf = 0;
  private frameAverage = 1000 / 60;
  /* Since when the average has been slow (ms), or −1. */
  private slowSince = -1;
  /* The rung of the ladder the visit is on (stage/optics.ts RENDER): its
     tier, and every how many of the display's frames one is drawn (1:
     each); and the display's own frame, the shortest interval seen. */
  private every = 1;
  private vsync = 1000 / 60;
  private lastDisplay = 0;
  private displayProbe = 0;
  /* The display's last intervals (ms), the frame read from them. */
  private readonly intervals: number[] = [];
  private intervalsSeen = 0;
  private floored = false;
  /* The arrival's targets are to be fitted to the resting scene once it is
     over (stone.ts refit). */
  private fitPending = false;
  /* Measuring the device in the dark (RENDER.calibrate): the tier being
     tried, the frames drawn of it, their work on the GPU's clock and end to
     end, since when. None once the scene is revealed. */
  private calibration: { tier: number; seen: number; timed: number[]; waited: number[]; since: number } | null = null;
  private readonly probePixel = new Uint8Array(4);
  /* The GPU's own clock (EXT_disjoint_timer_query_webgl2), where offered,
     and the frames timed on it whose answers have not come back yet (they
     come back no sooner than the next task). */
  private readonly timer: TimerQueries | null;
  private readonly timing: { query: WebGLQuery; cpu: number; tier: number }[] = [];
  /* The frame rate stepping back up after the arrival (RENDER.stepUp): the
     window being timed, if any; done once tried, and never once the watcher
     has stepped down. */
  private stepUp: { since: number; samples: number[] } | null = null;
  private stepUpTried = false;
  private steppedDown = false;
  /* The page's curtain: the arrival waits for `start` (the preloader
     stands in front until then), drawing nothing. */
  private startAsked = false;
  private waiting = false;
  /* Shares of the way to the first frame (onProgress): the shores, the
     shaders, the measuring in the dark. */
  private readonly loaded = [0, 0, 0];
  /* Started before the page hydrated: settled once it has (attach). */
  private readonly attached: Promise<void>;
  private markAttached: (() => void) | null = null;

  /* The last pointer position, to tell a movement from a tremor. */
  private lastPointer: [number, number] | null = null;
  /* The frame's place in the viewport, read once and kept until a resize or
     a scroll moves it: read on every pointer move, it made the browser
     recompute style mid-frame whenever anything had changed since (the
     entrance's fade does, every frame). */
  private frameRect: DOMRect | null = null;
  /* The air's frame this frame, and a scratch cell (airAt: called for every
     mote of pollen, it allocates nothing). */
  private airFrame: Atmosphere["air"] = null;
  private readonly cell: [number, number] = [0, 0];
  private readonly restCenter: [number, number] = [0.5, 0.5];

  private visible = true;
  private reduced: boolean;
  /* Every program has linked: the frame can be measured (which draws the
     air's first state) and drawn. */
  private linked = false;
  private ready = false;
  private disposed = false;
  private lost = false;

  constructor(gl: WebGL2RenderingContext, options: StageEngineOptions) {
    this.gl = gl;
    this.options = options;
    this.reduced = options.reducedMotion;
    /* A visitor's tier is where the dark starts, and stays. */
    this.fixed = fixedTier(options.quality);
    this.tier = this.fixed ?? 0;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("stage: no vertex array");
    this.vao = vao;
    this.attached = options.detached ? new Promise((resolve) => (this.markAttached = resolve)) : Promise.resolve();

    /* THE LONGEST COMPILES ARE STARTED FIRST: the scene, the water, the
       lake, the stone. A first visit waits for the last program, and on
       Windows the scene alone took ~6 s of a ~7 s compile (2026-10-23):
       created ~19th, it was linked ~0.35 s after the first. (Worth at most
       that: Chrome does not compile strictly in the order programs are
       created.) */
    this.scene = createProgram(gl, SCENE_FRAG, [
      ...CAMERA_UNIFORMS, ...FOG_UNIFORMS, ...SHEET_UNIFORMS, ...WATER_UNIFORMS,
      ...STONE_UNIFORMS, ...PLATE_UNIFORMS, ...DEVELOP_UNIFORMS, ...SLOT_UNIFORMS, ...MIST_UNIFORMS,
      "uWaterOpen", "uLakeBurn", "uBloomNear", "uBloomRect",
    ]);
    this.water = new OpenWaterPass(gl, vao);
    this.lake = new LakePass(gl, vao);
    this.stone = new StonePass(gl, vao);
    this.atmosphere = new Atmosphere(gl, vao);
    this.bloom = new BloomPass(gl, vao, this.params.bloomSeed);
    this.rain = new RainPass(gl, vao);
    this.wisps = MIST.on ? createWisps(gl) : null;
    this.stoneNoise = createStoneNoise(gl);
    this.film = createProgram(gl, FILM_FRAG, [
      ...CAMERA_UNIFORMS, "uFlowerPrint", "uFlowerTone", "uFlowerBox", "uClothPrint", "uClothBox", "uFlowerAir",
      "uScene", "uGlow", "uDiffusion", "uHalation", "uUpscale", "uPlate", "uBackdropDepth", "uPlateGeo", "uPlateAxis",
      "uBackdropNearest", "uExposure", "uPrint", "uKnee", "uUnprint", "uFoot", "uVignette", "uPaper", "uRegrade", "uGrain",
      "uBloomFine", "uBloomCoarse", "uBloomFineRect", "uBloomCoarseRect", "uSceneSize", "uBloomHalo", "uBloomHaloRect", "uBloomHaloSize",
    ]);
    this.down = createProgram(gl, DOWN_FRAG, ["uSource", "uTexel", "uWeights"]);
    this.up = createProgram(gl, UP_FRAG, ["uCoarse", "uFine", "uTexel", "uSpread"]);
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerQueries | null;

    options.canvas.addEventListener("webglcontextlost", this.handleLost);
    this.probeDisplay();
    void this.load();
  }

  /**
   * THE DISPLAY'S OWN FRAME, read all the while the shaders compile (its
   * frames, nothing drawn: an idle loop costs the compile nothing, measured
   * cold, where any animation slows it 2–4×), and after from the frame
   * loop. The ladder is laid out from it (RENDER), so it must be known
   * before the device is measured; read only in the page's first moments,
   * busy hydrating, a 120 Hz display read as 60. The frames drawn in the
   * dark are each waited for, and their intervals say nothing about it.
   */
  private probeDisplay(): void {
    let last = 0;
    const step = (now: number) => {
      if (last > 0) this.displayInterval(now - last);
      last = now;
      this.displayProbe = this.ready || this.disposed ? 0 : requestAnimationFrame(step);
    };
    this.displayProbe = requestAnimationFrame(step);
  }

  /**
   * One interval between the display's frames (ms). THE LOWER QUARTILE OF
   * THE LAST 120, NOT THE SHORTEST: a frame's timestamp jitters, and the
   * shortest ever seen crept from a 120 Hz display's 8.3 ms to 6.3, making
   * every frame at 60 look late to the watcher, which stepped a fast GPU
   * down to 30 (2026-10-23). A busy page only lengthens intervals (two
   * frames' worth, three), so the quick end of them is the display's frame;
   * and the estimate only ever comes down, or a device too slow for every
   * frame would read its own slowness as the display's. Between 4 and 50 ms
   * (250 to 20 Hz): anything else is a stall.
   */
  private displayInterval(ms: number): void {
    if (ms <= 4 || ms >= 50) return;
    const list = this.intervals;
    list.push(ms);
    if (list.length > 120) list.shift();
    this.intervalsSeen += 1;
    if (list.length >= 8 && (list.length < 120 || this.intervalsSeen % 30 === 0)) this.vsync = Math.min(this.vsync, quantile(list, 0.25));
  }

  get weather(): number {
    return this.stillness.level;
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────── */

  /**
   * THE SHORES AND THE SHADERS AT ONCE. The images are fetched (already on
   * their way: HeroSection preloads them with the page) and decoded while
   * the driver compiles, instead of after: either alone was most of the
   * wait. Only then is the frame measured — measuring draws the air's first
   * state, which needs its programs.
   */
  private async load(): Promise<void> {
    const alive = () => !this.disposed && !this.lost;
    let plates: Plates | null;
    try {
      [plates] = await Promise.all([
        buildPlates(this.gl, alive, this.fetches.signal, (f) => this.progress(0, f)),
        programsLinked(this.gl, alive, (f) => this.progress(1, f)),
      ]);
    } catch (error) {
      if (alive()) {
        console.warn(error);
        this.options.onLost();
      }
      return;
    }
    if (!plates) return;
    /* Started before the page hydrated: the frame is measured (the canvas
       sized) only once it has. */
    await this.attached;
    if (!alive()) {
      /* Gone while the shaders compiled: the plates arrived after dispose
         and were never its to delete. */
      if (!this.gl.isContextLost()) deletePlates(this.gl, plates);
      return;
    }
    this.linked = true;
    this.measureFrame();
    this.plates = plates;
    this.ready = true;
    /* MEASURED IN THE DARK (stage/optics.ts RENDER.calibrate): frames drawn
       unseen, held at the opening shot, the costliest view, before the
       scene is revealed (reveal). */
    this.camera.arrive();
    this.calibration = { tier: this.tier, seen: 0, timed: [], waited: [], since: performance.now() };
    /* The flowers posed before their first frame. */
    this.stepBloom(0);
    this.render();
    this.syncLoop();
  }

  /** Part `part` of the way to the first frame is `fraction` done: the
   *  page told the whole (the shores 0.4, the shaders 0.45, the measuring
   *  0.15 — roughly their shares of a first visit's wait). */
  private progress(part: number, fraction: number): void {
    if (fraction <= this.loaded[part]) return;
    this.loaded[part] = fraction;
    this.options.onProgress?.(0.4 * this.loaded[0] + 0.45 * this.loaded[1] + 0.15 * this.loaded[2]);
  }

  /**
   * Measured: the visit starts on tier `tier`, drawing every `every`th of
   * the display's frames, and the page is told the stage is ready. The
   * arrival waits for the page's curtain (`start`).
   */
  private reveal(tier: number, every: number): void {
    this.calibration = null;
    this.dropTimings();
    this.setRung(tier, every);
    if (this.fixed === null) this.measured = { tier, every };
    this.reportTier();
    this.progress(2, 1);
    this.options.onFirstFrame();
    if (this.startAsked) this.begin();
    else this.waiting = true;
  }

  start(): void {
    this.startAsked = true;
    if (this.waiting) this.begin();
  }

  attach(): void {
    this.markAttached?.();
    this.markAttached = null;
  }

  /**
   * The scene comes up out of the dark on its ARRIVAL — the camera from
   * where it starts and the air set moving (stage/motion.ts ARRIVAL,
   * atmosphere/motion.ts ARRIVAL_AIR); under reduced motion it is simply
   * there.
   */
  private begin(): void {
    this.waiting = false;
    if (this.reduced) this.camera.settle();
    else this.camera.arrive();
    this.atmosphere.beginArrival();
    /* The rain arrives on the visit's clock (weather/motion.ts
       RAIN_MOTION.onset): the visit begins now. */
    this.rainTime = 0;
    this.fitPending = true;
    this.slowSince = -1;
    this.frameAverage = this.every * this.vsync;
  }

  /** Onto a rung: its tier (the targets rebuilt only if that changed), and
   *  every how many display frames one is drawn. */
  private setRung(tier: number, every: number): void {
    this.every = every;
    if (tier !== this.tier) {
      this.tier = tier;
      this.measureFrame();
    }
    if (!this.calibration) this.reportTier();
  }

  /** The page is told the tier, when it has changed. */
  private reportTier(): void {
    if (this.tier === this.reportedTier) return;
    this.reportedTier = this.tier;
    this.options.onTier?.(this.tier);
  }

  /**
   * The fastest rung `tier` is drawn at, in display frames. The device's
   * own: full quality at any even rate, a cheaper tier at the slowest only
   * (RENDER, the ladder: the frame rate gives way before the picture). The
   * visitor's: any even rate, but Low (`capped`) at the slowest — it is
   * chosen to spare the device.
   */
  private fastestEvery(tier: number): number {
    const floor = floorEvery(this.vsync);
    if (this.fixed === null) return tier > 0 ? floor : 1;
    return RENDER.tiers[tier].capped ? floor : 1;
  }

  setQuality(tier: number | null): void {
    const next = fixedTier(tier);
    if (next === this.fixed) return;
    this.fixed = next;
    /* Not linked yet: the dark starts on it (load). */
    if (!this.linked) {
      this.tier = next ?? 0;
      return;
    }
    const c = this.calibration;
    if (c) {
      /* Still in the dark: measured again, from the new start. */
      this.tier = next ?? 0;
      this.measureFrame();
      this.dropTimings();
      c.tier = this.tier;
      c.seen = 0;
      c.timed.length = 0;
      c.waited.length = 0;
      c.since = performance.now();
      return;
    }
    /* IN VIEW: onto the chosen tier — or, back to Auto, onto what the dark
       measured — no faster than the frame rate now (a heavier tier may not
       hold it); the step back up and the watcher start afresh from there,
       so a lighter tier climbs to the rate it holds and a heavier one falls
       to it. */
    const target = next ?? this.measured?.tier ?? 0;
    const every = next === null && this.measured ? this.measured.every : Math.max(this.fastestEvery(target), this.every);
    this.stopStepUp();
    this.steppedDown = false;
    this.stepUpTried = false;
    this.slowSince = -1;
    this.setRung(target, every);
    this.frameAverage = this.every * this.vsync;
    if (this.ready && !this.raf) this.render();
  }

  /**
   * Whether `work` ms a frame holds a rung drawing every `every`th display
   * frame (RENDER.share): `timed` on the GPU's clock, else end to end.
   */
  private holds(work: number, every: number, timed: boolean): boolean {
    const share = timed ? RENDER.share.timed : every > 1 ? RENDER.share.waited.capped : RENDER.share.waited.full;
    return work <= share * every * this.vsync;
  }

  /** A frame's GPU work is to be timed: its query begun, or null where
   *  there is no GPU clock. End it right after the frame's last draw. */
  private beginTiming(): WebGLQuery | null {
    if (!this.timer) return null;
    const query = this.gl.createQuery();
    if (query) this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
    return query;
  }

  private endTiming(query: WebGLQuery | null): void {
    if (query && this.timer) this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
  }

  /** An ended query to be read once its answer is back (collectTimings),
   *  with its frame's script ms. */
  private trackTiming(query: WebGLQuery | null, cpu: number): void {
    if (query) this.timing.push({ query, cpu, tier: this.tier });
  }

  /**
   * The timed frames whose answers are back, oldest first, each handed on
   * as its work: the larger of its script's ms and its GPU's (the two run
   * side by side). All are dropped if the GPU's clock was disturbed (a
   * disjoint: its frequency changed, or another context took it), and so
   * are answers that never come (a driver that does not keep the clock).
   */
  private collectTimings(take: (work: number, tier: number) => void): void {
    const gl = this.gl;
    if (!this.timer || this.timing.length === 0) return;
    if (gl.getParameter(this.timer.GPU_DISJOINT_EXT)) {
      this.dropTimings();
      return;
    }
    while (this.timing.length > 0) {
      const { query, cpu, tier } = this.timing[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      take(Math.max(cpu, (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6), tier);
      gl.deleteQuery(query);
      this.timing.shift();
    }
    if (this.timing.length > 60) this.dropTimings();
  }

  private dropTimings(): void {
    for (const { query } of this.timing) this.gl.deleteQuery(query);
    this.timing.length = 0;
  }

  /**
   * One frame drawn in the dark: its script took `cpu` ms and the whole
   * frame, waited for to the GPU's end, `wall`; `query` times it on the
   * GPU's clock. Past the warm-up, counted; with enough, the rung decided
   * (RENDER: the fastest rung of the tier that holds) — or a cheaper tier
   * tried, still in the dark; at the last, the floor.
   */
  private calibrate(cpu: number, wall: number, query: WebGLQuery | null, now: number): void {
    const c = this.calibration;
    if (!c) {
      if (query) this.gl.deleteQuery(query);
      return;
    }
    const C = RENDER.calibrate;
    c.seen += 1;
    this.progress(2, Math.min(0.9, c.seen / (C.warmup + C.frames)));
    /* The first tier warms the driver up; a cheaper one tried after only
       rebuilds its targets. */
    if (c.seen <= (c.tier === 0 ? C.warmup : 1)) {
      if (query) this.gl.deleteQuery(query);
      c.since = now;
      return;
    }
    this.trackTiming(query, cpu);
    /* Not a stall of the page (a tab put aside): a frame. */
    if (wall > 0 && wall < 1000) c.waited.push(wall);
    this.judge(now, wall);
  }

  /**
   * The rung, once there is enough to go on: on the GPU's clock where its
   * answers have come back, else end to end — also where they do not come
   * back in twice the time allowed.
   */
  private judge(now: number, wall = 0): void {
    const c = this.calibration;
    if (!c) return;
    this.collectTimings((work, tier) => {
      if (tier === c.tier && work < 1000) c.timed.push(work);
    });
    const C = RENDER.calibrate;
    const vsync = this.vsync;
    /* A FAST DEVICE IS SETTLED AT ONCE: two frames running well inside the
       display's own frame at full quality — or at the visitor's tier, at
       the fastest rate it is drawn at. */
    const fast = c.timed.length >= 2 ? c.timed : this.timer ? null : c.waited;
    if (c.tier === (this.fixed ?? 0) && fast && fast.length >= 2 && Math.max(fast[fast.length - 1], fast[fast.length - 2]) <= RENDER.fastShare * vsync) {
      this.reveal(c.tier, this.fastestEvery(c.tier));
      return;
    }
    const over = now - c.since;
    const floor = floorEvery(vsync);
    const enough = (n: number) => n >= C.frames || (n >= 2 && over >= C.seconds * 1000);
    /* One frame so far over what the slowest rung holds that no more are
       needed: the wall alone says so. */
    const far = wall > 3 * floor * vsync;
    const timed = enough(c.timed.length) && !far;
    const late = !this.timer || far || (c.timed.length < 2 && over >= 2 * C.seconds * 1000);
    if (!timed && !(late && (enough(c.waited.length) || far))) return;
    const work = quantile(timed ? c.timed : c.waited, C.quantile);
    for (let every = this.fastestEvery(c.tier); every <= floor; every += 1) {
      if (this.holds(work, every, timed)) {
        this.reveal(c.tier, every);
        return;
      }
    }
    /* THE VISITOR'S TIER HOLDS, whatever the device: only the frame rate
       gives way, to the slowest even one. */
    if (this.fixed !== null) {
      this.reveal(c.tier, floor);
      return;
    }
    const last = RENDER.tiers.length - 1;
    if (c.tier >= last) {
      this.reachFloor();
      this.reveal(last, floor);
      return;
    }
    /* Far over (more than a third past what the slowest rung holds):
       straight to the cheapest tier, not through each. */
    this.tier = this.holds(work / 1.33, floor, timed) ? c.tier + 1 : last;
    this.measureFrame();
    this.dropTimings();
    c.tier = this.tier;
    c.seen = 0;
    c.timed.length = 0;
    c.waited.length = 0;
    c.since = now;
  }

  /** Even the slowest rung cannot keep up: the page is told, once. */
  private reachFloor(): void {
    if (this.floored) return;
    this.floored = true;
    this.options.onFloor?.();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncLoop();
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) {
      this.camera.centre();
      this.camera.settle();
    }
  }

  setParams(next: Partial<StageParams>): void {
    Object.assign(this.params, next);
    if (this.ready && !this.raf) {
      this.stepBloom(0);
      this.render();
    }
  }

  resize(): void {
    /* Before the programs link there is nothing to size: load measures. */
    if (this.disposed || this.lost || !this.linked) return;
    this.measureFrame();
    if (this.ready && !this.raf) this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    if (this.displayProbe) cancelAnimationFrame(this.displayProbe);
    /* Its load stops waiting, and finds itself gone. */
    this.attach();
    /* The shores still on their way are not needed now. */
    this.fetches.abort();
    this.options.canvas.removeEventListener("webglcontextlost", this.handleLost);
    const gl = this.gl;
    if (gl.isContextLost()) return;
    this.dropTimings();
    gl.deleteProgram(this.scene.handle);
    gl.deleteProgram(this.film.handle);
    gl.deleteProgram(this.down.handle);
    gl.deleteProgram(this.up.handle);
    this.deleteTargets();
    this.atmosphere.dispose();
    this.bloom.dispose();
    this.stone.dispose();
    this.lake.dispose();
    this.water.dispose();
    this.rain.dispose();
    if (this.wisps) gl.deleteTexture(this.wisps);
    gl.deleteTexture(this.stoneNoise);
    if (this.plates) deletePlates(gl, this.plates);
    this.plates = null;
    gl.deleteVertexArray(this.vao);
    /* The context itself is NOT lost on purpose: React's development
       double-mount hands the same canvas straight back, and a lost context
       cannot be revived by asking for it again. */
  }

  private handleLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.stopLoop();
    this.options.onLost();
  };

  /* ── Measurement ────────────────────────────────────────────────────── */

  private measureFrame(): void {
    const { frame, canvas } = this.options;
    const rect = frame.getBoundingClientRect();
    this.frameRect = rect;
    const style = getComputedStyle(frame);

    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const cell = Number.parseFloat(style.getPropertyValue("--size-hero-cell"));
    this.cellPx = Number.isFinite(cell) && cell > 0 ? cell : 4;
    for (const name of COLOR_TOKENS) {
      this.colors[name] = srgbToLinear(parseColor(style.getPropertyValue(`--color-hero-${name}`)));
    }

    const tier = RENDER.tiers[this.tier];
    this.dpr = Math.min(window.devicePixelRatio || 1, tier.outputDpr);
    const w = Math.max(1, Math.round(this.cssW * this.dpr));
    const h = Math.max(1, Math.round(this.cssH * this.dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    /* The scene at most `scenePixels`; the film pass makes up the rest. */
    const sceneScale = Math.min(1, Math.sqrt((this.sceneCap || tier.scenePixels) / (w * h)), tier.sceneDpr / this.dpr);
    this.resizeTargets(Math.max(1, Math.round(w * sceneScale)), Math.max(1, Math.round(h * sceneScale)));
    this.upscale = w / (this.sceneTarget?.width ?? w);
    /* The plant at the screen's own pixels where they are finer than the
       scene's (a 4K screen), except on the slowest tier. */
    this.bloom.resize(this.sceneTarget?.width ?? w, this.sceneTarget?.height ?? h, this.cssW, this.cssH, w, h, this.tier < RENDER.tiers.length - 1);
    this.stone.resize();
    this.lake.resize(this.sceneTarget?.width ?? w, this.sceneTarget?.height ?? h);
    this.water.resize(this.sceneTarget?.width ?? w, this.sceneTarget?.height ?? h);

    const volumeW = Math.max(1, Math.round(Math.min(this.cssW * VOLUME.scale, VOLUME.maxWidth) * tier.volumeScale));
    const volumeH = Math.max(1, Math.round((volumeW * this.cssH) / this.cssW));
    this.atmosphere.resize(this.cssW, this.cssH, this.cellPx, volumeW, volumeH, this.reduced);
  }

  /** The scene's target and the diffusion's levels, rebuilt on a new size. */
  private resizeTargets(width: number, height: number): void {
    const current = this.sceneTarget;
    if (current && current.width === width && current.height === height) return;
    this.deleteTargets();
    this.glowValid = false;
    const gl = this.gl;
    this.sceneTarget = createTarget(gl, width, height, gl.RGBA16F, gl.LINEAR);
    let w = width;
    let h = height;
    for (let i = 0; i < GLOW_LEVELS; i += 1) {
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
      /* One channel: the luminance (shaders/post.ts DOWN_FRAG). */
      this.glowDown.push(createTarget(gl, w, h, gl.R16F, gl.LINEAR));
      /* Each level but the coarsest gets a twin to sum the levels above into. */
      if (i < GLOW_LEVELS - 1) this.glowUp.push(createTarget(gl, w, h, gl.R16F, gl.LINEAR));
    }
  }

  private deleteTargets(): void {
    deleteTarget(this.gl, this.sceneTarget);
    for (const t of [...this.glowDown, ...this.glowUp]) deleteTarget(this.gl, t);
    this.sceneTarget = null;
    this.glowDown = [];
    this.glowUp = [];
  }

  /* ── The loop ───────────────────────────────────────────────────────── */

  private syncLoop(): void {
    const shouldRun = this.ready && this.visible && !this.disposed && !this.lost;
    if (shouldRun && !this.raf) {
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!shouldRun) {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    /* The display's own frame (displayInterval), read while held too —
       nothing else runs then — and never from the frames drawn in the dark,
       each waited for. */
    if (this.lastDisplay > 0 && !this.calibration) this.displayInterval(now - this.lastDisplay);
    this.lastDisplay = now;
    /* Ready, and held behind the page's curtain: nothing to draw. */
    if (this.waiting) {
      this.lastTime = now;
      return;
    }
    const elapsed = now - this.lastTime;
    /* A capped rung draws every `every`th of the display's frames — at 30,
       every other frame of a 60 Hz display, every fourth at 120: evenly,
       the display's frame nearest the interval. */
    if (this.every > 1 && elapsed < (this.every - 0.5) * this.vsync) return;
    this.lastTime = now;
    const seconds = elapsed / 1000;
    const dt = Math.min(seconds, PARALLAX.maxFrame);
    const wall = Math.min(seconds, CLOCKS.maxFrame);
    if (this.calibration) {
      /* In the dark, held at the opening shot. WHAT THE FRAME COSTS, the
         GPU's share included: a one-pixel read returns only once it is
         drawn. Unseen, the browser does not wait on the GPU between
         frames, so their intervals came back fast whatever the frame
         cost (a 6 fps device measured as 120); and the wait the read
         makes is one nobody sees. */
      /* IN A BURST WHILE FAST: frames drawn back to back while each runs
         well inside the display's rate and the burst under `burstMs`, so
         a fast device is measured in a few tens of milliseconds instead of
         a frame of the display's each. Anything slower a frame at a time,
         the page free between: drawn back to back, a frame near a rung's
         edge read ~30% dearer than it runs (a GTX 1050 Ti at 4K: 45 ms
         against the 35 it holds), and dropped a tier it did not need. */
      /* TIMED ON THE GPU'S OWN CLOCK TOO (RENDER.calibrate): its answer
         comes back from a later task, and the rung is judged on those. */
      const gl = this.gl;
      const burst = performance.now();
      let step = dt;
      let stepWall = wall;
      /* The answers of the frames drawn before this task. */
      this.judge(burst);
      while (this.calibration && performance.now() - burst < RENDER.calibrate.burstMs) {
        const query = this.beginTiming();
        const start = performance.now();
        this.tick(step, false, stepWall);
        this.camera.arrive();
        this.render();
        this.endTiming(query);
        const issued = performance.now();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.probePixel);
        const end = performance.now();
        this.calibrate(issued - start, end - start, query, end);
        step = Math.min((end - start) / 1000, PARALLAX.maxFrame);
        stepWall = Math.min((end - start) / 1000, CLOCKS.maxFrame);
        if (end - start > RENDER.burstFrameMs) break;
      }
      return;
    }
    this.watchFrameRate(elapsed);
    /* After the arrival, a capped visit may time its frames to step back up
       (RENDER.stepUp). */
    const query = this.stepUp && now >= this.stepUp.since ? this.beginTiming() : null;
    const start = performance.now();
    this.tick(dt, true, wall);
    this.endTiming(query);
    this.trackTiming(query, performance.now() - start);
    this.watchStepUp(now);
  };

  /** `dt`: the step for what has state (the springs, the air, the
   *  flowers); `wall`: the frame's real length, for what is only a function
   *  of time (motion.ts CLOCKS). */
  private tick(dt: number, paint: boolean, wall = dt): void {
    this.time += wall;
    if (!this.reduced) this.waterTime += wall;
    this.mistTime += this.reduced ? wall * 0.25 : wall;
    if (!this.reduced) this.rainTime += wall;
    this.camera.update(dt, this.params.swayRate, this.params.followMix);
    if (this.fitPending && !this.camera.arriving) {
      this.fitPending = false;
      this.stone.refit();
      this.bloom.refit();
    }
    this.stillness.update(dt);
    const tier = RENDER.tiers[this.tier];
    /* Once a drawn frame at most: a step longer than the frame would make
       the air move in jumps between frames. */
    const stride = Math.max(1, Math.min(tier.airEvery, this.every));
    this.atmosphere.tick(dt, this.params, this.params, tier.pressureIterations, this.reduced, stride);
    this.bloomClock += dt;
    this.stepBloom(dt);
    if (paint) this.render();
  }

  /**
   * The flowers' step: their tremble, the cloth's sway and their pollen, in
   * the air the visitor's hand moves (atmosphere/hand.ts, kept on the CPU:
   * nothing is read back from the GPU).
   */
  private stepBloom(dt: number): void {
    /* The air's frame, once a frame: read for every mote of pollen. */
    this.airFrame = this.atmosphere.air;
    const p = this.params;
    this.bloom.update(dt, {
      clock: this.bloomClock,
      seed: p.bloomSeed,
      reduced: this.reduced,
      air: this.airAt,
      sway: p.clothSway,
    });
  }

  /** A world point's cell on the air's grid (its plane: the camera at
   *  rest), into `out`. */
  private airCell(p: readonly number[], air: NonNullable<Atmosphere["air"]>, out: [number, number]): [number, number] {
    const f = focalPx(this.cssW, this.cssH);
    const c = frameCenter(this.cssW, this.cssH, f, this.restCenter);
    const u = ((p[0] / p[2]) * f) / this.cssW + c[0];
    const v = (((p[1] - CAMERA.eyeHeight) / p[2]) * f) / this.cssH + c[1];
    out[0] = (u * air.map[0] + air.map[2]) * air.grid[0];
    out[1] = (v * air.map[1] + air.map[3]) * air.grid[1];
    return out;
  }

  /** The air the hand moved at a world point (atmosphere/hand.ts): m/s,
   *  and churn. */
  private airAt: AirAt = (p, out) => {
    const air = this.airFrame;
    if (!air) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const [cx, cy] = this.airCell(p, air, this.cell);
    this.atmosphere.hand.at(cx, cy, out);
    /* Cells a second → metres a second, at the point's own depth. */
    const metresPerCell = (air.cellPx * p[2]) / focalPx(this.cssW, this.cssH);
    out[0] *= metresPerCell;
    out[1] *= metresPerCell;
    return out;
  };

  private render(): void {
    if (!this.plates || this.lost) return;
    const camera = this.camera.pose([this.cssW, this.cssH], this.params);
    this.atmosphere.render(camera, this.params, this.reduced);
    this.drawSet(camera);
    /* The diffusion redrawn every `glowEvery` frames (RENDER.tiers), and
       always once its targets are new. */
    this.glowAge += 1;
    if (!this.glowValid || this.glowAge >= RENDER.tiers[this.tier].glowEvery) {
      this.drawGlow();
      this.glowValid = true;
      this.glowAge = 0;
    }
    this.drawFilm(camera);
  }

  /* What the set's programs read this frame: one object, refilled. */
  private setFrame: SetFrame | null = null;

  private frameOfSet(camera: CameraFrame): SetFrame | null {
    const plates = this.plates;
    const density = this.atmosphere.density;
    const light = this.atmosphere.light;
    const target = this.sceneTarget;
    if (!plates || !density || !light || !target) return null;
    const f = (this.setFrame ??= {
      camera,
      params: this.params,
      colors: this.colors,
      waterTime: 0,
      mistTime: 0,
      wisps: this.wisps,
      stoneNoise: this.stoneNoise,
      plates,
      density,
      light,
      unprint: this.unprintCache,
      width: 1,
      height: 1,
    });
    f.camera = camera;
    f.colors = this.colors;
    f.waterTime = this.waterTime;
    f.mistTime = this.mistTime;
    f.plates = plates;
    f.density = density;
    f.light = light;
    f.unprint = this.unprint();
    f.width = target.width;
    f.height = target.height;
    return f;
  }

  /**
   * The set: the plant, the stone, the photograph in the lake and the open
   * water, each by its own program, then the scene pass, which reads them
   * (shaders/scene.ts, the top).
   */
  private drawSet(camera: CameraFrame): void {
    this.drawBloom(camera);
    const f = this.frameOfSet(camera);
    if (!f) return;
    this.stone.render(f);
    this.lake.render(f);
    const p = this.params;
    this.water.render(f, [p.lakeBurnHorizon, p.lakeBurnFoot, p.lakeBurnShape, p.lakeContrast], this.bloom, this.stone, this.lake);
    this.drawScene(f);
    /* The pollen's motes, into the scene's light (bloom/bloom.ts drawMotes). */
    if (this.sceneTarget) this.bloom.drawMotes(camera, this.sceneTarget, this.colors);
  }

  /* The print curve's inverse, rebuilt only when the print changes. */
  private unprintKey = "";
  private unprintCache = new Float32Array(65);
  /* The regrade's table, rebuilt only when its amount changes. */
  private regradeAmount = Number.NaN;
  private regradeCache = new Float32Array(65);

  private regrade(): Float32Array<ArrayBuffer> {
    if (this.params.regrade !== this.regradeAmount) {
      this.regradeCache = regradeTable(this.params.regrade);
      this.regradeAmount = this.params.regrade;
    }
    return this.regradeCache;
  }

  private unprint(): Float32Array<ArrayBuffer> {
    const p = this.params;
    const key = `${p.shadows}|${p.highlights}|${p.toe}|${p.knee}`;
    if (key !== this.unprintKey) {
      this.unprintCache = unprintTable(FILM.print.pivot, p.shadows, p.highlights, p.toe, p.knee);
      this.unprintKey = key;
    }
    return this.unprintCache;
  }

  /** The flowers' own pass (bloom/), which the scene pass reads. */
  private drawBloom(camera: CameraFrame): void {
    const p = this.params;
    this.bloom.render(camera, this.colors, { light: [p.stoneTop, p.stoneAway, p.stoneToward] });
  }

  /** The scene pass: the composite, over everything the set's own passes
   *  and the atmosphere drew this frame. */
  private drawScene(f: SetFrame): void {
    const target = this.sceneTarget;
    if (!target) return;
    const gl = this.gl;
    const p = this.params;
    const u = this.scene.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    discardBound(gl);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(this.scene.handle);
    setCameraUniforms(gl, u, f.camera);
    setFogUniforms(gl, u, f);
    setSheetUniforms(gl, u, f);
    setWaterUniforms(gl, u, f);
    setStoneUniforms(gl, u, f);
    setPlateUniforms(gl, u, f.camera, f.plates);
    setDevelopUniforms(gl, u, f);
    setMistUniforms(gl, u, f);
    gl.uniform4f(u.uLakeBurn, p.lakeBurnHorizon, p.lakeBurnFoot, p.lakeBurnShape, p.lakeContrast);
    this.bloom.bindScene(u, UNITS.bloom);
    this.stone.bindScene(u);
    this.water.bindScene(u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The diffusion: down the pyramid, then back up it, summing. */
  private drawGlow(): void {
    const scene = this.sceneTarget;
    if (!scene || this.glowDown.length === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.down.handle);
    let source: Target = scene;
    for (const level of this.glowDown) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, level.fbo);
      discardBound(gl);
      gl.viewport(0, 0, level.width, level.height);
      bindTexture(gl, this.down.uniforms.uSource, 0, source.tex);
      gl.uniform2f(this.down.uniforms.uTexel, 1 / source.width, 1 / source.height);
      /* From the scene's colour, its luminance; from a level, its one channel. */
      if (source === scene) gl.uniform3f(this.down.uniforms.uWeights, 0.2126, 0.7152, 0.0722);
      else gl.uniform3f(this.down.uniforms.uWeights, 1, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = level;
    }
    gl.useProgram(this.up.handle);
    gl.uniform1f(this.up.uniforms.uSpread, this.params.spread);
    let coarse: Target = this.glowDown[this.glowDown.length - 1];
    for (let i = this.glowUp.length - 1; i >= 0; i -= 1) {
      const out = this.glowUp[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
      discardBound(gl);
      gl.viewport(0, 0, out.width, out.height);
      bindTexture(gl, this.up.uniforms.uCoarse, 0, coarse.tex);
      bindTexture(gl, this.up.uniforms.uFine, 1, this.glowDown[i].tex);
      gl.uniform2f(this.up.uniforms.uTexel, 1 / coarse.width, 1 / coarse.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      coarse = out;
    }
  }

  /** The film pass, at the screen's own resolution, onto the canvas. */
  private drawFilm(camera: CameraFrame): void {
    const plates = this.plates;
    const scene = this.sceneTarget;
    const glow = this.glowUp[0] ?? this.glowDown[0];
    if (!plates || !scene || !glow) return;
    const gl = this.gl;
    const p = this.params;
    const u = this.film.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.options.canvas.width, this.options.canvas.height);
    gl.useProgram(this.film.handle);
    setCameraUniforms(gl, u, camera);
    bindTexture(gl, u.uScene, 0, scene.tex);
    bindTexture(gl, u.uGlow, 1, glow.tex);
    gl.uniform1f(u.uDiffusion, p.diffusion);
    gl.uniform1f(u.uHalation, p.halation);
    gl.uniform1f(u.uUpscale, this.upscale);
    setPlateUniforms(gl, u, camera, plates);
    gl.uniform1f(u.uExposure, p.exposure);
    gl.uniform4f(u.uPrint, FILM.print.pivot, p.shadows, p.highlights, p.toe);
    gl.uniform1f(u.uKnee, p.knee);
    gl.uniform1fv(u.uUnprint, this.unprint());
    const below = 1 - p.footFrom;
    gl.uniform2f(u.uFoot, p.footFrom, p.footStops / (below * below));
    gl.uniform3f(u.uVignette, p.vignette, ...FILM.vignette.at);
    gl.uniform3f(u.uPaper, FILM.paper.black, p.paperWhite, p.paperGamma);
    gl.uniform1fv(u.uRegrade, this.regrade());
    gl.uniform4f(u.uGrain, p.grain, FILM.fps, this.time, FILM.grainSize);
    /* The flowers' own print, and the cloth's (bloom/optics.ts BLOOM.print). */
    const fp = BLOOM.print;
    gl.uniform3f(u.uFlowerPrint, fp.white, fp.rise, fp.amount);
    gl.uniform2f(u.uFlowerTone, fp.from, fp.to);
    gl.uniform3f(u.uClothPrint, fp.cloth.white, fp.cloth.from, fp.cloth.to);
    this.bloom.bindFilm(u, UNITS.bloom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* The rain, laid on the finished print as drops (weather/rain.ts). */
    this.rain.draw(camera, p.rain, this.rainTime, this.options.canvas.height, this.reduced);
  }

  /**
   * The ladder, watched after the reveal (stage/optics.ts RENDER): the
   * interval between drawn frames is what the visitor feels, so it is what
   * is measured; a sustained slow average takes the next rung down. It
   * never climbs back mid-visit: a scene that sharpens and softens as the
   * frame rate wanders is worse than one that is slightly soft.
   */
  private watchFrameRate(elapsed: number): void {
    if (elapsed <= 0 || elapsed > 250) return;
    const interval = this.every * this.vsync;
    /* NOT DURING THE ARRIVAL: its opening shot shows more of the lake, the
       costliest thing to draw (stage/motion.ts ARRIVAL.zoom), and was
       measured in the dark already. */
    if (this.camera.arriving) {
      this.slowSince = -1;
      this.frameAverage = interval;
      return;
    }
    this.frameAverage += (elapsed - this.frameAverage) * 0.05;
    if (this.frameAverage <= interval * (this.every > 1 ? RENDER.slowShare.capped : RENDER.slowShare.full)) {
      this.slowSince = -1;
      return;
    }
    const now = performance.now();
    if (this.slowSince < 0) this.slowSince = now;
    if (now - this.slowSince < RENDER.slowSeconds * 1000) return;
    this.slowSince = -1;
    /* Stepped down: the frame rate does not come back up this visit. */
    this.steppedDown = true;
    this.stopStepUp();
    const floor = floorEvery(this.vsync);
    const last = RENDER.tiers.length - 1;
    /* The visitor's tier holds: only the frame rate gives way, as at full
       quality below; at the slowest even rate there is nothing more to
       give, and it stays. */
    if (this.fixed !== null) {
      if (this.every >= floor) return;
      this.setRung(this.tier, Math.min(floor, Math.max(this.every + 1, Math.round(this.frameAverage / this.vsync))));
    } else if (this.tier === 0 && this.every < floor) {
      /* To the even rate nearest what the frames were actually keeping, not
         just the next: from 120 a device running at ~30 goes to 30, not
         through 60 and 40, 1.5 s slow at each. Nearest, not the slower: a
         frame now and then three display frames long put a device keeping
         ~58 on 40. */
      this.setRung(0, Math.min(floor, Math.max(this.every + 1, Math.round(this.frameAverage / this.vsync))));
    } else if (this.tier < last) {
      this.setRung(this.tier + 1, floor);
    } else {
      this.reachFloor();
      return;
    }
    this.frameAverage = this.every * this.vsync;
  }

  /**
   * THE FRAME RATE STEPS BACK UP (RENDER.stepUp) where the dark measured a
   * passing load: once the arrival is over, a capped rung at full quality
   * times its frames on the GPU's clock (frame); if they fit the next
   * faster rung, it goes there, and tries the next. Every pixel the same.
   */
  private watchStepUp(now: number): void {
    if (!this.stepUpTried) {
      if (this.camera.arriving || this.fitPending) return;
      this.stepUpTried = true;
      /* Any rung faster than this one its tier may take: full quality only,
         unless the tier is the visitor's (fastestEvery). */
      if (this.timer && !this.steppedDown && this.every > this.fastestEvery(this.tier)) this.stepUp = { since: now + 500, samples: [] };
      return;
    }
    const up = this.stepUp;
    if (!up) return;
    this.collectTimings((work) => up.samples.push(work));
    const S = RENDER.stepUp;
    if (now - up.since < S.seconds * 1000 || up.samples.length < S.minFrames) return;
    const faster = this.every - 1;
    if (quantile(up.samples, S.quantile) > S.share * faster * this.vsync) {
      this.stopStepUp();
      return;
    }
    this.dropTimings();
    this.setRung(this.tier, faster);
    this.frameAverage = faster * this.vsync;
    this.slowSince = -1;
    this.stepUp = faster > this.fastestEvery(this.tier) ? { since: now + 500, samples: [] } : null;
  }

  private stopStepUp(): void {
    this.stepUp = null;
    this.dropTimings();
  }

  /* ── Input ──────────────────────────────────────────────────────────── */

  pointerDown(clientX: number, clientY: number, pointerType: string): void {
    const at = this.framePoint(clientX, clientY);
    if (!at) return;
    this.stillness.stir();
    this.atmosphere.pointerDown(at[0], at[1], pointerType);
  }

  pointerMove(clientX: number, clientY: number, pointerType: string): void {
    const at = this.framePoint(clientX, clientY);
    /* The weather waits for stillness: any real movement resets it. */
    const last = this.lastPointer;
    if (!last || Math.hypot(clientX - last[0], clientY - last[1]) > STILLNESS.tremorPx) {
      this.stillness.stir();
      this.lastPointer = [clientX, clientY];
    }
    /* The lean follows a hovering pointer. On touch, movement is scrolling. */
    if (at && pointerType !== "touch" && !this.reduced) {
      this.camera.lean((at[0] / this.cssW) * 2 - 1, 1 - (at[1] / this.cssH) * 2);
    }
    this.atmosphere.pointerMove(at?.[0] ?? null, at?.[1] ?? null, pointerType);
  }

  pointerUp(): void {
    this.atmosphere.pointerUp();
  }

  pointerLeave(): void {
    this.camera.centre();
    this.lastPointer = null;
    this.atmosphere.pointerLeave();
  }

  activity(): void {
    this.stillness.stir();
    /* A scroll moves the frame in the viewport. */
    this.frameRect = null;
  }

  /** Client px → frame CSS px, or null outside the frame. */
  private framePoint(clientX: number, clientY: number): [number, number] | null {
    const rect = (this.frameRect ??= this.options.frame.getBoundingClientRect());
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return [x, y];
  }

  /* ── Development ────────────────────────────────────────────────────── */

  advance(seconds: number): void {
    if (!this.ready) return;
    /* Driven by hand, the page's own frames frozen: revealed as measured
       fast, at once. */
    if (this.calibration) this.reveal(this.fixed ?? 0, this.fastestEvery(this.fixed ?? 0));
    if (this.waiting) this.begin();
    const frames = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < frames; i += 1) this.tick(1 / 60, false);
    this.render();
  }

  lean(nx: number, ny: number): void {
    this.camera.lean(nx, ny);
  }

  probe(): { density: number[][]; light: number[][] } {
    this.render();
    return this.atmosphere.probe();
  }

  async gpuTimings(frames = 20): Promise<{ air: number; sheets: number; scene: number; film: number } | null> {
    const gl = this.gl;
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: GLenum } | null;
    if (!ext || !this.ready) return null;
    const timed = (work: () => void) => {
      const query = gl.createQuery();
      if (!query) return null;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      work();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      return query;
    };
    const tier = RENDER.tiers[this.tier];
    const pending: (WebGLQuery | null)[][] = [];
    for (let i = 0; i < frames; i += 1) {
      const camera = this.camera.pose([this.cssW, this.cssH], this.params);
      pending.push([
        timed(() => this.atmosphere.tick(1 / 60, this.params, this.params, tier.pressureIterations, this.reduced)),
        timed(() => this.atmosphere.render(camera, this.params, this.reduced)),
        timed(() => this.drawSet(camera)),
        timed(() => {
          this.drawGlow();
          this.drawFilm(camera);
        }),
      ]);
    }
    const ms: number[][] = [[], [], [], []];
    for (const row of pending) {
      for (const [i, query] of row.entries()) {
        if (!query) continue;
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        ms[i].push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(query);
      }
    }
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      air: round(median(ms[0])),
      sheets: round(median(ms[1])),
      scene: round(median(ms[2])),
      film: round(median(ms[3])),
    };
  }

  profile(from: number, to: number): number[] {
    this.render();
    const gl = this.gl;
    const { width, height } = this.options.canvas;
    /* readPixels rows run bottom-up. */
    const y0 = Math.floor((1 - to) * height);
    const rows = Math.max(1, Math.ceil((to - from) * height));
    const pixels = new Uint8Array(width * rows * 4);
    gl.readPixels(0, y0, width, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const columns = Math.round(this.cssW);
    const out = new Array<number>(columns).fill(0);
    for (let c = 0; c < columns; c += 1) {
      const x = Math.min(width - 1, Math.floor(((c + 0.5) / columns) * width));
      let sum = 0;
      for (let r = 0; r < rows; r += 1) {
        const i = (r * width + x) * 4;
        sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      }
      out[c] = sum / rows;
    }
    return out;
  }

  grid(columns: number, rows: number): number[][] {
    this.render();
    const gl = this.gl;
    const { width, height } = this.options.canvas;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const sums = new Array<number>(columns * rows).fill(0);
    const counts = new Array<number>(columns * rows).fill(0);
    for (let y = 0; y < height; y += 2) {
      /* readPixels rows run bottom-up; the grid runs top-down. */
      const row = Math.min(rows - 1, Math.floor(((height - 1 - y) / height) * rows));
      for (let x = 0; x < width; x += 2) {
        const cell = row * columns + Math.min(columns - 1, Math.floor((x / width) * columns));
        const i = (y * width + x) * 4;
        sums[cell] += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        counts[cell] += 1;
      }
    }
    const out: number[][] = [];
    for (let r = 0; r < rows; r += 1) {
      out.push(sums.slice(r * columns, (r + 1) * columns).map((s, c) => Math.round(s / Math.max(1, counts[r * columns + c]))));
    }
    return out;
  }

  measure(bands = 20, from = 0, to = 1): number[] {
    this.render();
    const gl = this.gl;
    const { width, height } = this.options.canvas;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const sums = new Array<number>(bands).fill(0);
    const counts = new Array<number>(bands).fill(0);
    const x0 = Math.floor(from * width);
    const x1 = Math.ceil(to * width);
    for (let y = 0; y < height; y += 1) {
      /* readPixels rows run bottom-up; bands run top-down. */
      const band = Math.min(bands - 1, Math.floor(((height - 1 - y) / height) * bands));
      for (let x = x0; x < x1; x += 2) {
        const i = (y * width + x) * 4;
        sums[band] += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        counts[band] += 1;
      }
    }
    return sums.map((s, i) => Math.round(s / Math.max(1, counts[i])));
  }
}
