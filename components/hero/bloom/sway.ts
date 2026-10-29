/**
 * ─── Bloom · the cloth in the air ───
 *
 * The cloth's tails answer the visitor's hand (motion.ts SWAY): the air the
 * hand moves (atmosphere/hand.ts, on the CPU), read where each free part of
 * them hangs, leans it, lets it swing back, and runs a ripple along it.
 *
 * NOT A CLOTH SIMULATION. The tie is placed as the user's reference places
 * it, to the centimetre (optics.ts BLOOM.cloth), and a strip left to fall
 * under its own weight finds a shape of its own; so every sample keeps its
 * designed rest and moves only by what the air adds to it. Each FREE SPAN —
 * a run of a tail the stone does not hold (shape.ts TailRest: how far each
 * sample is off the stone, and whether the surface there carries its
 * weight) — is one damped spring for its end (or, held at both ends, its
 * middle), laid along it by its first bending shape: from where it hangs,
 * its share of the way out, a little more than straight; held at both ends,
 * half a sine, rocking across the plane it stands in. Each sample moves
 * square to the strip where it is, never along it; the ripple, and the
 * twist of its margins, are waves running out along it. So it keeps its
 * length to a fraction of a pixel.
 *
 * TOUCHING THE STONE: no sample comes nearer it than SWAY.clear (or its
 * rest, if that is nearer), along the stone's normal where it lies at rest:
 * a face and the top are flat, and over the arris it barely moves.
 *
 * COST: three springs on a fixed step, and the ~45 samples of the free
 * spans, frames and all, while they move (microseconds); in still air
 * nothing is written and nothing sent to the GPU (bloom.ts sends only the
 * cloth's rows when only the cloth moved).
 */

import type { AirAt } from "./bloom";
import { SWAY } from "./motion";
import { BLOOM } from "./optics";
import { POSE_ROW, SAMPLE_FLOATS, type Pose, type TailRest, type Vec3 } from "./shape";

const G = 9.81;
const TAU = 2 * Math.PI;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Span {
  readonly tail: number;
  /** Its samples (of its tail), from the one it hangs from to its last;
   *  its bending shape at each (0 at what holds it). */
  readonly from: number;
  readonly to: number;
  readonly shape: Float32Array;
  /** Where the air is read and the shape is 1 (m, world), the stone's
   *  normal there, and how far it may come toward it (m). */
  readonly anchor: Vec3;
  readonly normal: Vec3;
  readonly room: number;
  /** Hanging: the way it hangs, which it cannot be pushed along (pushed up
   *  it, it bows out). Held at both ends: across the plane it stands in,
   *  the only way it leans. */
  readonly axis: Vec3;
  readonly hangs: boolean;
  /** m of lean a radian; its swing's angular frequency. */
  readonly reach: number;
  readonly omega: number;
  /** Its end's offset (m) and velocity (m/s), and where the air holds it. */
  readonly q: Float64Array;
  readonly v: Float64Array;
  readonly target: Float64Array;
  /** The ripple: how much of it the air has swollen (0–1), and its two
   *  waves' phases. */
  swell: number;
  phase: number;
  twist: number;
}

export class ClothSway {
  /** The first row of the pose texture the tails are in: only these are
   *  sent when only the cloth moved. */
  readonly firstRow: number;
  private readonly pose: Pose;
  private readonly spans: Span[] = [];
  /* Per tail: its points this frame (m, three a sample: rest where nothing
     moves it), its margins' twist (radians a sample), its way along itself
     at rest (three a sample), and how far each sample is from the one
     before it (m). */
  private readonly points: Float32Array[];
  private readonly turn: Float32Array[];
  private readonly ways: Float32Array[];
  private readonly steps: Float32Array[];
  private readonly air: [number, number, number] = [0, 0, 0];
  private clock = 0;
  private moving = false;

  constructor(pose: Pose) {
    this.pose = pose;
    const tails = pose.tails;
    this.points = tails.map((tail) => restPoints(tail));
    this.turn = tails.map((tail) => new Float32Array(tail.count));
    this.ways = tails.map((tail, k) => {
      const p = this.points[k];
      const n = tail.count;
      const ways = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        const a = Math.max(i - 1, 0) * 3;
        const b = Math.min(i + 1, n - 1) * 3;
        ways.set(normalize([p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]), i * 3);
      }
      return ways;
    });
    this.steps = this.points.map((p, k) => {
      const steps = new Float32Array(tails[k].count);
      for (let i = 1; i < steps.length; i += 1) steps[i] = Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2], p[i * 3 + 2] - p[i * 3 - 1]);
      return steps;
    });
    this.firstRow = Math.floor(Math.min(...tails.map((t) => t.first)) / POSE_ROW);
    tails.forEach((tail, k) => this.findSpans(tail, k));
  }

  /**
   * Which of a tail is free: a sample is held where it lies on the stone
   * on a surface that carries its weight (SWAY.held), and where it leaves
   * the knot; a free span runs between what holds it.
   */
  private findSpans(tail: TailRest, k: number): void {
    const H = SWAY.held;
    const n = tail.count;
    const held = (i: number) =>
      i === 0 || (1 - smoothstep(H.gap[0], H.gap[1], tail.gap[i])) * smoothstep(H.up[0], H.up[1], tail.normal[i * 3 + 1]) >= 0.5;
    const p = this.points[k];
    const at = (i: number): Vec3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
    for (let i = 1; i < n; i += 1) {
      if (held(i)) continue;
      const from = i - 1;
      let last = i;
      while (last + 1 < n && !held(last + 1)) last += 1;
      /* Hanging from `from`, or held again past `last`. */
      const hangs = last === n - 1;
      const to = hangs ? last : last + 1;
      const length = tail.along[to] - tail.along[from];
      const shape = new Float32Array(to - from + 1);
      let anchor = to;
      for (let j = from; j <= to; j += 1) {
        const x = (tail.along[j] - tail.along[from]) / length;
        shape[j - from] = hangs ? Math.pow(x, 1.3) : Math.sin(Math.PI * x);
        if (!hangs && shape[j - from] > shape[anchor - from]) anchor = j;
      }
      const [a, b, m] = [at(from), at(to), at(anchor)];
      const chord: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const rise: Vec3 = [m[0] - a[0], m[1] - a[1], m[2] - a[2]];
      const axis = hangs ? normalize(chord) : normalize(cross(chord, rise));
      const gap = tail.gap[anchor];
      const S = SWAY.swing;
      this.spans.push({
        tail: k,
        from,
        to,
        shape,
        anchor: at(anchor),
        normal: [tail.normal[anchor * 3], tail.normal[anchor * 3 + 1], tail.normal[anchor * 3 + 2]],
        room: Math.max(gap - Math.min(gap, SWAY.clear), 0),
        axis,
        hangs,
        reach: hangs ? length : 0.5 * length,
        omega: Math.min(Math.sqrt((S.stiffness * G) / length), S.most),
        q: new Float64Array(3),
        v: new Float64Array(3),
        target: new Float64Array(3),
        swell: 0,
        phase: 0,
        twist: 0,
      });
      i = last;
    }
  }

  /**
   * Advances the cloth by `dt` seconds in the air the hand moves (`air`;
   * `gain` of the designed sway, 0 holds it still). True when its pose has
   * changed and must be sent to the GPU: while it moves visibly, and once
   * more when it comes to rest.
   */
  step(dt: number, air: AirAt | null, gain: number): boolean {
    const S = SWAY;
    const honoured = Math.min(dt, S.step.most);
    for (const s of this.spans) {
      let vx = 0;
      let vy = 0;
      if (air && gain > 0) {
        air(s.anchor, this.air);
        vx = this.air[0];
        vy = this.air[1];
      }
      const speed = Math.hypot(vx, vy);
      const v2 = speed * speed;
      const strength = v2 / (v2 + S.lean.half * S.lean.half);
      /* Where the air holds it: leaned its way, by an angle that grows as
         drag does and saturates. */
      const lean = S.lean.most * s.reach * gain * strength;
      const k = speed > 1e-6 ? lean / speed : 0;
      const t = s.target;
      t[0] = vx * k;
      t[1] = vy * k;
      t[2] = 0;
      const ax = s.axis;
      const along = t[0] * ax[0] + t[1] * ax[1] + t[2] * ax[2];
      const n = s.normal;
      if (s.hangs) {
        /* Never along the way it hangs: pushed up it, it bows out off the
           face instead; and it stands off the face in moving air. */
        const out = (along < 0 ? -along * S.lift : 0) + lean * S.billow;
        for (let c = 0; c < 3; c += 1) t[c] += -ax[c] * along + n[c] * out;
      } else {
        /* Only across its plane: it rocks about where it stands. */
        for (let c = 0; c < 3; c += 1) t[c] = ax[c] * along;
      }
      const tn = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
      if (tn < -s.room) for (let c = 0; c < 3; c += 1) t[c] += n[c] * (-s.room - tn);
      /* The ripple swells with the air at once, and dies after it slowly;
         quicker as the air quickens. */
      const follow = strength > s.swell ? S.follow.attack : S.follow.release;
      s.swell += (strength - s.swell) * (1 - Math.exp(-honoured / follow));
      const hz = S.ripple.hz[0] + (S.ripple.hz[1] - S.ripple.hz[0]) * s.swell;
      s.phase = (s.phase + TAU * hz * honoured) % TAU;
      s.twist = (s.twist + (TAU * hz * honoured) / S.ratio) % TAU;
    }

    /* The swing, on a fixed step. */
    this.clock += honoured;
    const h = S.step.dt;
    while (this.clock >= h) {
      this.clock -= h;
      for (const s of this.spans) swing(s, h);
    }

    /* How far it moves: its lean, its swing, its ripple. */
    const flutter = gain * (S.ripple.depth + S.ripple.twist * BLOOM.cloth.halfWidth);
    let most = 0;
    for (const s of this.spans) {
      most = Math.max(most, Math.hypot(s.q[0], s.q[1], s.q[2]), Math.hypot(s.v[0], s.v[1], s.v[2]) / s.omega, s.swell * flutter);
    }
    if (most >= S.visible) {
      this.write(gain);
      this.moving = true;
      return true;
    }
    if (this.moving) {
      this.restore();
      this.moving = false;
      return true;
    }
    return false;
  }

  /** Every free span posed: moved, rippled, kept off the stone, its frames
   *  turned with it. */
  private write(gain: number): void {
    const R = SWAY.ripple;
    const kappa = TAU / R.wavelength;
    const tails = this.pose.tails;
    for (const s of this.spans) {
      const tail = tails[s.tail];
      const p = this.points[s.tail];
      const turn = this.turn[s.tail];
      const way = this.ways[s.tail];
      const rest = tail.rest;
      const depth = gain * s.swell * R.depth;
      const twist = gain * s.swell * R.twist;
      for (let i = s.from; i <= s.to; i += 1) {
        const shape = s.shape[i - s.from];
        const o = i * SAMPLE_FLOATS;
        const x = tail.along[i] - tail.along[s.from];
        const ripple = depth * Math.pow(shape, 0.6) * Math.sin(kappa * x - s.phase);
        /* The ripple off its face where it hangs; across its plane where it
           stands as a loop (its face turns round the loop's fold, and
           rippled along that it stretched by up to 13%). */
        const rx = s.hangs ? rest[o + 8] : s.axis[0];
        const ry = s.hangs ? rest[o + 9] : s.axis[1];
        const rz = s.hangs ? rest[o + 10] : s.axis[2];
        /* The lean square to the strip where it is (its way along itself at
           rest): moved along itself, it would stretch. */
        const wx = way[i * 3];
        const wy = way[i * 3 + 1];
        const wz = way[i * 3 + 2];
        const qt = s.q[0] * wx + s.q[1] * wy + s.q[2] * wz;
        p[i * 3] = rest[o] + (s.q[0] - wx * qt) * shape + rx * ripple;
        p[i * 3 + 1] = rest[o + 1] + (s.q[1] - wy * qt) * shape + ry * ripple;
        p[i * 3 + 2] = rest[o + 2] + (s.q[2] - wz * qt) * shape + rz * ripple;
        turn[i] = twist * shape * Math.sin(0.7 * kappa * x - s.twist + 1.3);
      }
      /* Hanging, its length kept from where it hangs out to its end, each
         sample its own distance from the one before (follow the leader): it
         swings in an arc, its end rising as it goes out — without it, a
         full lean stretched its end by ~4%. */
      if (s.hangs) {
        const steps = this.steps[s.tail];
        for (let i = s.from + 1; i <= s.to; i += 1) {
          const dx = p[i * 3] - p[i * 3 - 3];
          const dy = p[i * 3 + 1] - p[i * 3 - 2];
          const dz = p[i * 3 + 2] - p[i * 3 - 1];
          const k = steps[i] / (Math.hypot(dx, dy, dz) || 1);
          p[i * 3] = p[i * 3 - 3] + dx * k;
          p[i * 3 + 1] = p[i * 3 - 2] + dy * k;
          p[i * 3 + 2] = p[i * 3 - 1] + dz * k;
        }
      }
      /* Kept off the stone, along its normal where it lies at rest. */
      for (let i = s.from; i <= s.to; i += 1) {
        const o = i * SAMPLE_FLOATS;
        const nx = tail.normal[i * 3];
        const ny = tail.normal[i * 3 + 1];
        const nz = tail.normal[i * 3 + 2];
        const gap = tail.gap[i];
        const off = (p[i * 3] - rest[o]) * nx + (p[i * 3 + 1] - rest[o + 1]) * ny + (p[i * 3 + 2] - rest[o + 2]) * nz;
        const short = Math.min(gap, SWAY.clear) - gap - off;
        if (short > 0) {
          p[i * 3] += nx * short;
          p[i * 3 + 1] += ny * short;
          p[i * 3 + 2] += nz * short;
        }
      }
    }
    /* Its frames from its new points, as shape.ts poseTail makes them: the
       face turned by the twist about the way along it, then made square to
       it again; across, the face × along. */
    const data = this.pose.data;
    for (const s of this.spans) {
      const tail = tails[s.tail];
      const p = this.points[s.tail];
      const turn = this.turn[s.tail];
      const rest = tail.rest;
      const n = tail.count;
      for (let i = s.from; i <= s.to; i += 1) {
        const a = Math.max(i - 1, 0) * 3;
        const b = Math.min(i + 1, n - 1) * 3;
        let tx = p[b] - p[a];
        let ty = p[b + 1] - p[a + 1];
        let tz = p[b + 2] - p[a + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const o = i * SAMPLE_FLOATS;
        const co = Math.cos(turn[i]);
        const si = Math.sin(turn[i]);
        let fx = rest[o + 8] * co - rest[o + 4] * si;
        let fy = rest[o + 9] * co - rest[o + 5] * si;
        let fz = rest[o + 10] * co - rest[o + 6] * si;
        const d = fx * tx + fy * ty + fz * tz;
        fx -= tx * d;
        fy -= ty * d;
        fz -= tz * d;
        const fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl;
        fy /= fl;
        fz /= fl;
        const w = (tail.first + i) * SAMPLE_FLOATS;
        data[w] = p[i * 3];
        data[w + 1] = p[i * 3 + 1];
        data[w + 2] = p[i * 3 + 2];
        data[w + 4] = fy * tz - fz * ty;
        data[w + 5] = fz * tx - fx * tz;
        data[w + 6] = fx * ty - fy * tx;
        data[w + 8] = fx;
        data[w + 9] = fy;
        data[w + 10] = fz;
      }
    }
    this.shade();
  }

  /** At rest again: the pose as it was written, exactly. */
  private restore(): void {
    this.pose.tails.forEach((tail, k) => {
      this.pose.data.set(tail.rest, tail.first * SAMPLE_FLOATS);
      restPoints(tail, this.points[k]);
    });
    this.shade();
  }

  /** The stone's contact shade under the tails, where they are now. */
  private shade(): void {
    this.pose.tails.forEach((tail, k) => {
      const p = this.points[k];
      tail.shadeAt.forEach((i, j) => {
        const point = tail.shade[j];
        point[0] = p[i * 3];
        point[1] = p[i * 3 + 1];
        point[2] = p[i * 3 + 2];
      });
    });
  }
}

/** One fixed step of a span's swing toward where the air holds it; it
 *  stops at the stone, never bounces off it. */
function swing(s: Span, h: number): void {
  const w = s.omega;
  const damp = 2 * SWAY.swing.damping * w;
  for (let c = 0; c < 3; c += 1) {
    s.v[c] += (w * w * (s.target[c] - s.q[c]) - damp * s.v[c]) * h;
    s.q[c] += s.v[c] * h;
  }
  const n = s.normal;
  const qn = s.q[0] * n[0] + s.q[1] * n[1] + s.q[2] * n[2];
  if (qn < -s.room) {
    const vn = s.v[0] * n[0] + s.v[1] * n[1] + s.v[2] * n[2];
    for (let c = 0; c < 3; c += 1) {
      s.q[c] += n[c] * (-s.room - qn);
      if (vn < 0) s.v[c] -= n[c] * vn;
    }
  }
}

/** A tail's points at rest (three floats a sample), into `out`. */
function restPoints(tail: TailRest, out: Float32Array = new Float32Array(tail.count * 3)): Float32Array {
  for (let i = 0; i < tail.count; i += 1) out.set(tail.rest.subarray(i * SAMPLE_FLOATS, i * SAMPLE_FLOATS + 3), i * 3);
  return out;
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
