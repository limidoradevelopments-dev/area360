/**
 * ─── Bloom · its shape ───
 *
 * The plant as surfaces swept along curves ("spines"). Each spine is a row
 * of samples — a point, the directions across it and off its face, its
 * half-width, how it is cupped across, how thick it is — and the mesh is a
 * fixed grid laid over those samples: the vertex stage (shaders/bloom.ts)
 * reads its sample and builds the surface there. So the mesh never changes
 * and the pose is a few kilobytes a frame:
 *
 *   tepals   in the flower's own frame (its axis z), posed by the opening
 *            and the air: a curve bent along its length, cupped across,
 *            twisted at the tip, its margin ruffled
 *   stems    in the world: thick, lens-shaped across, scalloped, swayed
 *   round    in the world: the tube from its stem to the flower's base,
 *            the second bud on its own short tube, the old stem and the
 *            roots (these two still); the style, in the flower's frame
 *   bracts   in the world: the small scales on the tube and round the
 *            second bud, made as tepals are
 *
 * The heart's filaments, anthers and stigma lobes are too many and too fine
 * for spines: the vertex stage builds each from a few numbers (its angle,
 * length, where in the throat it is set) and the heart's state. The moss is
 * a still mesh in the world, built here once.
 *
 * GROWN PER VISIT. `grow(seed)` decides this visit's flower — how many
 * tepals, each one's length, width, angles, curl, twist and when it opens —
 * from the seed, on the golden-angle spiral a cactus flower's tepals stand
 * on. The rest is the plant's and does not change; the closed bud looks the
 * same on every visit, so the first paint (HeroStill) always matches.
 */

import { STONE } from "../stone/optics";
import { OPENING, SWAY } from "./motion";
import { BLOOM, GOLDEN_ANGLE, type MossDesign, type StemDesign } from "./optics";

export type Vec3 = [number, number, number];

/** Samples along each kind of spine. */
export const SAMPLES = { tepal: 20, stem: 64, tube: 40, style: 8, trunk: 12, root: 20, budlet: 36, bract: 5 } as const;
/** The pose texture: this many samples a row, three texels each. */
export const POSE_ROW = 64;
export const POSE_WIDTH = POSE_ROW * 3;
/** Floats a sample: three RGBA texels. */
const SAMPLE_FLOATS = 12;

/** What a vertex is part of (shaders/bloom.ts reads the same numbers). */
export const KIND = { tepal: 0, stem: 1, round: 2, filament: 3, anther: 4, lobe: 5, moss: 7 } as const;
/** What a round spine is made of (shaders/bloom.ts reads the same numbers). */
export const MATTER = { tube: 0, style: 1, wood: 2, root: 3, bud: 4 } as const;

const SCALE = BLOOM.scale;
const TAU = Math.PI * 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Zero first and second derivative at both ends: a plant's creep has no
 *  start or stop to it. */
const smootherstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
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

/** A small seeded generator (mulberry32): the same seed, the same flower. */
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

/* ── This visit's flower ──────────────────────────────────────────────── */

interface Tepal {
  /** Its place on the spiral, 0 outermost … 1 innermost. */
  q: number;
  inner: boolean;
  phi: number;
  length: number;
  half: number;
  widest: number;
  claw: number;
  tip: number;
  base: number;
  end: number;
  curl: number;
  cup: number;
  crease: number;
  twist: number;
  /** How far it sweeps sideways off its plane (radians). */
  sweep: number;
  /** When it begins to open, and over how much of the opening. */
  start: number;
  each: number;
  /** Where it springs from, in the flower's frame. */
  r0: number;
  z0: number;
  /** In the bud: how far out it lies, over those inside it (m). */
  layer: number;
  /** Its own quiver's phase. */
  phase: number;
  hash: number;
}

export interface Genome {
  readonly seed: number;
  readonly tepals: readonly Tepal[];
  /** Each filament: its angle, its length and where in the throat it is
   *  set (shares), how much further it splays than its neighbours. */
  readonly filaments: Float32Array;
}

export function grow(seed: number): Genome {
  const rand = random(seed);
  const T = BLOOM.tepals;
  const [least, most] = T.count;
  const count = least + Math.floor(rand() * (most - least + 1));
  const spin = rand() * TAU;
  const tepals: Tepal[] = [];
  for (let j = 0; j < count; j += 1) {
    const q = j / (count - 1);
    const inner = q >= T.inner;
    const shape = smoothstep(0.18, 0.82, q);
    const h1 = rand();
    const h2 = rand();
    const h3 = rand();
    const h4 = rand();
    const jitter = pair(T.jitter, q);
    /* The outermost are short and sepal-like, growing to full length by
       the first third of the spiral. */
    const length = pair(T.length, q) * lerp(0.7, 1, smoothstep(0, 0.35, q)) * (0.9 + 0.2 * h1) * SCALE;
    const order = inner ? (q - T.inner) / (1 - T.inner) : q / T.inner;
    const series = inner ? OPENING.inner : OPENING.outer;
    tepals.push({
      q,
      inner,
      phi: j * GOLDEN_ANGLE + spin + (h2 - 0.5) * 0.18,
      length,
      half: pair(T.halfWidth, shape) * (0.85 + 0.3 * h3) * SCALE,
      widest: pair(T.widest, shape),
      claw: pair(T.claw, shape),
      tip: pair(T.tip, shape),
      base: pair(T.base, q) + (h4 - 0.5) * 2 * jitter,
      end: pair(T.end, q) + (h1 - 0.5) * 2 * jitter * 1.5,
      curl: pair(T.curl, q) * (0.55 + 0.9 * h2),
      cup: pair(T.cup, shape) / SCALE,
      crease: pair(T.crease, shape),
      twist: pair(T.twist, q) * (h3 * 2 - 1),
      sweep: (h4 - 0.5) * 0.35 * (1 - 0.6 * q),
      /* Never before the opening begins: the bud is the same on every
         visit, so the first paint (HeroStill) matches. */
      start: Math.max(lerp(series.first, series.last, order) + (h1 - 0.5) * 2 * OPENING.stray, 0),
      /* The outermost peel back quickest (OPENING.outer.quick), so the crown
         is seen opening within seconds; the cup and the heart keep their
         pace. */
      each: series.each * (0.9 + 0.2 * h2) * (inner ? 1 : lerp(OPENING.outer.quick, 1, order)),
      r0: T.rim * (inner ? 0.92 : 1.08) * SCALE,
      z0: -T.lower * (inner ? 0 : 1 - order) * SCALE,
      layer: (1 - q) * 0.0014 * SCALE,
      phase: rand() * TAU,
      hash: rand(),
    });
  }
  const H = BLOOM.heart;
  const filaments = new Float32Array(H.filaments * 4);
  for (let i = 0; i < H.filaments; i += 1) {
    /* Two series, as the flower has them: most set deep along the throat,
       the rest round its mouth, splaying wider. */
    const mouth = rand() < 0.4;
    filaments[i * 4] = i * GOLDEN_ANGLE * 3 + rand() * 0.3;
    filaments[i * 4 + 1] = rand();
    filaments[i * 4 + 2] = mouth ? 0.7 + 0.3 * rand() : 0.6 * rand();
    filaments[i * 4 + 3] = rand();
  }
  return { seed, tepals, filaments };
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

/**
 * A point laid onto the stone's rounded surface, `clearance` metres off it:
 * over the top, round the arris, down the face — wherever it is nearest.
 * What hugs the stone (the roots) is drawn roughly and laid on with this.
 */
export function onStone(p: readonly number[], clearance: number): Vec3 {
  const q = toPlan(p);
  const want = clearance * PLAN_PER_METRE;
  const e = 1e-4;
  for (let i = 0; i < 6; i += 1) {
    const d = stoneDistance(q);
    const g = normalize([
      stoneDistance([q[0] + e, q[1], q[2]]) - stoneDistance([q[0] - e, q[1], q[2]]),
      stoneDistance([q[0], q[1] + e, q[2]]) - stoneDistance([q[0], q[1] - e, q[2]]),
      stoneDistance([q[0], q[1], q[2] + e]) - stoneDistance([q[0], q[1], q[2] - e]),
    ]);
    q[0] += g[0] * (want - d);
    q[1] += g[1] * (want - d);
    q[2] += g[2] * (want - d);
  }
  return fromPlan(q);
}

/* ── The mesh ─────────────────────────────────────────────────────────── */

/** Where each spine's samples begin in the pose texture. */
export interface Layout {
  readonly stems: readonly number[];
  readonly tube: number;
  readonly style: number;
  readonly trunk: number;
  readonly roots: readonly number[];
  readonly budlet: number;
  /** The tube's bracts, then the second bud's: SAMPLES.bract each. */
  readonly bracts: number;
  readonly tepals: number;
  /** Rows of the pose texture in use. */
  readonly rows: number;
}

export interface Mesh {
  /** Per vertex: (sample, across, side, kind) then (along, share, hash, space). */
  readonly attributes: Float32Array;
  readonly indices: Uint16Array;
  /** The indices of the whole parts, which come first; the heart's threads
   *  and anthers after them are laid over (bloom.ts). */
  readonly opaque: number;
  readonly layout: Layout;
}

/* Across a tepal: nine columns, closer at the margins where it curls and
   ruffles. */
const TEPAL_ACROSS = [-1, -0.82, -0.58, -0.3, 0, 0.3, 0.58, 0.82, 1];
/* Across a bract: three. */
const BRACT_ACROSS = [-1, 0, 1];
/* Across a stem: denser toward the rounded margin, where its thickness
   turns over (sin spacing). */
const STEM_ACROSS = Array.from({ length: 13 }, (_, i) => Math.sin(((i - 6) / 6) * (Math.PI / 2)));
/* Round each round spine: vertices about its circumference. */
const AROUND = { tube: 18, style: 12, trunk: 18, root: 8, budlet: 14 } as const;
const FILAMENT_ALONG = 6;
const LOBE_ALONG = 4;
/* The moss: rings out from each cushion's middle, and spokes round it; then
   rings over its grit — the mat round the old stem's foot finely, the
   small cushions (a few centimetres, a few pixels) coarsely. */
const MOSS_MESH = { mat: { rings: 18, spokes: 64, grit: 5 }, small: { rings: 9, spokes: 36, grit: 3 } } as const;

const TUBE_BRACTS = BLOOM.tube.bracts.count;
const BUD_BRACTS = BLOOM.budlet.bracts;

export function buildMesh(genome: Genome): Mesh {
  const verts: number[] = [];
  const idx: number[] = [];
  let next = 0;
  const vertex = (sample: number, across: number, side: number, kind: number, along: number, share: number, hash: number, space: number) => {
    verts.push(sample, across, side, kind, along, share, hash, space);
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

  /* The pose texture's layout: whole rows for the stems, then the rest
     packed. */
  let sample = 0;
  const take = (count: number) => {
    const at = sample;
    sample += count;
    return at;
  };
  const stems = BLOOM.stems.map(() => take(POSE_ROW));
  const tube = take(SAMPLES.tube);
  const style = take(SAMPLES.style);
  const trunk = take(SAMPLES.trunk);
  const roots = BLOOM.roots.paths.map(() => take(SAMPLES.root));
  const budlet = take(SAMPLES.budlet);
  const bracts = take((TUBE_BRACTS + BUD_BRACTS) * SAMPLES.bract);
  const tepals = take(genome.tepals.length * SAMPLES.tepal);
  const layout: Layout = { stems, tube, style, trunk, roots, budlet, bracts, tepals, rows: Math.ceil(sample / POSE_ROW) };

  /* Stems: two faces, top and underside, meeting at the margin. The third
     number of the second attribute is where along its margin it is, in
     areoles (the shaders draw one at each whole number). */
  BLOOM.stems.forEach((stem, k) => {
    const lobes = STEM_RESTS[k].lobes;
    for (const side of [1, -1]) {
      const first = next;
      for (let i = 0; i < SAMPLES.stem; i += 1) {
        for (const u of STEM_ACROSS) {
          vertex(stems[k] + i, u, side, KIND.stem, i / (SAMPLES.stem - 1), stem.young, lobes[i], 0);
        }
      }
      grid(first, SAMPLES.stem, STEM_ACROSS.length);
    }
  });

  /* Round spines: the share is what it is made of. */
  const round = (at: number, count: number, around: number, matter: number, space: number) => {
    const first = next;
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j <= around; j += 1) vertex(at + i, j / around, 0, KIND.round, i / (count - 1), matter, 0, space);
    }
    grid(first, count, around + 1);
  };
  round(tube, SAMPLES.tube, AROUND.tube, MATTER.tube, 0);
  round(style, SAMPLES.style, AROUND.style, MATTER.style, 1);
  round(trunk, SAMPLES.trunk, AROUND.trunk, MATTER.wood, 0);
  for (const at of roots) round(at, SAMPLES.root, AROUND.root, MATTER.root, 0);
  round(budlet, SAMPLES.budlet, AROUND.budlet, MATTER.bud, 0);

  /* Bracts: small tepals in the world (space 0); a share below zero tells
     the light stage it is a bract. */
  for (let b = 0; b < TUBE_BRACTS + BUD_BRACTS; b += 1) {
    const first = next;
    for (let i = 0; i < SAMPLES.bract; i += 1) {
      for (const u of BRACT_ACROSS) vertex(bracts + b * SAMPLES.bract + i, u, 0, KIND.tepal, i / (SAMPLES.bract - 1), -1, (b * 0.618) % 1, 0);
    }
    grid(first, SAMPLES.bract, BRACT_ACROSS.length);
  }

  /* Tepals. */
  genome.tepals.forEach((t, k) => {
    const first = next;
    for (let i = 0; i < SAMPLES.tepal; i += 1) {
      for (const u of TEPAL_ACROSS) {
        vertex(tepals + k * SAMPLES.tepal + i, u, 0, KIND.tepal, i / (SAMPLES.tepal - 1), t.q, t.hash, 1);
      }
    }
    grid(first, SAMPLES.tepal, TEPAL_ACROSS.length);
  });

  /* The moss: still, in the world — its point and its normal ride in the
     attributes themselves, and how far out from its middle (past 1, its
     grit). Its rings closer toward the middle, where it climbs the old
     stem. */
  MOSS.forEach((cushion, k) => {
    const { rings, spokes, grit } = BLOOM.moss[k].collar ? MOSS_MESH.mat : MOSS_MESH.small;
    const first = next;
    for (let i = 0; i < rings + grit; i += 1) {
      const r = i < rings ? (i / (rings - 1)) ** 1.35 : 1 + (BLOOM.mossForm.grit * (i - rings + 1)) / grit;
      for (let j = 0; j <= spokes; j += 1) {
        const v = cushion.at(r, (j / spokes) * TAU);
        verts.push(v[0], v[1], v[2], KIND.moss, v[3], v[4], v[5], r);
        next += 1;
      }
    }
    grid(first, rings + grit, spokes + 1);
  });

  const opaque = idx.length;

  /* The heart: each filament a ribbon turned to the eye, its anther a
     small card at its tip; the stigma's lobes. Their numbers ride in the
     second attribute: angle, length share, throat share, splay. */
  const f = genome.filaments;
  const filamentCount = f.length / 4;
  for (let i = 0; i < filamentCount; i += 1) {
    const first = next;
    for (let a = 0; a < FILAMENT_ALONG; a += 1) {
      for (const u of [-1, 1]) vertex(i, u, a / (FILAMENT_ALONG - 1), KIND.filament, f[i * 4], f[i * 4 + 1], f[i * 4 + 2], f[i * 4 + 3]);
    }
    grid(first, FILAMENT_ALONG, 2);
    const card = next;
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      vertex(i, cx, cy, KIND.anther, f[i * 4], f[i * 4 + 1], f[i * 4 + 2], f[i * 4 + 3]);
    }
    idx.push(card, card + 1, card + 2, card + 2, card + 1, card + 3);
  }
  const lobes = BLOOM.heart.lobes[0];
  for (let i = 0; i < lobes; i += 1) {
    const first = next;
    const phi = (i / lobes) * TAU + 0.3;
    for (let a = 0; a < LOBE_ALONG; a += 1) {
      for (const u of [-1, 1]) vertex(i, u, a / (LOBE_ALONG - 1), KIND.lobe, phi, 0, 0, 0);
    }
    grid(first, LOBE_ALONG, 2);
  }

  if (next > 65535) throw new Error("bloom: mesh too large for 16-bit indices");
  return { attributes: new Float32Array(verts), indices: new Uint16Array(idx), opaque, layout };
}

/* ── The moss ─────────────────────────────────────────────────────────── */

/**
 * A cushion of moss on the top: an irregular outline, soft lumps a few
 * centimetres across (sharper ones stood up as spikes; the fur is the
 * light stage's), highest in the middle, thinning to its outline (a dome
 * to the last, it read as a heap set on the stone), climbing the old stem
 * where it comes up through it (`collar`), so the stems come out of the
 * moss and not out of a stalk above it. Past its outline, THE GRIT: a thin
 * layer of humus and grains it holds, thinning to nothing and sunk into
 * the stone at its edge (optics.ts BLOOM.mossForm) — what sets the clump
 * into the stone instead of on it. `at(r, theta)`: the point r of the way
 * out at angle theta (past 1: the grit), and its normal.
 */
function cushionOf(design: MossDesign, index: number) {
  const rand = random(0.311 + index * 0.137);
  const ph = Array.from({ length: 3 }, () => rand() * TAU);
  const lumpAt = Array.from({ length: 5 }, () => [rand(), rand(), 0.6 + 0.8 * rand()]);
  /* Its clumps: moss grows in cushions that run together, so its back is a
     row of soft rises, never one smooth slope (as one dome it read as a
     heap of earth): where each is (share of its spans), how wide (share),
     how high (share of its height). */
  const clumps = Array.from({ length: 6 }, () => {
    const a = rand() * TAU;
    const d = 0.75 * Math.sqrt(rand());
    return [Math.cos(a) * d, Math.sin(a) * d, 0.22 + 0.2 * rand(), 0.35 + 0.45 * rand()];
  });
  const [cx, cz] = design.center;
  const [rx, rz] = design.radius;
  const F = BLOOM.mossForm;
  const foot = BLOOM.trunk.points[0];
  const collar = design.collar;
  /* How far out its outline is at angle theta (share of its spans). */
  const outline = (theta: number) =>
    1 + 0.16 * Math.sin(3 * theta + ph[0]) + 0.09 * Math.sin(5 * theta + ph[1]) + 0.05 * Math.sin(9 * theta + ph[2]);
  const height = (x: number, z: number) => {
    const ex = (x - cx) / rx;
    const ez = (z - cz) / rz;
    const r = Math.hypot(ex, ez) / outline(Math.atan2(ez, ex));
    if (r >= 1) return F.gritHeight * (1 - smoothstep(1, 1 + F.grit, r)) - 0.0008 * smoothstep(1 + 0.6 * F.grit, 1 + F.grit, r);
    let lumps = 0;
    for (const [a, b, s] of lumpAt) lumps += Math.sin(x * 220 * s + a * TAU) * Math.sin(z * 160 * s + b * TAU);
    const up = collar ? collar.height * Math.exp(-((x - foot[0]) ** 2 + (z - foot[2]) ** 2) / collar.radius ** 2) : 0;
    let rises = 0;
    for (const [px, pz, w, h] of clumps) rises += h * Math.exp(-((ex - px) ** 2 + (ez - pz) ** 2) / (w * w));
    const body = Math.pow(1 - r * r, F.edge) * (0.55 + 0.6 * Math.min(rises, 1));
    return design.height * body * (1 + F.lumps * lumps) + up + F.gritHeight * r ** 4;
  };
  return {
    at(r: number, theta: number): number[] {
      const o = outline(theta) * r;
      const x = cx + rx * o * Math.cos(theta);
      const z = cz + rz * o * Math.sin(theta);
      const y = STONE.top + height(x, z);
      const e = 0.001;
      const n = normalize([-(height(x + e, z) - height(x - e, z)) / (2 * e), 1, -(height(x, z + e) - height(x, z - e)) / (2 * e)]);
      return [x, y, z, n[0], n[1], n[2]];
    },
  };
}
const MOSS = BLOOM.moss.map((m, i) => cushionOf(m, i));

/** The moss's cushions, for the contact shade and the fit: their middles
 *  on the top (x, z), their half-spans with their outline's wander and
 *  their grit (the contact shade takes the wander back out), and their
 *  heights with the collar (m). */
export const MOSS_BOUNDS = BLOOM.moss.map((m) => {
  const k = 1.3 * (1 + BLOOM.mossForm.grit);
  return { center: m.center, radius: [m.radius[0] * k, m.radius[1] * k] as const, height: m.height + (m.collar?.height ?? 0) };
});

/* ── The rest pose of the stems and their forms ──────────────────────── */

interface StemRest {
  /** Samples along it at equal steps of length: point, share, length. */
  readonly points: Vec3[];
  readonly length: number;
  /** Half-width, half-thickness and cross curvature at each sample. */
  readonly width: Float32Array;
  readonly thick: Float32Array;
  readonly cup: Float32Array;
  /** Where along its margin each sample is, in areoles. */
  readonly lobes: Float32Array;
  /** How far each sample is carried by the stem's sway (a share of its
   *  tip's): a cantilever's from its root, nothing where it rests on the
   *  stone, and from there again past it. */
  readonly sway: Float32Array;
  /** Where it lies flat against the stone: the stone's outward normal
   *  there, and how far its face is turned to it. */
  readonly normal: Vec3[];
  readonly follow: Float32Array;
}

/* Over what share of a stem's length it eases down onto the stone. */
const REST_EASE = 0.2;

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

function restStem(index: number): StemRest {
  const design = BLOOM.stems[index];
  const S = BLOOM.stem;
  const drawn = resample(curveThrough(design.points), SAMPLES.stem);
  const length = drawn.length;
  const width = new Float32Array(SAMPLES.stem);
  const thick = new Float32Array(SAMPLES.stem);
  const cup = new Float32Array(SAMPLES.stem);
  const lobes = new Float32Array(SAMPLES.stem);
  const [stalkShare, stalkRadius] = S.stalk;
  const young = design.young;
  /* This season's stem is thinner and narrower still. */
  const fullWidth = design.width;
  const fleshy = S.thick * lerp(1, 0.75, young);
  const phase = index * 1.7;
  for (let i = 0; i < SAMPLES.stem; i += 1) {
    const s = i / (SAMPLES.stem - 1);
    const a = s * length;
    const blade = smoothstep(stalkShare, stalkShare + 0.16, s);
    let w = lerp(stalkRadius, fullWidth, blade);
    /* A blunt, rounded tip: the blade's last part an ellipse's end. */
    if (s > S.tip) w *= Math.sqrt(Math.max(1 - ((s - S.tip) / (1 - S.tip)) ** 2, 0)) * 0.97 + 0.03;
    /* The areoles' notches along the margin, long shallow scallops between
       them; none on the round stalk. */
    const along = (a - stalkShare * length) / S.lobe + phase;
    lobes[i] = along;
    const notch = 1 - S.notch * blade * (1 - Math.pow(Math.abs(Math.sin(Math.PI * along)), 0.6));
    width[i] = Math.max(w * notch, 0.0004);
    /* Round where it leaves the old stem (as thick as it is wide), then a
       fleshy blade, thinning toward its tip. */
    const t = fleshy * lerp(1, 0.55, smoothstep(0.4, 1, s));
    thick[i] = lerp(Math.min(width[i], stalkRadius), Math.min(t, width[i] * 0.8), blade);
    /* Cupped a little along its midrib, and the blade undulating between
       the areoles: the margin rises and falls by about S.wave. */
    const wave = (2 * S.wave) / Math.max(width[i] * width[i], 1e-6);
    cup[i] = blade * (3 + Math.min(wave, 8) * Math.cos(Math.PI * along));
  }
  const { points, sway, normal, follow } = layOnStone(design, drawn.points, width, thick);
  return { points, length, width, thick, cup, lobes, sway, normal, follow };
}

/**
 * A stem laid onto the stone where it rests (optics.ts StemDesign `rest`):
 * drawn freely, then from `from` on brought down to it — its spine, flat
 * against a face or over an arris, or its lower margin, propped on edge on
 * the top — eased in, smoothed and laid again so it follows the stone
 * without kinks, `lift` off it (a tip peels away). Drawn as designed, they
 * hovered: 3 mm to 10 cm off the stone, with no shade under them (the
 * user's note of 2026-10-05: "its like floating").
 */
function layOnStone(design: StemDesign, drawn: Vec3[], width: Float32Array, thick: Float32Array) {
  const n = SAMPLES.stem;
  const R = design.rest;
  const sway = new Float32Array(n);
  const follow = new Float32Array(n);
  const weight = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const s = i / (n - 1);
    sway[i] = s * s;
    if (!R) continue;
    const w = smoothstep(R.from - REST_EASE, R.from, s);
    weight[i] = w;
    const peel = R.to < 1 ? smoothstep(R.to, 1, s) : 0;
    /* A cantilever's sway from its root; none where it rests; past that,
       its own, as short as its free end. */
    const free = R.to < 1 ? clamp01((s - R.to) / (1 - R.to)) ** 2 * (1 - R.to) : 0;
    sway[i] = (1 - w) * s * s + w * free;
    if (R.on === "spine") follow[i] = w * (1 - peel);
  }
  if (!R) return { points: drawn, sway, normal: drawn.map(() => [0, 1, 0] as Vec3), follow };

  const [f0, f1] = design.face.map((f) => normalize([...f] as Vec3));
  /* Which margin touches is chosen once, where it first comes down: chosen
     sample by sample, it switched sides over an arris and the blade folded
     over itself. */
  let side = 0;
  const lay = (points: Vec3[]): Vec3[] =>
    points.map((p, i) => {
      const w = weight[i];
      if (w <= 0) return p;
      const s = i / (n - 1);
      const lift = lerp(R.lift[0], R.lift[1], R.to < 1 ? smoothstep(R.to, 1, s) : 0);
      if (R.on === "spine") {
        const q = onStone(p, thick[i] + lift);
        return [lerp(p[0], q[0], w), lerp(p[1], q[1], w), lerp(p[2], q[2], w)];
      }
      /* Its margin nearer the stone onto it, the blade as it was drawn:
         across it as the pose has it (face × tangent), the face turning
         from the root's to the tip's. */
      const a = points[Math.max(i - 1, 0)];
      const b = points[Math.min(i + 1, n - 1)];
      const t = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const blend = smoothstep(0.1, 0.95, s);
      const f = normalize([lerp(f0[0], f1[0], blend), lerp(f0[1], f1[1], blend), lerp(f0[2], f1[2], blend)]);
      const across = normalize(cross(f, t));
      const edge = (sign: number): Vec3 => [p[0] + across[0] * width[i] * sign, p[1] + across[1] * width[i] * sign, p[2] + across[2] * width[i] * sign];
      if (side === 0) side = stoneDistance(toPlan(edge(1))) < stoneDistance(toPlan(edge(-1))) ? 1 : -1;
      const m = edge(side);
      const q = onStone(m, thick[i] * 0.6 + lift);
      return [p[0] + (q[0] - m[0]) * w, p[1] + (q[1] - m[1]) * w, p[2] + (q[2] - m[2]) * w];
    });
  let points = lay(drawn);
  for (let pass = 0; pass < 3; pass += 1) {
    points = points.map((p, i) =>
      i === 0 || i === n - 1 || weight[i] <= 0
        ? p
        : ([0, 1, 2].map((c) => 0.25 * points[i - 1][c] + 0.5 * p[c] + 0.25 * points[i + 1][c]) as Vec3),
    );
    points = lay(points);
  }
  /* Back to equal steps along it (the samples are shares of its length),
     and laid once more: the steps' chords cut into the stone over an
     arris. */
  points = lay(resample(points, n).points);
  return { points, sway, normal: points.map((p) => stoneNormal(p)), follow };
}

const STEM_RESTS = BLOOM.stems.map((_, i) => restStem(i));

/** The sample a share `at` of the way along a stem. */
const sampleAt = (at: number) => Math.round(at * (SAMPLES.stem - 1));

/* ── The still parts: the old stem, the roots ────────────────────────── */

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

/** A part that does not move: its spine, radii and frames. */
export interface Still {
  points: Vec3[];
  radius: Float32Array;
  across: Vec3[];
  face: Vec3[];
}

/* The old stem: flared where it comes out of the crack. */
const TRUNK: Still = (() => {
  const T = BLOOM.trunk;
  const { points } = resample(curveThrough(T.points), SAMPLES.trunk);
  const radius = new Float32Array(SAMPLES.trunk);
  for (let i = 0; i < SAMPLES.trunk; i += 1) {
    const s = i / (SAMPLES.trunk - 1);
    radius[i] = lerp(T.radius[0], T.radius[1], s) * (1 + 0.35 * (1 - smoothstep(0, 0.3, s)));
  }
  return { points, radius, ...frames(points, [1, 0, 0]) };
})();

/* The roots: drawn roughly (optics.ts), laid onto the stone, smoothed, and
   laid on again, so they follow it without kinks — half sunk into the grit
   where they leave the clump, touching the stone past it. */
const ROOTS: Still[] = BLOOM.roots.paths.map((path) => {
  const [r0, r1] = BLOOM.roots.radius;
  let { points } = resample(curveThrough(path), SAMPLES.root);
  const radius = new Float32Array(SAMPLES.root);
  const clear = new Float32Array(SAMPLES.root);
  for (let i = 0; i < SAMPLES.root; i += 1) {
    const s = i / (SAMPLES.root - 1);
    radius[i] = lerp(r0, r1, s) * (1 - 0.5 * smoothstep(0.85, 1, s));
    clear[i] = radius[i] * lerp(0.3, 1.05, smoothstep(0.15, 0.45, s));
  }
  for (let pass = 0; pass < 3; pass += 1) {
    points = points.map((p, i) => onStone(p, clear[i]));
    points = points.map((p, i) =>
      i === 0 || i === points.length - 1
        ? p
        : ([0, 1, 2].map((c) => 0.25 * points[i - 1][c] + 0.5 * p[c] + 0.25 * points[i + 1][c]) as Vec3),
    );
  }
  points = points.map((p, i) => onStone(p, clear[i]));
  return { points, radius, ...frames(points, [0, 1, 0]) };
});

/* ── The pose ─────────────────────────────────────────────────────────── */

/** What moves the plant this frame (bloom.ts integrates it). */
export interface PoseInput {
  /** The opening, 0 bud … 1 open (the visit's clock through OPENING). */
  open: number;
  /** The flower's head pushed by the air (m, world), and each stem's tip. */
  head: Vec3;
  stems: readonly Vec3[];
  /** How hard the air moves past the flower (m/s), for the tremble. */
  air: number;
  /** Seconds, for the tremble. */
  time: number;
}

/** The flower's frame this frame: where it is and how it faces. */
export interface FlowerFrame {
  origin: Vec3;
  /** Columns: across, up, and its axis (the way it faces). */
  basis: Float32Array;
  /** The heart's opening, 0–1, and the style's. */
  heart: number;
}

/**
 * Per tepal, what the pose needs that never changes in a visit — its outline
 * and its open angles at every sample and half-sample — and the bud's
 * profile under it, kept until the bud's swelling changes it.
 */
interface TepalCache {
  width: Float32Array;
  open: Float32Array;
  openMid: Float32Array;
  bud: Float32Array;
  budMid: Float32Array;
  budRadius: Float32Array;
  budAt: number;
  cos: number;
  sin: number;
}

/* The tube's bracts: where along it, which way round, how long (fixed: the
   plant's, not the visit's). */
const TUBE_BRACT_AT = (() => {
  const B = BLOOM.tube.bracts;
  const rand = random(0.713);
  return Array.from({ length: B.count }, (_, b) => {
    const s = lerp(B.from, B.to, (b + 0.3 + 0.4 * rand()) / B.count);
    const grown = (s - B.from) / (B.to - B.from);
    return { s, angle: b * GOLDEN_ANGLE * 2 + rand(), length: pair(B.length, grown) * SCALE * (0.8 + 0.4 * rand()) };
  });
})();

/** Where the second bud's body begins along its spine (share): the rest is
 *  its tube. */
export const BUDLET_BODY = (() => {
  const B = BLOOM.budlet;
  const reach = Math.hypot(B.reach[0], B.reach[1], B.reach[2]) + 0.4 * Math.hypot(B.bow[0], B.bow[1], B.bow[2]);
  return clamp01(1 - (B.length * SCALE) / reach);
})();

/**
 * The pose, written straight into the texture's floats: few arrays made
 * per sample (a frame poses ~1300 samples; made the plain way it cost
 * ~0.8 ms of the main thread for half as many).
 */
export class Pose {
  readonly data: Float32Array;
  readonly frame: FlowerFrame = { origin: [0, 0, 0], basis: new Float32Array(9), heart: 0 };
  /** The stems' spines this frame (world), for the contact shade. */
  readonly stemSpines: Vec3[][] = STEM_RESTS.map((r) => r.points.map((p) => [...p] as Vec3));
  /** The still parts — the old stem, then the roots — for the contact
   *  shade and the fit. */
  readonly stills: readonly Still[] = [TRUNK, ...ROOTS];
  private readonly genome: Genome;
  private readonly layout: Layout;
  private readonly tepals: TepalCache[];
  private readonly faces = BLOOM.stems.map((stem) => [normalize([...stem.face[0]] as Vec3), normalize([...stem.face[1]] as Vec3)]);
  /* The second bud's spine this frame, for its bracts. */
  private readonly budPoints: Vec3[] = Array.from({ length: SAMPLES.budlet }, () => [0, 0, 0] as Vec3);
  private readonly budRadius = new Float32Array(SAMPLES.budlet);

  constructor(genome: Genome, layout: Layout) {
    this.genome = genome;
    this.layout = layout;
    this.data = new Float32Array(layout.rows * POSE_WIDTH * 4);
    const n = SAMPLES.tepal;
    this.tepals = genome.tepals.map((t) => {
      const c: TepalCache = {
        width: new Float32Array(n),
        open: new Float32Array(n),
        openMid: new Float32Array(n),
        bud: new Float32Array(n),
        budMid: new Float32Array(n),
        budRadius: new Float32Array(n),
        budAt: -1,
        cos: Math.cos(t.phi),
        sin: Math.sin(t.phi),
      };
      const bend = lerp(0.85, 1.5, t.q);
      const angle = (s: number) => t.base + (t.end - t.base) * Math.pow(s, bend) + t.curl * Math.max((s - 0.6) / 0.4, 0) ** 2;
      for (let i = 0; i < n; i += 1) {
        const s = i / (n - 1);
        c.width[i] = t.half * tepalWidth(s, t);
        c.open[i] = angle(s);
        c.openMid[i] = angle((i + 0.5) / (n - 1));
      }
      return c;
    });
    /* The still parts, once. */
    this.writeStill(layout.trunk, TRUNK);
    ROOTS.forEach((root, k) => this.writeStill(layout.roots[k], root));
  }

  update(input: PoseInput): void {
    this.poseStems(input);
    this.poseFlower(input);
    this.poseTube();
    this.poseStyle();
    this.poseBudlet();
    this.poseTepals(input);
  }

  /* One sample: point, half-width; across, cup; face, thickness. */
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

  private writeStill(first: number, still: Still): void {
    still.points.forEach((p, i) => {
      const a = still.across[i];
      const f = still.face[i];
      const r = still.radius[i];
      this.write(first + i, p[0], p[1], p[2], r, a[0], a[1], a[2], 0, f[0], f[1], f[2], r);
    });
  }

  private poseStems(input: PoseInput): void {
    const n = SAMPLES.stem;
    STEM_RESTS.forEach((rest, k) => {
      const tip = input.stems[k] ?? [0, 0, 0];
      const spine = this.stemSpines[k];
      /* Bent as a cantilever from its root: the push grows with the square
         of the way along — held where it rests on the stone (StemRest
         sway). */
      for (let i = 0; i < n; i += 1) {
        const bend = rest.sway[i];
        const p = rest.points[i];
        spine[i][0] = p[0] + tip[0] * bend;
        spine[i][1] = p[1] + tip[1] * bend;
        spine[i][2] = p[2] + tip[2] * bend;
      }
      const [f0, f1] = this.faces[k];
      for (let i = 0; i < n; i += 1) {
        const s = i / (n - 1);
        const a = spine[Math.max(i - 1, 0)];
        const b = spine[Math.min(i + 1, n - 1)];
        let tx = b[0] - a[0];
        let ty = b[1] - a[1];
        let tz = b[2] - a[2];
        let l = Math.hypot(tx, ty, tz) || 1;
        tx /= l;
        ty /= l;
        tz /= l;
        /* Its flat side turns from the root's way to the tip's, square to
           the spine. */
        const blend = smoothstep(0.1, 0.95, s);
        let fx = lerp(f0[0], f1[0], blend);
        let fy = lerp(f0[1], f1[1], blend);
        let fz = lerp(f0[2], f1[2], blend);
        /* Lying flat against the stone, it turns its face to the stone's
           (whichever side of it was already nearer). */
        const turn = rest.follow[i];
        if (turn > 0) {
          const m = rest.normal[i];
          const side = fx * m[0] + fy * m[1] + fz * m[2] >= 0 ? 1 : -1;
          fx = lerp(fx, m[0] * side, turn);
          fy = lerp(fy, m[1] * side, turn);
          fz = lerp(fz, m[2] * side, turn);
        }
        const along = fx * tx + fy * ty + fz * tz;
        fx -= tx * along;
        fy -= ty * along;
        fz -= tz * along;
        l = Math.hypot(fx, fy, fz) || 1;
        fx /= l;
        fy /= l;
        fz /= l;
        const p = spine[i];
        this.write(
          this.layout.stems[k] + i,
          p[0], p[1], p[2], rest.width[i],
          fy * tz - fz * ty, fz * tx - fx * tz, fx * ty - fy * tx, rest.cup[i],
          fx, fy, fz, rest.thick[i],
        );
      }
    });
  }

  private poseFlower(input: PoseInput): void {
    const open = input.open;
    /* Its head begins to lift as soon as it opens (a smootherstep held it
       still for the first few seconds: the bloom read as starting late). */
    const lift = smoothstep(OPENING.lift[0], OPENING.lift[1], open);
    const rest = normalize([
      lerp(BLOOM.budFacing[0], BLOOM.facing[0], lift),
      lerp(BLOOM.budFacing[1], BLOOM.facing[1], lift),
      lerp(BLOOM.budFacing[2], BLOOM.facing[2], lift),
    ]);
    const head = input.head;
    /* Pushed, the head swings on its tube and tips the way it goes. */
    const tilt = 5;
    const f = normalize([rest[0] + head[0] * tilt, rest[1] + head[1] * tilt, rest[2] + head[2] * tilt]);
    const e1 = normalize(cross([0, 1, 0], f));
    const e2 = cross(f, e1);
    const frame = this.frame;
    frame.origin = [BLOOM.center[0] + head[0], BLOOM.center[1] + head[1], BLOOM.center[2] + head[2]];
    frame.basis.set([...e1, ...e2, ...f]);
    frame.heart = smootherstep(OPENING.heart[0], OPENING.heart[1], open);
  }

  /** A point of the flower's own frame, in the world. */
  toWorld(p: readonly number[]): Vec3 {
    const b = this.frame.basis;
    const o = this.frame.origin;
    return [
      o[0] + b[0] * p[0] + b[3] * p[1] + b[6] * p[2],
      o[1] + b[1] * p[0] + b[4] * p[1] + b[7] * p[2],
      o[2] + b[2] * p[0] + b[5] * p[1] + b[8] * p[2],
    ];
  }

  /**
   * An areole on a stem's margin this frame, a share `at` along it, on the
   * side toward `toward`: sunk a little into the margin, since what grows
   * from it tapers in.
   */
  private areole(stem: number, at: number, toward: readonly number[]): Vec3 {
    const o = (this.layout.stems[stem] + sampleAt(at)) * SAMPLE_FLOATS;
    const d = this.data;
    const margin = d[o + 3] * 0.75;
    const side = Math.sign((toward[0] - d[o]) * d[o + 4] + (toward[1] - d[o + 1]) * d[o + 5] + (toward[2] - d[o + 2]) * d[o + 6]) || 1;
    return [d[o] + d[o + 4] * margin * side, d[o + 1] + d[o + 5] * margin * side, d[o + 2] + d[o + 6] * margin * side];
  }

  private poseTube(): void {
    const T = BLOOM.tube;
    /* The knee follows the head halfway. */
    const head = this.frame.origin;
    const knee: Vec3 = [
      T.knee[0] + 0.5 * (head[0] - BLOOM.center[0]),
      T.knee[1] + 0.5 * (head[1] - BLOOM.center[1]),
      T.knee[2] + 0.5 * (head[2] - BLOOM.center[2]),
    ];
    const from = this.areole(T.stem, T.at, knee);
    /* Into the flower along its axis, flaring into its throat at the
       tepals' ring: the cup has a floor. */
    const neck = this.toWorld([0, 0, -0.05 * SCALE]);
    const base = this.toWorld([0, 0, 0.002 * SCALE]);
    const { points } = resample(curveThrough([from, knee, neck, base], 40), SAMPLES.tube);
    let across = normalize(cross([0, 1, 0], normalize([knee[0] - from[0], knee[1] - from[1], knee[2] - from[2]])));
    const n = SAMPLES.tube;
    const throat = BLOOM.tepals.rim * 0.9 * SCALE;
    const first = this.layout.tube;
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      const a = points[Math.max(i - 1, 0)];
      const b = points[Math.min(i + 1, n - 1)];
      const t = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      /* Carried along without turning about the tube (parallel
         transport), so its ridges run straight. */
      const along = dot(across, t);
      across = normalize([across[0] - t[0] * along, across[1] - t[1] * along, across[2] - t[2] * along]);
      const face = cross(t, across);
      /* Sunk to nothing in the stem's margin; a slender stalk thickening
         into the ovary, then the flower. */
      const r =
        lerp(
          lerp(T.radius[0], T.radius[1], smoothstep(0.45, 0.9, s)) * SCALE +
            0.0012 * SCALE * Math.exp(-(((s - 0.78) / 0.06) ** 2)),
          throat,
          smoothstep(0.88, 1, s) ** 1.5,
        ) * smoothstep(0, 0.04, s);
      const p = points[i];
      this.write(first + i, p[0], p[1], p[2], r, across[0], across[1], across[2], 0, face[0], face[1], face[2], r);
    }
    /* Its bracts, lying along it toward the flower, a little lifted. */
    const B = BLOOM.tube.bracts;
    TUBE_BRACT_AT.forEach((b, k) => this.bract(this.layout.bracts + k * SAMPLES.bract, first, n, b.s, b.angle, b.length, B.halfWidth * SCALE, 0.22, 0.6));
  }

  /**
   * A bract on round spine `spine` (`count` samples), at share `s` of it,
   * `angle` round it: a narrow scale `length` long, lying along it, tilted
   * out by `tilt` (radians) and wrapped by `wrap` of the spine's own
   * roundness.
   */
  private bract(sample: number, spine: number, count: number, s: number, angle: number, length: number, half: number, tilt: number, wrap: number): void {
    const d = this.data;
    const i = Math.min(Math.round(s * (count - 1)), count - 2);
    const o = (spine + i) * SAMPLE_FLOATS;
    const q = (spine + i + 1) * SAMPLE_FLOATS;
    const t = normalize([d[q] - d[o], d[q + 1] - d[o + 1], d[q + 2] - d[o + 2]]);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    /* Out from the spine there, and round it. */
    const out: Vec3 = [ca * d[o + 4] + sa * d[o + 8], ca * d[o + 5] + sa * d[o + 9], ca * d[o + 6] + sa * d[o + 10]];
    const round: Vec3 = [-sa * d[o + 4] + ca * d[o + 8], -sa * d[o + 5] + ca * d[o + 9], -sa * d[o + 6] + ca * d[o + 10]];
    const r = d[o + 3];
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const way: Vec3 = [t[0] * ct + out[0] * st, t[1] * ct + out[1] * st, t[2] * ct + out[2] * st];
    /* Its inner side faces the spine. */
    const face: Vec3 = [-(out[0] * ct - t[0] * st), -(out[1] * ct - t[1] * st), -(out[2] * ct - t[2] * st)];
    const n = SAMPLES.bract;
    for (let j = 0; j < n; j += 1) {
      const u = j / (n - 1);
      const lift = 0.0012 * SCALE * u * u;
      const px = d[o] + out[0] * (r * 0.9 + lift) + way[0] * length * u;
      const py = d[o + 1] + out[1] * (r * 0.9 + lift) + way[1] * length * u;
      const pz = d[o + 2] + out[2] * (r * 0.9 + lift) + way[2] * length * u;
      const w = half * tepalWidth(u, { widest: 0.3, claw: 0.7, tip: 1.5 });
      const cup = Math.min(wrap / Math.max(r, 0.001), 2.6 / Math.max(w, 1e-4));
      this.write(sample + j, px, py, pz, w, round[0], round[1], round[2], cup, face[0], face[1], face[2], 0);
    }
  }

  private poseStyle(): void {
    const H = BLOOM.heart;
    const reach = H.style[0] * SCALE * lerp(0.55, 1, this.frame.heart);
    const z0 = H.throat[0] * SCALE * 1.2;
    const n = SAMPLES.style;
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      /* It droops a little under the stigma, as in the second reference. */
      const r = H.style[1] * SCALE * lerp(1, 0.7, s);
      this.write(this.layout.style + i, 0, -0.1 * reach * s * s, z0 + (reach - z0) * s, r, 1, 0, 0, 0, 0, 1, 0, r);
    }
  }

  /**
   * The second bud: from its areole, drooping out and turning up, its
   * slender tube swelling into a spindle wrapped in narrow bracts. It rides
   * its stem's sway.
   */
  private poseBudlet(): void {
    const B = BLOOM.budlet;
    const o = (this.layout.stems[B.stem] + sampleAt(B.at)) * SAMPLE_FLOATS;
    const d = this.data;
    const tip: Vec3 = [d[o] + B.reach[0], d[o + 1] + B.reach[1], d[o + 2] + B.reach[2]];
    const from = this.areole(B.stem, B.at, tip);
    const bow: Vec3 = [from[0] + B.bow[0], from[1] + B.bow[1], from[2] + B.bow[2]];
    const end: Vec3 = [from[0] + B.reach[0], from[1] + B.reach[1], from[2] + B.reach[2]];
    const { points } = resample(curveThrough([from, bow, end], 32), SAMPLES.budlet);
    const n = SAMPLES.budlet;
    const body = BUDLET_BODY;
    const tube = B.tube * SCALE;
    const R = B.radius * SCALE;
    const { across, face } = frames(points, cross([0, 1, 0], normalize([end[0] - from[0], end[1] - from[1], end[2] - from[2]])));
    for (let i = 0; i < n; i += 1) {
      const s = i / (n - 1);
      let r: number;
      if (s < body) {
        r = tube * smoothstep(0, 0.06, s) * (1 + 0.5 * smoothstep(body - 0.2, body, s));
      } else {
        const x = (s - body) / (1 - body);
        const t0 = tube * 1.5;
        r = x < 0.42 ? t0 + (R - t0) * Math.sin((Math.PI / 2) * (x / 0.42)) : R * Math.pow(Math.max(Math.cos((Math.PI / 2) * ((x - 0.42) / 0.58)), 0), 0.75);
        r = Math.max(r, 0.0003);
      }
      const p = points[i];
      this.budPoints[i] = p;
      this.budRadius[i] = r;
      const a = across[i];
      const f = face[i];
      this.write(this.layout.budlet + i, p[0], p[1], p[2], r, a[0], a[1], a[2], 0, f[0], f[1], f[2], r);
    }
    /* Its bracts: from just under the body up most of its length, wrapped
       round it, their tips a little loose. */
    const first = this.layout.bracts + TUBE_BRACTS * SAMPLES.bract;
    const nb = SAMPLES.bract;
    for (let b = 0; b < BUD_BRACTS; b += 1) {
      const angle = (b / BUD_BRACTS) * TAU + 0.5;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      for (let j = 0; j < nb; j += 1) {
        const u = j / (nb - 1);
        const s = body - 0.02 + (1 - body) * (0.86 + 0.08 * ((b * 0.618) % 1)) * u;
        const i = Math.min(Math.round(s * (n - 1)), n - 1);
        const a = across[i];
        const f = face[i];
        const out: Vec3 = [ca * a[0] + sa * f[0], ca * a[1] + sa * f[1], ca * a[2] + sa * f[2]];
        const round: Vec3 = [-sa * a[0] + ca * f[0], -sa * a[1] + ca * f[1], -sa * a[2] + ca * f[2]];
        const r = this.budRadius[i] + 0.0004 + 0.0014 * SCALE * u * u * u;
        const p = this.budPoints[i];
        const w = Math.min((r * Math.PI) / BUD_BRACTS, 0.004 * SCALE) * 1.3 * tepalWidth(u, { widest: 0.4, claw: 0.5, tip: 1.6 });
        const cup = Math.min(1 / r, 2.6 / Math.max(w, 1e-4));
        this.write(first + b * nb + j, p[0] + out[0] * r, p[1] + out[1] * r, p[2] + out[2] * r, w, round[0], round[1], round[2], cup, -out[0], -out[1], -out[2], 0);
      }
    }
  }

  private poseTepals(input: PoseInput): void {
    const n = SAMPLES.tepal;
    const swell = smootherstep(OPENING.swell[0], OPENING.swell[1], input.open);
    const budRadius = BLOOM.bud.radius * SCALE * lerp(0.86, 1, swell);
    const budLength = BLOOM.bud.length * SCALE;
    const F = SWAY.flutter;
    const flutter = lerp(F.rest, F.most, smoothstep(0, F.full, input.air));
    const omega = 2 * Math.PI * F.hz;
    const time = input.time;
    const lag = OPENING.lag;
    /* The first sign (OPENING.stir): the outermost loosen at their tips off
       the bud before they open. */
    const stir = OPENING.stir;
    const stirred = smootherstep(0, stir.until, input.open) * stir.tip;
    const tepals = this.genome.tepals;
    for (let k = 0; k < tepals.length; k += 1) {
      const t = tepals[k];
      const c = this.tepals[k];
      if (c.budAt !== budRadius) {
        this.budProfile(t, c, budRadius, budLength);
        c.budAt = budRadius;
      }
      const opened = smootherstep(t.start, t.start + t.each, input.open);
      /* Its quiver: a lift and a turn, each on two incommensurate terms. */
      const quiver = flutter * opened * (Math.sin(time * omega + t.phase) + 0.6 * Math.sin(time * omega * 1.618 + 2.1 * t.phase));
      const turn = 0.7 * flutter * opened * Math.sin(time * omega * 0.84 + 1.3 * t.phase);
      const loose = stirred * Math.max(1 - t.q / stir.outer, 0);
      const da = t.length / (n - 1);
      const cphi = c.cos;
      const sphi = c.sin;
      let px = 0;
      let py = 0;
      let pz = t.z0;
      for (let i = 0; i < n; i += 1) {
        const s = i / (n - 1);
        /* Base first, tip after (OPENING.lag). */
        const w = smootherstep(0, 1, opened * (1 + lag) - lag * s);
        /* Loosened most at its tip; its own opening takes that over. */
        const theta = c.bud[i] + (c.open[i] - c.bud[i]) * w + quiver * s + loose * s * s * (1 - w);
        const psi = t.sweep * w * s;
        const tau = (t.twist * s * s + turn * s) * w;
        if (i === 0) {
          const r = t.r0 + t.layer * (1 - w);
          px = cphi * r;
          py = sphi * r;
        }
        /* The plane it bends in, swept sideways by psi: its radial way
           (rx, ry, 0); across, square to that plane; its face (toward the
           flower's heart), the tangent × across. (psi is under 0.2 rad: its
           cosine and sine to the cube, well under a micron off, and the
           frame's posing a third cheaper.) */
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
        const width = c.width[i];
        /* Wrapped round the bud, it is cupped to the bud's roundness; open,
           to its own. Never past ~150° each side. */
        const wrap = 1 / Math.max(c.budRadius[i] + t.layer, 0.002);
        const cup = Math.min(wrap + (t.cup - wrap) * w, 2.6 / Math.max(width, 1e-4));
        this.write(this.layout.tepals + k * n + i, px, py, pz, width, lx, ly, lz, cup, ax, ay, az, t.crease * w);
        /* Step to the next sample along the curve's mid-angle. */
        if (i < n - 1) {
          const s2 = (i + 0.5) / (n - 1);
          const w2 = smootherstep(0, 1, opened * (1 + lag) - lag * s2);
          const th2 = c.budMid[i] + (c.openMid[i] - c.budMid[i]) * w2 + quiver * s2 + loose * s2 * s2 * (1 - w2);
          const ps2 = t.sweep * w2 * s2;
          const cp2 = 1 - 0.5 * ps2 * ps2;
          const sp2 = ps2 - (ps2 * ps2 * ps2) / 6;
          const step = Math.sin(th2) * da;
          px += step * (cp2 * cphi - sp2 * sphi);
          py += step * (cp2 * sphi + sp2 * cphi);
          pz += Math.cos(th2) * da;
        }
      }
    }
  }

  /**
   * The bud's meridian under this tepal: the angle its spine makes with the
   * flower's axis at each sample (and half-sample), and the bud's radius
   * there. A spindle from the tepal's own root, widest at BLOOM.bud.widest,
   * closing to the point — the inner tepals to its very tip, the outer ones
   * a little short of it, so their tips lie on the bud as scales.
   */
  private budProfile(t: Tepal, c: TepalCache, radius: number, length: number): void {
    const n = SAMPLES.tepal;
    const widest = BLOOM.bud.widest;
    const r0 = t.r0 + t.layer;
    const peak = radius + t.layer;
    const end = 0.0015 * SCALE + t.layer * 2.5;
    /* Their tips spread along the bud, as a real one's scales lie: a ring of
       them at one height read as a torn paper edge. */
    const reach = length * lerp(0.68, 1, t.q) * (0.93 + 0.12 * t.hash);
    const meridian = (z: number) => {
      const x = z / reach;
      return x < widest
        ? r0 + (peak - r0) * Math.sin((Math.PI / 2) * (x / widest))
        : end + (peak - end) * Math.cos((Math.PI / 2) * Math.min((x - widest) / (1 - widest), 1));
    };
    /* Walked at equal steps of the tepal's own length, so it ends where
       the tepal does. */
    const da = t.length / (n - 1);
    let z = 0;
    for (let i = 0; i < n; i += 1) {
      const h = 0.002;
      const slope = (meridian(Math.min(z + h, reach)) - meridian(Math.max(z - h, 0))) / (2 * h);
      const angle = Math.atan(slope);
      c.bud[i] = angle;
      c.budRadius[i] = meridian(Math.min(z, reach));
      z += da * Math.cos(angle);
    }
    for (let i = 0; i < n - 1; i += 1) c.budMid[i] = 0.5 * (c.bud[i] + c.bud[i + 1]);
  }
}

/**
 * A tepal's outline: its half-width along it, as a share of its widest. A
 * narrow claw where it springs from the tube, widening to `widest`, then an
 * end shaped by `tip` — rounded at 1, pointed above.
 */
export function tepalWidth(s: number, t: { widest: number; claw: number; tip: number }): number {
  if (s <= t.widest) {
    const x = s / t.widest;
    return t.claw + (1 - t.claw) * Math.sin((Math.PI / 2) * x) ** 1.2;
  }
  const x = (s - t.widest) / (1 - t.widest);
  return Math.pow(Math.max(1 - Math.pow(x, t.tip), 0), 1 / t.tip) * (1 - 0.15 * x);
}

/**
 * The tip of filament `i` in the flower's frame, as the vertex stage puts
 * it (shaders/bloom.ts filamentAt): where the pollen is shaken from.
 */
export function antherAt(genome: Genome, i: number, heart: number, out: Vec3): Vec3 {
  const H = BLOOM.heart;
  const f = genome.filaments;
  const phi = f[i * 4];
  const length = pair(H.length, f[i * 4 + 1]) * SCALE;
  const throat = f[i * 4 + 2];
  const z = pair(H.throat, throat) * SCALE;
  const ring = H.ring * SCALE * lerp(0.7, 1.15, throat);
  const splay = lerp(0.05, pair(H.splay, throat) + (f[i * 4 + 3] - 0.5) * 0.2, heart);
  const r = ring + length * Math.sin(splay);
  out[0] = Math.cos(phi) * r;
  out[1] = Math.sin(phi) * r;
  out[2] = z + length * Math.cos(splay);
  return out;
}
