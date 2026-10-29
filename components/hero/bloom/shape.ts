/**
 * ─── Bloom · its shape ───
 *
 * The two cut flowers and their cloth as surfaces swept along curves
 * ("spines"). Each spine is a row of samples — a point, the directions
 * across it and off its face, its half-width, how it is cupped across, how
 * thick it is — and the mesh is a fixed grid laid over those samples: the
 * vertex stage (shaders/bloom.ts) reads its sample and builds the surface
 * there. So the mesh never changes and the pose is a few kilobytes a frame:
 *
 *   rays     each head's white rays, posed in the head's own frame (its
 *            axis z) by the air's tremble, then carried into the world and
 *            laid onto the stone where they press on it; and its bracts,
 *            the small green scales cupped behind them
 *   round    in the world: each disc, a dome of revolution; the stems, from
 *            their cuts to the heads; the side shoot
 *   cloth    in the world: the strip wound round the stems, its knot, its
 *            two tails laid over the stone
 *
 * Everything but the rays and what hangs free of the cloth's tails (sway.ts)
 * is still, and written once.
 */

import { STONE } from "../stone/optics";
import { FLUTTER } from "./motion";
import { BLOOM, type ClothTail, type HeadDesign } from "./optics";

export type Vec3 = [number, number, number];

/** Samples along each kind of spine. */
export const SAMPLES = { ray: 12, bract: 5, disc: 10, stem: 56, shoot: 8, wrap: 64, knot: 16, tail: 40 } as const;
/** The pose texture: this many samples a row, three texels each. */
export const POSE_ROW = 64;
export const POSE_WIDTH = POSE_ROW * 3;
/** Floats a sample: three RGBA texels — point, half-width; across, cup;
 *  face, thickness. */
export const SAMPLE_FLOATS = 12;

/** What a vertex is part of (shaders/bloom.ts reads the same numbers). */
export const KIND = { ray: 0, cloth: 1, round: 2 } as const;
/** What a round spine is made of (shaders/bloom.ts reads the same numbers). */
export const MATTER = { stem: 0, disc: 1 } as const;

const TAU = Math.PI * 2;
const HEADS = BLOOM.heads;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const pair = (range: readonly [number, number], t: number) => lerp(range[0], range[1], t);

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: readonly number[], b: readonly number[], k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** A small seeded generator (mulberry32): the same seed, the same flowers. */
function random(seed: number): () => number {
  let s = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── The heads' rays ──────────────────────────────────────────────────── */

interface Ray {
  phi: number;
  length: number;
  half: number;
  base: number;
  end: number;
  curl: number;
  twist: number;
  /** How far it sweeps sideways off its plane (radians). */
  sweep: number;
  /** Where it springs from, in the head's frame. */
  r0: number;
  z0: number;
  /** Its own quiver's phase. */
  phase: number;
  hash: number;
}

export interface Genome {
  readonly seed: number;
  /** Each head's rays. */
  readonly heads: readonly (readonly Ray[])[];
}

/**
 * The heads from their seed: how many rays each, and each ray's length,
 * width, angles and twist — one series round the disc, evenly set but no
 * two alike (the user's photograph: some cross, some turn).
 */
export function grow(seed: number): Genome {
  const R = BLOOM.rays;
  const heads = HEADS.map((head, h) => {
    const rand = random((seed + h * 0.618034) % 1);
    const size = head.size;
    const [least, most] = R.count;
    const count = least + Math.floor(rand() * (most - least + 1));
    const spin = rand() * TAU;
    const rays: Ray[] = [];
    for (let j = 0; j < count; j += 1) {
      const h1 = rand();
      const h2 = rand();
      const h3 = rand();
      const h4 = rand();
      const base = pair(R.base, h1) + (h2 - 0.5) * 2 * R.jitter;
      rays.push({
        phi: (j / count) * TAU + spin + (h3 - 0.5) * 0.12,
        length: pair(R.length, h4) * size,
        half: R.halfWidth * (0.85 + 0.3 * h2) * size,
        base,
        end: Math.max(pair(R.end, h3) + (h1 - 0.5) * 2 * R.jitter, base),
        curl: R.curl * (0.4 + 1.2 * h4),
        twist: R.twist * (h1 * 2 - 1),
        sweep: (h2 - 0.5) * 0.3,
        /* Alternate rays a little behind the others: one series, but they
           overlap at their bases, as a daisy's do. */
        r0: BLOOM.disc.radius * 0.94 * size,
        z0: -(0.0006 + (j % 2) * 0.0009) * size,
        phase: rand() * TAU,
        hash: rand(),
      });
    }
    return rays;
  });
  return { seed, heads };
}

/* ── The stone's surface, for what lies on it ────────────────────────── */

/* The stone as stone/shaders/stone.ts STONE_SHAPE_GLSL has it: its plan
   mapped to a square, its height scaled to the plan's units, a box with
   rounded arrises. */
const STONE_MID = 0.5 * (STONE.top - STONE.depth);
const STONE_K = 1 / STONE.plan.across;
const STONE_HALF = Math.SQRT1_2;
const STONE_B: Vec3 = [STONE_HALF, 0.5 * (STONE.top + STONE.depth) * STONE_K, STONE_HALF];
const STONE_R = STONE.edge * STONE_K;
/* Metres → the plan's units, roughly: the faces stretch by ~1.6, the
   height by ~2 (STONE_K); for a clearance of a few millimetres the mean is
   near enough. */
const PLAN_PER_METRE = 1.8;

function toPlan(p: readonly number[]): Vec3 {
  const sx = (p[0] - STONE.center[0]) / STONE.plan.across;
  const sz = (p[2] - STONE.center[1]) / STONE.plan.along;
  return [(sx + sz) * STONE_HALF, (p[1] - STONE_MID) * STONE_K, (sz - sx) * STONE_HALF];
}
function fromPlan(q: Vec3): Vec3 {
  const sx = (q[0] - q[2]) * STONE_HALF;
  const sz = (q[0] + q[2]) * STONE_HALF;
  return [STONE.center[0] + sx * STONE.plan.across, STONE_MID + q[1] / STONE_K, STONE.center[1] + sz * STONE.plan.along];
}
function stoneDistance(q: Vec3): number {
  const x = Math.abs(q[0]) - STONE_B[0] + STONE_R;
  const y = Math.abs(q[1]) - STONE_B[1] + STONE_R;
  const z = Math.abs(q[2]) - STONE_B[2] + STONE_R;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0)) + Math.min(Math.max(x, y, z), 0) - STONE_R;
}
function planGradient(q: Vec3): Vec3 {
  const e = 1e-4;
  return normalize([
    stoneDistance([q[0] + e, q[1], q[2]]) - stoneDistance([q[0] - e, q[1], q[2]]),
    stoneDistance([q[0], q[1] + e, q[2]]) - stoneDistance([q[0], q[1] - e, q[2]]),
    stoneDistance([q[0], q[1], q[2] + e]) - stoneDistance([q[0], q[1], q[2] - e]),
  ]);
}

/** The stone's outward normal nearest a world point (the gradient of its
 *  distance: the plan's stretch does not turn a level set's normal). */
function stoneNormal(p: readonly number[]): Vec3 {
  const e = 1e-4;
  const at = (x: number, y: number, z: number) => stoneDistance(toPlan([x, y, z]));
  return normalize([
    at(p[0] + e, p[1], p[2]) - at(p[0] - e, p[1], p[2]),
    at(p[0], p[1] + e, p[2]) - at(p[0], p[1] - e, p[2]),
    at(p[0], p[1], p[2] + e) - at(p[0], p[1], p[2] - e),
  ]);
}

/** How far a world point is off the stone (m, along its normal: the
 *  distance in the plan's units over its rate in the world's), and that
 *  normal. */
function stoneGap(p: readonly number[]): [number, Vec3] {
  const e = 1e-4;
  const at = (x: number, y: number, z: number) => stoneDistance(toPlan([x, y, z]));
  const g: Vec3 = [
    (at(p[0] + e, p[1], p[2]) - at(p[0] - e, p[1], p[2])) / (2 * e),
    (at(p[0], p[1] + e, p[2]) - at(p[0], p[1] - e, p[2])) / (2 * e),
    (at(p[0], p[1], p[2] + e) - at(p[0], p[1], p[2] - e)) / (2 * e),
  ];
  const rate = Math.hypot(g[0], g[1], g[2]) || 1;
  return [at(p[0], p[1], p[2]) / rate, [g[0] / rate, g[1] / rate, g[2] / rate]];
}

/**
 * A point laid onto the stone's rounded surface, `clearance` metres off it:
 * over the top, round the arris, down the face — wherever it is nearest.
 * What lies along the stone (the cloth's tails) is drawn roughly and laid
 * on with this.
 */
function onStone(p: readonly number[], clearance: number): Vec3 {
  const q = toPlan(p);
  const want = clearance * PLAN_PER_METRE;
  for (let i = 0; i < 6; i += 1) {
    const d = stoneDistance(q);
    const g = planGradient(q);
    q[0] += g[0] * (want - d);
    q[1] += g[1] * (want - d);
    q[2] += g[2] * (want - d);
  }
  return fromPlan(q);
}

/**
 * A point kept `clearance` metres off the stone, bent onto it over `soft`
 * metres: what is clear of it is left as it is; what would pass into it
 * lies on it, eased in so a ray pressed under its head bends onto the top
 * instead of folding at a line. Into `out` (may be `p`).
 */
function keepOff(p: readonly number[], clearance: number, soft: number, out: number[]): void {
  const q = toPlan(p);
  const want = clearance * PLAN_PER_METRE;
  const band = soft * PLAN_PER_METRE;
  const d0 = stoneDistance(q);
  if (d0 >= want + band) {
    out[0] = p[0];
    out[1] = p[1];
    out[2] = p[2];
    return;
  }
  /* A smooth maximum of the distance and `want`: (x + 1)²/4 across the
     band, so the surface it is laid on meets the free one without a
     crease. */
  const x = Math.max((d0 - want) / band, -1);
  const target = want + (band * (x + 1) * (x + 1)) / 4;
  for (let i = 0; i < 3; i += 1) {
    const d = stoneDistance(q);
    const g = planGradient(q);
    q[0] += g[0] * (target - d);
    q[1] += g[1] * (target - d);
    q[2] += g[2] * (target - d);
  }
  const r = fromPlan(q);
  out[0] = r[0];
  out[1] = r[1];
  out[2] = r[2];
}

/* ── Curves ───────────────────────────────────────────────────────────── */

/** A centripetal Catmull–Rom curve through `points`, sampled densely. */
function curveThrough(points: readonly (readonly number[])[], steps = 48): Vec3[] {
  const p = points.map((v) => [v[0], v[1], v[2]] as Vec3);
  /* Mirrored ends, so the curve leaves the first point and reaches the last
     along the line between their neighbours. */
  const first: Vec3 = [2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1], 2 * p[0][2] - p[1][2]];
  const n = p.length;
  const last: Vec3 = [2 * p[n - 1][0] - p[n - 2][0], 2 * p[n - 1][1] - p[n - 2][1], 2 * p[n - 1][2] - p[n - 2][2]];
  const all = [first, ...p, last];
  const out: Vec3[] = [];
  for (let s = 1; s < all.length - 2; s += 1) {
    const [p0, p1, p2, p3] = [all[s - 1], all[s], all[s + 1], all[s + 2]];
    const knot = (a: Vec3, b: Vec3) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) || 1e-4;
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let k = 0; k < steps; k += 1) {
      const t = t1 + ((t2 - t1) * k) / steps;
      const pt: Vec3 = [0, 0, 0];
      for (let c = 0; c < 3; c += 1) {
        const a1 = ((t1 - t) * p0[c] + t * p1[c]) / t1;
        const a2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1);
        const a3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + t * a2) / t2;
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        pt[c] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
      }
      out.push(pt);
    }
  }
  out.push(p[n - 1]);
  return out;
}

/** `count` points at equal steps of length along a dense polyline. */
function resample(line: Vec3[], count: number): { points: Vec3[]; length: number } {
  const cum = [0];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const length = cum[cum.length - 1];
  const points: Vec3[] = [];
  let j = 1;
  for (let i = 0; i < count; i += 1) {
    const at = (length * i) / (count - 1);
    while (j < cum.length - 1 && cum[j] < at) j += 1;
    const t = clamp01((at - cum[j - 1]) / Math.max(cum[j] - cum[j - 1], 1e-9));
    const a = line[j - 1];
    const b = line[j];
    points.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
  }
  return { points, length };
}

/**
 * A round spine's frames along its points, carried without turning about
 * it (parallel transport) so it never twists: each sample's across and
 * face (face = tangent × across).
 */
function frames(points: readonly Vec3[], start: Vec3): { across: Vec3[]; face: Vec3[] } {
  const n = points.length;
  const across: Vec3[] = [];
  const face: Vec3[] = [];
  let a = normalize(start);
  for (let i = 0; i < n; i += 1) {
    const p = points[Math.max(i - 1, 0)];
    const q = points[Math.min(i + 1, n - 1)];
    const t = normalize([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
    const along = dot(a, t);
    a = normalize([a[0] - t[0] * along, a[1] - t[1] * along, a[2] - t[2] * along]);
    across.push(a);
    face.push(cross(t, a));
  }
  return { across, face };
}

/* ── The mesh ─────────────────────────────────────────────────────────── */

/** Where each spine's samples begin in the pose texture. */
export interface Layout {
  /** Per head: its stem, its disc, its bracts, its rays. */
  readonly stems: readonly number[];
  readonly discs: readonly number[];
  readonly bracts: readonly number[];
  readonly rays: readonly number[];
  readonly shoot: number;
  /** The cloth's pieces: the wrap, the knot's crossing and its loop, then
   *  the tails. */
  readonly cloth: readonly number[];
  /** Rows of the pose texture in use. */
  readonly rows: number;
}

export interface Mesh {
  /** Per vertex: (sample, across, side, kind) then (along, share, hash, last). */
  readonly attributes: Float32Array;
  readonly indices: Uint16Array;
  readonly layout: Layout;
}

/* Across a ray: seven columns, closer at the margins where it curls. */
const RAY_ACROSS = [-1, -0.72, -0.38, 0, 0.38, 0.72, 1];
/* Across a bract: three. */
const BRACT_ACROSS = [-1, 0, 1];
/* Across the cloth: denser toward its margins, where it curls and frays. */
const CLOTH_ACROSS = Array.from({ length: 9 }, (_, i) => Math.sin(((i - 4) / 4) * (Math.PI / 2)));
/* Round each round spine: vertices about its circumference. */
const AROUND = { stem: 10, disc: 18, shoot: 8 } as const;

const B = BLOOM.bracts;
const BRACTS = B.rows * B.count;
const TAILS = BLOOM.cloth.tails;
/* The cloth's pieces before its tails: the wrap, the knot's crossing band
   and its loop — their samples, and a length past which no end shows (it
   is hidden in the knot). */
const PIECES = [SAMPLES.wrap, SAMPLES.knot, SAMPLES.knot] as const;
const HIDDEN_END = 10;

export function buildMesh(genome: Genome): Mesh {
  const verts: number[] = [];
  const idx: number[] = [];
  let next = 0;
  const vertex = (sample: number, across: number, side: number, kind: number, along: number, share: number, hash: number, last: number) => {
    verts.push(sample, across, side, kind, along, share, hash, last);
    return next++;
  };
  /* A grid of `rows` × `cols` vertices from `first`, as triangles. */
  const grid = (first: number, rows: number, cols: number) => {
    for (let i = 0; i < rows - 1; i += 1) {
      for (let j = 0; j < cols - 1; j += 1) {
        const a = first + i * cols + j;
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  };

  /* The pose texture's layout, packed. */
  let sample = 0;
  const take = (count: number) => {
    const at = sample;
    sample += count;
    return at;
  };
  const stems = HEADS.map(() => take(SAMPLES.stem));
  const discs = HEADS.map(() => take(SAMPLES.disc));
  const bracts = HEADS.map(() => take(BRACTS * SAMPLES.bract));
  const rays = genome.heads.map((r) => take(r.length * SAMPLES.ray));
  const shoot = take(SAMPLES.shoot);
  const cloth = [...PIECES.map((n) => take(n)), ...TAILS.map(() => take(SAMPLES.tail))];
  const layout: Layout = { stems, discs, bracts, rays, shoot, cloth, rows: Math.ceil(sample / POSE_ROW) };

  /* The cloth: two faces meeting at its margins. The share is which piece;
     the hash its length (m: its weave, and how far from its end it frays);
     the last, how its end is cut (radians off square). */
  const counts = [...PIECES, ...TAILS.map(() => SAMPLES.tail)];
  counts.forEach((count, k) => {
    const tail = k - PIECES.length;
    const length = tail >= 0 ? TAIL_LENGTHS[tail] : HIDDEN_END;
    const slant = tail >= 0 ? TAILS[tail].slant : 0;
    for (const side of [1, -1]) {
      const first = next;
      for (let i = 0; i < count; i += 1) {
        for (const u of CLOTH_ACROSS) vertex(cloth[k] + i, u, side, KIND.cloth, i / (count - 1), k, length, slant);
      }
      grid(first, count, CLOTH_ACROSS.length);
    }
  });

  /* Round spines: the share is what it is made of. */
  const round = (at: number, count: number, around: number, matter: number) => {
    const first = next;
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j <= around; j += 1) vertex(at + i, j / around, 0, KIND.round, i / (count - 1), matter, 0, 0);
    }
    grid(first, count, around + 1);
  };
  HEADS.forEach((_, h) => {
    round(stems[h], SAMPLES.stem, AROUND.stem, MATTER.stem);
    round(discs[h], SAMPLES.disc, AROUND.disc, MATTER.disc);
  });
  round(shoot, SAMPLES.shoot, AROUND.shoot, MATTER.stem);

  /* The bracts: small scales, made as rays are; a share below zero tells
     the light stage it is a bract. */
  HEADS.forEach((_, h) => {
    for (let b = 0; b < BRACTS; b += 1) {
      const first = next;
      for (let i = 0; i < SAMPLES.bract; i += 1) {
        for (const u of BRACT_ACROSS) vertex(bracts[h] + b * SAMPLES.bract + i, u, 0, KIND.ray, i / (SAMPLES.bract - 1), -1, (b * 0.618) % 1, 0);
      }
      grid(first, SAMPLES.bract, BRACT_ACROSS.length);
    }
  });

  /* The rays: their margins ruffled. */
  genome.heads.forEach((list, h) => {
    list.forEach((ray, k) => {
      const first = next;
      for (let i = 0; i < SAMPLES.ray; i += 1) {
        for (const u of RAY_ACROSS) vertex(rays[h] + k * SAMPLES.ray + i, u, 0, KIND.ray, i / (SAMPLES.ray - 1), h, ray.hash, 1);
      }
      grid(first, SAMPLES.ray, RAY_ACROSS.length);
    });
  });

  if (next > 65535) throw new Error("bloom: mesh too large for 16-bit indices");
  return { attributes: new Float32Array(verts), indices: new Uint16Array(idx), layout };
}

/* ── The heads' frames ────────────────────────────────────────────────── */

/** Where a head lies and how it faces: its across, up and axis. */
export interface HeadFrame {
  readonly origin: Vec3;
  /** Columns: across, up, and its axis (the way it faces). */
  readonly basis: Float32Array;
  readonly size: number;
}

/** Per ray, what the pose needs that never changes: its outline and its
 *  angles at every sample and half-sample. */
interface RayCache {
  width: Float32Array;
  open: Float32Array;
  openMid: Float32Array;
  cos: number;
  sin: number;
}

function rayCaches(rays: readonly Ray[]): RayCache[] {
  const n = SAMPLES.ray;
  const R = BLOOM.rays;
  return rays.map((t) => {
    const c: RayCache = { width: new Float32Array(n), open: new Float32Array(n), openMid: new Float32Array(n), cos: Math.cos(t.phi), sin: Math.sin(t.phi) };
    /* Spread from its base, bending back along it, its tip curling back
       a little more. */
    const angle = (s: number) => t.base + (t.end - t.base) * Math.pow(s, 1.3) + t.curl * Math.max((s - 0.65) / 0.35, 0) ** 2;
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      c.width[i] = t.half * rayWidth(s, R);
      c.open[i] = angle(s);
      c.openMid[i] = angle((i + 0.5) / (n - 1));
    }
    return c;
  });
}

/** Floats a ray's walk writes for each sample: its point, its across, its
 *  face (the head's frame). */
const WALK = 9;

/**
 * Walks one ray's spine in its head's frame, trembling by `quiver` and
 * `turn` (radians), into `out` (WALK floats a sample). Shared by the pose
 * and by the laying down, which finds how low the head reaches. Writes into
 * an array it is handed: walked for every ray every frame the air moves
 * them, it allocated ~1,600 small arrays a frame and held the main thread
 * ~0.8 ms.
 */
function walkRay(t: Ray, c: RayCache, quiver: number, turn: number, out: Float32Array): void {
  const n = SAMPLES.ray;
  const da = t.length / (n - 1);
  const cphi = c.cos;
  const sphi = c.sin;
  let px = cphi * t.r0;
  let py = sphi * t.r0;
  let pz = t.z0;
  for (let i = 0; i < n; i += 1) {
    const s = i / (n - 1);
    const theta = c.open[i] + quiver * s;
    const psi = t.sweep * s;
    const tau = t.twist * s * s + turn * s;
    /* The plane it bends in, swept sideways by psi: its radial way
       (rx, ry, 0); across, square to that plane; its face (toward the
       head's front), the tangent × across. (psi is under 0.2 rad: its
       cosine and sine to the cube, well under a micron off.) */
    const cps = 1 - 0.5 * psi * psi;
    const sps = psi - (psi * psi * psi) / 6;
    const rx = cps * cphi - sps * sphi;
    const ry = cps * sphi + sps * cphi;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    let lx = -ry;
    let ly = rx;
    let lz = 0;
    let ax = -ct * rx;
    let ay = -ct * ry;
    let az = st;
    if (tau !== 0) {
      const co = Math.cos(tau);
      const si = Math.sin(tau);
      const nlx = lx * co + ax * si;
      const nly = ly * co + ay * si;
      const nlz = lz * co + az * si;
      ax = ax * co - lx * si;
      ay = ay * co - ly * si;
      az = az * co - lz * si;
      lx = nlx;
      ly = nly;
      lz = nlz;
    }
    const o = i * WALK;
    out[o] = px;
    out[o + 1] = py;
    out[o + 2] = pz;
    out[o + 3] = lx;
    out[o + 4] = ly;
    out[o + 5] = lz;
    out[o + 6] = ax;
    out[o + 7] = ay;
    out[o + 8] = az;
    /* Step to the next sample along the curve's mid-angle. */
    if (i < n - 1) {
      const s2 = (i + 0.5) / (n - 1);
      const th2 = c.openMid[i] + quiver * s2;
      const ps2 = t.sweep * s2;
      const cp2 = 1 - 0.5 * ps2 * ps2;
      const sp2 = ps2 - (ps2 * ps2 * ps2) / 6;
      const step = Math.sin(th2) * da;
      px += step * (cp2 * cphi - sp2 * sphi);
      py += step * (cp2 * sphi + sp2 * cphi);
      pz += Math.cos(th2) * da;
    }
  }
}

/**
 * A HEAD LAID DOWN: its frame turned to its facing, and set at the height
 * where its lowest ray reaches `lie.press` into the top — which the pose
 * then lays onto it (keepOff), so it rests on its rays.
 */
function layHead(design: HeadDesign, rays: readonly Ray[], caches: readonly RayCache[]): HeadFrame {
  const f = normalize([...design.facing] as Vec3);
  const e1 = normalize(cross([0, 1, 0], f));
  const e2 = cross(f, e1);
  let low = 0;
  const walk = new Float32Array(SAMPLES.ray * WALK);
  rays.forEach((t, k) => {
    walkRay(t, caches[k], 0, 0, walk);
    for (let i = 0; i < SAMPLES.ray; i += 1) {
      const w = caches[k].width[i];
      const o = i * WALK;
      for (const side of [-1, 1]) {
        const x = walk[o] + walk[o + 3] * w * side;
        const y = walk[o + 1] + walk[o + 4] * w * side;
        const z = walk[o + 2] + walk[o + 5] * w * side;
        low = Math.min(low, e1[1] * x + e2[1] * y + f[1] * z);
      }
    }
  });
  const [cx, cz] = design.center;
  return { origin: [cx, STONE.top - BLOOM.lie.press - low, cz], basis: new Float32Array([...e1, ...e2, ...f]), size: design.size };
}

/** A point of a head's own frame, in the world. */
export function toWorld(frame: HeadFrame, p: readonly number[]): Vec3 {
  const b = frame.basis;
  const o = frame.origin;
  return [
    o[0] + b[0] * p[0] + b[3] * p[1] + b[6] * p[2],
    o[1] + b[1] * p[0] + b[4] * p[1] + b[7] * p[2],
    o[2] + b[2] * p[0] + b[5] * p[1] + b[8] * p[2],
  ];
}

/** The disc's radius a share `t` of its height up (its foot 0, its tip 1),
 *  as a share of its foot's: a dome coning toward its tip. */
function discProfile(t: number): number {
  return Math.pow(Math.max(1 - Math.pow(Math.max(t, 0), 2.2), 0), 0.55);
}

/* ── The cloth's tails, before they are posed ────────────────────────── */

/* Each tail's length (m), as drawn: the shaders size its weave and fray by
   it (written into the mesh before the pose is made, so drawn here). */
const TAIL_LENGTHS = TAILS.map((tail) => resample(curveThrough(tail.points), 2).length);

/* ── The pose ─────────────────────────────────────────────────────────── */

/** A spine the stone's contact shade lies under: points, and their radius
 *  (m; a flat band of cloth: its half-width, negative). */
export interface Run {
  readonly points: readonly Vec3[];
  readonly radius: readonly number[];
}

interface Spine {
  points: Vec3[];
  radius: Float32Array;
}

/** A tail of the cloth as it lies at rest: what its sway in the air starts
 *  from and comes back to (sway.ts). */
export interface TailRest {
  /** Its first sample in the pose, and how many. */
  readonly first: number;
  readonly count: number;
  /** Its samples at rest, as the pose holds them (SAMPLE_FLOATS each). */
  readonly rest: Float32Array;
  /** How far along it each sample is from the knot (m). */
  readonly along: Float32Array;
  /** How far each sample is off the stone (m), and the stone's outward
   *  normal nearest it (three floats a sample). */
  readonly gap: Float32Array;
  readonly normal: Float32Array;
  /** Its points under the stone's contact shade (in `runs`: moved with it),
   *  and which of its samples each one is. */
  readonly shade: readonly Vec3[];
  readonly shadeAt: readonly number[];
}

/**
 * The pose, written straight into the texture's floats. The stems, discs,
 * bracts and the cloth are still, written once; the rays each frame, as the
 * air at the heads makes them tremble; and what hangs free of the cloth's
 * tails as the air at them sways it (sway.ts, from `tails`).
 */
export class Pose {
  readonly data: Float32Array;
  readonly heads: HeadFrame[];
  /** What the contact shade lies under: the stems, the wrap, the cloth's
   *  tails (bloom.ts setContact). */
  readonly runs: Run[] = [];
  /** The cloth's tails at rest, the long one first. */
  readonly tails: TailRest[] = [];
  private readonly genome: Genome;
  private readonly layout: Layout;
  private readonly caches: RayCache[][];
  /* Scratch: a ray's walk, and one sample carried into the world. */
  private readonly walk = new Float32Array(SAMPLES.ray * WALK);
  private readonly world = [0, 0, 0];
  /* Per head, per ray sample: whether it can come near enough the stone to
     be laid onto it at all (most never can, and are not asked). */
  private readonly near: Uint8Array[];

  constructor(genome: Genome, layout: Layout) {
    this.genome = genome;
    this.layout = layout;
    this.data = new Float32Array(layout.rows * POSE_WIDTH * 4);
    this.caches = genome.heads.map((rays) => rayCaches(rays));
    this.heads = HEADS.map((design, h) => layHead(design, genome.heads[h], this.caches[h]));
    this.near = this.nearStone();
    const stems = HEADS.map((_, h) => this.poseStem(h));
    HEADS.forEach((_, h) => {
      this.poseDisc(h);
      this.poseBracts(h);
    });
    this.poseShoot(stems);
    this.poseCloth(stems);
    this.update(0, 0, true);
  }

  /** The rays this frame: `air`, how hard the air moves past the heads
   *  (m/s), for their tremble; `time`, seconds; `still`: none of their own
   *  quiver in still air (reduced motion: they move only as the air does). */
  update(air: number, time: number, still = false): void {
    this.poseRays(this.flutter(air, still), time);
  }

  /** How far the rays tremble (radians) for air moving `air` m/s past the
   *  heads (bloom.ts: under FLUTTER.visible it holds the pose it has). */
  flutter(air: number, still = false): number {
    const F = FLUTTER;
    return lerp(still ? 0 : F.rest, F.most, smoothstep(0, F.full, air));
  }

  /** The rays posed trembling by `flutter` radians at `time` seconds. */
  poseRays(flutter: number, time: number): void {
    const F = FLUTTER;
    const omega = 2 * Math.PI * F.hz;
    const n = SAMPLES.ray;
    const out = this.world;
    const walk = this.walk;
    const { press, soft } = BLOOM.lie;
    const R = BLOOM.rays;
    const heads = this.genome.heads;
    for (let h = 0; h < heads.length; h += 1) {
      const rays = heads[h];
      const frame = this.heads[h];
      const b = frame.basis;
      const o = frame.origin;
      const cup = R.cup / frame.size;
      const near = this.near[h];
      for (let k = 0; k < rays.length; k += 1) {
        const t = rays[k];
        const c = this.caches[h][k];
        /* Its quiver: a lift and a turn, each on two incommensurate terms. */
        const quiver = flutter * (Math.sin(time * omega + t.phase) + 0.6 * Math.sin(time * omega * 1.618 + 2.1 * t.phase));
        const turn = 0.7 * flutter * Math.sin(time * omega * 0.84 + 1.3 * t.phase);
        const first = this.layout.rays[h] + k * n;
        walkRay(t, c, quiver, turn, walk);
        for (let i = 0; i < n; i += 1) {
          const w = i * WALK;
          const px = walk[w];
          const py = walk[w + 1];
          const pz = walk[w + 2];
          const lx = walk[w + 3];
          const ly = walk[w + 4];
          const lz = walk[w + 5];
          const ax = walk[w + 6];
          const ay = walk[w + 7];
          const az = walk[w + 8];
          /* Into the world, and laid onto the top where it presses on it:
             held there whatever the air does. */
          out[0] = o[0] + b[0] * px + b[3] * py + b[6] * pz;
          out[1] = o[1] + b[1] * px + b[4] * py + b[7] * pz;
          out[2] = o[2] + b[2] * px + b[5] * py + b[8] * pz;
          if (near[k * n + i]) keepOff(out, 0.0006, Math.min(soft, press), out);
          this.write(
            first + i,
            out[0], out[1], out[2], c.width[i],
            b[0] * lx + b[3] * ly + b[6] * lz, b[1] * lx + b[4] * ly + b[7] * lz, b[2] * lx + b[5] * ly + b[8] * lz,
            /* Its channel, never past ~150° each side. */
            Math.min(cup, 2.6 / Math.max(c.width[i], 1e-4)),
            b[0] * ax + b[3] * ay + b[6] * az, b[1] * ax + b[4] * ay + b[7] * az, b[2] * ax + b[5] * ay + b[8] * az,
            R.crease,
          );
        }
      }
    }
  }

  /**
   * Which ray samples can ever be laid onto the stone: those whose resting
   * point lies within the laying's reach of it, with room for the most the
   * air can lift or drop a ray's tip (FLUTTER.most over its length).
   */
  private nearStone(): Uint8Array[] {
    const n = SAMPLES.ray;
    const walk = this.walk;
    const reach = (BLOOM.lie.soft + 0.0006) * PLAN_PER_METRE;
    return this.genome.heads.map((rays, h) => {
      const frame = this.heads[h];
      const flags = new Uint8Array(rays.length * n);
      rays.forEach((t, k) => {
        walkRay(t, this.caches[h][k], 0, 0, walk);
        const swing = 1.6 * FLUTTER.most * t.length * PLAN_PER_METRE;
        for (let i = 0; i < n; i += 1) {
          const p = toWorld(frame, [walk[i * WALK], walk[i * WALK + 1], walk[i * WALK + 2]]);
          flags[k * n + i] = stoneDistance(toPlan(p)) < reach + swing ? 1 : 0;
        }
      });
      return flags;
    });
  }

  /** A point on head `h`'s disc (`u`, `v`: 0–1, round it and up it), in
   *  the world: where the pollen is shaken from. */
  discPoint(h: number, u: number, v: number): Vec3 {
    const frame = this.heads[h];
    const D = BLOOM.disc;
    const r = D.radius * frame.size * discProfile(v) * 0.9;
    const a = u * TAU;
    return toWorld(frame, [Math.cos(a) * r, Math.sin(a) * r, v * D.height * frame.size]);
  }

  /* One sample: point, half-width; across, cup (a round spine: how fast
     its radius changes along it); face, thickness. */
  private write(
    sample: number,
    px: number, py: number, pz: number, w: number,
    lx: number, ly: number, lz: number, k: number,
    ax: number, ay: number, az: number, h: number,
  ): void {
    const o = sample * SAMPLE_FLOATS;
    const d = this.data;
    d[o] = px;
    d[o + 1] = py;
    d[o + 2] = pz;
    d[o + 3] = w;
    d[o + 4] = lx;
    d[o + 5] = ly;
    d[o + 6] = lz;
    d[o + 7] = k;
    d[o + 8] = ax;
    d[o + 9] = ay;
    d[o + 10] = az;
    d[o + 11] = h;
  }

  /** A round spine written: its points and radii, carried frames, and how
   *  fast its radius changes along it (for its normals). */
  private writeRound(first: number, points: Vec3[], radius: Float32Array, start: Vec3): void {
    const n = points.length;
    const { across, face } = frames(points, start);
    for (let i = 0; i < n; i += 1) {
      const a = points[Math.max(i - 1, 0)];
      const b = points[Math.min(i + 1, n - 1)];
      const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      const slope = (radius[Math.min(i + 1, n - 1)] - radius[Math.max(i - 1, 0)]) / span;
      const p = points[i];
      const l = across[i];
      const f = face[i];
      this.write(first + i, p[0], p[1], p[2], radius[i], l[0], l[1], l[2], Math.max(Math.min(slope, 8), -8), f[0], f[1], f[2], radius[i]);
    }
  }

  /**
   * A STEM, from its cut to its head: along the top through its design's
   * points, resting on it at its own radius, held out past the edge where
   * it leaves it (drooping a little), then up off the top in the bend that
   * carries it into the back of its head along the head's axis, swelling
   * into the receptacle the bracts sit on. The cut is closed by a flat disc:
   * the first ring, at no radius.
   */
  private poseStem(h: number): Spine {
    const design = HEADS[h];
    const frame = this.heads[h];
    const S = BLOOM.stem;
    const n = SAMPLES.stem;
    const r = S.radius;
    const size = frame.size;
    const lying = design.stem.map(([x, z]) => [x, STONE.top + r, z]);
    lying[lying.length - 1][1] -= design.droop;
    const base = toWorld(frame, [0, 0, -0.002 * size]);
    const neck = toWorld(frame, [0, 0, -0.012 * size]);
    const bend = toWorld(frame, [0, 0, -(0.012 + S.bend) * size]);
    bend[1] = Math.max(bend[1] - 0.25 * S.bend, STONE.top + 2 * r);
    const drawn = resample(curveThrough([...lying.reverse(), bend, neck, base], 40), n);
    const radius = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      radius[i] = lerp(r, S.receptacle * size, smoothstep(0.955, 1, s) ** 1.5);
    }
    const points = drawn.points.map((p, i) => {
      const q = [0, 0, 0];
      keepOff(p, radius[i], 0.003, q);
      return q as Vec3;
    });
    const [a, b] = [points[1], points[2]];
    points[0] = [a[0] + (a[0] - b[0]) * 0.03, a[1] + (a[1] - b[1]) * 0.03, a[2] + (a[2] - b[2]) * 0.03];
    radius[0] = 0;
    const t0 = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    this.writeRound(this.layout.stems[h], points, radius, cross([0, 1, 0], t0));
    this.runs.push({ points: points.filter((_, i) => i % 6 === 1), radius: Array.from(radius).filter((_, i) => i % 6 === 1) });
    return { points, radius };
  }

  /** A DISC: a dome of revolution about its head's axis, from a little
   *  behind the rays' bases to its tip. */
  private poseDisc(h: number): void {
    const frame = this.heads[h];
    const D = BLOOM.disc;
    const n = SAMPLES.disc;
    const foot = -0.0016 * frame.size;
    const top = D.height * frame.size;
    const points: Vec3[] = [];
    const radius = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const z = lerp(foot, top, i / (n - 1));
      points.push(toWorld(frame, [0, 0, z]));
      radius[i] = D.radius * frame.size * discProfile(z / top);
    }
    const b = frame.basis;
    this.writeRound(this.layout.discs[h], points, radius, [b[0], b[1], b[2]]);
  }

  /**
   * THE BRACTS behind a head: small green scales in rows round the
   * receptacle's back, pointing back and out from under the rays, the outer
   * row longer and further back; each cupped round the receptacle, its
   * inner face to it.
   */
  private poseBracts(h: number): void {
    const frame = this.heads[h];
    const size = frame.size;
    const R = BLOOM.disc.radius * size;
    const first = this.layout.bracts[h];
    const n = SAMPLES.bract;
    const rand = random(0.271 + h * 0.37);
    for (let row = 0; row < B.rows; row += 1) {
      const q = B.rows > 1 ? row / (B.rows - 1) : 0;
      for (let j = 0; j < B.count; j += 1) {
        const phi = ((j + 0.5 * row + 0.2 * rand()) / B.count) * TAU;
        const angle = pair(B.angle, q) + (rand() - 0.5) * 0.15;
        const length = pair(B.length, q) * size * (0.9 + 0.2 * rand());
        const radial: Vec3 = [Math.cos(phi), Math.sin(phi), 0];
        const way: Vec3 = [radial[0] * Math.sin(angle), radial[1] * Math.sin(angle), Math.cos(angle)];
        const face: Vec3 = [radial[0] * Math.cos(angle), radial[1] * Math.cos(angle), -Math.sin(angle)];
        const across: Vec3 = [-radial[1], radial[0], 0];
        const start: Vec3 = [radial[0] * R * (0.78 - 0.1 * q), radial[1] * R * (0.78 - 0.1 * q), -(0.0018 + 0.0016 * q) * size];
        const w = normalize([...toWorld(frame, way)].map((v, c) => v - frame.origin[c]) as Vec3);
        const l = normalize([...toWorld(frame, across)].map((v, c) => v - frame.origin[c]) as Vec3);
        const f = normalize([...toWorld(frame, face)].map((v, c) => v - frame.origin[c]) as Vec3);
        const half = B.halfWidth * size;
        const at = first + (row * B.count + j) * n;
        for (let i = 0; i < n; i += 1) {
          const u = i / (n - 1);
          /* Its tip a little lifted off the receptacle. */
          const p = add(add(toWorld(frame, start), w, length * u), f, -0.0008 * size * u * u);
          const width = half * rayWidth(u, { widest: 0.4, claw: 0.75, tip: 1.3 });
          this.write(at + i, p[0], p[1], p[2], width, l[0], l[1], l[2], Math.min(1 / (R * 0.9), 2.4 / Math.max(width, 1e-4)), f[0], f[1], f[2], 0);
        }
      }
    }
  }

  /**
   * THE SIDE SHOOT on one stem, cut a few centimetres out (the reference's
   * twig at the right): leaving the stem toward its head, at an angle to
   * it and rising off the top, a stiff fork bowing a little under its own
   * weight. Written from its cut, so its first ring closes it as a stem's
   * does.
   */
  private poseShoot(stems: Spine[]): void {
    const S = BLOOM.stem.shoot;
    const stem = stems[S.stem];
    const n = stem.points.length;
    const i = Math.round((1 - S.at) * (n - 1));
    const p = stem.points[i];
    const toward = normalize([stem.points[i + 1][0] - stem.points[i - 1][0], 0, stem.points[i + 1][2] - stem.points[i - 1][2]]);
    /* Off to the back of the stem (away from the camera: it shows against
       the top's light, not lost in the face). */
    let side = normalize(cross([0, 1, 0], toward));
    if (side[2] < 0) side = [-side[0], -side[1], -side[2]];
    const level = normalize(add(toward, side, Math.tan(S.angle)));
    const way = normalize(add(level, [0, 1, 0], Math.tan(S.rise)));
    const end = add(p, way, S.length);
    end[1] -= 0.18 * S.length;
    const mid = add(p, way, 0.5 * S.length);
    const drawn = resample(curveThrough([end, mid, p]), SAMPLES.shoot).points;
    const radius = new Float32Array(SAMPLES.shoot);
    const points = drawn.map((q, k) => {
      radius[k] = S.radius * lerp(1, 1.3, k / (SAMPLES.shoot - 1));
      const out = [0, 0, 0];
      keepOff(q, radius[k], 0.002, out);
      return out as Vec3;
    });
    const [a, b] = [points[1], points[2]];
    points[0] = [a[0] + (a[0] - b[0]) * 0.05, a[1] + (a[1] - b[1]) * 0.05, a[2] + (a[2] - b[2]) * 0.05];
    radius[0] = 0;
    this.writeRound(this.layout.shoot, points, radius, [0, 1, 0]);
  }

  /**
   * THE TIE, as a strip of cloth is tied round two stems: wound round them
   * where they meet — the turns overlapping, each a little over the last,
   * pressed flat under them onto the stone — then knotted on top: the strip
   * crossing over itself, and the knot's own loop standing on it; and its
   * two tails let go from the knot.
   */
  private poseCloth(stems: Spine[]): void {
    const C = BLOOM.cloth;
    const W = C.wrap;
    const thick = C.thick;
    /* Where the stems pass the binding point, and which way they run. */
    const near = stems.map((stem) => {
      let best = 0;
      let d = Infinity;
      stem.points.forEach((p, i) => {
        const e = Math.hypot(p[0] - C.at[0], p[2] - C.at[1]);
        if (e < d) {
          d = e;
          best = i;
        }
      });
      const a = stem.points[Math.max(best - 1, 0)];
      const b = stem.points[Math.min(best + 1, stem.points.length - 1)];
      return { p: stem.points[best], t: normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), r: stem.radius[best] };
    });
    const centre: Vec3 = [0, 0, 0];
    let axis: Vec3 = [0, 0, 0];
    for (const s of near) {
      for (let c = 0; c < 3; c += 1) {
        centre[c] += s.p[c] / near.length;
        axis[c] += s.t[c] * Math.sign(s.t[0] || 1);
      }
    }
    axis = normalize([axis[0], 0, axis[2]]);
    const up: Vec3 = [0, 1, 0];
    const side = normalize(cross(up, axis));
    const r = near[0].r;
    const apart = Math.hypot(near[0].p[0] - near[1].p[0], near[0].p[2] - near[1].p[2]);
    /* The bundle's section: the two stems side by side. */
    const a0 = 0.5 * apart + r + W.stand + thick;
    const b0 = r + W.stand + thick;

    /* THE WRAP: a helix of the strip round the bundle, `turns` round, its
       width along the stems, ending on top where the knot is tied. */
    const wrap: Vec3[] = [];
    const n = SAMPLES.wrap;
    const sweep = W.turns * TAU;
    const endAngle = Math.PI / 2 + 2 * TAU;
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const theta = endAngle - sweep * (1 - u);
      const grow = 2.2 * thick * (u * W.turns);
      const off = W.pitch * W.turns * (u - 0.5);
      const p = add(add(add(centre, axis, off), side, (a0 + grow) * Math.cos(theta)), up, (b0 + grow) * Math.sin(theta));
      const q = [0, 0, 0];
      keepOff(p, thick, 0.0015, q);
      wrap.push(q as Vec3);
    }
    const outA = a0 + 2.2 * thick * W.turns;
    const outB = b0 + 2.2 * thick * W.turns;
    this.writeBand(this.layout.cloth[0], wrap, (i) => {
      const u = i / (n - 1);
      const theta = endAngle - sweep * (1 - u);
      return [side[0] * Math.cos(theta) * outB, Math.sin(theta) * outA, side[2] * Math.cos(theta) * outB];
    }, axis, C.halfWidth, 0);

    /* THE KNOT: the strip crossing over the wrap's top at a slant, and the
       knot's own loop standing on it, along the stems. */
    const K = C.knot;
    const slant = normalize(add(axis, side, 0.8));
    const slantSide = normalize(cross(up, slant));
    const crossing: Vec3[] = [];
    const m = SAMPLES.knot;
    for (let i = 0; i < m; i += 1) {
      const phi = lerp(-1.35, 1.35, i / (m - 1));
      const bulge = 1 + 0.25 * Math.cos(phi);
      crossing.push(add(add(centre, slantSide, (outA + 2 * thick) * 1.05 * Math.sin(phi)), up, (outB + 2.5 * thick) * bulge * Math.cos(phi)));
    }
    this.writeBand(this.layout.cloth[1], crossing, (i) => {
      const phi = lerp(-1.35, 1.35, i / (m - 1));
      return [slantSide[0] * Math.sin(phi), Math.cos(phi), slantSide[2] * Math.sin(phi)];
    }, slant, C.halfWidth * 0.8, 0);
    const rho = 0.5 * K.height;
    const hub = add(centre, up, outB + 3 * thick + 0.75 * rho);
    const loop: Vec3[] = [];
    for (let i = 0; i < m; i += 1) {
      const phi = lerp(-2.6, 2.6, i / (m - 1));
      /* A little flattened along the stems, and leaning back. */
      loop.push(add(add(add(hub, axis, 0.5 * K.length * Math.sin(phi)), up, rho * Math.cos(phi)), side, 0.3 * rho * Math.cos(phi)));
    }
    this.writeBand(this.layout.cloth[2], loop, (i) => {
      const phi = lerp(-2.6, 2.6, i / (m - 1));
      return [axis[0] * Math.sin(phi), Math.cos(phi), axis[2] * Math.sin(phi)];
    }, side, C.halfWidth * 0.75, 6);
    this.runs.push({ points: [add(centre, axis, -0.02), centre, add(centre, axis, 0.02)], radius: [outA, outA, outA] });

    /* THE TAILS, from the knot's front: the long one first. */
    C.tails.forEach((tail, k) => {
      const start = add(add(centre, side, outA * (k === 0 ? 0.7 : 0.4)), up, outB * 0.9 + (k === 0 ? 0 : 0.003));
      const from = k === 0 ? start : add(start, axis, -0.012);
      this.poseTail(tail, this.layout.cloth[PIECES.length + k], from);
    });
  }

  /**
   * A band of the cloth along `points`: its width along `across` (made
   * square to it), its face turned out (toward `out(i)`), `curl` its
   * margins' (1/m).
   */
  private writeBand(first: number, points: Vec3[], out: (i: number) => Vec3, across: Vec3, half: number, curl: number): void {
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const a = points[Math.max(i - 1, 0)];
      const b = points[Math.min(i + 1, n - 1)];
      const t = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const l = normalize(add(across, t, -dot(across, t)));
      let f = cross(t, l);
      if (dot(f, out(i)) < 0) f = [-f[0], -f[1], -f[2]];
      const p = points[i];
      this.write(first + i, p[0], p[1], p[2], half, l[0], l[1], l[2], curl, f[0], f[1], f[2], BLOOM.cloth.thick);
    }
  }

  /**
   * A tail of the cloth: drawn from the knot through its points, then laid
   * onto the stone from where it comes down to it — on the top, over the
   * arris, flat against the face — eased in, smoothed and laid again so it
   * follows the stone without kinks, its end peeling off it. Its flat side
   * turns from the knot's way to its end's, and to the stone's own where it
   * lies on it; its margins curl, less where it lies flat.
   */
  private poseTail(tail: ClothTail, first: number, start: Vec3): void {
    const n = SAMPLES.tail;
    const C = BLOOM.cloth;
    const R = tail.rest;
    let points = resample(curveThrough([start, ...tail.points.slice(1)]), n).points;
    const weight = new Float32Array(n);
    const peel = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      weight[i] = smoothstep(R.from - 0.08, R.from, s);
      peel[i] = R.to < 1 ? smoothstep(R.to, 1, s) : 0;
    }
    const lay = (pts: Vec3[]): Vec3[] =>
      pts.map((p, i) => {
        const w = weight[i] * (1 - 0.6 * peel[i]);
        if (w <= 0) return p;
        const q = onStone(p, C.thick + R.lift * peel[i] * peel[i]);
        return [lerp(p[0], q[0], w), lerp(p[1], q[1], w), lerp(p[2], q[2], w)];
      });
    points = lay(points);
    for (let pass = 0; pass < 3; pass += 1) {
      points = points.map((p, i) =>
        i === 0 || i === n - 1 ? p : ([0, 1, 2].map((c) => 0.25 * points[i - 1][c] + 0.5 * p[c] + 0.25 * points[i + 1][c]) as Vec3),
      );
      points = lay(points);
    }
    points = lay(resample(points, n).points);
    const [f0, f1] = tail.face.map((f) => normalize([...f] as Vec3));
    const half = C.halfWidth * tail.width;
    const run: Vec3[] = [];
    const runR: number[] = [];
    const runAt: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      const a = points[Math.max(i - 1, 0)];
      const b = points[Math.min(i + 1, n - 1)];
      const t = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const blend = smoothstep(0.05, 0.95, s);
      let f = normalize([lerp(f0[0], f1[0], blend), lerp(f0[1], f1[1], blend), lerp(f0[2], f1[2], blend)]);
      /* Lying on the stone, its face turned to the stone's (whichever side
         of it was already nearer). */
      const follow = weight[i] * (1 - peel[i]);
      if (follow > 0) {
        const m = stoneNormal(points[i]);
        const sign = dot(f, m) >= 0 ? 1 : -1;
        f = normalize([lerp(f[0], m[0] * sign, follow), lerp(f[1], m[1] * sign, follow), lerp(f[2], m[2] * sign, follow)]);
      }
      const along = dot(f, t);
      f = normalize([f[0] - t[0] * along, f[1] - t[1] * along, f[2] - t[2] * along]);
      const l = cross(f, t);
      /* Its margins curl, in soft folds along it, always up off the stone
         (curled into it, they were cut away); flatter where it lies, never
         flat: a strip of cloth keeps its creases. */
      const curl = tail.curl * (0.55 + 0.45 * Math.sin(s * 11 + first)) * (1 - 0.55 * follow);
      /* Torn, not cut: its width wanders along it, and spreads at its end
         where the threads let go. */
      const width = half * (0.92 + 0.08 * Math.sin(s * 17 + 2 * first) + 0.05 * Math.sin(s * 41 + first)) * (1 + 0.22 * smoothstep(0.82, 1, s));
      const p = points[i];
      this.write(first + i, p[0], p[1], p[2], width, l[0], l[1], l[2], curl, f[0], f[1], f[2], C.thick);
      if (i % 5 === 0 || i === n - 1) {
        run.push([p[0], p[1], p[2]]);
        runR.push(-half);
        runAt.push(i);
      }
    }
    this.runs.push({ points: run, radius: runR });

    /* As it lies: what its sway starts from and comes back to. */
    const along = new Float32Array(n);
    const gap = new Float32Array(n);
    const normal = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const p = points[i];
      if (i > 0) along[i] = along[i - 1] + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1], p[2] - points[i - 1][2]);
      const [g, m] = stoneGap(p);
      gap[i] = g;
      normal.set(m, i * 3);
    }
    const rest = this.data.slice(first * SAMPLE_FLOATS, (first + n) * SAMPLE_FLOATS);
    this.tails.push({ first, count: n, rest, along, gap, normal, shade: run, shadeAt: runAt });
  }
}

/**
 * A ray's outline: its half-width along it, as a share of its widest. A
 * narrow claw where it leaves the disc (the floret's tube), widening to
 * `widest`, then an end shaped by `tip` — rounded at 1, pointed above. (Its
 * three teeth are cut in the light stage.)
 */
export function rayWidth(s: number, t: { widest: number; claw: number; tip: number }): number {
  if (s <= t.widest) {
    const x = s / t.widest;
    return t.claw + (1 - t.claw) * Math.sin((Math.PI / 2) * x) ** 1.2;
  }
  const x = (s - t.widest) / (1 - t.widest);
  return Math.pow(Math.max(1 - Math.pow(x, t.tip * 2.2), 0), 1 / (t.tip * 2.2));
}
