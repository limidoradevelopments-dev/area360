/**
 * ─── 404 · the ruin, as shapes ───
 *
 * THE HERO'S STONE, BROKEN (2026-11-05, the user: "the ruined version of
 * exactly our hero section stone"): its plan, its height, its rounded
 * arrises and its place are the hero's own (hero/stone/optics.ts STONE),
 * shaded by the hero's own granite (shaders/set.ts: hero shadeStone). What
 * this adds is the damage, in the world's metres:
 *
 *   THE BREAK   the top's right corner gone: a roughened plane through the
 *               top just right of the hero's knot and cloth (they stay on
 *               whole stone, as the hero lays them) and the right corner a
 *               quarter of a metre down
 *   THE BITES   where the break went into the right face as well: cavities
 *               in their own shade, clear of the cloth's tail
 *   THE CRACKS  dark lines down the faces (traced on the user's frame,
 *               carried onto the stone through the camera at rest)
 *   THE CHUNKS  what broke off and stayed: a slab on the fracture, a block
 *               tipping off the right edge, bits — none in the water (the
 *               user, 2026-11-05: no pieces floating on it)
 *
 * The flowers and the cloth are not here: they are the hero's own mesh
 * (flowers.ts). Emitted as rows of a texture for the set's distance field
 * (shaders/set.ts): fixed shapes, nothing sent per frame.
 */

import { STONE } from "@/components/hero/stone/optics";

type V3 = [number, number, number];

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: V3): V3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/* ── The stone's faces ──────────────────────────────────────────────── */

/* Its front corner on the water, and the outward normal of the right face
   (x, z): the plan is a diamond (hero/stone/optics.ts). */
const FRONT: [number, number] = [STONE.center[0], STONE.center[1] - STONE.plan.along];
const RIGHT_FACE = normalize([STONE.plan.along, 0, -STONE.plan.across]);
/* The right corner's x: where the break ends. */
const RIGHT_X = STONE.center[0] + STONE.plan.across;

/** A point on the right face, `s` of the way from the front corner to the
 *  right one, `y` up, `off` m out from it. */
function onRightFace(s: number, y: number, off: number): V3 {
  return [
    FRONT[0] + STONE.plan.across * s + RIGHT_FACE[0] * off,
    y,
    FRONT[1] + STONE.plan.along * s + RIGHT_FACE[2] * off,
  ];
}

/* ── The break ──────────────────────────────────────────────────────── */

/**
 * WHERE IT BREAKS: `from`, the share of the stone's width (left corner 0,
 * right 1) at which the fracture leaves the top — past the hero's knot
 * (0.72) and its cloth's tail (0.79 over the front-right edge), so both
 * lie on whole stone as the hero lays them; `depth`, how far below the top
 * it meets the right corner (m). Roughened by `rough` m of noise at `size`
 * cycles a metre (shaders/set.ts).
 */
export const BREAK_DESIGN = { from: 0.83, depth: 0.27, rough: [0.04, 0.014] as const, size: [8, 28] as const } as const;

const BREAK_X = STONE.center[0] - STONE.plan.across + 2 * STONE.plan.across * BREAK_DESIGN.from;
const BREAK_THROUGH: [V3, V3] = [[BREAK_X, STONE.top, 0], [RIGHT_X, STONE.top - BREAK_DESIGN.depth, 0]];
const BREAK_NORMAL = normalize([BREAK_THROUGH[0][1] - BREAK_THROUGH[1][1], BREAK_THROUGH[1][0] - BREAK_THROUGH[0][0], 0]);

export const BREAK = {
  normal: BREAK_NORMAL,
  offset: BREAK_NORMAL[0] * BREAK_THROUGH[0][0] + BREAK_NORMAL[1] * BREAK_THROUGH[0][1],
  /** Where it leaves the top (x, m). */
  start: BREAK_X,
} as const;

/** The fracture's height at `x` (m): where what lies on it rests. */
export const fractureAt = (x: number) => (BREAK.offset - BREAK.normal[0] * x) / BREAK.normal[1];

/* ── The bites ──────────────────────────────────────────────────────── */

interface Bite {
  at: V3;
  half: V3;
  turn: V3;
}

/* The right face's turn about the up axis: a bite's z along its normal. */
const FACE_YAW = (Math.atan2(RIGHT_FACE[0], RIGHT_FACE[2]) * 180) / Math.PI;

/* Under the break, right of the cloth's tail (it hangs at ~0.58 of the
   right face). */
const BITES: Bite[] = [
  { at: onRightFace(0.8, 0.34, 0.01), half: [0.075, 0.07, 0.065], turn: [FACE_YAW + 18, 14, 28] },
  { at: onRightFace(0.93, 0.22, 0.0), half: [0.06, 0.055, 0.06], turn: [FACE_YAW - 20, -10, 34] },
];

/* ── The cracks ─────────────────────────────────────────────────────── */

interface Crack {
  /** Its line on the faces (world, m): traced on the user's frame. */
  points: V3[];
  /** Its half-width at its start and at its end (m). */
  width: [number, number];
}

const CRACKS: Crack[] = [
  /* The main one: from the top, over the left face's top edge, down toward
     the front corner and on down it nearly to the water. */
  {
    points: [
      [-0.23, 0.544, 10.43], [-0.17, 0.544, 10.12], [-0.11, 0.544, 9.8],
      [-0.083, 0.545, 9.572], [-0.0765, 0.5163, 9.5571], [-0.0379, 0.4471, 9.4681], [-0.0126, 0.364, 9.4097],
      [0.0187, 0.3208, 9.3377], [0.0738, 0.2963, 9.2108], [0.0978, 0.2774, 9.1556], [0.104, 0.1904, 9.1689],
      [0.0978, 0.0697, 9.1556],
    ],
    width: [0.011, 0.0045],
  },
  /* Its branch, out across the left face. */
  {
    points: [[-0.0126, 0.3264, 9.4097], [-0.0507, 0.2545, 9.4976], [-0.1027, 0.2037, 9.6174], [-0.1426, 0.168, 9.7092], [-0.2246, 0.0813, 9.8983]],
    width: [0.0085, 0.003],
  },
  /* From the front corner onto the right face, toward the break. */
  {
    points: [[0.0978, 0.2897, 9.1556], [0.1485, 0.2901, 9.2713], [0.2138, 0.3252, 9.4218], [0.254, 0.3417, 9.5144], [0.3, 0.37, 9.62]],
    width: [0.008, 0.011],
  },
  /* Down the right face. */
  {
    points: [[0.2405, 0.3319, 9.4833], [0.2676, 0.2878, 9.5457], [0.3088, 0.227, 9.6407], [0.3368, 0.1296, 9.7052], [0.3438, 0.0629, 9.7214]],
    width: [0.0095, 0.0034],
  },
  /* A shorter one further along it, under the break. */
  {
    points: [[0.4525, 0.3, 9.9718], [0.4525, 0.2458, 9.9718], [0.4825, 0.1451, 10.0408], [0.5128, 0.0836, 10.1107]],
    width: [0.0085, 0.003],
  },
];

/* ── The chunks ─────────────────────────────────────────────────────── */

interface Chunk {
  at: V3;
  /** Half its size along its own axes (m). */
  half: V3;
  /** Its turn (degrees): about the up axis, then across, then along. */
  turn: V3;
  /** Its edges' radius (m). */
  round: number;
}

/* What broke off and stayed on the stone, lying on the fracture. */
const CHUNKS: Chunk[] = [
  { at: [0.49, fractureAt(0.49) + 0.05, 9.98], half: [0.085, 0.026, 0.07], turn: [24, 8, -22], round: 0.006 },
  { at: [0.575, fractureAt(0.575) + 0.07, 10.12], half: [0.062, 0.058, 0.066], turn: [-16, 9, -40], round: 0.008 },
  { at: [0.455, fractureAt(0.455) + 0.016, 10.16], half: [0.022, 0.015, 0.019], turn: [50, 10, -40], round: 0.004 },
  { at: [0.53, fractureAt(0.53) + 0.014, 10.3], half: [0.019, 0.014, 0.017], turn: [-20, 0, -42], round: 0.004 },
  { at: [0.51, fractureAt(0.51) + 0.012, 10.14], half: [0.017, 0.012, 0.015], turn: [10, 0, -35], round: 0.003 },
];

/* ── Emitted ────────────────────────────────────────────────────────── */

const f = (v: number) => {
  const s = v.toFixed(5);
  return s === "-0.00000" ? "0.00000" : s;
};

function rotation([yaw, pitch, roll]: V3): number[] {
  const r = (d: number) => (d * Math.PI) / 180;
  const cy = Math.cos(r(yaw)), sy = Math.sin(r(yaw));
  const cp = Math.cos(r(pitch)), sp = Math.sin(r(pitch));
  const cr = Math.cos(r(roll)), sr = Math.sin(r(roll));
  /* R = Ry · Rx · Rz; world → local is a dot with each row of Rᵀ, which
     are R's columns. */
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (a: number[], b: number[]) => {
    const o = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
    return o;
  };
  const R = mul(mul(Ry, Rx), Rz);
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}

function sphereOf(points: V3[], pad: number): [V3, number] {
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], p[k]);
    hi[k] = Math.max(hi[k], p[k]);
  }
  const c: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let r = 0;
  for (const p of points) r = Math.max(r, length(sub(p, c)));
  return [c, r + pad];
}

/** Everything the set's pictures must hold (world): the stone above the
 *  water, what lies on it (the hero's flowers, their stems past its right
 *  side) and what broke from it. */
export const SET_BOUNDS = (() => {
  const lo: V3 = [STONE.center[0] - STONE.plan.across - 0.02, -0.02, STONE.center[1] - STONE.plan.along - 0.05];
  const hi: V3 = [STONE.center[0] + STONE.plan.across + 0.16, STONE.top + 0.24, STONE.center[1] + STONE.plan.along + 0.02];
  return { lo, hi };
})();

/**
 * THE RUIN AS A TEXTURE, NOT AS CONSTANTS IN THE SHADER (2026-11-05,
 * measured): laid out as GLSL constant arrays, ~400 rows read by a changing
 * index, the set's program took 19 s to compile cold on Windows (Direct3D's
 * FXC, every Windows browser). As rows of an RGBA32F texture read by
 * texelFetch, the program holds only code. Rows of four floats,
 * `RUIN_WIDTH` a texture row; each table's first row is a constant of the
 * shader (RUIN_GLSL).
 */
export const RUIN_WIDTH = 64;

function emit(): { data: Float32Array; rows: number; glsl: string } {
  const rows: number[][] = [];
  const table = (list: number[][]) => {
    const at = rows.length;
    rows.push(...list);
    return at;
  };
  /* A box: its bounding sphere FIRST (one read tells a step it is far),
     then the rows of its turn, then its half-size and radius. */
  const box = (at: V3, half: V3, turn: V3, w: number) => {
    const m = rotation(turn);
    return [[at[0], at[1], at[2], length(half)], [m[0], m[1], m[2], 0], [m[3], m[4], m[5], 0], [m[6], m[7], m[8], 0], [half[0], half[1], half[2], w]];
  };
  const chunkAt = table(CHUNKS.flatMap((c) => box(c.at, c.half, c.turn, c.round)));
  const biteAt = table(BITES.flatMap((b) => box(b.at, b.half, b.turn, 0)));
  const crackAt = table(
    CRACKS.flatMap(({ points, width }) =>
      points.slice(0, -1).flatMap((a, k) => {
        const b = points[k + 1];
        const t0 = k / (points.length - 1);
        const t1 = (k + 1) / (points.length - 1);
        return [[a[0], a[1], a[2], width[0] + (width[1] - width[0]) * t0], [b[0], b[1], b[2], width[0] + (width[1] - width[0]) * t1]];
      }),
    ),
  );
  const [center, radius] = sphereOf(CHUNKS.map((c) => c.at), Math.max(...CHUNKS.map((c) => length(c.half))) + 0.004);
  const clusterAt = table([[center[0], center[1], center[2], radius]]);
  /* The box a ray must cross to meet what broke off (shaders/set.ts starts
     each ray at the nearest it enters of this and the stone's own prism). */
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const c of CHUNKS) {
    const r = length(c.half) + 0.012;
    for (const p of [add(c.at, [r, r, r]), add(c.at, [-r, -r, -r])]) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  const height = Math.ceil(rows.length / RUIN_WIDTH);
  const data = new Float32Array(RUIN_WIDTH * height * 4);
  rows.forEach((row, k) => data.set(row, k * 4));
  const glsl = [
    `const vec3 BREAK_NORMAL = vec3(${f(BREAK.normal[0])}, ${f(BREAK.normal[1])}, ${f(BREAK.normal[2])});`,
    `const float BREAK_OFFSET = ${f(BREAK.offset)};`,
    `const vec2 BREAK_ROUGH = vec2(${f(BREAK_DESIGN.rough[0])}, ${f(BREAK_DESIGN.rough[1])});`,
    `const vec2 BREAK_SIZE = vec2(${f(BREAK_DESIGN.size[0])}, ${f(BREAK_DESIGN.size[1])});`,
    `const int CHUNK = ${chunkAt};`,
    `const int BITE = ${biteAt};`,
    `const int CRACK = ${crackAt};`,
    `const int CLUSTER = ${clusterAt};`,
    `const vec3 CHUNKS_LO = vec3(${f(lo[0])}, ${f(lo[1])}, ${f(lo[2])});`,
    `const vec3 CHUNKS_HI = vec3(${f(hi[0])}, ${f(hi[1])}, ${f(hi[2])});`,
    `/* the ruin's rows (scene/engine.ts uploads RUIN_DATA) */`,
    `uniform sampler2D uRuin;`,
    `vec4 row(int k) {`,
    `  return texelFetch(uRuin, ivec2(k % ${RUIN_WIDTH}, k / ${RUIN_WIDTH}), 0);`,
    `}`,
  ].join("\n");
  return { data, rows: height, glsl };
}

const EMITTED = emit();

/** The ruin's constants and its row reader (shaders/set.ts). */
export const RUIN_GLSL = EMITTED.glsl;
/** Its rows, RGBA32F, `RUIN_WIDTH` × `RUIN_HEIGHT` texels. */
export const RUIN_DATA = EMITTED.data;
export const RUIN_HEIGHT = EMITTED.rows;

/** How many of each the set's loops run to (uniforms, so the compiler
 *  never pastes a loop out whole: shaders/set.ts). */
export const RUIN_COUNTS = {
  chunks: CHUNKS.length,
  bites: BITES.length,
  cracks: CRACKS.reduce((n, c) => n + c.points.length - 1, 0),
} as const;
