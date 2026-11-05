/**
 * ─── 404 · the engine ───
 *
 * The 404's own renderer, small on purpose (2026-11-05, the user's question
 * first: would a live 404 slow the site? It is its own route — nothing here
 * loads on the home page):
 *
 *   SET        the hero's stone, broken, traced into a picture of the rect
 *              it stands in, and again as the lake mirrors it (shaders/
 *              set.ts) — then THE HERO'S OWN FLOWERS, dead, drawn by the
 *              hero's own programs into the same picture, depth-tested
 *              against the stone (shaders/flowers.ts) — ONLY WHEN THE
 *              CAMERA HAS MOVED: at rest, and on every phone (no hover, no
 *              lean), once
 *   COMPOSITE  the user's frame's fog, THE HERO'S LAKE, the pictures laid
 *              in, the grain (shaders/composite.ts) — 30 times a second at
 *              rest, every display frame while the camera leans
 *
 * WHAT IS THE HERO'S, AND HOW (2026-11-05, the user: "exactly our hero
 * section stone… flower… water"): its camera rig, framing and lean
 * (hero/stage/camera.ts); its stone's shape, shading and every value it is
 * shaded with, fed by the hero's own setter (hero/stage/uniforms.ts
 * setStoneUniforms); its lake's waves and lapping, fed by the hero's own
 * setter (setWaterUniforms) on the hero's lake clock; its flowers' genome,
 * mesh, pose and programs (hero/bloom/); its colours, read from the hero's
 * own CSS variables as the hero reads them. Never the hero's engine: its
 * import alone would fetch the hero's 65 KB.
 *
 * THE SET IS TRACED PROGRESSIVELY (measured on this machine's AMD
 * integrated GPU: a whole picture at full quality is ~15–20 ms at 1920 ×
 * 957, too much for one frame): while the camera moves, a picture at a
 * quarter of the samples each frame; once it rests, the full one in bands
 * over a few frames into a second target, shown when whole. The first is
 * made the same way, before the scene fades up.
 *
 * THE HERO'S RULES KEPT: shaders compile off the main thread and nothing is
 * asked of a program until the driver says it is done (gl.ts
 * programsLinked); a call only when it changes the GPU's state
 * (sendChangedStateOnly); nothing allocated or read back per frame; parked
 * while the tab is hidden or the canvas is off the screen; everything it
 * made deleted on every way out.
 */

import { BLOOM } from "@/components/hero/bloom/optics";
import { NOISE_SIZE as BLOOM_NOISE_SIZE } from "@/components/hero/bloom/shaders/bloom";
import { POSE_WIDTH } from "@/components/hero/bloom/shape";
import { CameraRig, type CameraFrame } from "@/components/hero/stage/camera";
import { defaultParams } from "@/components/hero/stage/engine";
import {
  abandonPrograms,
  bindTexture,
  createProgram,
  parseColor,
  programsLinked,
  sendChangedStateOnly,
  srgbToLinear,
  type Program,
} from "@/components/hero/stage/gl";
import { PARALLAX } from "@/components/hero/stage/motion";
import { setStoneUniforms, setWaterUniforms, type SetFrame } from "@/components/hero/stage/uniforms";
import { createStoneNoise } from "@/components/hero/stone/noise";
import { STONE } from "@/components/hero/stone/optics";

import { deadFlowers, type DeadFlowers } from "./flowers";
import { lostFraming, type LostFraming } from "./frame";
import { SCENE_MOTION } from "./motion";
import { LOOK, linear } from "./optics";
import { PLATE_DATA, PLATE_SIZE, PLATE_SPAN, PLATE_TONE } from "./plate";
import { RUIN_COUNTS, RUIN_DATA, RUIN_HEIGHT, RUIN_WIDTH, SET_BOUNDS } from "./ruin";
import { NOISE_SIZE } from "./shaders/common";
import { COMPOSITE_FRAG, COMPOSITE_UNIFORMS } from "./shaders/composite";
import { FLOWER_FRAG, FLOWER_UNIFORMS, FLOWER_VERT } from "./shaders/flowers";
import { SET_FRAG, SET_UNIFORMS, SHADE_TUBES } from "./shaders/set";

export interface RuinHandlers {
  /** The first frame is on the canvas: it may be shown. */
  onFirstFrame(): void;
  /** There will be no scene (no WebGL2, a shader refused, the context
   *  lost): what stands in for it should. Called at most once. */
  onLost(): void;
}

export interface RuinScene {
  /** The hand's place over the frame, −1–1 each way (y up). */
  lean(nx: number, ny: number): void;
  /** The hand has gone: the camera comes home. */
  centre(): void;
  dispose(): void;
}

export interface RuinOptions {
  /** No clock (the water and the grain still) and no lean. */
  reducedMotion: boolean;
}

/**
 * HOW MUCH IS DRAWN. The composite at the screen's own pixels up to 2× and
 * at most `maxPixels` (a 4K screen is drawn at ~2560 × 1440 and stretched:
 * fog and water have nothing finer). The set's picture at rest: four
 * samples a CSS pixel — two each way on a 1× screen, one on a 2× screen,
 * whose pixels are already that fine; while the camera moves, half that
 * each way. The mirror at half: the water blurs it.
 */
const BUDGET = {
  maxRatio: 2,
  maxPixels: 3_700_000,
  setSamples: 2,
  moving: 0.5,
  mirrorScale: 0.5,
  /* Texels of the set traced in one frame while it is refined (~4 ms of
     this machine's integrated GPU at 1920 wide). */
  band: 60_000,
  /* The march's steps. */
  steps: 80,
  /* Grow-only targets get this much room, so a lean does not remake them. */
  slack: 1.15,
} as const;

/* The pictures' rects round the set (frame px): its outline is padded so
   the composite's filtered read of the edge falls on clear texels. */
const PAD_PX = 3;

/* The hero's CSS variables for what it lights (hero/hero.css), and this
   page's for what died (not-found.css). */
const HERO_COLORS = ["lit", "shade", "stone", "water", "cloth", "pollen"] as const;
const DEAD_COLORS = ["petal", "disc", "stem"] as const;

/* A picture: its colour, its depth (the flowers test against the stone's),
   its framebuffer, its size. */
interface Target {
  readonly tex: WebGLTexture;
  readonly depth: WebGLRenderbuffer;
  readonly fbo: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

interface Picture {
  target: Target | null;
  /** The rect in the frame (origin, size: px, GL's y up). */
  readonly rect: [number, number, number, number];
  /** Target texels a frame px. */
  scale: number;
}

/* Development only: overrides for timing and registering (window.__kaviLost.knobs). */
const knobs: { steps?: number; taps?: number; cracks?: number; print?: [number, number, number]; rings?: number } = {};

const SWAY = {
  swayX: PARALLAX.sway[0],
  swayY: PARALLAX.sway[1],
  swayRate: PARALLAX.frequency,
  followMix: PARALLAX.follow.mix,
};

/**
 * THE HERO'S OWN VALUES for what its setters read: the hero's defaults
 * themselves (hero/stage/engine.ts defaultParams — the user's tuned stone
 * light, sheen and feet, and their lake: undulation, ripples, lapping, the
 * long exposure, the waver), never restated. Importing the hero's engine
 * module for them also keeps the hero's code ONE chunk the two pages share
 * (2026-11-05, measured: borrowing its parts one by one split them out of
 * the home page's engine, 65.1 → 68.5 KB gzipped in two downloads); the
 * module does nothing when imported, and nothing of it starts here.
 */
const PARAMS = defaultParams();

export function createRuinScene(canvas: HTMLCanvasElement, handlers: RuinHandlers, options: RuinOptions): RuinScene {
  let alive = true;
  let lostOnce = false;
  const lose = () => {
    if (lostOnce) return;
    lostOnce = true;
    handlers.onLost();
  };

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    queueMicrotask(lose);
    return { lean() {}, centre() {}, dispose() {} };
  }
  sendChangedStateOnly(gl);

  const reduced = options.reducedMotion;
  const rig = new CameraRig();
  const framing: LostFraming = { focal: 1, center: [0.5, 0.5] };

  let setProgram: Program | null = null;
  let flowerProgram: Program | null = null;
  let compositeProgram: Program | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let flowerVao: WebGLVertexArrayObject | null = null;
  const buffers: WebGLBuffer[] = [];
  let noise: WebGLTexture | null = null;
  let plate: WebGLTexture | null = null;
  let ruin: WebGLTexture | null = null;
  let stoneNoise: WebGLTexture | null = null;
  let bloomNoise: WebGLTexture | null = null;
  let poseTex: WebGLTexture | null = null;
  let flowers: DeadFlowers | null = null;

  /* The hero's colours and the dead ones, linear (read with the size). */
  const colors: Record<(typeof HERO_COLORS)[number] | (typeof DEAD_COLORS)[number], [number, number, number]> = {
    lit: [1, 1, 1], shade: [0.5, 0.5, 0.5], stone: [0.3, 0.3, 0.3], water: [0, 0, 0],
    cloth: [0.8, 0.8, 0.8], pollen: [0.8, 0.7, 0.4], petal: [0.2, 0.2, 0.2], disc: [0.1, 0.1, 0.1], stem: [0.1, 0.1, 0.1],
  };
  /* What the hero's setters read: its values, its colours, its clock. */
  const heroFrame = { params: PARAMS, colors, waterTime: 0, stoneNoise: null } as unknown as SetFrame;

  /* The set as shown, the one being refined, and the mirror. */
  let shown: Picture = { target: null, rect: [0, 0, 0, 0], scale: 1 };
  let work: Picture = { target: null, rect: [0, 0, 0, 0], scale: 1 };
  const mirror: Picture = { target: null, rect: [0, 0, 0, 0], scale: BUDGET.mirrorScale };
  /* Where the set stands now (frame px), its full samples a frame px, and
     how far the refinement has come: −1 none under way. */
  const rect: [number, number, number, number] = [0, 0, 0, 0];
  let fullScale: number = BUDGET.setSamples;
  let shownFull = false;
  let band = -1;
  let bands = 1;

  /* The frame: CSS px, and the drawing buffer's px. */
  let cssW = 0;
  let cssH = 0;
  let frameW = 0;
  let frameH = 0;
  let ready = false;
  let firstShown = false;
  let reported = false;

  /* The pose the pictures stand for. */
  const traced = { x: NaN, y: NaN, z: NaN, r0: NaN, r4: NaN, r8: NaN, focal: NaN, cx: NaN, cy: NaN, w: 0, h: 0 };

  /* The clocks: the lake's own (the hero's waves and lapping run on it). */
  let raf = 0;
  let last = 0;
  let lastDraw = -Infinity;
  let waterTime = 0;
  let parked = document.hidden;
  let resized = true;
  const view: [number, number] = [1, 1];

  /* ── Made once ──────────────────────────────────────────────────── */

  const texture = (context: WebGL2RenderingContext, filter: GLenum, wrap: GLenum, target: GLenum = context.TEXTURE_2D) => {
    const tex = context.createTexture();
    context.bindTexture(target, tex);
    context.texParameteri(target, context.TEXTURE_MIN_FILTER, filter);
    context.texParameteri(target, context.TEXTURE_MAG_FILTER, filter);
    context.texParameteri(target, context.TEXTURE_WRAP_S, wrap);
    context.texParameteri(target, context.TEXTURE_WRAP_T, wrap);
    if (target === context.TEXTURE_3D) context.texParameteri(target, context.TEXTURE_WRAP_R, wrap);
    return tex;
  };

  const make = (context: WebGL2RenderingContext) => {
    /* The lattice: a seeded random value a texel (mulberry32), repeating. */
    const values = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
    let s = 0x9e3779b9;
    for (let k = 0; k < values.length; k++) {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      values[k] = ((t ^ (t >>> 14)) >>> 0) >>> 24;
    }
    context.pixelStorei(context.UNPACK_ALIGNMENT, 1);
    noise = texture(context, context.LINEAR, context.REPEAT);
    context.texImage2D(context.TEXTURE_2D, 0, context.R8, NOISE_SIZE, NOISE_SIZE, 0, context.RED, context.UNSIGNED_BYTE, values);
    /* The user's frame's field (plate.ts). */
    plate = texture(context, context.LINEAR, context.CLAMP_TO_EDGE);
    const bytes = Uint8Array.from(atob(PLATE_DATA), (c) => c.charCodeAt(0));
    context.texImage2D(context.TEXTURE_2D, 0, context.R8, PLATE_SIZE[0], PLATE_SIZE[1], 0, context.RED, context.UNSIGNED_BYTE, bytes);
    context.pixelStorei(context.UNPACK_ALIGNMENT, 4);
    /* The ruin's shapes, a row of four floats a texel (ruin.ts). */
    ruin = texture(context, context.NEAREST, context.CLAMP_TO_EDGE);
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA32F, RUIN_WIDTH, RUIN_HEIGHT, 0, context.RGBA, context.FLOAT, RUIN_DATA);
    /* The hero's stone's own noise lattice (hero/stone/noise.ts). */
    stoneNoise = createStoneNoise(context);
    heroFrame.stoneNoise = stoneNoise;
    /* The hero's flowers' noise volume, the same values the hero makes
       (hero/bloom/bloom.ts). */
    const volume = new Uint8Array(BLOOM_NOISE_SIZE ** 3 * 4);
    let h = 0x9e3779b9;
    for (let i = 0; i < volume.length; i += 1) {
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      h ^= h >>> 15;
      volume[i] = h & 255;
    }
    bloomNoise = texture(context, context.LINEAR, context.REPEAT, context.TEXTURE_3D);
    context.texImage3D(context.TEXTURE_3D, 0, context.RGBA8, BLOOM_NOISE_SIZE, BLOOM_NOISE_SIZE, BLOOM_NOISE_SIZE, 0, context.RGBA, context.UNSIGNED_BYTE, volume);
    /* The flowers: the hero's mesh, the pose with their death in it. */
    flowers = deadFlowers();
    poseTex = texture(context, context.NEAREST, context.CLAMP_TO_EDGE);
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA32F, POSE_WIDTH, flowers.rows, 0, context.RGBA, context.FLOAT, flowers.pose);
    flowerVao = context.createVertexArray();
    context.bindVertexArray(flowerVao);
    const vertexBuffer = context.createBuffer();
    const indexBuffer = context.createBuffer();
    if (vertexBuffer) buffers.push(vertexBuffer);
    if (indexBuffer) buffers.push(indexBuffer);
    context.bindBuffer(context.ARRAY_BUFFER, vertexBuffer);
    context.bufferData(context.ARRAY_BUFFER, flowers.mesh.attributes, context.STATIC_DRAW);
    context.enableVertexAttribArray(0);
    context.vertexAttribPointer(0, 4, context.FLOAT, false, 32, 0);
    context.enableVertexAttribArray(1);
    context.vertexAttribPointer(1, 4, context.FLOAT, false, 32, 16);
    context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer);
    context.bufferData(context.ELEMENT_ARRAY_BUFFER, flowers.mesh.indices, context.STATIC_DRAW);
    context.bindVertexArray(null);
  };

  /* ── The frame's size, and the colours its variables hold ───────── */

  const measure = () => {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, box.width);
    const h = Math.max(1, box.height);
    let ratio = Math.min(window.devicePixelRatio || 1, BUDGET.maxRatio);
    const pixels = w * h * ratio * ratio;
    if (pixels > BUDGET.maxPixels) ratio *= Math.sqrt(BUDGET.maxPixels / pixels);
    cssW = w;
    cssH = h;
    frameW = Math.max(1, Math.round(w * ratio));
    frameH = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== frameW) canvas.width = frameW;
    if (canvas.height !== frameH) canvas.height = frameH;
    /* Four samples a CSS px for the set: two each way at 1×, one at 2×. */
    fullScale = Math.max(1, Math.min(BUDGET.setSamples, BUDGET.setSamples / ratio));
    view[0] = cssW;
    view[1] = cssH;
    const style = getComputedStyle(canvas);
    for (const name of HERO_COLORS) colors[name] = srgbToLinear(parseColor(style.getPropertyValue(`--color-hero-${name}`)));
    for (const name of DEAD_COLORS) colors[name] = srgbToLinear(parseColor(style.getPropertyValue(`--color-lost-${name}`)));
    resized = false;
  };

  /* ── Where the set stands this frame ────────────────────────────── */

  const corner: [number, number, number] = [0, 0, 0];
  const rectOf = (frame: CameraFrame, mirrored: boolean, out: [number, number, number, number]) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const r = frame.rotation;
    const [px, py, pz] = frame.position;
    for (let k = 0; k < 8; k++) {
      corner[0] = (k & 1 ? SET_BOUNDS.hi : SET_BOUNDS.lo)[0];
      corner[1] = (k & 2 ? SET_BOUNDS.hi : SET_BOUNDS.lo)[1] * (mirrored ? -1 : 1);
      corner[2] = (k & 4 ? SET_BOUNDS.hi : SET_BOUNDS.lo)[2];
      const dx = corner[0] - px;
      const dy = corner[1] - py;
      const dz = corner[2] - pz;
      /* camera space: Rᵀ · (p − eye), R column-major */
      const cx = r[0] * dx + r[1] * dy + r[2] * dz;
      const cy = r[3] * dx + r[4] * dy + r[5] * dz;
      const cz = r[6] * dx + r[7] * dy + r[8] * dz;
      if (cz <= 0.01) continue;
      const u = ((cx / cz) * framing.focal) / cssW + framing.center[0];
      const v = ((cy / cz) * framing.focal) / cssH + framing.center[1];
      x0 = Math.min(x0, u * frameW);
      x1 = Math.max(x1, u * frameW);
      y0 = Math.min(y0, v * frameH);
      y1 = Math.max(y1, v * frameH);
    }
    x0 = Math.max(0, Math.floor(x0) - PAD_PX);
    y0 = Math.max(0, Math.floor(y0) - PAD_PX);
    x1 = Math.min(frameW, Math.ceil(x1) + PAD_PX);
    y1 = Math.min(frameH, Math.ceil(y1) + PAD_PX);
    out[0] = x0;
    out[1] = y0;
    out[2] = Math.max(0, x1 - x0);
    out[3] = Math.max(0, y1 - y0);
  };

  /* A picture's drawn size (texels). */
  const texelsOf = (picture: Picture): [number, number] => [Math.ceil(picture.rect[2] * picture.scale), Math.ceil(picture.rect[3] * picture.scale)];

  const deleteTarget = (context: WebGL2RenderingContext, t: Target | null) => {
    if (!t) return;
    context.deleteFramebuffer(t.fbo);
    context.deleteTexture(t.tex);
    context.deleteRenderbuffer(t.depth);
  };

  const createTarget = (context: WebGL2RenderingContext, width: number, height: number): Target => {
    const tex = texture(context, context.LINEAR, context.CLAMP_TO_EDGE);
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null);
    const depth = context.createRenderbuffer();
    const fbo = context.createFramebuffer();
    if (!tex || !depth || !fbo) throw new Error("not-found: target allocation failed");
    context.bindRenderbuffer(context.RENDERBUFFER, depth);
    context.renderbufferStorage(context.RENDERBUFFER, context.DEPTH_COMPONENT24, width, height);
    context.bindFramebuffer(context.FRAMEBUFFER, fbo);
    context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, tex, 0);
    context.framebufferRenderbuffer(context.FRAMEBUFFER, context.DEPTH_ATTACHMENT, context.RENDERBUFFER, depth);
    if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) throw new Error("not-found: target incomplete");
    return { tex, depth, fbo, width, height };
  };

  /* A picture's target, grown when its rect outgrows it, kept otherwise. */
  const fit = (context: WebGL2RenderingContext, picture: Picture) => {
    const [w, h] = texelsOf(picture);
    if (!(w > 0 && h > 0) || !Number.isFinite(w + h)) return false;
    const t = picture.target;
    if (t && t.width >= w && t.height >= h) return true;
    picture.target = createTarget(
      context,
      Math.max(w, Math.ceil(w * BUDGET.slack), t?.width ?? 0),
      Math.max(h, Math.ceil(h * BUDGET.slack), t?.height ?? 0),
    );
    deleteTarget(context, t);
    return true;
  };

  /* ── Drawing ────────────────────────────────────────────────────── */

  const sendCamera = (context: WebGL2RenderingContext, u: Program["uniforms"], frame: CameraFrame) => {
    context.uniform2f(u.uView, cssW, cssH);
    context.uniform1f(u.uFocal, framing.focal);
    context.uniform2f(u.uCenter, framing.center[0], framing.center[1]);
    context.uniform3f(u.uCamPos, frame.position[0], frame.position[1], frame.position[2]);
    context.uniformMatrix3fv(u.uCamRot, false, frame.rotation);
  };

  const L = LOOK;
  const fogLight = linear(L.fog.level);
  const sendPrint = (context: WebGL2RenderingContext, u: Program["uniforms"]) => {
    const p = knobs.print ?? L.print.hero;
    context.uniform3f(u.uPrint, p[0], p[1], p[2]);
  };

  /* The stone traced into rows [from, to) of a picture's drawn texels (the
     first band clears it); then, but in the mirror, the flowers. */
  const trace = (context: WebGL2RenderingContext, frame: CameraFrame, picture: Picture, mirrored: boolean, from: number, to: number) => {
    const program = setProgram;
    if (!program || !picture.target) return;
    const u = program.uniforms;
    const [w, h] = texelsOf(picture);
    context.bindFramebuffer(context.FRAMEBUFFER, picture.target.fbo);
    if (from === 0) {
      context.viewport(0, 0, picture.target.width, picture.target.height);
      context.clearColor(0, 0, 0, 0);
      context.clearDepth(1);
      context.depthMask(true);
      context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);
    }
    context.viewport(0, 0, w, h);
    const partial = from > 0 || to < h;
    if (partial) {
      context.enable(context.SCISSOR_TEST);
      context.scissor(0, from, w, Math.max(0, Math.min(h, to) - from));
    }
    /* The stone, writing its depth (always: it is the picture's first). */
    context.enable(context.DEPTH_TEST);
    context.depthFunc(context.ALWAYS);
    context.depthMask(true);
    context.bindVertexArray(vao);
    context.useProgram(program.handle);
    sendCamera(context, u, frame);
    setStoneUniforms(context, u, heroFrame);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, noise);
    context.uniform1i(u.uNoise, 0);
    context.activeTexture(context.TEXTURE1);
    context.bindTexture(context.TEXTURE_2D, ruin);
    context.uniform1i(u.uRuin, 1);
    context.uniform2f(u.uFrame, frameW, frameH);
    context.uniform4f(u.uRect, picture.rect[0], picture.rect[1], picture.rect[2], picture.rect[3]);
    context.uniform1f(u.uScale, picture.scale);
    context.uniform1f(u.uMirror, mirrored ? 1 : 0);
    context.uniform1f(u.uFootprint, cssW / (framing.focal * frameW * picture.scale));
    context.uniform1i(u.uSteps, knobs.steps ?? BUDGET.steps);
    context.uniform1i(u.uTaps, knobs.taps ?? 4);
    context.uniform1i(u.uChunks, RUIN_COUNTS.chunks);
    context.uniform1i(u.uBites, RUIN_COUNTS.bites);
    context.uniform1i(u.uCracks, knobs.cracks ?? RUIN_COUNTS.cracks);
    context.uniform3fv(u.uLit, colors.lit);
    context.uniform1f(u.uWaterTime, waterTime);
    context.uniform1f(u.uFogLight, fogLight);
    context.uniform1f(u.uFogPerMetre, L.fog.perMetre);
    sendPrint(context, u);
    context.uniform4f(u.uCrack, L.crack.core, L.crack.shadowReach, L.crack.shadow, L.crack.wander);
    context.uniform2f(u.uOcclusion, L.occlusion.reach, L.occlusion.strength);
    if (flowers) context.uniform4fv(u.uShade, flowers.shade);
    context.uniform1i(u.uShadeCount, Math.min(flowers?.shadeCount ?? 0, SHADE_TUBES));
    context.uniform2f(u.uContact, L.contact.reach, L.contact.strength);
    context.drawArrays(context.TRIANGLES, 0, 3);

    /* The hero's flowers on it: the hero's programs, the stone's depth. */
    const plant = flowerProgram;
    if (!mirrored && plant && flowers && flowerVao && poseTex && bloomNoise) {
      const p = plant.uniforms;
      context.depthFunc(context.LESS);
      context.useProgram(plant.handle);
      sendCamera(context, p, frame);
      bindTexture(context, p.uPose, 0, poseTex);
      bindTexture(context, p.uNoise, 1, bloomNoise, context.TEXTURE_3D);
      const B = BLOOM;
      context.uniform1f(p.uRayRuffle, B.rays.ruffle);
      context.uniform2f(p.uRidges, B.stem.ribs[0], B.stem.ribs[1]);
      context.uniform1f(p.uClothPleat, B.cloth.pleat);
      context.uniform4f(p.uTargetRect, picture.rect[0] / frameW, picture.rect[1] / frameH, w / picture.scale / frameW, h / picture.scale / frameH);
      context.uniform1f(p.uMirror, 0);
      context.uniform3f(p.uPoints, 0, B.pollen.radius, picture.scale * (frameW / cssW));
      /* No stone for the hero's program to hide the flowers behind: the
         stone it knows is whole, and part of it is gone. The depth hides
         them where this one stands (LOOK.dead.noStone: far away). */
      context.uniform4f(p.uStonePlan, L.dead.noStone, L.dead.noStone, STONE.plan.across, STONE.plan.along);
      context.uniform2f(p.uStoneSpan, -STONE.depth, STONE.top);
      context.uniform4f(p.uStoneWeather, STONE.edge, STONE.runs, STONE.lichen.size, STONE.lichen.cover);
      context.uniform3fv(p.uLit, colors.lit);
      /* The hero's dome, scaled as the hero scales it with its stone's top
         light (hero/bloom/bloom.ts: fitted under 0.8). */
      const dome = B.light.dome;
      const k = STONE.light.top / L.dead.domeFittedUnder;
      context.uniform3f(p.uBloomDome, dome[0] * k, dome[1] * k, dome[2] * k);
      context.uniform2f(p.uLightSide, STONE.lightSide[0], STONE.lightSide[1]);
      context.uniform3fv(p.uPetal, colors.petal);
      context.uniform3fv(p.uDisc, colors.disc);
      context.uniform3fv(p.uStem, colors.stem);
      context.uniform3fv(p.uCloth, colors.cloth);
      context.uniform3fv(p.uPollen, colors.pollen);
      /* Dried: the rays' light through them, their sheen and satin, the
         stems' wax, as the dead are (LOOK.dead); the rest the hero's. */
      const D = L.dead;
      const H = B.light;
      context.uniform4f(p.uBloomLight, H.transmit * D.transmit, H.sheen * D.sheen, H.wax * D.wax, H.through[0] * D.transmit);
      context.uniform4f(p.uBloomMore, H.through[1], H.florets[0], H.florets[1], B.rays.teeth);
      context.uniform4f(p.uRayLook, H.veins[0], H.veins[1], H.satin[0], H.satin[1] * D.sheen);
      context.uniform4f(p.uPlantMore, H.weave, B.cloth.fray[0], B.cloth.fray[1], H.cloth);
      sendPrint(context, p);
      context.bindVertexArray(flowerVao);
      context.drawElements(context.TRIANGLES, flowers.mesh.indices.length, context.UNSIGNED_SHORT, 0);
      context.bindVertexArray(vao);
    }
    context.disable(context.DEPTH_TEST);
    if (partial) context.disable(context.SCISSOR_TEST);
  };

  const composite = (context: WebGL2RenderingContext, frame: CameraFrame, now: number) => {
    const program = compositeProgram;
    if (!program) return;
    const u = program.uniforms;
    context.bindFramebuffer(context.FRAMEBUFFER, null);
    context.viewport(0, 0, frameW, frameH);
    context.bindVertexArray(vao);
    context.useProgram(program.handle);
    sendCamera(context, u, frame);
    setStoneUniforms(context, u, heroFrame);
    heroFrame.waterTime = waterTime;
    setWaterUniforms(context, u, heroFrame);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, noise);
    context.uniform1i(u.uNoise, 0);
    context.activeTexture(context.TEXTURE1);
    context.bindTexture(context.TEXTURE_2D, plate);
    context.uniform1i(u.uPlate, 1);
    context.activeTexture(context.TEXTURE2);
    context.bindTexture(context.TEXTURE_2D, shown.target?.tex ?? null);
    context.uniform1i(u.uSet, 2);
    context.activeTexture(context.TEXTURE3);
    context.bindTexture(context.TEXTURE_2D, mirror.target?.tex ?? null);
    context.uniform1i(u.uMirrorImage, 3);
    context.uniform2f(u.uFrame, frameW, frameH);
    context.uniform4f(u.uPlateSpan, PLATE_SPAN.across[0], PLATE_SPAN.across[1], PLATE_SPAN.up[0], PLATE_SPAN.up[1]);
    const r = shown.rect;
    context.uniform4f(u.uSetRect, r[0], r[1], shown.target ? r[2] : 0, shown.target ? r[3] : 0);
    context.uniform1f(u.uSetScale, shown.scale);
    context.uniform2f(u.uSetTexels, shown.target?.width ?? 1, shown.target?.height ?? 1);
    const m = mirror.rect;
    context.uniform4f(u.uMirrorRect, m[0], m[1], mirror.target ? m[2] : 0, mirror.target ? m[3] : 0);
    context.uniform1f(u.uMirrorScale, mirror.scale);
    context.uniform2f(u.uMirrorTexels, mirror.target?.width ?? 1, mirror.target?.height ?? 1);
    context.uniform1f(u.uGrainSeed, reduced ? 0 : Math.floor((now / 1000) * L.print.grainRate) % L.print.grainCycle);
    context.uniform1f(u.uGrain, L.print.grain / 255);
    context.uniform1f(u.uCssPerPx, cssW / frameW);
    context.uniform2f(u.uTone, PLATE_TONE.red[1] / 255, PLATE_TONE.blue[1] / 255);
    context.uniform1f(u.uFogLight, fogLight);
    context.uniform1f(u.uWaterBase, L.water.base);
    context.uniform1f(u.uRings, knobs.rings ?? L.water.rings);
    context.drawArrays(context.TRIANGLES, 0, 3);
  };

  /* Whether the camera (or the frame) is not where the pictures stand. */
  const movedFrom = (frame: CameraFrame) => {
    const rot = frame.rotation;
    const e = SCENE_MOTION.poseEpsilon;
    return (
      Number.isNaN(traced.x) || traced.w !== frameW || traced.h !== frameH ||
      Math.abs(traced.x - frame.position[0]) > e || Math.abs(traced.y - frame.position[1]) > e ||
      Math.abs(traced.z - frame.position[2]) > e ||
      Math.abs(traced.r0 - rot[0]) > e || Math.abs(traced.r4 - rot[4]) > e || Math.abs(traced.r8 - rot[8]) > e ||
      traced.focal !== framing.focal || traced.cx !== framing.center[0] || traced.cy !== framing.center[1]
    );
  };

  const standFor = (frame: CameraFrame) => {
    traced.x = frame.position[0];
    traced.y = frame.position[1];
    traced.z = frame.position[2];
    traced.r0 = frame.rotation[0];
    traced.r4 = frame.rotation[4];
    traced.r8 = frame.rotation[8];
    traced.focal = framing.focal;
    traced.cx = framing.center[0];
    traced.cy = framing.center[1];
    traced.w = frameW;
    traced.h = frameH;
  };

  /** One frame: the pictures brought up to date, then the composite. */
  const draw = (context: WebGL2RenderingContext, now: number) => {
    /* The hero's lean (its turn and its eye), through the hero's lens:
       everything reads the lens from `framing`. */
    const frame = rig.pose(view, SWAY);
    lostFraming(cssW, cssH, framing);

    /* Before the first picture is whole, a hand moving over the page does
       not restart it: it is finished for where it began, and the camera
       catches up after. */
    if (movedFrom(frame) && (firstShown || band < 0)) {
      standFor(frame);
      rectOf(frame, false, rect);
      rectOf(frame, true, mirror.rect);
      if (fit(context, mirror)) trace(context, frame, mirror, true, 0, Infinity);
      band = -1;
      shownFull = false;
      /* Something is on the screen: a quick picture now, refined once the
         camera rests. Nothing yet: straight to the full one. */
      if (firstShown) {
        shown.rect.splice(0, 4, ...rect);
        shown.scale = fullScale * BUDGET.moving;
        if (fit(context, shown)) trace(context, frame, shown, false, 0, Infinity);
      }
    } else if (!shownFull) {
      /* At rest: the full picture, a band a frame, swapped in when whole. */
      if (band < 0) {
        work.rect.splice(0, 4, ...rect);
        work.scale = fullScale;
        const [w, h] = texelsOf(work);
        bands = Math.max(1, Math.min(16, Math.ceil((w * h) / BUDGET.band)));
        band = 0;
        if (!fit(context, work)) band = -1;
      }
      if (band >= 0) {
        const h = texelsOf(work)[1];
        const step = Math.ceil(h / bands);
        trace(context, frame, work, false, band * step, (band + 1) * step);
        band++;
        if (band >= bands) {
          [shown, work] = [work, shown];
          shownFull = true;
          band = -1;
          firstShown = true;
        }
      }
    }

    if (!firstShown) return;
    composite(context, frame, now);
    lastDraw = now;
    if (!reported) {
      reported = true;
      handlers.onFirstFrame();
    }
  };

  /* ── The loop ───────────────────────────────────────────────────── */

  const tick = (now: number) => {
    raf = 0;
    if (!alive || parked || !ready || gl.isContextLost()) return;
    const dt = Math.min(Math.max(0, (now - last) / 1000), SCENE_MOTION.maxFrame);
    last = now;
    if (resized) measure();
    rig.update(dt, SWAY.swayRate, SWAY.followMix);
    const moving = !rig.resting;
    if (!reduced) waterTime += dt;
    const due =
      !shownFull || moving || traced.w !== frameW || traced.h !== frameH ||
      (!reduced && now - lastDraw >= 1000 / SCENE_MOTION.stillRate - SCENE_MOTION.early);
    if (due) draw(gl, now);
    /* Under reduced motion nothing moves but the lean (which is off): once
       the picture is whole the loop parks, and a resize wakes it. */
    if (!reduced || moving || !shownFull) raf = requestAnimationFrame(tick);
  };

  const wake = () => {
    if (raf || !alive || parked || !ready) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  /* ── Parking ────────────────────────────────────────────────────── */

  let onScreen = true;
  const repark = () => {
    const was = parked;
    parked = document.hidden || !onScreen;
    if (parked && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (was && !parked) wake();
  };
  const sizes = new ResizeObserver(() => {
    resized = true;
    wake();
  });
  sizes.observe(canvas);
  const sight = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    repark();
  });
  sight.observe(canvas);
  document.addEventListener("visibilitychange", repark);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ready = false;
    lose();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  /* Everything this made on the GPU, deleted (on every way out). */
  function free() {
    const context = gl as WebGL2RenderingContext;
    if (context.isContextLost()) return;
    if (!ready) abandonPrograms(context);
    for (const program of [setProgram, flowerProgram, compositeProgram]) if (program) context.deleteProgram(program.handle);
    setProgram = flowerProgram = compositeProgram = null;
    for (const picture of [shown, work, mirror]) {
      deleteTarget(context, picture.target);
      picture.target = null;
    }
    for (const tex of [noise, plate, ruin, stoneNoise, bloomNoise, poseTex]) context.deleteTexture(tex);
    noise = plate = ruin = stoneNoise = bloomNoise = poseTex = null;
    for (const buffer of buffers.splice(0)) context.deleteBuffer(buffer);
    context.deleteVertexArray(vao);
    context.deleteVertexArray(flowerVao);
    vao = flowerVao = null;
  }

  /* ── Start ──────────────────────────────────────────────────────── */

  const compileStart = performance.now();
  let compileMs = NaN;
  try {
    setProgram = createProgram(gl, SET_FRAG, SET_UNIFORMS);
    flowerProgram = createProgram(gl, FLOWER_FRAG, FLOWER_UNIFORMS, FLOWER_VERT);
    compositeProgram = createProgram(gl, COMPOSITE_FRAG, COMPOSITE_UNIFORMS);
  } catch {
    queueMicrotask(lose);
  }
  vao = gl.createVertexArray();
  make(gl);

  programsLinked(gl, () => alive)
    .then(() => {
      if (!alive || gl.isContextLost()) return;
      compileMs = performance.now() - compileStart;
      ready = true;
      wake();
    })
    .catch(() => {
      /* A shader refused: what was made goes now, not at unmount (this
         page is never unmounted but by leaving it). */
      if (!alive) return;
      free();
      lose();
    });

  /* ── Development: probe it and time it (window.__kaviLost) ──────── */

  const devName = "__kaviLost";
  if (process.env.NODE_ENV !== "production") {
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const handle = {
      knobs,
      /** How long the programs took to link (ms, from their creation). */
      get compileMs() {
        return compileMs;
      },
      /** Traces the set again at full quality (after a knob changes). */
      retrace() {
        traced.w = 0;
        firstShown = false;
        band = -1;
        wake();
      },
      /** The printed frame at CSS points (x, y from the top left): drawn
       *  and read back in one task. */
      probe(points: [number, number][]) {
        if (!ready || !firstShown) return null;
        if (resized) measure();
        draw(gl, performance.now());
        const px = new Uint8Array(4);
        return points.map(([x, y]) => {
          gl.readPixels(Math.round((x * frameW) / cssW), frameH - 1 - Math.round((y * frameH) / cssH), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return [px[0], px[1], px[2]];
        });
      },
      /** GPU ms, medians over `frames`: the whole set at full samples
       *  (seen, flowers, mirror), a quick one (moving), and the composite.
       *  On the GPU's clock where offered, else end to end. */
      async timings(frames = 30) {
        if (!ready || !firstShown) return null;
        if (resized) measure();
        const out = { full: [] as number[], moving: [] as number[], composite: [] as number[], clock: timer ? "gpu" : "wall" };
        const px = new Uint8Array(4);
        const fence = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pending: [WebGLQuery, number[]][] = [];
        const time = (list: number[], run: () => void) => {
          if (timer) {
            const q = gl.createQuery()!;
            gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
            run();
            gl.endQuery(timer.TIME_ELAPSED_EXT);
            pending.push([q, list]);
          } else {
            fence();
            const t0 = performance.now();
            run();
            fence();
            list.push(performance.now() - t0);
          }
        };
        const frame = rig.pose(view, SWAY);
        lostFraming(cssW, cssH, framing);
        const probe: Picture = { target: null, rect: [...rect], scale: fullScale };
        for (let k = 0; k < frames; k++) {
          probe.scale = fullScale;
          fit(gl, probe);
          time(out.full, () => {
            trace(gl, frame, probe, false, 0, Infinity);
            trace(gl, frame, mirror, true, 0, Infinity);
          });
          probe.scale = fullScale * BUDGET.moving;
          time(out.moving, () => trace(gl, frame, probe, false, 0, Infinity));
          time(out.composite, () => composite(gl, frame, performance.now()));
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        for (const [q, list] of pending) {
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) list.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q);
        }
        deleteTarget(gl, probe.target);
        const median = (v: number[]) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)];
        return { clock: out.clock, full: median(out.full), moving: median(out.moving), composite: median(out.composite), bands, frame: [frameW, frameH], setRect: [...rect], scale: fullScale };
      },
    };
    (window as unknown as Record<string, unknown>)[devName] = handle;
  }

  return {
    lean(nx, ny) {
      if (reduced) return;
      rig.lean(nx, ny);
      wake();
    },
    centre() {
      rig.centre();
      wake();
    },
    dispose() {
      if (!alive) return;
      alive = false;
      if (process.env.NODE_ENV !== "production") delete (window as unknown as Record<string, unknown>)[devName];
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizes.disconnect();
      sight.disconnect();
      document.removeEventListener("visibilitychange", repark);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      free();
    },
  };
}
