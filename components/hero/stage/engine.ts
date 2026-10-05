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
 *   sheets      the fog between the planes, half resolution (atmosphere/)
 *   bloom       the plant on the stone, and in the lake (bloom/): posed
 *               on the CPU from the visit's clock and the air read back
 *               where it stands (atmosphere/sampler.ts)
 *   stone       the stone as the camera sees it and as the lake mirrors
 *               it, over rects round it (stone/)
 *   lake        the photograph reflected in the lake (water/lake.ts)
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
import type { AirParams } from "../atmosphere/fluid";
import { FLUID, WIND } from "../atmosphere/motion";
import { AirSampler } from "../atmosphere/sampler";
import { BloomPass, type AirAt } from "../bloom/bloom";
import { BLOOM } from "../bloom/optics";
import { AERIAL, EXTINCTION, MIST_SEEN, SOFT_BLACK, LIGHT, OVER_PHOTO, SHEETS, VOLUME } from "../atmosphere/optics";
import { STONE } from "../stone/optics";
import { SLOT_UNIFORMS, StonePass } from "../stone/stone";
import { LakePass } from "../water/lake";
import { WATER_MOTION } from "../water/motion";
import { WATER } from "../water/optics";
import { StillnessClock } from "../weather/clock";
import { STILLNESS } from "../weather/motion";
import { CAMERA, CAMERA_UNIFORMS, CameraRig, focalPx, setCameraUniforms, type CameraFrame, type SwayParams } from "./camera";
import {
  bindTexture,
  createProgram,
  createTarget,
  deleteTarget,
  parseColor,
  programsLinked,
  srgbToLinear,
  supportsHalfFloatTargets,
  type Program,
  type Target,
} from "./gl";
import { PARALLAX } from "./motion";
import { FILM, RENDER } from "./optics";
import { buildPlates, type Plates } from "./plates";
import { DOWN_FRAG, FILM_FRAG, UP_FRAG } from "./shaders/post";
import { SCENE_FRAG } from "./shaders/scene";
import {
  DEVELOP_UNIFORMS,
  FOG_UNIFORMS,
  PLATE_UNIFORMS,
  SHEET_UNIFORMS,
  STONE_UNIFORMS,
  UNITS,
  WATER_UNIFORMS,
  setDevelopUniforms,
  setFogUniforms,
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
  /** The lens's glow: strength, and how far it reaches (FILM.diffusion). */
  diffusion: number;
  /** Bright air spilling over the photograph's dark edges (FILM.halation). */
  halation: number;
  /** Fog thickened in front of the near bank's darkest trees (SOFT_BLACK.amount). */
  softBlack: number;
  spread: number;
  shadows: number;
  highlights: number;
  toe: number;
  knee: number;
  grain: number;
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
  paws: number;
  glass: number;
  /** The near bank's drifting self-shade over the open fog (MIST_SEEN.grey). */
  mistSeen: number;
  /** The bloom (bloom/): how open, 0 bud … 1 full — below 0, as the visit's
   *  clock opens it (bloom/motion.ts OPENING) — and which flower, 0–1 (a new
   *  one each visit). */
  bloomOpen: number;
  bloomSeed: number;
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
    form: 1,
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
    fogLife: OVER_PHOTO.amount,
    aerial: AERIAL.perMetre,
    swayX: PARALLAX.sway[0],
    swayY: PARALLAX.sway[1],
    swayRate: PARALLAX.frequency,
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
    diffusion: FILM.diffusion.amount,
    halation: FILM.halation,
    softBlack: SOFT_BLACK.amount,
    spread: FILM.diffusion.spread,
    shadows: FILM.print.shadows,
    highlights: FILM.print.highlights,
    toe: FILM.print.toe,
    knee: FILM.print.knee,
    grain: FILM.grain,
    stoneTop: STONE.light.top,
    stoneAway: STONE.light.sideAway,
    stoneToward: STONE.light.sideToward,
    sheenTop: STONE.sheen.top,
    sheenFace: STONE.sheen.face,
    footAway: STONE.foot.away,
    footToward: STONE.foot.toward,
    swell: 1,
    undulation: 1,
    ripples: 1,
    waver: WATER.waver,
    lapping: 1,
    paws: WATER_MOTION.catsPaws.coverage,
    glass: WATER_MOTION.catsPaws.glass,
    bloomOpen: -1,
    bloomSeed: 0.37,
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
}

export interface StageEngine {
  readonly params: StageParams;
  setParams(next: Partial<StageParams>): void;
  setReducedMotion(reduced: boolean): void;
  setVisible(visible: boolean): void;
  /** Re-measure the frame and the tokens. */
  resize(): void;
  pointerDown(clientX: number, clientY: number, pointerType: string): void;
  pointerMove(clientX: number, clientY: number, pointerType: string): void;
  pointerUp(): void;
  pointerLeave(): void;
  /** The visitor did something that is not a pointer (scroll, a key). */
  activity(): void;
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
    powerPreference: "default",
  });
  if (!gl || !supportsHalfFloatTargets(gl)) return null;
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

/** The design's grade (FILM.grade), on a print value 0–1. */
function grade(x: number): number {
  const v = x * 255;
  const knots = FILM.grade;
  for (let i = 1; i < knots.length; i += 1) {
    const [x1, y1] = knots[i];
    if (v <= x1) {
      const [x0, y0] = knots[i - 1];
      return (y0 + ((v - x0) / (x1 - x0)) * (y1 - y0)) / 255;
    }
  }
  return knots[knots.length - 1][1] / 255;
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

const COLOR_TOKENS = ["lit", "shade", "stone", "water", "petal", "sepal", "leaf", "tube", "anther"] as const;
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
  private readonly airSampler: AirSampler;
  private readonly stone: StonePass;
  private readonly lake: LakePass;
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
  /* Development only: the scene's pixel cap raised past the tier's, for
     close-up stills of the plant (set from the console, then resize()). */
  private sceneCap = 0;
  private colors: Record<ColorToken, Rgb> = {
    lit: [1, 1, 1],
    shade: [0.5, 0.5, 0.5],
    stone: [0.25, 0.25, 0.25],
    water: [0, 0, 0],
    petal: [0.8, 0.8, 0.8],
    sepal: [0.7, 0.7, 0.7],
    leaf: [0.1, 0.1, 0.1],
    tube: [0.3, 0.3, 0.3],
    anther: [0.7, 0.7, 0.7],
  };

  /* Clock. `time` only advances while the loop runs; the lake's own time
     stands still under reduced motion (the water holds its last shape). */
  private time = 0;
  private waterTime = 0;
  /* Seconds the scene has been on screen this visit: the bloom opens on it. */
  private bloomClock = 0;
  private lastTime = 0;
  private raf = 0;
  private slowFrames = 0;
  private frameAverage = 1000 / 60;

  /* The last pointer position, to tell a movement from a tremor. */
  private lastPointer: [number, number] | null = null;

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

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("stage: no vertex array");
    this.vao = vao;

    this.atmosphere = new Atmosphere(gl, vao);
    /* A new flower each visit (bloom/shape.ts grow). */
    this.params.bloomSeed = Math.random();
    this.bloom = new BloomPass(gl, vao, this.params.bloomSeed);
    this.airSampler = new AirSampler(gl);
    this.stone = new StonePass(gl, vao);
    this.lake = new LakePass(gl, vao);
    this.scene = createProgram(gl, SCENE_FRAG, [
      ...CAMERA_UNIFORMS, ...FOG_UNIFORMS, ...SHEET_UNIFORMS, ...WATER_UNIFORMS,
      ...STONE_UNIFORMS, ...PLATE_UNIFORMS, ...DEVELOP_UNIFORMS, ...SLOT_UNIFORMS,
      "uLakePhoto", "uLakeBurn",
      "uBloomNear", "uBloomMirror", "uBloomRect", "uBloomMirrorRect", "uBloomMirrorFill", "uBloomPlane",
    ]);
    this.film = createProgram(gl, FILM_FRAG, [
      ...CAMERA_UNIFORMS,
      "uScene", "uGlow", "uDiffusion", "uHalation", "uUpscale", "uPlate", "uBackdropDepth", "uPlateGeo", "uPlateAxis",
      "uBackdropNearest", "uExposure", "uPrint", "uKnee", "uUnprint", "uFoot", "uVignette", "uPaper", "uGrain",
    ]);
    this.down = createProgram(gl, DOWN_FRAG, ["uSource", "uTexel"]);
    this.up = createProgram(gl, UP_FRAG, ["uCoarse", "uFine", "uTexel", "uSpread"]);

    options.canvas.addEventListener("webglcontextlost", this.handleLost);
    void this.load();
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
      [plates] = await Promise.all([buildPlates(this.gl, alive), programsLinked(this.gl)]);
    } catch (error) {
      console.warn(error);
      if (alive()) this.options.onLost();
      return;
    }
    if (!plates || !alive()) return;
    this.linked = true;
    this.measureFrame();
    this.plates = plates;
    this.ready = true;
    /* The plant posed before its first frame: a bud. */
    this.stepBloom(0);
    this.render();
    this.options.onFirstFrame();
    this.syncLoop();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncLoop();
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) this.camera.centre();
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
    this.options.canvas.removeEventListener("webglcontextlost", this.handleLost);
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.deleteProgram(this.scene.handle);
    gl.deleteProgram(this.film.handle);
    gl.deleteProgram(this.down.handle);
    gl.deleteProgram(this.up.handle);
    this.deleteTargets();
    this.atmosphere.dispose();
    this.bloom.dispose();
    this.airSampler.dispose();
    this.stone.dispose();
    this.lake.dispose();
    if (this.plates) {
      gl.deleteTexture(this.plates.backdrop);
      gl.deleteTexture(this.plates.depth);
    }
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
    const sceneScale = Math.min(1, Math.sqrt((this.sceneCap || tier.scenePixels) / (w * h)));
    this.resizeTargets(Math.max(1, Math.round(w * sceneScale)), Math.max(1, Math.round(h * sceneScale)));
    this.upscale = w / (this.sceneTarget?.width ?? w);
    this.bloom.resize(this.sceneTarget?.width ?? w, this.sceneTarget?.height ?? h, this.cssW, this.cssH);
    this.stone.resize();
    this.lake.resize(this.sceneTarget?.width ?? w, this.sceneTarget?.height ?? h);

    const volumeW = Math.max(1, Math.round(Math.min(this.cssW * VOLUME.scale, VOLUME.maxWidth) * tier.volumeScale));
    const volumeH = Math.max(1, Math.round((volumeW * this.cssH) / this.cssW));
    this.atmosphere.resize(this.cssW, this.cssH, this.cellPx, volumeW, volumeH, this.reduced);
  }

  /** The scene's target and the diffusion's levels, rebuilt on a new size. */
  private resizeTargets(width: number, height: number): void {
    const current = this.sceneTarget;
    if (current && current.width === width && current.height === height) return;
    this.deleteTargets();
    const gl = this.gl;
    this.sceneTarget = createTarget(gl, width, height, gl.RGBA16F, gl.LINEAR);
    let w = width;
    let h = height;
    for (let i = 0; i < GLOW_LEVELS; i += 1) {
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
      this.glowDown.push(createTarget(gl, w, h, gl.RGBA16F, gl.LINEAR));
      /* Each level but the coarsest gets a twin to sum the levels above into. */
      if (i < GLOW_LEVELS - 1) this.glowUp.push(createTarget(gl, w, h, gl.RGBA16F, gl.LINEAR));
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
    const elapsed = now - this.lastTime;
    this.lastTime = now;
    this.watchFrameRate(elapsed);
    this.tick(Math.min(elapsed / 1000, PARALLAX.maxFrame), true);
  };

  private tick(dt: number, paint: boolean): void {
    this.time += dt;
    if (!this.reduced) this.waterTime += dt;
    this.camera.update(dt, this.params.swayRate);
    this.stillness.update(dt);
    const tier = RENDER.tiers[this.tier];
    this.atmosphere.tick(dt, this.params, this.params, tier.pressureIterations, this.reduced);
    this.bloomClock += dt;
    this.stepBloom(dt);
    if (paint) this.render();
  }

  /**
   * The plant's step: the air round it asked for (and last frame's
   * collected: atmosphere/sampler.ts), then its opening, sway and pollen.
   */
  private stepBloom(dt: number): void {
    const air = this.atmosphere.air;
    if (air) {
      const [cx, cy] = this.airCell(BLOOM.center, air);
      const f = focalPx(this.cssW, this.cssH);
      /* The air within ~45 cm of the flower: the stems' tips and wherever
         the pollen drifts before it fades (bloom/motion.ts POLLEN.reach). */
      const half = Math.min(32, Math.ceil((0.45 * f) / (BLOOM.center[2] * air.cellPx)));
      this.airSampler.update(air.target, cx - half, cy - half, 2 * half, 2 * half);
    }
    const p = this.params;
    this.bloom.update(dt, {
      clock: this.bloomClock,
      open: p.bloomOpen,
      seed: p.bloomSeed,
      reduced: this.reduced,
      air: this.airAt,
    });
  }

  /** A world point's cell on the air's grid (its plane: the camera at rest). */
  private airCell(p: readonly number[], air: NonNullable<Atmosphere["air"]>): [number, number] {
    const f = focalPx(this.cssW, this.cssH);
    const u = ((p[0] / p[2]) * f) / this.cssW + 0.5;
    const v = (((p[1] - CAMERA.eyeHeight) / p[2]) * f) / this.cssH + 1 - CAMERA.horizon;
    return [(u * air.map[0] + air.map[2]) * air.grid[0], (v * air.map[1] + air.map[3]) * air.grid[1]];
  }

  /** The air at a world point, from the patch read back: m/s, and churn. */
  private airAt: AirAt = (p, out) => {
    const air = this.atmosphere.air;
    if (!air || !this.airSampler.ready) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const [cx, cy] = this.airCell(p, air);
    this.airSampler.at(cx, cy, out);
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
    this.drawGlow();
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
    f.plates = plates;
    f.density = density;
    f.light = light;
    f.unprint = this.unprint();
    f.width = target.width;
    f.height = target.height;
    return f;
  }

  /**
   * The set: the plant, the stone and the photograph in the lake, each by
   * its own program, then the scene pass, which reads them (shaders/
   * scene.ts, the top).
   */
  private drawSet(camera: CameraFrame): void {
    this.drawBloom(camera);
    const f = this.frameOfSet(camera);
    if (!f) return;
    this.stone.render(f);
    this.lake.render(f);
    this.drawScene(f);
  }

  /* The print curve's inverse, rebuilt only when the print changes. */
  private unprintKey = "";
  private unprintCache = new Float32Array(65);

  private unprint(): Float32Array<ArrayBuffer> {
    const p = this.params;
    const key = `${p.shadows}|${p.highlights}|${p.toe}|${p.knee}`;
    if (key !== this.unprintKey) {
      this.unprintCache = unprintTable(FILM.print.pivot, p.shadows, p.highlights, p.toe, p.knee);
      this.unprintKey = key;
    }
    return this.unprintCache;
  }

  /** The plant's own pass (bloom/), which the scene pass reads. */
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
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(this.scene.handle);
    setCameraUniforms(gl, u, f.camera);
    setFogUniforms(gl, u, f);
    setSheetUniforms(gl, u, f);
    setWaterUniforms(gl, u, f);
    setStoneUniforms(gl, u, f);
    setPlateUniforms(gl, u, f.camera, f.plates);
    setDevelopUniforms(gl, u, f);
    gl.uniform4f(u.uLakeBurn, p.lakeBurnHorizon, p.lakeBurnFoot, p.lakeBurnShape, p.lakeContrast);
    this.bloom.bindScene(u, UNITS.bloom);
    this.stone.bindScene(u);
    this.lake.bindScene(u);
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
      gl.viewport(0, 0, level.width, level.height);
      bindTexture(gl, this.down.uniforms.uSource, 0, source.tex);
      gl.uniform2f(this.down.uniforms.uTexel, 1 / source.width, 1 / source.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = level;
    }
    gl.useProgram(this.up.handle);
    gl.uniform1f(this.up.uniforms.uSpread, this.params.spread);
    let coarse: Target = this.glowDown[this.glowDown.length - 1];
    for (let i = this.glowUp.length - 1; i >= 0; i -= 1) {
      const out = this.glowUp[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
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
    gl.uniform4f(u.uGrain, p.grain, FILM.fps, this.time, FILM.grainSize);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * The adaptive tier. The frame interval is what the visitor feels, so it
   * is what is measured; a sustained slow average drops one quality tier.
   * It never climbs back mid-visit: a scene that sharpens and softens as the
   * frame rate wanders is worse than one that is slightly soft.
   */
  private watchFrameRate(elapsed: number): void {
    if (elapsed <= 0 || elapsed > 250) return;
    this.frameAverage += (elapsed - this.frameAverage) * 0.05;
    this.slowFrames = this.frameAverage > RENDER.slowFrameMs ? this.slowFrames + 1 : 0;
    if (this.slowFrames > RENDER.slowFrames && this.tier < RENDER.tiers.length - 1) {
      this.tier += 1;
      this.slowFrames = 0;
      this.frameAverage = 1000 / 60;
      this.measureFrame();
    }
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
  }

  /** Client px → frame CSS px, or null outside the frame. */
  private framePoint(clientX: number, clientY: number): [number, number] | null {
    const rect = this.options.frame.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return [x, y];
  }

  /* ── Development ────────────────────────────────────────────────────── */

  advance(seconds: number): void {
    if (!this.ready) return;
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
