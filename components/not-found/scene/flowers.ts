/**
 * ─── 404 · the hero's flowers, dead ───
 *
 * THE HERO'S OWN TWO CHAMOMILES AND THEIR CLOTH (2026-11-05, the user: "a
 * died version of exact hero section flower"): grown from the hero's seed,
 * built and posed by the hero's own code (hero/bloom/shape.ts grow,
 * buildMesh, Pose) — every head, ray, stem, the knot and both tails where
 * the hero lays them on the stone, drawn by the hero's own vertex and
 * fragment programs (hero/bloom/shaders/bloom.ts). What this adds is their
 * death, written into the pose once:
 *
 *   THE RAYS    reflexed — bent back toward the stem, as a chamomile's rays
 *               bend back as the head ages and then fall — the bend
 *               gathering toward the tip, a droop toward the ground on top
 *               of it, each ray its own amount; shrivelled to strands,
 *               rolled in along their length; laid on the stone where they
 *               fall onto it
 *   THE DISCS   shrunk as a dried receptacle shrinks
 *   THE STEMS   where they ran on over the stone's right corner, now
 *               broken away, they lie on the fracture and droop past it
 *
 * Their colours are dried ones (not-found.css: the dead petal, disc and
 * stem), read by the engine as the hero reads its own.
 */

import { buildMesh, grow, Pose, SAMPLE_FLOATS, SAMPLES, type Mesh, type Vec3 } from "@/components/hero/bloom/shape";
import { BLOOM } from "@/components/hero/bloom/optics";
import { STONE } from "@/components/hero/stone/optics";

import { BREAK, fractureAt } from "./ruin";

export const WILT = {
  /** How far each ray bends back toward its stem (rad), least and most:
   *  past flat, so the outer rays fall onto the stone round the head. */
  reflex: [0.95, 1.55] as const,
  /** How the bend gathers toward the tip: the claw holds, the strap goes. */
  curl: 1.6,
  /** A pull toward the ground on top of it (rad, at the tip). */
  droop: 0.35,
  /** A ray's width kept at its claw and at its tip: dried to a strand. */
  shrivel: [0.55, 0.24] as const,
  /** How far a dried ray rolls in across its width (rad of arc). */
  roll: 1.2,
  /** How much more it is creased along its midrib. */
  crease: 1.6,
  /** The disc's radius kept as the receptacle dries. */
  disc: 0.82,
  /** How far above the top a fallen ray lies (m): on it, never in it. */
  rest: 0.0012,
  /** Where a stem's resting on the fracture starts and is whole (m either
   *  side of where the break leaves the top), and how far off it it lies. */
  drape: { ease: 0.025, rest: 0.0015 },
} as const;

/** The stone's contact shade under the flowers and the cloth: at most this
 *  many tubes (scene/shaders/set.ts), every `every`th point of each run. */
export const SHADE = { most: 40, every: 5 } as const;

export interface DeadFlowers {
  readonly mesh: Mesh;
  /** The pose texture's floats (hero/bloom/shape.ts POSE_WIDTH a row). */
  readonly pose: Float32Array;
  readonly rows: number;
  /** The contact shade's tubes: (a, radius), (b, 0), two vec4 each. */
  readonly shade: Float32Array;
  readonly shadeCount: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** `v` turned by `angle` about the unit `axis` (Rodrigues). */
function turn(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return [v[0] * c + k[0] * s + axis[0] * d, v[1] * c + k[1] * s + axis[1] * d, v[2] * c + k[2] * s + axis[2] * d];
}

/** A small seeded generator (mulberry32): the same death every visit. */
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

/* Whether (x, z) is over the stone's top: its diamond plan. */
function overTop(x: number, z: number): boolean {
  return Math.abs(x - STONE.center[0]) / STONE.plan.across + Math.abs(z - STONE.center[1]) / STONE.plan.along <= 1;
}

/* Where a stem lies now that the corner it ran over is gone: on the
   fracture, and on down its slope past the corner. */
function draped(p: Vec3, radius: number): Vec3 {
  const D = WILT.drape;
  const t = smoothstep(BREAK.start - D.ease, BREAK.start + D.ease, p[0]);
  if (t <= 0) return p;
  const lie = fractureAt(p[0]) + radius + D.rest;
  return [p[0], lerp(p[1], Math.min(p[1], lie), t), p[2]];
}

export function deadFlowers(): DeadFlowers {
  const genome = grow(BLOOM.seed);
  const mesh = buildMesh(genome);
  const pose = new Pose(genome, mesh.layout);
  const d = pose.data;
  const L = mesh.layout;
  const at = (i: number): Vec3 => [d[i * SAMPLE_FLOATS], d[i * SAMPLE_FLOATS + 1], d[i * SAMPLE_FLOATS + 2]];
  const vec = (i: number, o: number): Vec3 => [d[i * SAMPLE_FLOATS + o], d[i * SAMPLE_FLOATS + o + 1], d[i * SAMPLE_FLOATS + o + 2]];
  const put = (i: number, o: number, v: Vec3) => {
    d[i * SAMPLE_FLOATS + o] = v[0];
    d[i * SAMPLE_FLOATS + o + 1] = v[1];
    d[i * SAMPLE_FLOATS + o + 2] = v[2];
  };
  const rnd = random(BLOOM.seed);
  const down: Vec3 = [0, -1, 0];

  /* ── The rays: reflexed, drooping, shrivelled, rolled ── */
  const n = SAMPLES.ray;
  genome.heads.forEach((rays, h) => {
    const frame = pose.heads[h];
    const facing: Vec3 = [frame.basis[6], frame.basis[7], frame.basis[8]];
    for (let k = 0; k < rays.length; k += 1) {
      const first = L.rays[h] + k * n;
      const reflex = lerp(WILT.reflex[0], WILT.reflex[1], rnd());
      const dir = normalize(sub(at(first + n - 1), at(first)));
      /* Back toward the stem: about the axis across the ray and its head's
         facing, the way that takes the ray behind the head. */
      let back = cross(facing, dir);
      back = length(back) > 1e-4 ? normalize(back) : [1, 0, 0];
      const sag = cross(dir, down);
      const sagAxis: Vec3 = length(sag) > 1e-4 ? normalize(sag) : back;
      let prev = at(first);
      let made = prev;
      for (let j = 1; j < n; j += 1) {
        const i = first + j;
        const s = j / (n - 1);
        const bend = reflex * Math.pow(s, WILT.curl);
        const fall = WILT.droop * s * s;
        const seg = sub(at(i), prev);
        prev = at(i);
        const u = turn(turn(seg, back, bend), sagAxis, fall);
        made = [made[0] + u[0], made[1] + u[1], made[2] + u[2]];
        /* Laid on the stone where it falls onto it. */
        const w = d[i * SAMPLE_FLOATS + 3] * lerp(WILT.shrivel[0], WILT.shrivel[1], s);
        if (overTop(made[0], made[2])) made[1] = Math.max(made[1], STONE.top + WILT.rest + w * 0.3);
        put(i, 0, made);
        put(i, 4, turn(turn(vec(i, 4), back, bend), sagAxis, fall));
        put(i, 8, turn(turn(vec(i, 8), back, bend), sagAxis, fall));
        d[i * SAMPLE_FLOATS + 3] = w;
        d[i * SAMPLE_FLOATS + 7] = (WILT.roll / Math.max(w, 1e-4)) * Math.sign(d[i * SAMPLE_FLOATS + 7] || 1);
        d[i * SAMPLE_FLOATS + 11] *= WILT.crease;
      }
      d[first * SAMPLE_FLOATS + 3] *= WILT.shrivel[0];
    }
  });

  /* ── The discs: dried, smaller ── */
  L.discs.forEach((first) => {
    for (let j = 0; j < SAMPLES.disc; j += 1) d[(first + j) * SAMPLE_FLOATS + 3] *= WILT.disc;
  });

  /* ── The stems and the side shoot: on the fracture past the break ── */
  const drapeRun = (first: number, count: number) => {
    for (let j = 0; j < count; j += 1) {
      const i = first + j;
      put(i, 0, draped(at(i), d[i * SAMPLE_FLOATS + 3]));
    }
  };
  L.stems.forEach((first) => drapeRun(first, SAMPLES.stem));
  drapeRun(L.shoot, SAMPLES.shoot);

  /* ── The contact shade: the runs the hero shades under (stems, wrap,
     tails), draped as the stems are, and each head as a ball ── */
  const tubes: number[] = [];
  const push = (a: Vec3, b: Vec3, r: number) => {
    if (tubes.length / 8 >= SHADE.most) return;
    tubes.push(a[0], a[1], a[2], r, b[0], b[1], b[2], 0);
  };
  pose.heads.forEach((frame) => push(frame.origin, frame.origin, frame.size * BLOOM.disc.radius));
  for (const run of pose.runs) {
    for (let j = 0; j + SHADE.every < run.points.length; j += SHADE.every) {
      const r = Math.abs(run.radius[j]);
      push(draped(run.points[j] as Vec3, r), draped(run.points[j + SHADE.every] as Vec3, r), r);
    }
  }

  return { mesh, pose: d, rows: L.rows, shade: new Float32Array(tubes), shadeCount: tubes.length / 8 };
}
