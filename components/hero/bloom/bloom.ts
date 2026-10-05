/**
 * ─── Bloom · its pass ───
 *
 * The plant is a small mesh (shape.ts), posed on the CPU each frame — the
 * opening, the air's push through springs, the tepals' tremble — and drawn
 * by its own two small programs (shaders/bloom.ts) into the two pictures the
 * scene pass reads:
 *
 *   NEAR    the plant as the camera sees it, over a rect of the scene's own
 *           pixels round it, and on the stone under it the share of the sky
 *           the stone keeps — read by the scene at the same pixel
 *   MIRROR  the plant as the still lake mirrors it, at half the resolution,
 *           softened (the lake blurs it anyway) — read where the reflected
 *           ray crosses the plant's depth
 *
 * Each is drawn SUPERSAMPLED (several samples a pixel each way, with a
 * depth test) and then resolved to its pixels, the contact shade worked out
 * in the same resolve. Its rect is fitted round the posed plant every frame
 * (the opening grows it, the sway moves it, the pollen drifts), its corner
 * on the scene's pixel grid; the targets grow with headroom and are kept.
 *
 * ONE PICTURE A DRAW: never one draw into two targets (gl.ts Target: under
 * Direct3D a program drawn into two at once is compiled again on its first
 * draw).
 */

import { CAMERA, CAMERA_UNIFORMS, setCameraUniforms, type CameraFrame } from "../stage/camera";
import { bindTexture, createProgram, deleteTarget, type Program } from "../stage/gl";
import { STONE } from "../stone/optics";
import { OPENING, POLLEN, SWAY } from "./motion";
import { BLOOM } from "./optics";
import { CONTACT_POINTS, PLANT_FRAG, PLANT_VERT, RESOLVE_FRAG } from "./shaders/bloom";
import { antherAt, buildMesh, grow, Pose, POSE_WIDTH, SAMPLES, type Genome, type Mesh, type Vec3 } from "./shape";

/** The plant's reflectances (linear), read from the hero's tokens. */
export interface BloomColors {
  lit: readonly [number, number, number];
  petal: readonly [number, number, number];
  sepal: readonly [number, number, number];
  leaf: readonly [number, number, number];
  tube: readonly [number, number, number];
  anther: readonly [number, number, number];
}

/** The air at a world point: velocity (m/s, world x and y) and churn. */
export type AirAt = (p: Vec3, out: [number, number, number]) => [number, number, number];

/** What the plant is told each step. */
export interface BloomStep {
  /** Seconds of the visit the stage has been on screen. */
  clock: number;
  /** A fixed opening (0 bud … 1 open) for tuning, or below 0: the clock's. */
  open: number;
  /** This visit's flower, 0–1. */
  seed: number;
  /** No idle movement: the plant moves only when the air moves it. */
  reduced: boolean;
  air: AirAt | null;
}

/** What it is drawn in: the stone's light (STONE.light): top, away, toward. */
export interface BloomLight {
  light: readonly [number, number, number];
}

/* Samples a pixel each way: the most that keeps the near picture's
   samples under ~0.9 M (a 1440 frame's plant draws at 4, a 4K one's at 3). */
const SAMPLE_BUDGET = 900_000;
/* The mirror: half the scene's resolution, two samples a pixel each way. */
const MIRROR_SCALE = 0.5;
const MIRROR_SAMPLES = 2;
/* Px of margin round the posed plant: the antialiased edge, and the
   contact shade's reach on the stone. */
const MARGIN_PX = 3;

const PLANT_UNIFORMS = [
  ...CAMERA_UNIFORMS,
  "uPose", "uFlowerOrigin", "uFlowerBasis", "uHeart", "uHeartSpan", "uHeartSplay", "uStyleTip", "uRibs",
  "uTargetRect", "uMirror", "uPoints",
  "uStonePlan", "uStoneSpan", "uStoneWeather",
  "uLit", "uBloomDome", "uLightSide", "uPetal", "uSepal", "uLeaf", "uTubeTone", "uAnther",
  "uBloomLight", "uBloomMore",
];
const RESOLVE_UNIFORMS = [
  ...CAMERA_UNIFORMS,
  "uSource", "uResolve", "uRectPx", "uStemPoints", "uStemLoops", "uFlowerShade", "uRoot", "uContactShade",
  "uStonePlan", "uStoneSpan", "uStoneWeather",
];

/** A supersampled target: a colour texture and a depth buffer. */
interface Sampled {
  tex: WebGLTexture;
  depth: WebGLRenderbuffer;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

/** A resolved picture, with the part of it in use this frame. */
interface Picture {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

class Spring {
  readonly d: Vec3 = [0, 0, 0];
  readonly v: Vec3 = [0, 0, 0];
}

interface Speck {
  p: Vec3;
  age: number;
  life: number;
  drift: Vec3;
}

export class BloomPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly plant: Program;
  private readonly resolve: Program;
  private readonly meshVao: WebGLVertexArrayObject;
  private readonly meshBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly pollenVao: WebGLVertexArrayObject;
  private readonly pollenBuffer: WebGLBuffer;
  private readonly poseTex: WebGLTexture;

  private genome: Genome;
  private mesh: Mesh;
  private pose: Pose;
  private opaque = 0;

  /* Supersampled and resolved, near and mirrored. */
  private nearSampled: Sampled | null = null;
  private mirrorSampled: Sampled | null = null;
  private near: Picture | null = null;
  private mirror: Picture | null = null;
  /* This frame: the near rect (scene px: corner, size), its samples a
     pixel; the mirror's rect (frame uv: corner, size) and its size (px). */
  private readonly nearRect = [0, 0, 0, 0];
  private samples = 4;
  private readonly mirrorRect = [0, 0, 0, 0];
  private readonly mirrorSize = [0, 0];

  /* The scene's target and the frame (px, CSS px). */
  private sceneW = 1;
  private sceneH = 1;
  private cssW = 1;
  private cssH = 1;

  /* Motion. */
  private open = 0;
  private readonly head = new Spring();
  private readonly stems = BLOOM.stems.map(() => new Spring());
  private accumulator = 0;
  private stepTime = 0;
  private airSpeed = 0;
  private readonly specks: Speck[] = [];
  private shed = 0;
  private readonly pollenData = new Float32Array(POLLEN.most * 4);
  private readonly stemPoints = new Float32Array(CONTACT_POINTS * 4);

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject, seed: number) {
    this.gl = gl;
    this.vao = vao;
    this.plant = createProgram(gl, PLANT_FRAG, PLANT_UNIFORMS, PLANT_VERT);
    this.resolve = createProgram(gl, RESOLVE_FRAG, RESOLVE_UNIFORMS);

    const meshVao = gl.createVertexArray();
    const pollenVao = gl.createVertexArray();
    const meshBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const pollenBuffer = gl.createBuffer();
    const poseTex = gl.createTexture();
    if (!meshVao || !pollenVao || !meshBuffer || !indexBuffer || !pollenBuffer || !poseTex) {
      throw new Error("bloom: allocation failed");
    }
    this.meshVao = meshVao;
    this.pollenVao = pollenVao;
    this.meshBuffer = meshBuffer;
    this.indexBuffer = indexBuffer;
    this.pollenBuffer = pollenBuffer;
    this.poseTex = poseTex;

    gl.bindVertexArray(pollenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pollenBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.pollenData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttrib4f(1, 0, 0, 0, 0);
    gl.bindVertexArray(null);

    this.genome = grow(seed);
    this.mesh = buildMesh(this.genome);
    this.pose = new Pose(this.genome, this.mesh.layout);
    this.upload();
  }

  /* ── The flower this visit ─────────────────────────────────────────── */

  private regrow(seed: number): void {
    this.genome = grow(seed);
    this.mesh = buildMesh(this.genome);
    this.pose = new Pose(this.genome, this.mesh.layout);
    this.upload();
  }

  /** The mesh to the GPU, and the pose texture sized to its layout. */
  private upload(): void {
    const gl = this.gl;
    const mesh = this.mesh;
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.attributes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.opaque = mesh.opaque;

    gl.bindTexture(gl.TEXTURE_2D, this.poseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, POSE_WIDTH, mesh.layout.rows, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /* ── Motion ────────────────────────────────────────────────────────── */

  /** Advances the plant by `dt` seconds: the opening, the air, the pollen. */
  update(dt: number, step: BloomStep): void {
    if (step.seed !== this.genome.seed) this.regrow(step.seed);
    this.open =
      step.open >= 0 ? Math.min(step.open, 1) : Math.min(Math.max((step.clock - OPENING.delay) / OPENING.seconds, 0), 1);

    /* The air where the plant stands, once a frame: at the flower, at each
       stem's tip. */
    const air: [number, number, number] = [0, 0, 0];
    const at = (p: readonly number[]) => (step.air ? step.air([p[0], p[1], p[2]], air) : ((air[0] = air[1] = air[2] = 0), air));
    const flowerAir = [...at(BLOOM.center)];
    const tipAir = BLOOM.stems.map((s) => [...at(s.points[s.points.length - 1])]);

    /* Fixed steps (the house rule for springs), the frame capped. */
    this.accumulator += Math.min(dt, SWAY.maxFrame);
    while (this.accumulator >= SWAY.step) {
      this.accumulator -= SWAY.step;
      this.stepTime += SWAY.step;
      this.spring(this.head, SWAY.head, flowerAir);
      this.stems.forEach((s, k) => this.spring(s, SWAY.stem, tipAir[k]));
    }

    /* Never quite still: the convection round it (motion.ts SWAY.idle). */
    const idle = step.reduced ? 0 : SWAY.idle.amount;
    const w = 2 * Math.PI * SWAY.idle.hz;
    const t = step.clock;
    const breathe = (phase: number): Vec3 => [
      idle * (Math.sin(w * t + phase) + 0.6 * Math.sin(w * SWAY.idle.ratio * t + 1.7 * phase)),
      idle * 0.6 * (Math.sin(w * 0.83 * t + 2.3 * phase) + 0.5 * Math.sin(w * SWAY.idle.ratio * 1.3 * t + phase)),
      0,
    ];
    const head = add(this.head.d, breathe(0.4));
    const tips = this.stems.map((s, k) => add(s.d, scale(breathe(1.9 + k * 2.4), 0.5)));

    /* How hard the air moves past the open flower: the tremble, the
       pollen. */
    const rel = Math.hypot(flowerAir[0] - this.head.v[0], flowerAir[1] - this.head.v[1]);
    this.airSpeed += (rel - this.airSpeed) * (1 - Math.exp(-dt / 0.15));

    this.pose.update({ open: this.open, head, stems: tips, air: this.airSpeed, time: this.stepTime });
    this.stepPollen(dt, step);
  }

  /** One fixed step of a spring pushed by the air (x and y, m/s). */
  private spring(s: Spring, k: { hz: number; damping: number; drag: number; most: number }, air: readonly number[]): void {
    const h = SWAY.step;
    const w = 2 * Math.PI * k.hz;
    for (let c = 0; c < 2; c += 1) {
      const a = -w * w * s.d[c] - 2 * k.damping * w * s.v[c] + k.drag * (air[c] - s.v[c]);
      s.v[c] += a * h;
      s.d[c] += s.v[c] * h;
    }
    /* Bent, never flung: past `most` it is held there. */
    const r = Math.hypot(s.d[0], s.d[1]);
    if (r > k.most) {
      s.d[0] *= k.most / r;
      s.d[1] *= k.most / r;
    }
  }

  private stepPollen(dt: number, step: BloomStep): void {
    const P = POLLEN;
    const specks = this.specks;
    const ripe = Math.min(Math.max((this.pose.frame.heart - P.ripe) / (1 - P.ripe), 0), 1);
    const strength = Math.min(Math.max((this.airSpeed - P.from) / (P.full - P.from), 0), 1);
    this.shed += dt * P.rate * strength * ripe;
    const tip: Vec3 = [0, 0, 0];
    while (this.shed >= 1) {
      this.shed -= 1;
      if (specks.length >= P.most) break;
      const i = Math.floor(Math.random() * (this.genome.filaments.length / 4));
      const p = this.pose.toWorld(antherAt(this.genome, i, this.pose.frame.heart, tip));
      const a = Math.random() * 2 * Math.PI;
      specks.push({
        p,
        age: 0,
        life: P.life[0] + (P.life[1] - P.life[0]) * Math.random(),
        drift: [Math.cos(a) * P.wander, Math.sin(a) * P.wander, (Math.random() - 0.5) * P.wander],
      });
    }
    const air: [number, number, number] = [0, 0, 0];
    const origin = this.pose.frame.origin;
    for (let i = specks.length - 1; i >= 0; i -= 1) {
      const s = specks[i];
      s.age += dt;
      const far = Math.hypot(s.p[0] - origin[0], s.p[1] - origin[1], s.p[2] - origin[2]);
      if (s.age >= s.life || far > P.reach) {
        specks.splice(i, 1);
        continue;
      }
      const v = step.air ? step.air(s.p, air) : air;
      s.p[0] += (v[0] + s.drift[0]) * dt;
      s.p[1] += (v[1] + s.drift[1] - P.settle) * dt;
      s.p[2] += s.drift[2] * dt;
    }
  }

  /* ── Drawing ───────────────────────────────────────────────────────── */

  /** The scene's target (px) and the frame (CSS px). */
  resize(sceneW: number, sceneH: number, cssW: number, cssH: number): void {
    this.sceneW = sceneW;
    this.sceneH = sceneH;
    this.cssW = cssW;
    this.cssH = cssH;
  }

  /** Draws both pictures for this frame's camera. */
  render(camera: CameraFrame, colors: BloomColors, light: BloomLight): void {
    const gl = this.gl;
    if (!this.fit(camera)) return;
    gl.bindTexture(gl.TEXTURE_2D, this.poseTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, POSE_WIDTH, this.mesh.layout.rows, gl.RGBA, gl.FLOAT, this.pose.data);
    const count = this.packPollen();

    const pxPerCss = this.sceneW / this.cssW;
    const [nx, ny, nw, nh] = this.nearRect;
    const near = this.near;
    const nearSampled = this.nearSampled;
    if (near && nearSampled && nw > 0 && nh > 0) {
      const rect = [nx / this.sceneW, ny / this.sceneH, nw / this.sceneW, nh / this.sceneH];
      this.drawPlant(nearSampled, nw * this.samples, nh * this.samples, rect, 0, this.samples * pxPerCss, camera, colors, light, count);
      this.drawResolve(near, nw, nh, nearSampled, [this.samples, 0, 0, 1], camera);
    }
    const mirror = this.mirror;
    const mirrorSampled = this.mirrorSampled;
    const [mw, mh] = this.mirrorSize;
    if (mirror && mirrorSampled && mw > 0 && mh > 0) {
      const perPx = MIRROR_SAMPLES * pxPerCss * MIRROR_SCALE;
      this.drawPlant(mirrorSampled, mw * MIRROR_SAMPLES, mh * MIRROR_SAMPLES, this.mirrorRect, 1, perPx, camera, colors, light, count);
      /* The lake's blur, as samples of this picture. */
      const sigma = Math.max(0.35 * BLOOM.mirrorBlur * camera.focal * perPx, 0.5);
      this.drawResolve(mirror, mw, mh, mirrorSampled, [MIRROR_SAMPLES, Math.min(Math.ceil(2.5 * sigma), 8), sigma, 0], camera);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Hands the scene pass the two pictures (texture units from `unit`). */
  bindScene(u: Record<string, WebGLUniformLocation | null>, unit: number): void {
    const gl = this.gl;
    if (!this.near || !this.mirror) {
      gl.uniform4f(u.uBloomRect, 0, 0, 0, 0);
      gl.uniform4f(u.uBloomMirrorRect, 0, 0, 0, 0);
      return;
    }
    bindTexture(gl, u.uBloomNear, unit, this.near.tex);
    bindTexture(gl, u.uBloomMirror, unit + 1, this.mirror.tex);
    gl.uniform4f(u.uBloomRect, this.nearRect[0], this.nearRect[1], this.nearRect[2], this.nearRect[3]);
    gl.uniform4f(u.uBloomMirrorRect, this.mirrorRect[0], this.mirrorRect[1], this.mirrorRect[2], this.mirrorRect[3]);
    gl.uniform2f(u.uBloomMirrorFill, this.mirrorSize[0] / this.mirror.width, this.mirrorSize[1] / this.mirror.height);
    gl.uniform1f(u.uBloomPlane, BLOOM.center[2]);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.plant.handle);
    gl.deleteProgram(this.resolve.handle);
    gl.deleteVertexArray(this.meshVao);
    gl.deleteVertexArray(this.pollenVao);
    gl.deleteBuffer(this.meshBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteBuffer(this.pollenBuffer);
    gl.deleteTexture(this.poseTex);
    this.release(this.nearSampled);
    this.release(this.mirrorSampled);
    for (const p of [this.near, this.mirror]) {
      if (p) deleteTarget(gl, { tex: p.tex, fbo: p.fbo, width: p.width, height: p.height });
    }
    this.nearSampled = this.mirrorSampled = null;
    this.near = this.mirror = null;
  }

  /**
   * Fits both rects round the posed plant (its spines, its heart, its
   * pollen, the contact's reach on the stone) and makes sure the targets
   * hold them. False if there is nothing to draw.
   */
  private fit(camera: CameraFrame): boolean {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const mbox = [Infinity, Infinity, -Infinity, -Infinity];
    const focal = camera.focal;
    const perCss = this.sceneW / this.cssW;
    const out: [number, number, number] = [0, 0, 0];
    const add = (p: readonly number[], margin: number) => {
      for (const [b, flip] of [[box, 1], [mbox, -1]] as const) {
        if (!projectPx(camera, p[0], p[1] * flip, p[2], this.sceneW, this.sceneH, out)) continue;
        const m = (margin * focal * perCss) / out[2];
        b[0] = Math.min(b[0], out[0] - m);
        b[1] = Math.min(b[1], out[1] - m);
        b[2] = Math.max(b[2], out[0] + m);
        b[3] = Math.max(b[3], out[1] + m);
      }
    };
    const d = this.pose.data;
    const layout = this.mesh.layout;
    const reach = BLOOM.contact.reach;
    /* The stems and the tube, in the world. */
    for (const first of layout.stems) {
      for (let i = 0; i < SAMPLES.stem; i += 2) {
        const o = (first + i) * 12;
        add([d[o], d[o + 1], d[o + 2]], d[o + 3] + d[o + 11] + reach);
      }
    }
    for (let i = 0; i < SAMPLES.tube; i += 2) {
      const o = (layout.tube + i) * 12;
      add([d[o], d[o + 1], d[o + 2]], d[o + 3]);
    }
    /* The flower: its tepals, in its own frame. */
    const tepals = this.genome.tepals.length;
    for (let k = 0; k < tepals; k += 1) {
      for (let i = 0; i < SAMPLES.tepal; i += 2) {
        const o = (layout.tepals + k * SAMPLES.tepal + i) * 12;
        add(this.pose.toWorld([d[o], d[o + 1], d[o + 2]]), d[o + 3] + 0.004);
      }
    }
    /* The heart and the flower's shade on the top. */
    add(this.pose.frame.origin, 0.09 * BLOOM.scale);
    add(BLOOM.stems[0].points[0], BLOOM.contact.root + reach);
    for (const s of this.specks) add(s.p, BLOOM.pollen.radius * 2);

    /* NEAR: the scene's pixels, its corner on their grid. */
    const pad = MARGIN_PX;
    const x0 = Math.max(0, Math.floor(box[0] - pad));
    const y0 = Math.max(0, Math.floor(box[1] - pad));
    const x1 = Math.min(this.sceneW, Math.ceil(box[2] + pad));
    const y1 = Math.min(this.sceneH, Math.ceil(box[3] + pad));
    const w = x1 - x0;
    const h = y1 - y0;
    if (!(w > 0 && h > 0)) {
      this.nearRect.fill(0);
    } else {
      this.nearRect[0] = x0;
      this.nearRect[1] = y0;
      this.nearRect[2] = w;
      this.nearRect[3] = h;
      this.samples = Math.max(2, Math.min(4, Math.floor(Math.sqrt(SAMPLE_BUDGET / (w * h)))));
      this.nearSampled = this.ensureSampled(this.nearSampled, w * this.samples, h * this.samples);
      this.near = this.ensurePicture(this.near, w, h, this.gl.NEAREST);
    }

    /* MIRROR: anywhere in the frame (the lake reads it through its ripples),
       at half the scene's resolution. */
    const mx0 = Math.max(0, mbox[0] - pad);
    const my0 = Math.max(0, mbox[1] - pad);
    const mx1 = Math.min(this.sceneW, mbox[2] + pad);
    const my1 = Math.min(this.sceneH, mbox[3] + pad);
    if (!(mx1 > mx0 && my1 > my0)) {
      this.mirrorRect.fill(0);
      this.mirrorSize[0] = this.mirrorSize[1] = 0;
    } else {
      const mw = Math.max(2, Math.ceil((mx1 - mx0) * MIRROR_SCALE));
      const mh = Math.max(2, Math.ceil((my1 - my0) * MIRROR_SCALE));
      this.mirrorRect[0] = mx0 / this.sceneW;
      this.mirrorRect[1] = my0 / this.sceneH;
      this.mirrorRect[2] = mw / MIRROR_SCALE / this.sceneW;
      this.mirrorRect[3] = mh / MIRROR_SCALE / this.sceneH;
      this.mirrorSize[0] = mw;
      this.mirrorSize[1] = mh;
      this.mirrorSampled = this.ensureSampled(this.mirrorSampled, mw * MIRROR_SAMPLES, mh * MIRROR_SAMPLES);
      this.mirror = this.ensurePicture(this.mirror, mw, mh, this.gl.LINEAR);
    }
    return this.nearRect[2] > 0 || this.mirrorSize[0] > 0;
  }

  /** The pollen alive this frame into its buffer; how many. */
  private packPollen(): number {
    const data = this.pollenData;
    let n = 0;
    for (const s of this.specks) {
      const a = Math.min(s.age / POLLEN.fade, 1) * (1 - smooth(0.55 * s.life, s.life, s.age));
      data[n * 4] = s.p[0];
      data[n * 4 + 1] = s.p[1];
      data[n * 4 + 2] = s.p[2];
      data[n * 4 + 3] = a;
      n += 1;
    }
    if (n > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pollenBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    return n;
  }

  private drawPlant(
    target: Sampled,
    width: number,
    height: number,
    rect: readonly number[],
    mirrored: number,
    samplesPerCss: number,
    camera: CameraFrame,
    colors: BloomColors,
    light: BloomLight,
    pollen: number,
  ): void {
    const gl = this.gl;
    const u = this.plant.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.plant.handle);
    setCameraUniforms(gl, u, camera);
    bindTexture(gl, u.uPose, 0, this.poseTex);
    const f = this.pose.frame;
    gl.uniform3f(u.uFlowerOrigin, f.origin[0], f.origin[1], f.origin[2]);
    gl.uniformMatrix3fv(u.uFlowerBasis, false, f.basis);
    const H = BLOOM.heart;
    const s = BLOOM.scale;
    gl.uniform4f(u.uHeart, f.heart, H.thread * s, H.anther[0] * s, H.anther[1] * s);
    gl.uniform4f(u.uHeartSpan, H.throat[0] * s, H.throat[1] * s, H.length[0] * s, H.length[1] * s);
    gl.uniform4f(u.uHeartSplay, 0.05, H.splay[0], H.splay[1], H.ring * s);
    const style = this.pose.data;
    const tip = (this.mesh.layout.style + SAMPLES.style - 1) * 12;
    gl.uniform4f(u.uStyleTip, style[tip], style[tip + 1], style[tip + 2], H.lobes[1] * s);
    gl.uniform4f(u.uRibs, BLOOM.stem.rib, 0.0035, BLOOM.tube.ridges, BLOOM.tube.ridgeDepth);
    gl.uniform4f(u.uTargetRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.uMirror, mirrored);
    gl.uniform3f(u.uPoints, 0, BLOOM.pollen.radius, samplesPerCss);
    this.setStone(u);
    gl.uniform3fv(u.uLit, colors.lit);
    /* The dome, scaled as the stone's light is tuned (stage/StageTuner). */
    const dome = BLOOM.light.dome;
    const k = light.light[0] / STONE.light.top;
    gl.uniform3f(u.uBloomDome, dome[0] * k, dome[1] * k, dome[2] * k);
    gl.uniform2f(u.uLightSide, STONE.lightSide[0], STONE.lightSide[1]);
    gl.uniform3fv(u.uPetal, colors.petal);
    gl.uniform3fv(u.uSepal, colors.sepal);
    gl.uniform3fv(u.uLeaf, colors.leaf);
    gl.uniform3fv(u.uTubeTone, colors.tube);
    gl.uniform3fv(u.uAnther, colors.anther);
    const L = BLOOM.light;
    gl.uniform4f(u.uBloomLight, L.transmit, L.cup, L.sheen, L.wax);
    gl.uniform3f(u.uBloomMore, L.through, BLOOM.pollen.tone, BLOOM.tepals.inner);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.bindVertexArray(this.meshVao);
    /* The plant's own parts, whole; then its threads and anthers, each as
       faint as it is finer than a sample, laid over without hiding each
       other; then the pollen. */
    gl.drawElements(gl.TRIANGLES, this.opaque, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length - this.opaque, gl.UNSIGNED_SHORT, this.opaque * 2);
    if (pollen > 0) {
      gl.uniform3f(u.uPoints, 1, BLOOM.pollen.radius, samplesPerCss);
      gl.bindVertexArray(this.pollenVao);
      gl.drawArrays(gl.POINTS, 0, pollen);
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  private drawResolve(target: Picture, width: number, height: number, source: Sampled, resolve: readonly number[], camera: CameraFrame): void {
    const gl = this.gl;
    const u = this.resolve.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    /* Where nothing is drawn, the picture leaves everything behind it. */
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.resolve.handle);
    gl.bindVertexArray(this.vao);
    setCameraUniforms(gl, u, camera);
    bindTexture(gl, u.uSource, 0, source.tex);
    gl.uniform4f(u.uResolve, resolve[0], resolve[1], resolve[2], resolve[3]);
    gl.uniform4f(u.uRectPx, this.nearRect[0], this.nearRect[1], this.sceneW, this.sceneH);
    this.setStone(u);
    if (resolve[3] > 0.5) this.setContact(u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setStone(u: Record<string, WebGLUniformLocation | null>): void {
    const gl = this.gl;
    gl.uniform4f(u.uStonePlan, STONE.center[0], STONE.center[1], STONE.plan.across, STONE.plan.along);
    gl.uniform2f(u.uStoneSpan, -STONE.depth, STONE.top);
    gl.uniform4f(u.uStoneWeather, STONE.edge, STONE.runs, STONE.lichen.size, STONE.lichen.cover);
  }

  /** The contact shade's inputs: the posed stems, the root, the flower. */
  private setContact(u: Record<string, WebGLUniformLocation | null>): void {
    const gl = this.gl;
    const per = Math.floor(CONTACT_POINTS / BLOOM.stems.length);
    const data = this.pose.data;
    const points = this.stemPoints;
    this.mesh.layout.stems.forEach((first, k) => {
      for (let i = 0; i < per; i += 1) {
        const o = (first + Math.round((i * (SAMPLES.stem - 1)) / (per - 1))) * 12;
        const q = (k * per + i) * 4;
        points[q] = data[o];
        points[q + 1] = data[o + 1];
        points[q + 2] = data[o + 2];
        points[q + 3] = data[o + 3];
      }
    });
    gl.uniform4fv(u.uStemPoints, points);
    gl.uniform2f(u.uStemLoops, BLOOM.stems.length, per);
    const f = this.pose.frame;
    const axis = [f.basis[6], f.basis[7], f.basis[8]];
    const radius = BLOOM.contact.flower * BLOOM.tepals.length[1] * BLOOM.scale * (0.45 + 0.55 * f.heart);
    gl.uniform4f(u.uFlowerShade, f.origin[0] + axis[0] * 0.02, f.origin[1] + axis[1] * 0.02, f.origin[2] + axis[2] * 0.02, radius);
    const root = BLOOM.stems[0].points[0];
    gl.uniform4f(u.uRoot, root[0], STONE.top, root[2], BLOOM.contact.root);
    gl.uniform2f(u.uContactShade, BLOOM.contact.reach, BLOOM.contact.depth);
  }

  private ensureSampled(current: Sampled | null, width: number, height: number): Sampled | null {
    if (current && current.width >= width && current.height >= height) return current;
    this.release(current);
    const gl = this.gl;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const w = Math.min(Math.ceil(width * 1.2), max);
    const h = Math.min(Math.ceil(height * 1.2), max);
    const tex = gl.createTexture();
    const depth = gl.createRenderbuffer();
    const fbo = gl.createFramebuffer();
    if (!tex || !depth || !fbo) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, depth, fbo, width: w, height: h };
  }

  private ensurePicture(current: Picture | null, width: number, height: number, filter: GLenum): Picture | null {
    if (current && current.width >= width && current.height >= height) return current;
    const gl = this.gl;
    if (current) deleteTarget(gl, { tex: current.tex, fbo: current.fbo, width: current.width, height: current.height });
    const w = Math.ceil(width * 1.2);
    const h = Math.ceil(height * 1.2);
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, width: w, height: h };
  }

  private release(s: Sampled | null): void {
    if (!s) return;
    const gl = this.gl;
    gl.deleteTexture(s.tex);
    gl.deleteRenderbuffer(s.depth);
    gl.deleteFramebuffer(s.fbo);
  }

  /** The opening, 0–1, this frame (development: the tuner shows it). */
  get opening(): number {
    return this.open;
  }

}

const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: readonly number[], k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A world point → the scene's target (px, y up) through this frame's
 *  camera, and its depth; false if behind it. */
function projectPx(camera: CameraFrame, x: number, y: number, z: number, w: number, h: number, out: [number, number, number]): boolean {
  const r = camera.rotation;
  const p = camera.position;
  const vx = x - p[0];
  const vy = y - p[1];
  const vz = z - p[2];
  /* Camera space: the rotation's columns are its right, up and forward. */
  const cx = vx * r[0] + vy * r[1] + vz * r[2];
  const cy = vx * r[3] + vy * r[4] + vz * r[5];
  const cz = vx * r[6] + vy * r[7] + vz * r[8];
  if (cz <= 0.1) return false;
  const [vw, vh] = camera.view;
  out[0] = ((cx / cz) * (camera.focal / vw) + 0.5) * w;
  out[1] = ((cy / cz) * (camera.focal / vh) + 1 - CAMERA.horizon) * h;
  out[2] = cz;
  return true;
}

