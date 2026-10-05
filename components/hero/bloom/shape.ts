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
 *            twisted at the tip
 *   stems    in the world: thick, lens-shaped across, scalloped, swayed
 *   tube     in the world, from its stem to the flower's base
 *   style    in the flower's frame
 *
 * The heart's filaments, anthers and stigma lobes are too many and too fine
 * for spines: the vertex stage builds each from a few numbers (its angle,
 * length, where in the throat it is set) and the heart's state.
 *
 * GROWN PER VISIT. `grow(seed)` decides this visit's flower — how many
 * tepals, each one's length, width, angles, curl, twist and when it opens —
 * from the seed, on the golden-angle spiral a cactus flower's tepals stand
 * on. The stems are the plant's and do not change; the closed bud looks the
 * same on every visit, so the first paint (HeroStill) always matches.
 */

import { BLOOM, GOLDEN_ANGLE } from "./optics";
import { OPENING, SWAY } from "./motion";

export type Vec3 = [number, number, number];

/** Samples along each kind of spine. */
export const SAMPLES = { tepal: 14, stem: 64, tube: 32, style: 8 } as const;
/** The pose texture: this many samples a row, three texels each. */
export const POSE_ROW = 64;
export const POSE_WIDTH = POSE_ROW * 3;
/** Floats a sample: three RGBA texels. */
const SAMPLE_FLOATS = 12;

/** What a vertex is part of (shaders/bloom.ts reads the same numbers). */
export const KIND = { tepal: 0, stem: 1, tube: 2, filament: 3, anther: 4, lobe: 5 } as const;

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
      cup: pair(T.cup, shape),
      crease: pair(T.crease, shape),
      twist: pair(T.twist, q) * (h3 * 2 - 1),
      sweep: (h4 - 0.5) * 0.35 * (1 - 0.6 * q),
      start: lerp(series.first, series.last, order) + (h1 - 0.5) * 2 * OPENING.stray,
      each: series.each * (0.9 + 0.2 * h2),
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

/* ── The mesh ─────────────────────────────────────────────────────────── */

/** Where each spine's samples begin in the pose texture. */
export interface Layout {
  readonly stems: readonly number[];
  readonly tube: number;
  readonly style: number;
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

/* Across a tepal: seven columns, closer at the margins where it curls. */
const TEPAL_ACROSS = [-1, -0.72, -0.38, 0, 0.38, 0.72, 1];
/* Across a stem: denser toward the rounded margin, where its thickness
   turns over (sin spacing). */
const STEM_ACROSS = Array.from({ length: 13 }, (_, i) => Math.sin(((i - 6) / 6) * (Math.PI / 2)));
/* Round the tube and the style: two vertices to each of its ridges. */
const ROUND = 18;
const FILAMENT_ALONG = 6;
const LOBE_ALONG = 4;

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
  const stems = BLOOM.stems.map(() => {
    const at = sample;
    sample += POSE_ROW;
    return at;
  });
  const tube = sample;
  sample += SAMPLES.tube;
  const style = sample;
  sample += SAMPLES.style;
  const tepals = sample;
  sample += genome.tepals.length * SAMPLES.tepal;
  const layout: Layout = { stems, tube, style, tepals, rows: Math.ceil(sample / POSE_ROW) };

  /* Stems: two faces, top and underside, meeting at the margin. */
  BLOOM.stems.forEach((stem, k) => {
    for (const side of [1, -1]) {
      const first = next;
      for (let i = 0; i < SAMPLES.stem; i += 1) {
        for (const u of STEM_ACROSS) {
          vertex(stems[k] + i, u, side, KIND.stem, i / (SAMPLES.stem - 1), stem.young, k / 3, 0);
        }
      }
      grid(first, SAMPLES.stem, STEM_ACROSS.length);
    }
  });

  /* The tube (world) and the style (the flower's frame): round. */
  for (const [at, count, space] of [[tube, SAMPLES.tube, 0], [style, SAMPLES.style, 1]] as const) {
    const first = next;
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j <= ROUND; j += 1) vertex(at + i, j / ROUND, 0, KIND.tube, i / (count - 1), space, 0, space);
    }
    grid(first, count, ROUND + 1);
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

/* ── The rest pose of the stems and their forms ──────────────────────── */

interface StemRest {
  /** Samples along it at equal steps of length: point, share, length. */
  readonly points: Vec3[];
  readonly length: number;
  /** Half-width, half-thickness and cross curvature at each sample. */
  readonly width: Float32Array;
  readonly thick: Float32Array;
  readonly cup: Float32Array;
}

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
  const { points, length } = resample(curveThrough(design.points), SAMPLES.stem);
  const width = new Float32Array(SAMPLES.stem);
  const thick = new Float32Array(SAMPLES.stem);
  const cup = new Float32Array(SAMPLES.stem);
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
    const notch = 1 - S.notch * blade * (1 - Math.pow(Math.abs(Math.sin(Math.PI * along)), 0.6));
    width[i] = Math.max(w * notch, 0.0004);
    /* Round where it leaves the root (as thick as it is wide), then a
       fleshy blade, thinning toward its tip. */
    const t = fleshy * lerp(1, 0.55, smoothstep(0.4, 1, s));
    thick[i] = lerp(Math.min(width[i], stalkRadius), Math.min(t, width[i] * 0.8), blade);
    /* Cupped a little along its midrib, and the blade undulating between
       the areoles: the margin rises and falls by about S.wave. */
    const wave = (2 * S.wave) / Math.max(width[i] * width[i], 1e-6);
    cup[i] = blade * (3 + Math.min(wave, 8) * Math.cos(Math.PI * along));
  }
  return { points, length, width, thick, cup };
}

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

const STEM_RESTS = BLOOM.stems.map((_, i) => restStem(i));

/* Where the tube leaves its stem: an areole on its stem's margin, at the
   sample nearest the tube's design point. */
const TUBE_ROOT = (() => {
  const rest = STEM_RESTS[BLOOM.tube.stem].points;
  let best = 0;
  let d = Infinity;
  rest.forEach((p, i) => {
    const e = Math.hypot(p[0] - BLOOM.tube.from[0], p[1] - BLOOM.tube.from[1], p[2] - BLOOM.tube.from[2]);
    if (e < d) {
      d = e;
      best = i;
    }
  });
  return best;
})();

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

/**
 * The pose, written straight into the texture's floats: no arrays made per
 * sample (a frame poses ~600 samples; made the plain way it cost ~0.8 ms of
 * the main thread).
 */
export class Pose {
  readonly data: Float32Array;
  readonly frame: FlowerFrame = { origin: [0, 0, 0], basis: new Float32Array(9), heart: 0 };
  /** The stems' spines this frame (world), for the contact shade. */
  readonly stemSpines: Vec3[][] = STEM_RESTS.map((r) => r.points.map((p) => [...p] as Vec3));
  private readonly genome: Genome;
  private readonly layout: Layout;
  private readonly tepals: TepalCache[];
  private readonly faces = BLOOM.stems.map((stem) => [normalize([...stem.face[0]] as Vec3), normalize([...stem.face[1]] as Vec3)]);

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
  }

  update(input: PoseInput): void {
    this.poseStems(input);
    this.poseFlower(input);
    this.poseTube();
    this.poseStyle();
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

  private poseStems(input: PoseInput): void {
    const n = SAMPLES.stem;
    STEM_RESTS.forEach((rest, k) => {
      const tip = input.stems[k] ?? [0, 0, 0];
      const spine = this.stemSpines[k];
      /* Bent as a cantilever from its root: the push grows with the square
         of the way along. */
      for (let i = 0; i < n; i += 1) {
        const s = i / (n - 1);
        const bend = s * s;
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
    const lift = smootherstep(OPENING.lift[0], OPENING.lift[1], open);
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

  private poseTube(): void {
    const T = BLOOM.tube;
    /* From an areole on the stem's margin, on the side toward the knee:
       its root sunk into the margin, where it tapers to nothing. */
    const o = (this.layout.stems[T.stem] + TUBE_ROOT) * SAMPLE_FLOATS;
    const d = this.data;
    const stem: Vec3 = [d[o], d[o + 1], d[o + 2]];
    const margin = d[o + 3] * 0.75;
    const side = Math.sign((T.knee[0] - stem[0]) * d[o + 4] + (T.knee[1] - stem[1]) * d[o + 5] + (T.knee[2] - stem[2]) * d[o + 6]) || 1;
    const from: Vec3 = [stem[0] + d[o + 4] * margin * side, stem[1] + d[o + 5] * margin * side, stem[2] + d[o + 6] * margin * side];
    /* The knee follows the head halfway. */
    const head = this.frame.origin;
    const knee: Vec3 = [
      T.knee[0] + 0.5 * (head[0] - BLOOM.center[0]),
      T.knee[1] + 0.5 * (head[1] - BLOOM.center[1]),
      T.knee[2] + 0.5 * (head[2] - BLOOM.center[2]),
    ];
    /* Into the flower along its axis, flaring into its throat at the
       tepals' ring: the cup has a floor. */
    const neck = this.toWorld([0, 0, -0.05 * SCALE]);
    const base = this.toWorld([0, 0, 0.002 * SCALE]);
    const { points } = resample(curveThrough([from, knee, neck, base], 40), SAMPLES.tube);
    let across = normalize(cross([0, 1, 0], normalize([knee[0] - from[0], knee[1] - from[1], knee[2] - from[2]])));
    const n = SAMPLES.tube;
    const throat = BLOOM.tepals.rim * 0.9 * SCALE;
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
        ) * smoothstep(0, 0.05, s);
      const p = points[i];
      this.write(this.layout.tube + i, p[0], p[1], p[2], r, across[0], across[1], across[2], 0, face[0], face[1], face[2], r);
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
        const theta = c.bud[i] + (c.open[i] - c.bud[i]) * w + quiver * s;
        const psi = t.sweep * w * s;
        const tau = (t.twist * s * s + turn * s) * w;
        if (i === 0) {
          const r = t.r0 + t.layer * (1 - w);
          px = cphi * r;
          py = sphi * r;
        }
        /* The plane it bends in, swept sideways by psi: its radial way
           (rx, ry, 0); across, square to that plane; its face (toward the
           flower's heart), the tangent × across. */
        const cps = Math.cos(psi);
        const sps = Math.sin(psi);
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
          const th2 = c.budMid[i] + (c.openMid[i] - c.budMid[i]) * w2 + quiver * s2;
          const ps2 = t.sweep * w2 * s2;
          const cp2 = Math.cos(ps2);
          const sp2 = Math.sin(ps2);
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
    const reach = length * lerp(0.84, 1, t.q);
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
