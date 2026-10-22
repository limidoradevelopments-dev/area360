/**
 * ─── Bloom · its pass ───
 *
 * The two cut flowers and their cloth are a small mesh (shape.ts), still
 * but for the rays' tremble in the air, posed on the CPU, and drawn by
 * their own small programs (shaders/bloom.ts) into the pictures the scene
 * and the film read:
 *
 *   NEAR    the flowers as the camera sees them, over a rect of the scene's
 *           own pixels round them, and on the stone under it the share of the
 *           sky the stone keeps — read by the scene at the same pixel
 *   FINE    on a screen finer than the scene (a 4K one: the scene is drawn
 *           at ~2560 and the film develops it at 3840), the same at the
 *           SCREEN's own pixels — the film puts back what the scene's
 *           coarser pixel lost of it (stage/shaders/post.ts), as it does
 *           for the photograph. NEAR is then this picture brought down to
 *           the scene's pixels, so the two agree exactly
 *   MIRROR  the flower as the still lake mirrors it, at half the resolution,
 *           softened (the lake blurs it anyway) — read where the reflected
 *           ray crosses the plant's depth
 *   HALO    the light the flower holds, in the fog round it: its petals'
 *           light past a threshold, gathered from NEAR to a few scene
 *           pixels a texel and spread — the film adds it
 *
 * And its pollen, as motes of light drawn straight into the scene's own
 * light after the scene pass (drawMotes): they drift up to ~70 cm from the
 * flower, and in its pictures they would grow the rect the flower is
 * supersampled over — and cost it its samples — wherever they went.
 *
 * Each is drawn SUPERSAMPLED (several samples a pixel each way, with a
 * depth test) and then resolved to its pixels, the contact shade worked out
 * in the same resolve. Its rect is fitted round the posed flower every
 * frame (the camera's lean moves it), its corner on the pixel grid; the
 * targets grow with headroom and are kept.
 *
 * ONE PICTURE A DRAW: never one draw into two targets (gl.ts Target: under
 * Direct3D a program drawn into two at once is compiled again on its first
 * draw).
 */

import { CAMERA_UNIFORMS, setCameraUniforms, type CameraFrame } from "../stage/camera";
import { bindTexture, createProgram, deleteTarget, type Program } from "../stage/gl";
import { STONE } from "../stone/optics";
import { FLUTTER, POLLEN } from "./motion";
import { BLOOM } from "./optics";
import { CONTACT_CHUNKS, CONTACT_POINTS, HALO_FRAG, NOISE_SIZE, PLANT_FRAG, PLANT_VERT, RESOLVE_FRAG } from "./shaders/bloom";
import { buildMesh, grow, Pose, POSE_WIDTH, SAMPLES, type Genome, type Mesh, type Vec3 } from "./shape";

/** The flowers' and the cloth's reflectances (linear), read from the
 *  hero's tokens. */
export interface BloomColors {
  lit: readonly [number, number, number];
  petal: readonly [number, number, number];
  disc: readonly [number, number, number];
  stem: readonly [number, number, number];
  cloth: readonly [number, number, number];
  pollen: readonly [number, number, number];
}

/** The air at a world point: velocity (m/s, world x and y) and churn. */
export type AirAt = (p: Vec3, out: [number, number, number]) => [number, number, number];

/** What the flower is told each step. */
export interface BloomStep {
  /** Seconds of the visit the stage has been on screen. */
  clock: number;
  /** Which flower, 0–1 (BLOOM.seed; the tuner tries others). */
  seed: number;
  /** No idle movement: it moves only when the air moves it. */
  reduced: boolean;
  air: AirAt | null;
}

/** What it is drawn in: the stone's light (STONE.light): top, away, toward. */
export interface BloomLight {
  light: readonly [number, number, number];
}

/* Samples a pixel each way: the most that keeps the near picture's samples
   under ~0.9 M (a 1440 frame's flower draws at 4). */
const SAMPLE_BUDGET = 900_000;
/* The same at the screen's own pixels (FINE): a 4K frame's flower and
   cloth draw at 4 a pixel each way. */
const FINE_BUDGET = 2_400_000;
/* The mirror: half the scene's resolution, two samples a pixel each way. */
const MIRROR_SCALE = 0.5;
const MIRROR_SAMPLES = 2;
/* Px of margin round the posed flower: the antialiased edge, and the
   contact shade's reach on the stone. */
const MARGIN_PX = 3;
/* The halo: scene px a texel, about this many texels across a 1440 frame's
   width (the light it spreads has no detail to keep). */
const HALO_TEXELS = 480;

const PLANT_UNIFORMS = [
  ...CAMERA_UNIFORMS,
  "uPose", "uRayRuffle", "uRidges", "uClothPleat",
  "uTargetRect", "uMirror", "uPoints", "uMote",
  "uStonePlan", "uStoneSpan", "uStoneWeather",
  "uLit", "uBloomDome", "uLightSide", "uPetal", "uDisc", "uStem", "uCloth", "uPollen",
  "uBloomLight", "uBloomMore", "uRayLook", "uPlantMore", "uNoise",
];
const RESOLVE_UNIFORMS = [
  ...CAMERA_UNIFORMS,
  "uSource", "uFoot", "uBlur", "uMode", "uRectPx",
  "uRuns", "uChunks", "uChunkSpan", "uChunkCount", "uHeadShade", "uContactShade", "uClothShade",
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

/** A resolved picture (the part in use this frame is kept apart). */
interface Picture {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

interface Speck {
  p: Vec3;
  /* Where it was shed: it fades toward its reach from there. */
  from: Vec3;
  age: number;
  life: number;
  drift: Vec3;
  /** Its glint's phase and rate (rad/s). */
  phase: number;
  rate: number;
}

export class BloomPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly plant: Program;
  private readonly resolve: Program;
  private readonly halo: Program;
  private readonly meshVao: WebGLVertexArrayObject;
  private readonly meshBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly pollenVao: WebGLVertexArrayObject;
  private readonly pollenBuffer: WebGLBuffer;
  private readonly poseTex: WebGLTexture;
  private readonly noiseTex: WebGLTexture;

  private genome: Genome;
  private mesh: Mesh;
  private pose: Pose;

  /* Supersampled and resolved: near (at the scene's pixels), fine (at the
     screen's, on a screen finer than the scene), mirrored. */
  private nearSampled: Sampled | null = null;
  private mirrorSampled: Sampled | null = null;
  private near: Picture | null = null;
  private fine: Picture | null = null;
  private mirror: Picture | null = null;
  /* The halo, and the picture it is spread through; its rect (scene px:
     corner, scene px a texel) and its used size (texels; 0 when not
     drawn); the flower's box this frame (scene px). */
  private halos: [Picture | null, Picture | null] = [null, null];
  private readonly haloRect = [0, 0, 1];
  private readonly haloUsed = [0, 0];
  private readonly flowerBox = [0, 0, 0, 0];
  /* The cloth's box this frame (scene px): its own print falls in it. */
  private readonly clothBox = [0, 0, 0, 0];
  private flowerDepth = 10;
  /* This frame: the near rect (scene px: corner, size); the fine rect
     (screen px: corner, size; size 0 when not drawn); the samples a pixel
     of whichever was drawn; the mirror's rect (frame uv: corner, size) and
     its size (px). */
  private readonly nearRect = [0, 0, 0, 0];
  private readonly fineRect = [0, 0, 0, 0];
  private samples = 4;
  private readonly mirrorRect = [0, 0, 0, 0];
  private readonly mirrorSize = [0, 0];

  /* The scene's target, the frame (CSS px), and the screen (px); whether
     the fine picture is drawn. */
  private sceneW = 1;
  private sceneH = 1;
  private cssW = 1;
  private cssH = 1;
  private outW = 1;
  private outH = 1;
  private fineOn = false;

  /* Motion: the rays' clock, the air past the heads (m/s, followed
     smoothly), whether the rays are trembling and whether their pose has
     changed since it was last sent to the GPU, the pollen. */
  private stepTime = 0;
  private airSpeed = 0;
  private trembling = false;
  private posed = true;
  /* Where the heads lie, between them (they never move). */
  private centre: Vec3 = [0, 0, 0];
  private readonly specks: Speck[] = [];
  private shed = 0;
  private idleShed = 0;
  private readonly pollenData = new Float32Array(POLLEN.most * 4);
  private readonly runs = new Float32Array(CONTACT_POINTS * 4);
  private readonly chunks = new Float32Array(CONTACT_CHUNKS * 4);
  private readonly chunkSpan = new Float32Array(CONTACT_CHUNKS * 2);
  private readonly headShade = new Float32Array(8);

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject, seed: number) {
    this.gl = gl;
    this.vao = vao;
    this.plant = createProgram(gl, PLANT_FRAG, PLANT_UNIFORMS, PLANT_VERT);
    this.resolve = createProgram(gl, RESOLVE_FRAG, RESOLVE_UNIFORMS);
    this.halo = createProgram(gl, HALO_FRAG, ["uSource", "uFoot", "uHalo", "uHaloBox"]);

    const meshVao = gl.createVertexArray();
    const pollenVao = gl.createVertexArray();
    const meshBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const pollenBuffer = gl.createBuffer();
    const poseTex = gl.createTexture();
    const noiseTex = gl.createTexture();
    if (!meshVao || !pollenVao || !meshBuffer || !indexBuffer || !pollenBuffer || !poseTex || !noiseTex) {
      throw new Error("bloom: allocation failed");
    }
    this.meshVao = meshVao;
    this.pollenVao = pollenVao;
    this.meshBuffer = meshBuffer;
    this.indexBuffer = indexBuffer;
    this.pollenBuffer = pollenBuffer;
    this.poseTex = poseTex;
    this.noiseTex = noiseTex;

    /* The light stage's noise: four random values a texel in a small
       volume, read with the texture unit's own filtering and repeating
       (shaders/bloom.ts noise). The same values every visit. */
    const values = new Uint8Array(NOISE_SIZE ** 3 * 4);
    let h = 0x9e3779b9;
    for (let i = 0; i < values.length; i += 1) {
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      h ^= h >>> 15;
      values[i] = h & 255;
    }
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, values);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_3D, null);

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
    this.centre = middleOf(this.pose);
  }

  /* ── The flower ──────────────────────────────────────────────────────── */

  private regrow(seed: number): void {
    this.genome = grow(seed);
    this.mesh = buildMesh(this.genome);
    this.pose = new Pose(this.genome, this.mesh.layout);
    this.upload();
    this.posed = true;
    this.centre = middleOf(this.pose);
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

    gl.bindTexture(gl.TEXTURE_2D, this.poseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, POSE_WIDTH, mesh.layout.rows, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /* ── Motion ────────────────────────────────────────────────────────── */

  /** Advances the flowers by `dt` seconds: their tremble, their pollen. */
  update(dt: number, step: BloomStep): void {
    if (step.seed !== this.genome.seed) this.regrow(step.seed);
    /* How hard the air moves past the heads, once a frame, followed
       smoothly (motion.ts FLUTTER.smooth): their tremble, their pollen. */
    const air: [number, number, number] = [0, 0, 0];
    if (step.air) step.air(this.center, air);
    const speed = Math.hypot(air[0], air[1]);
    this.airSpeed += (speed - this.airSpeed) * (1 - Math.exp(-dt / FLUTTER.smooth));
    this.stepTime += Math.min(dt, 0.1);
    /* Posed only while the air moves them visibly; once it no longer does,
       laid back to rest once and held (motion.ts FLUTTER.visible). */
    const flutter = this.pose.flutter(this.airSpeed, step.reduced);
    if (flutter >= FLUTTER.visible) {
      this.pose.poseRays(flutter, this.stepTime);
      this.trembling = this.posed = true;
    } else if (this.trembling) {
      this.pose.poseRays(0, this.stepTime);
      this.trembling = false;
      this.posed = true;
    }
    this.stepPollen(dt, step);
  }

  /** Where the heads lie (m, world: between them): the air is read round
   *  it. */
  get center(): Vec3 {
    return this.centre;
  }

  private stepPollen(dt: number, step: BloomStep): void {
    const P = POLLEN;
    const specks = this.specks;
    const strength = Math.min(Math.max((this.airSpeed - P.from) / (P.full - P.from), 0), 1);
    this.shed += dt * P.rate * strength;
    /* In still air, one or two at a time, at a rate that wanders on two
       terms at the golden ratio (never a beat). Not with reduced motion:
       that is the scene moving, not the visitor. */
    if (!step.reduced) {
      const w = 2 * Math.PI * P.idle.hz * step.clock;
      this.idleShed += dt * P.idle.rate * (1 + 0.35 * Math.sin(w) + 0.25 * Math.sin(w * P.ratio + 1.3));
    }
    while (this.shed >= 1 || this.idleShed >= 1) {
      if (this.shed >= 1) this.shed -= 1;
      else this.idleShed -= 1;
      if (specks.length >= P.most) continue;
      /* From either disc, anywhere on its florets. */
      const h = Math.random() < 0.5 ? 0 : 1;
      const p = this.pose.discPoint(h, Math.random(), Math.sqrt(Math.random()));
      const a = Math.random() * 2 * Math.PI;
      const [slow, quick] = P.glint.hz;
      specks.push({
        p,
        from: [p[0], p[1], p[2]],
        age: 0,
        life: P.life[0] + (P.life[1] - P.life[0]) * Math.random(),
        drift: [Math.cos(a) * P.wander, Math.sin(a) * P.wander, (Math.random() - 0.5) * P.wander],
        phase: Math.random() * 2 * Math.PI,
        rate: 2 * Math.PI * (slow + (quick - slow) * Math.random()),
      });
    }
    const air: [number, number, number] = [0, 0, 0];
    for (let i = specks.length - 1; i >= 0; i -= 1) {
      const s = specks[i];
      s.age += dt;
      const far = Math.hypot(s.p[0] - s.from[0], s.p[1] - s.from[1], s.p[2] - s.from[2]);
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

  /**
   * The scene's target (px), the frame (CSS px) and the screen (px); and
   * whether the plant may be drawn at the screen's own pixels when they are
   * finer than the scene's (not on the slowest quality tier).
   */
  resize(sceneW: number, sceneH: number, cssW: number, cssH: number, outW: number, outH: number, fine: boolean): void {
    this.sceneW = sceneW;
    this.sceneH = sceneH;
    this.cssW = cssW;
    this.cssH = cssH;
    this.outW = outW;
    this.outH = outH;
    this.fineOn = fine && outW > sceneW * 1.01;
  }

  /** Draws the pictures for this frame's camera. */
  render(camera: CameraFrame, colors: BloomColors, light: BloomLight): void {
    const gl = this.gl;
    if (!this.fit(camera)) return;
    /* The pose to the GPU only when it has changed (still air: never). */
    if (this.posed) {
      gl.bindTexture(gl.TEXTURE_2D, this.poseTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, POSE_WIDTH, this.mesh.layout.rows, gl.RGBA, gl.FLOAT, this.pose.data);
      this.posed = false;
    }

    const [nx, ny, nw, nh] = this.nearRect;
    const near = this.near;
    const nearSampled = this.nearSampled;
    const s = this.samples;
    this.haloUsed[0] = this.haloUsed[1] = 0;
    if (near && nearSampled && nw > 0 && nh > 0) {
      const [fx, fy, fw, fh] = this.fineRect;
      if (fw > 0 && this.fine) {
        /* At the screen's pixels, then down to the scene's from that: the
           scene and the film see one plant. */
        const kx = this.outW / this.sceneW;
        const ky = this.outH / this.sceneH;
        const rect = [fx / this.outW, fy / this.outH, fw / this.outW, fh / this.outH];
        this.drawPlant(nearSampled, fw * s, fh * s, rect, 0, s * (this.outW / this.cssW), camera, colors, light);
        this.drawResolve(this.fine, fw, fh, nearSampled, [0, 0, s, s], [0, 0], [1, 0], [fx, fy, this.outW, this.outH], camera);
        this.drawResolve(near, nw, nh, this.fine.tex, [nx * kx - fx, ny * ky - fy, kx, Math.ceil(kx) + 1], [0, 0], [0, 1], [0, 0, 1, 1], camera);
      } else {
        const rect = [nx / this.sceneW, ny / this.sceneH, nw / this.sceneW, nh / this.sceneH];
        this.drawPlant(nearSampled, nw * s, nh * s, rect, 0, s * (this.sceneW / this.cssW), camera, colors, light);
        this.drawResolve(near, nw, nh, nearSampled, [0, 0, s, s], [0, 0], [1, 0], [nx, ny, this.sceneW, this.sceneH], camera);
      }
      this.drawHalo(near, camera);
    }
    const mirror = this.mirror;
    const mirrorSampled = this.mirrorSampled;
    const [mw, mh] = this.mirrorSize;
    if (mirror && mirrorSampled && mw > 0 && mh > 0) {
      const perPx = MIRROR_SAMPLES * (this.sceneW / this.cssW) * MIRROR_SCALE;
      this.drawPlant(mirrorSampled, mw * MIRROR_SAMPLES, mh * MIRROR_SAMPLES, this.mirrorRect, 1, perPx, camera, colors, light);
      /* The lake's blur, as samples of this picture. */
      const sigma = Math.max(0.35 * BLOOM.mirrorBlur * camera.focal * perPx, 0.5);
      this.drawResolve(mirror, mw, mh, mirrorSampled, [0, 0, MIRROR_SAMPLES, 0], [Math.min(Math.ceil(2.5 * sigma), 8), sigma], [0, 0], [0, 0, 1, 1], camera);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * THE HALO: the flower's light past a threshold (its tepals, never its
   * tube or the cloth's shade), gathered from the near picture into a few scene pixels a texel
   * over its box, then spread there by a Gaussian BLOOM.glow.reach wide at
   * the flower — one way, then the other. The film adds it (bindFilm).
   */
  private drawHalo(near: Picture, camera: CameraFrame): void {
    const gl = this.gl;
    const [bx0, by0, bx1, by1] = this.flowerBox;
    if (!(bx1 > bx0 && by1 > by0)) return;
    const k = Math.max(2, Math.round(this.sceneW / HALO_TEXELS));
    const spread = (BLOOM.glow.reach * camera.focal * (this.sceneW / this.cssW)) / this.flowerDepth;
    const sigma = Math.max(spread / k, 0.5);
    const reach = Math.min(Math.ceil(3 * sigma), 24);
    const pad = Math.ceil(3 * spread) + k;
    const x0 = Math.floor(bx0) - pad;
    const y0 = Math.floor(by0) - pad;
    const w = Math.ceil((bx1 - x0 + pad) / k);
    const h = Math.ceil((by1 - y0 + pad) / k);
    this.halos = [this.ensurePicture(this.halos[0], w, h, gl.LINEAR), this.ensurePicture(this.halos[1], w, h, gl.LINEAR)];
    const [a, b] = this.halos;
    if (!a || !b) return;
    const u = this.halo.uniforms;
    gl.useProgram(this.halo.handle);
    gl.bindVertexArray(this.vao);
    gl.clearColor(0, 0, 0, 0);
    const pass = (target: Picture, source: WebGLTexture, foot: readonly number[], halo: readonly number[]) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, w, h);
      bindTexture(gl, u.uSource, 0, source);
      gl.uniform4f(u.uFoot, foot[0], foot[1], foot[2], foot[3]);
      gl.uniform4f(u.uHalo, halo[0], halo[1], halo[2], halo[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const [nx, ny, nw, nh] = this.nearRect;
    const grow = 0.08 * Math.max(bx1 - bx0, by1 - by0);
    gl.uniform4f(u.uHaloBox, bx0 - grow - nx, by0 - grow - ny, bx1 + grow - nx, by1 + grow - ny);
    pass(a, near.tex, [x0 - nx, y0 - ny, k, 0], [nw, nh, BLOOM.glow.threshold, 0]);
    pass(b, a.tex, [1, 0, sigma, reach], [w, h, 0, 1]);
    pass(a, b.tex, [0, 1, sigma, reach], [w, h, 0, 1]);
    this.haloRect[0] = x0;
    this.haloRect[1] = y0;
    this.haloRect[2] = k;
    this.haloUsed[0] = w;
    this.haloUsed[1] = h;
  }

  /**
   * THE POLLEN, straight into the scene's light (`target`), after the scene
   * pass and before the film's diffusion, which spreads them a little
   * further as it does every light: each mote a soft point, added, hiding
   * nothing; then in the still lake, fainter and wider. Hidden where the
   * stone stands in front (PLANT_FRAG).
   */
  drawMotes(camera: CameraFrame, target: { fbo: WebGLFramebuffer; width: number; height: number }, colors: BloomColors): void {
    const count = this.packPollen();
    if (count === 0) return;
    const gl = this.gl;
    const u = this.plant.uniforms;
    const P = BLOOM.pollen;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(this.plant.handle);
    setCameraUniforms(gl, u, camera);
    this.setStone(u);
    bindTexture(gl, u.uPose, 0, this.poseTex);
    bindTexture(gl, u.uNoise, 1, this.noiseTex, gl.TEXTURE_3D);
    gl.uniform4f(u.uTargetRect, 0, 0, 1, 1);
    gl.uniform3fv(u.uLit, colors.lit);
    gl.uniform3fv(u.uPollen, colors.pollen);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    gl.bindVertexArray(this.pollenVao);
    for (const mirrored of [0, 1]) {
      const wide = mirrored ? 1.8 : 1;
      gl.uniform1f(u.uMirror, mirrored);
      gl.uniform3f(u.uPoints, 1, P.radius * wide, target.width / this.cssW);
      gl.uniform3f(u.uMote, P.haloWidth * wide, P.halo, P.light * P.veil * (mirrored ? P.mirror : 1));
      gl.drawArrays(gl.POINTS, 0, count);
    }
    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }

  /**
   * Hands the scene pass the near and mirrored pictures (texture units from
   * `unit`), each on its own: on a wide frame the lens closes in and the
   * plant's reflection falls below the frame — with no mirror, the plant
   * itself once went missing from the scene. A picture not drawn this
   * frame gets a rect nothing falls in.
   */
  bindScene(u: Record<string, WebGLUniformLocation | null>, unit: number): void {
    const gl = this.gl;
    const near = this.near && this.nearRect[2] > 0 ? this.near : null;
    const mirror = this.mirror && this.mirrorSize[0] > 0 ? this.mirror : null;
    const either = near ?? mirror;
    if (!either) {
      gl.uniform4f(u.uBloomRect, 0, 0, 0, 0);
      gl.uniform4f(u.uBloomMirrorRect, -10, -10, 1, 1);
      return;
    }
    bindTexture(gl, u.uBloomNear, unit, (near ?? either).tex);
    bindTexture(gl, u.uBloomMirror, unit + 1, (mirror ?? either).tex);
    if (near) gl.uniform4f(u.uBloomRect, this.nearRect[0], this.nearRect[1], this.nearRect[2], this.nearRect[3]);
    else gl.uniform4f(u.uBloomRect, 0, 0, 0, 0);
    if (mirror) {
      gl.uniform4f(u.uBloomMirrorRect, this.mirrorRect[0], this.mirrorRect[1], this.mirrorRect[2], this.mirrorRect[3]);
      gl.uniform2f(u.uBloomMirrorFill, this.mirrorSize[0] / mirror.width, this.mirrorSize[1] / mirror.height);
    } else {
      gl.uniform4f(u.uBloomMirrorRect, -10, -10, 1, 1);
      gl.uniform2f(u.uBloomMirrorFill, 1, 1);
    }
    gl.uniform1f(u.uBloomPlane, this.center[2]);
  }

  /** Hands the film pass the fine picture and the near one it replaces,
   *  and the halo with how much of it to add (texture units from `unit`,
   *  three) — or tells it there is none. */
  bindFilm(u: Record<string, WebGLUniformLocation | null>, unit: number): void {
    const gl = this.gl;
    gl.uniform2f(u.uSceneSize, this.sceneW, this.sceneH);
    /* The flower's own box (its tepals), a little grown: where its own print
       may fall (BLOOM.print) — not on the cloth, as bright as a tepal's
       shade. */
    const [bx0, by0, bx1, by1] = this.flowerBox;
    const grow = 0.08 * Math.max(bx1 - bx0, by1 - by0, 0);
    if (bx1 > bx0) gl.uniform4f(u.uFlowerBox, bx0 - grow, by0 - grow, bx1 + grow, by1 + grow);
    else gl.uniform4f(u.uFlowerBox, 0, 0, -1, -1);
    /* The cloth's own box, a pixel grown, and the air round the flower it
       is measured against (the box's middle). */
    const [cx0, cy0, cx1, cy1] = this.clothBox;
    if (cx1 > cx0) gl.uniform4f(u.uClothBox, cx0 - 1, cy0 - 1, cx1 + 1, cy1 + 1);
    else gl.uniform4f(u.uClothBox, 0, 0, -1, -1);
    gl.uniform2f(u.uFlowerAir, (0.5 * (bx0 + bx1)) / this.sceneW, (0.5 * (by0 + by1)) / this.sceneH);
    /* The near picture: what the fine one replaces, and where the halo
       falls on the plant. */
    if (this.near && this.nearRect[2] > 0) {
      bindTexture(gl, u.uBloomCoarse, unit + 1, this.near.tex);
      gl.uniform4f(u.uBloomCoarseRect, this.nearRect[0], this.nearRect[1], this.near.width, this.near.height);
    } else {
      gl.uniform4f(u.uBloomCoarseRect, -1, -1, 0, 0);
    }
    const halo = this.halos[0];
    if (halo && this.haloUsed[0] > 0) {
      bindTexture(gl, u.uBloomHalo, unit + 2, halo.tex);
      gl.uniform4f(u.uBloomHaloRect, this.haloRect[0], this.haloRect[1], this.haloRect[2], BLOOM.glow.halo);
      gl.uniform4f(u.uBloomHaloSize, halo.width, halo.height, this.haloUsed[0], this.haloUsed[1]);
    } else {
      gl.uniform4f(u.uBloomHaloRect, 0, 0, 1, 0);
    }
    const [fx, fy, fw, fh] = this.fineRect;
    if (!this.fine || !this.near || !(fw > 0)) {
      gl.uniform4f(u.uBloomFineRect, 0, 0, 0, 0);
      return;
    }
    bindTexture(gl, u.uBloomFine, unit, this.fine.tex);
    gl.uniform4f(u.uBloomFineRect, fx, fy, fw, fh);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.plant.handle);
    gl.deleteProgram(this.resolve.handle);
    gl.deleteProgram(this.halo.handle);
    gl.deleteVertexArray(this.meshVao);
    gl.deleteVertexArray(this.pollenVao);
    gl.deleteBuffer(this.meshBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteBuffer(this.pollenBuffer);
    gl.deleteTexture(this.poseTex);
    gl.deleteTexture(this.noiseTex);
    this.release(this.nearSampled);
    this.release(this.mirrorSampled);
    for (const p of [this.near, this.fine, this.mirror, ...this.halos]) {
      if (p) deleteTarget(gl, { tex: p.tex, fbo: p.fbo, width: p.width, height: p.height });
    }
    this.nearSampled = this.mirrorSampled = null;
    this.near = this.fine = this.mirror = null;
    this.halos = [null, null];
  }

  /**
   * Fits the rects round the posed flower (its spines, its heart, the
   * cloth, the contact's reach on the stone; and the flower's own box, for
   * the halo) and makes sure the targets hold them. False if there is
   * nothing to draw.
   */
  private fit(camera: CameraFrame): boolean {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const mbox = [Infinity, Infinity, -Infinity, -Infinity];
    const focal = camera.focal;
    const perCss = this.sceneW / this.cssW;
    const out: [number, number, number] = [0, 0, 0];
    const add = (x: number, y: number, z: number, margin: number) => {
      for (const [b, flip] of [[box, 1], [mbox, -1]] as const) {
        if (!projectPx(camera, x, y * flip, z, this.sceneW, this.sceneH, out)) continue;
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
    const spine = (first: number, count: number, extra: number, step = 2) => {
      for (let i = 0; i < count; i += step) {
        const o = (first + i) * 12;
        add(d[o], d[o + 1], d[o + 2], d[o + 3] + d[o + 11] + extra);
      }
      const o = (first + count - 1) * 12;
      add(d[o], d[o + 1], d[o + 2], d[o + 3] + d[o + 11] + extra);
    };
    /* The stems, the shoot and the cloth, with their shade's reach on the
       stone; and the cloth's own box, its margins and the knot's girth with
       it. */
    for (const first of layout.stems) spine(first, SAMPLES.stem, reach);
    spine(layout.shoot, SAMPLES.shoot, reach, 3);
    const pieces = [SAMPLES.wrap, SAMPLES.knot, SAMPLES.knot, SAMPLES.tail, SAMPLES.tail];
    layout.cloth.forEach((first, k) => spine(first, pieces[k], BLOOM.contact.cloth * 3, 3));
    const cloth = this.clothBox;
    cloth[0] = cloth[1] = Infinity;
    cloth[2] = cloth[3] = -Infinity;
    layout.cloth.forEach((first, k) => {
      for (let i = 0; i < pieces[k]; i += 1) {
        const o = (first + i) * 12;
        if (!projectPx(camera, d[o], d[o + 1], d[o + 2], this.sceneW, this.sceneH, out)) continue;
        const m = ((d[o + 3] + 0.002) * focal * perCss) / out[2];
        cloth[0] = Math.min(cloth[0], out[0] - m);
        cloth[1] = Math.min(cloth[1], out[1] - m);
        cloth[2] = Math.max(cloth[2], out[0] + m);
        cloth[3] = Math.max(cloth[3], out[1] + m);
      }
    });
    /* The heads: their rays, discs and bracts — and their own box, which
       the halo is spread round and their print falls in. */
    const heads = this.flowerBox;
    heads[0] = heads[1] = Infinity;
    heads[2] = heads[3] = -Infinity;
    this.genome.heads.forEach((rays, h) => {
      for (let k = 0; k < rays.length; k += 1) {
        for (let i = 0; i < SAMPLES.ray; i += 2) {
          const o = (layout.rays[h] + k * SAMPLES.ray + i) * 12;
          add(d[o], d[o + 1], d[o + 2], d[o + 3] + 0.003);
          if (!projectPx(camera, d[o], d[o + 1], d[o + 2], this.sceneW, this.sceneH, out)) continue;
          heads[0] = Math.min(heads[0], out[0]);
          heads[1] = Math.min(heads[1], out[1]);
          heads[2] = Math.max(heads[2], out[0]);
          heads[3] = Math.max(heads[3], out[1]);
        }
      }
      spine(layout.discs[h], SAMPLES.disc, 0.002, 3);
      const o = this.pose.heads[h].origin;
      add(o[0], o[1], o[2], 0.02);
    });
    const c = this.center;
    if (projectPx(camera, c[0], c[1], c[2], this.sceneW, this.sceneH, out)) this.flowerDepth = out[2];

    /* NEAR: the scene's pixels, its corner on their grid. */
    const pad = MARGIN_PX;
    const x0 = Math.max(0, Math.floor(box[0] - pad));
    const y0 = Math.max(0, Math.floor(box[1] - pad));
    const x1 = Math.min(this.sceneW, Math.ceil(box[2] + pad));
    const y1 = Math.min(this.sceneH, Math.ceil(box[3] + pad));
    const w = x1 - x0;
    const h = y1 - y0;
    this.fineRect.fill(0);
    if (!(w > 0 && h > 0)) {
      this.nearRect.fill(0);
    } else {
      this.nearRect[0] = x0;
      this.nearRect[1] = y0;
      this.nearRect[2] = w;
      this.nearRect[3] = h;
      this.near = this.ensurePicture(this.near, w, h, this.gl.LINEAR);
      if (this.fineOn) {
        /* FINE: the same rect at the screen's pixels, outward to their
           grid. */
        const kx = this.outW / this.sceneW;
        const ky = this.outH / this.sceneH;
        const fx0 = Math.floor(x0 * kx);
        const fy0 = Math.floor(y0 * ky);
        const fw = Math.min(this.outW, Math.ceil(x1 * kx)) - fx0;
        const fh = Math.min(this.outH, Math.ceil(y1 * ky)) - fy0;
        this.fineRect[0] = fx0;
        this.fineRect[1] = fy0;
        this.fineRect[2] = fw;
        this.fineRect[3] = fh;
        this.samples = Math.max(2, Math.min(4, Math.floor(Math.sqrt(FINE_BUDGET / (fw * fh)))));
        this.nearSampled = this.ensureSampled(this.nearSampled, fw * this.samples, fh * this.samples);
        this.fine = this.ensurePicture(this.fine, fw, fh, this.gl.NEAREST);
      } else {
        this.samples = Math.max(2, Math.min(4, Math.floor(Math.sqrt(SAMPLE_BUDGET / (w * h)))));
        this.nearSampled = this.ensureSampled(this.nearSampled, w * this.samples, h * this.samples);
      }
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

  /** The pollen alive this frame into its buffer, each mote's light — its
   *  fades in, out and toward its reach, its glint — with it; how many. */
  private packPollen(): number {
    const data = this.pollenData;
    const G = POLLEN.glint;
    let n = 0;
    for (const s of this.specks) {
      const far = Math.hypot(s.p[0] - s.from[0], s.p[1] - s.from[1], s.p[2] - s.from[2]);
      const glint = 1 - G.depth * (0.5 - 0.5 * Math.sin(s.phase + s.rate * s.age));
      const a =
        smooth(0, POLLEN.fade, s.age) * (1 - smooth(0.55 * s.life, s.life, s.age)) * (1 - smooth(0.7 * POLLEN.reach, POLLEN.reach, far)) * glint;
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
    bindTexture(gl, u.uNoise, 1, this.noiseTex, gl.TEXTURE_3D);
    gl.uniform1f(u.uRayRuffle, BLOOM.rays.ruffle);
    gl.uniform2f(u.uRidges, BLOOM.stem.ribs[0], BLOOM.stem.ribs[1]);
    gl.uniform1f(u.uClothPleat, BLOOM.cloth.pleat);
    gl.uniform4f(u.uTargetRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.uMirror, mirrored);
    gl.uniform3f(u.uPoints, 0, BLOOM.pollen.radius, samplesPerCss);
    this.setStone(u);
    gl.uniform3fv(u.uLit, colors.lit);
    /* The dome, scaled as the stone's light is tuned (stage/StageTuner),
       against the top light it was fitted under (0.8: the stone's own was
       since set to the user's 0.83, under which they saw the flowers ~4%
       brighter — kept). */
    const dome = BLOOM.light.dome;
    const k = light.light[0] / 0.8;
    gl.uniform3f(u.uBloomDome, dome[0] * k, dome[1] * k, dome[2] * k);
    gl.uniform2f(u.uLightSide, STONE.lightSide[0], STONE.lightSide[1]);
    gl.uniform3fv(u.uPetal, colors.petal);
    gl.uniform3fv(u.uDisc, colors.disc);
    gl.uniform3fv(u.uStem, colors.stem);
    gl.uniform3fv(u.uCloth, colors.cloth);
    const L = BLOOM.light;
    gl.uniform4f(u.uBloomLight, L.transmit, L.sheen, L.wax, L.through[0]);
    gl.uniform4f(u.uBloomMore, L.through[1], L.florets[0], L.florets[1], BLOOM.rays.teeth);
    gl.uniform4f(u.uRayLook, L.veins[0], L.veins[1], L.satin[0], L.satin[1]);
    const F = BLOOM.cloth.fray;
    gl.uniform4f(u.uPlantMore, L.weave, F[0], F[1], L.cloth);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.bindVertexArray(this.meshVao);
    /* The flowers and the cloth, whole. (Their pollen is drawn into the
       scene: drawMotes.) */
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  /**
   * One picture resolved from `source` into `target`'s first width × height
   * pixels: `foot` the footprint (where the first pixel's begins in the
   * source, its span, texels to visit), `blur` the mirror's (reach, width),
   * `mode` (contact shade, source already resolved), `rectPx` the picture's
   * corner in its frame and the frame's size (px), for the contact shade.
   */
  private drawResolve(
    target: Picture,
    width: number,
    height: number,
    source: Sampled | WebGLTexture,
    foot: readonly number[],
    blur: readonly number[],
    mode: readonly number[],
    rectPx: readonly number[],
    camera: CameraFrame,
  ): void {
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
    bindTexture(gl, u.uSource, 0, "tex" in source ? source.tex : source);
    gl.uniform4f(u.uFoot, foot[0], foot[1], foot[2], foot[3]);
    gl.uniform2f(u.uBlur, blur[0], blur[1]);
    gl.uniform2f(u.uMode, mode[0], mode[1]);
    gl.uniform4f(u.uRectPx, rectPx[0], rectPx[1], rectPx[2], rectPx[3]);
    this.setStone(u);
    if (mode[0] > 0.5) this.setContact(u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setStone(u: Record<string, WebGLUniformLocation | null>): void {
    const gl = this.gl;
    gl.uniform4f(u.uStonePlan, STONE.center[0], STONE.center[1], STONE.plan.across, STONE.plan.along);
    gl.uniform2f(u.uStoneSpan, -STONE.depth, STONE.top);
    gl.uniform4f(u.uStoneWeather, STONE.edge, STONE.runs, STONE.lichen.size, STONE.lichen.cover);
  }

  /**
   * The contact shade's inputs: the runs the stone lies under — the tube,
   * the cloth wound round it and its knot, the cloth's tails — as points
   * and their radii, read in chunks of a few points, each with the sphere
   * its shade reaches; and the flower.
   */
  private setContact(u: Record<string, WebGLUniformLocation | null>): void {
    const gl = this.gl;
    const runs = this.runs;
    const chunks = this.chunks;
    const span = this.chunkSpan;
    const reachMost = BLOOM.contact.reach;
    let n = 0;
    let c = 0;
    let first = 0;
    /* Closes the chunk from point `first` to the last one written. */
    const chunk = () => {
      if (c >= CONTACT_CHUNKS || n - first < 2) return;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = first; i < n; i += 1) {
        cx += runs[i * 4];
        cy += runs[i * 4 + 1];
        cz += runs[i * 4 + 2];
      }
      const k = 1 / (n - first);
      cx *= k;
      cy *= k;
      cz *= k;
      let far = 0;
      for (let i = first; i < n; i += 1) {
        const r = Math.abs(runs[i * 4 + 3]);
        const reach = runs[i * 4 + 3] < 0 ? 3 * BLOOM.contact.cloth : Math.min(Math.max(4 * r, 0.003), reachMost);
        far = Math.max(far, Math.hypot(runs[i * 4] - cx, runs[i * 4 + 1] - cy, runs[i * 4 + 2] - cz) + r + 2.5 * reach);
      }
      chunks.set([cx, cy, cz, far], c * 4);
      span[c * 2] = first;
      span[c * 2 + 1] = n - 1;
      c += 1;
    };
    /* Each run's points; every fourth closes a chunk, which the next one
       begins from. */
    for (const run of this.pose.runs) {
      chunk();
      first = n;
      run.points.forEach((p, i) => {
        if (n >= CONTACT_POINTS) return;
        const r = run.radius[i];
        runs[n * 4] = p[0];
        runs[n * 4 + 1] = p[1];
        runs[n * 4 + 2] = p[2];
        runs[n * 4 + 3] = r < 0 ? Math.min(r, -1e-5) : Math.max(r, 1e-5);
        n += 1;
        if (n - first === 4) {
          chunk();
          first = n - 1;
        }
      });
    }
    chunk();
    gl.uniform4fv(u.uRuns, runs);
    gl.uniform4fv(u.uChunks, chunks);
    gl.uniform2fv(u.uChunkSpan, span);
    gl.uniform1f(u.uChunkCount, c);
    const shade = this.headShade;
    this.pose.heads.forEach((head, h) => {
      shade.set([head.origin[0], head.origin[1], head.origin[2], BLOOM.contact.head * BLOOM.rays.length[1] * head.size], h * 4);
    });
    gl.uniform4fv(u.uHeadShade, shade);
    gl.uniform4f(u.uContactShade, BLOOM.contact.reach, BLOOM.contact.depth, BLOOM.contact.crease[0], BLOOM.contact.crease[1]);
    gl.uniform1f(u.uClothShade, BLOOM.contact.cloth);
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
    if (!tex || !depth || !fbo) {
      /* A context going away mid-allocation: none of it is kept. */
      gl.deleteTexture(tex);
      gl.deleteRenderbuffer(depth);
      gl.deleteFramebuffer(fbo);
      return null;
    }
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
    if (!tex || !fbo) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      return null;
    }
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

}

/** The point between the two heads (m, world). */
function middleOf(pose: Pose): Vec3 {
  const [a, b] = pose.heads;
  return [0.5 * (a.origin[0] + b.origin[0]), 0.5 * (a.origin[1] + b.origin[1]), 0.5 * (a.origin[2] + b.origin[2])];
}

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
  out[0] = ((cx / cz) * (camera.focal / vw) + camera.center[0]) * w;
  out[1] = ((cy / cz) * (camera.focal / vh) + camera.center[1]) * h;
  out[2] = cz;
  return true;
}
