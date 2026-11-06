/**
 * ─── Water · the hand on it ───
 *
 * Where the pointer touches the lake (water/motion.ts HAND_RIPPLES): a
 * ring of the last few touches, each where it fell, when, and how hard,
 * packed each frame into the live ring trains — each touch, and its echoes
 * off the stone, mirrored in its two front faces when it falls — for their
 * own pass to draw (water/ripples.ts, shaders/ripples.ts).
 *
 * Nothing is allocated a frame, nothing is read back, and once the last
 * touch has died no train is live: the pass draws nothing and the lake's
 * programs read nothing.
 */

import { STONE } from "../stone/optics";
import { GRAVITY, HAND_RIPPLES } from "./motion";

const H = HAND_RIPPLES;
const N = H.count;
/* Where an image is put when a face does not see the touch: never inside
   any ring's reach. */
const NOWHERE = 1e4;
/* The longest drawn wave's wavenumber, and the band's soft edge below it
   (shaders/surface.ts handRing: drawn from 0.6 of it). */
const K_LONGEST = (2 * Math.PI) / H.wavelengths[1];
const K_SHORTEST = (2 * Math.PI) / H.wavelengths[0];
/* How fast a touch's leading ring runs out (m/s): the group speed of the
   longest wave drawn at all (½√(g/k)), and a little more. */
const REACH = 0.5 * Math.sqrt(GRAVITY / (0.6 * K_LONGEST)) + 0.02;

/** What the lake's programs read (shaders/surface.ts). */
export const HAND_LOOK = [K_LONGEST, K_SHORTEST, GRAVITY / 4, REACH] as const;

/** Ring trains drawn at most: every touch, and up to two echoes each for
 *  the ones near the stone. Past it the latest touches' echoes are left
 *  out (a pass along the stone's very front, longer than ~1.2 s). */
export const HAND_SOURCES = 48;
/* A train's kind, packed over its age (shaders/ripples.ts handSlope). */
const KIND = 100;

/* The stone's plan, as the lake's programs see it (uStonePlan): its
   centre, and its half-diagonals across and along the lens's axis. */
const [CX, CZ] = STONE.center;
const A = STONE.plan.across;
const B = STONE.plan.along;

/** The plan's diamond at a point relative to its centre: ≤ 1 inside. */
function reach(x: number, z: number): number {
  return Math.abs(x) / A + Math.abs(z) / B;
}

/**
 * Whether a straight line from (ax, az) to (bx, bz), relative to the
 * stone's centre, passes through its plan: the diamond's measure along it
 * is convex and piecewise straight, so its least is at an end or where the
 * line crosses an axis.
 */
export function crossesPlan(ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let least = Math.min(reach(ax, az), reach(bx, bz));
  if (dx !== 0) {
    const s = Math.min(1, Math.max(0, -ax / dx));
    least = Math.min(least, reach(ax + dx * s, az + dz * s));
  }
  if (dz !== 0) {
    const s = Math.min(1, Math.max(0, -az / dz));
    least = Math.min(least, reach(ax + dx * s, az + dz * s));
  }
  return least <= 1;
}

/* The two front faces (toward the camera), relative to the centre: a
   corner on each, and its outward normal. Front-left runs from (−A, 0) to
   (0, −B), front-right from (0, −B) to (A, 0). */
const SIDE = Math.hypot(A, B);
const FACES = [
  { x: -A, z: 0, nx: -B / SIDE, nz: -A / SIDE },
  { x: A, z: 0, nx: B / SIDE, nz: -A / SIDE },
] as const;

export class HandRipples {
  /** The live ring trains, packed for the lake's programs: where each
   *  starts (x, z: m), its age (s) plus 100 × its kind (0 a touch clear of
   *  the stone, 1 one near it, 2 and 3 its image behind the front-left and
   *  front-right face), its slope now. */
  readonly waves = new Float32Array(4 * HAND_SOURCES);
  /** How many of them are live. */
  count = 0;
  /** What they cover on the water: x, z least, x, z most. */
  readonly box = new Float32Array(4);
  /* Each touch: x, z (m), and its images behind the front-left and
     front-right faces (x, z each; far away where that face does not see
     it). */
  private readonly drops = new Float32Array(2 * N);
  private readonly echoes = new Float32Array(4 * N).fill(NOWHERE);
  /* Each touch's age and slope this frame (frame). */
  private readonly ages = new Float32Array(N);
  private readonly slopes = new Float32Array(N);
  private readonly born = new Float64Array(N).fill(-1e9);
  private readonly strength = new Float32Array(N);
  private next = 0;
  /* The last touch: where the pointer was on the screen (CSS px) and
     when (ms, the page's clock), and the lake's time it fell at. */
  private lastX = Number.NaN;
  private lastY = 0;
  private lastMs = 0;
  private lastFall = -1e9;

  /**
   * The pointer moved over the water: at (x, z) on it, at (px, py) on the
   * screen (CSS px), the lake's clock at `now` (s), the page's at `ms`.
   * A touch falls once it has travelled `spacing` since the last.
   */
  move(x: number, z: number, px: number, py: number, now: number, ms: number): void {
    if (Number.isNaN(this.lastX)) {
      this.lastX = px;
      this.lastY = py;
      this.lastMs = ms;
      return;
    }
    const travel = Math.hypot(px - this.lastX, py - this.lastY);
    if (travel < H.spacing || now - this.lastFall < H.gap) return;
    const seconds = Math.max((ms - this.lastMs) / 1000, 1 / 240);
    const strength = Math.min(1, Math.max(H.least, travel / seconds / H.fast));
    this.fall(x, z, now, strength);
    this.lastX = px;
    this.lastY = py;
    this.lastMs = ms;
  }

  /** The pointer left the water: the next touch starts a new trail. */
  lift(): void {
    this.lastX = Number.NaN;
  }

  private fall(x: number, z: number, now: number, strength: number): void {
    const i = this.next;
    this.next = (i + 1) % N;
    this.born[i] = now;
    this.lastFall = now;
    this.strength[i] = strength;
    this.drops[i * 2] = x;
    this.drops[i * 2 + 1] = z;
    /* Its image behind each front face that sees it. */
    const rx = x - CX;
    const rz = z - CZ;
    for (let f = 0; f < 2; f += 1) {
      const face = FACES[f];
      const out = (rx - face.x) * face.nx + (rz - face.z) * face.nz;
      const at = i * 4 + f * 2;
      if (out <= 0) {
        this.echoes[at] = this.echoes[at + 1] = NOWHERE;
        continue;
      }
      this.echoes[at] = x - 2 * out * face.nx;
      this.echoes[at + 1] = z - 2 * out * face.nz;
    }
  }

  /** The touches at the lake's time `now`: the live trains packed, the
   *  box they cover. Whether any lives. */
  frame(now: number): boolean {
    const box = this.box;
    box[0] = box[1] = Infinity;
    box[2] = box[3] = -Infinity;
    this.count = 0;
    for (let i = 0; i < N; i += 1) {
      const age = now - this.born[i];
      /* Drawn as if it fell `head` before (a hand is not a point), and
         landing over `land`. */
      const landed = Math.min(1, Math.max(0, age / H.land));
      const slope = H.slope * this.strength[i] * landed * landed * Math.exp(-age / H.life) / (1 + age / H.spread);
      const alive = age > 0 && slope > H.slope * 0.01;
      this.ages[i] = age + H.head;
      this.slopes[i] = alive ? slope : 0;
    }
    /* The touches first, then their echoes while there is room. */
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < N; i += 1) {
        const slope = this.slopes[i];
        if (slope <= 0) continue;
        const drawn = this.ages[i];
        const reach = drawn * REACH;
        const x = this.drops[i * 2];
        const z = this.drops[i * 2 + 1];
        const near = Math.hypot(x - CX, z - CZ) < reach + B;
        if (pass === 0) {
          this.add(x, z, drawn + KIND * (near ? 1 : 0), slope, reach);
          continue;
        }
        if (!near) continue;
        for (let f = 0; f < 2; f += 1) {
          const ex = this.echoes[i * 4 + f * 2];
          if (ex >= NOWHERE) continue;
          this.add(ex, this.echoes[i * 4 + f * 2 + 1], drawn + KIND * (2 + f), slope * H.echo, reach);
        }
      }
    }
    if (this.count === 0) {
      box[0] = box[1] = 1;
      box[2] = box[3] = 0;
    }
    return this.count > 0;
  }

  private add(x: number, z: number, packed: number, slope: number, reach: number): void {
    if (this.count >= HAND_SOURCES) return;
    const at = this.count * 4;
    this.waves[at] = x;
    this.waves[at + 1] = z;
    this.waves[at + 2] = packed;
    this.waves[at + 3] = slope;
    this.count += 1;
    const box = this.box;
    box[0] = Math.min(box[0], x - reach);
    box[1] = Math.min(box[1], z - reach);
    box[2] = Math.max(box[2], x + reach);
    box[3] = Math.max(box[3], z + reach);
  }
}
