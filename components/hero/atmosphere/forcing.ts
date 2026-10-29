/**
 * ─── Atmosphere · forcing ───
 *
 * Everything that moves the air, evaluated once per FLUID STEP and packed
 * into the shaders' uniform arrays. Coordinates are grid cells, y up.
 * Nothing here draws a clearing or a curl; it only says where air is added,
 * where it is turned and where it is dragged. The fog does the rest.
 *
 *   breath  a divergence source: air added (a gust, the entrance, a puff)
 *   stir    turbulent energy put in (a touch)
 *   plume   a warm hand's thermal (the spell)
 *   wake    the hand's path (hover): entrainment and turbulence
 */

import { approach } from "@/components/ui/easing";

import { SPELL, WAKE } from "./motion";
import { MAX_BREATHS, MAX_STIRS } from "./shaders/fluid";

export interface BreathSpec {
  readonly sigma: number;
  /** Peak divergence per second at the centre. */
  readonly rate: number;
  readonly seconds: number;
}

export interface StirSpec {
  readonly sigma: number;
  /** Peak turbulent energy per second at the centre. */
  readonly energy: number;
  readonly seconds: number;
}

interface Pulse<T> {
  x: number;
  y: number;
  spec: T;
  age: number;
}

interface Spell {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  age: number;
  /** 1 while held; runs to 0 after letting go, so the warmth fades, not stops. */
  presence: number;
  releasing: boolean;
}

/** Uniform payload for one step, reused every step (no per-step allocation). */
export interface ForcingFrame {
  readonly breath: Float32Array;
  breathCount: number;
  readonly stir: Float32Array;
  stirCount: number;
  /** hand x, y, width, lift */
  readonly plume: Float32Array;
  /** height (widths), energy per second, thinning per second */
  readonly plumeShape: Float32Array;
  readonly wakeSegment: Float32Array;
  /** sigma (0: no hand), velocity x, velocity y (cells/s), speed 0–1 */
  readonly wake: Float32Array;
  /** The resting hand's thinning, per second (WAKE.presence; 0: no hand). */
  wakePresence: number;
}

export class Forcing {
  private breaths: Pulse<BreathSpec>[] = [];
  private stirs: Pulse<StirSpec>[] = [];
  private spell: Spell | null = null;

  /* The wake: where the cursor was at the start and end of this frame, and
     how long the frame was. */
  private wakeFrom: readonly [number, number] | null = null;
  private wakeTo: readonly [number, number] | null = null;
  private wakeSeconds = 1 / 60;

  /** Scales everything the visitor does. Tuned live; 1 = designed. */
  gain = { breath: 1, spell: 1, wake: 1 };

  readonly frame: ForcingFrame = {
    breath: new Float32Array(MAX_BREATHS * 4),
    breathCount: 0,
    stir: new Float32Array(MAX_STIRS * 4),
    stirCount: 0,
    plume: new Float32Array(4),
    plumeShape: new Float32Array(3),
    wakeSegment: new Float32Array(4),
    wake: new Float32Array(4),
    wakePresence: 0,
  };

  /** True while anything is still pushing on the air. */
  get busy(): boolean {
    return this.breaths.length > 0 || this.stirs.length > 0 || this.spell !== null;
  }

  get casting(): boolean {
    return this.spell !== null && !this.spell.releasing;
  }

  breathe(x: number, y: number, spec: BreathSpec): void {
    this.breaths.push({ x, y, spec, age: 0 });
    /* The oldest gives way when the table is full (one slot is the palm's). */
    if (this.breaths.length > MAX_BREATHS - 1) this.breaths.shift();
  }

  stir(x: number, y: number, spec: StirSpec): void {
    this.stirs.push({ x, y, spec, age: 0 });
    if (this.stirs.length > MAX_STIRS) this.stirs.shift();
  }

  beginSpell(x: number, y: number): void {
    this.spell = { x, y, targetX: x, targetY: y, age: 0, presence: 1, releasing: false };
  }

  moveSpell(x: number, y: number): void {
    if (!this.spell || this.spell.releasing) return;
    this.spell.targetX = x;
    this.spell.targetY = y;
  }

  /** Lets go. The warmth fades over `SPELL.releaseSeconds`; the air it
   *  set rising keeps rising a while on its own. */
  endSpell(): void {
    if (this.spell) this.spell.releasing = true;
  }

  /** The cursor's path this frame, for the wake. Null when not hovering. */
  setWake(from: readonly [number, number] | null, to: readonly [number, number] | null, seconds: number): void {
    this.wakeFrom = from;
    this.wakeTo = to;
    this.wakeSeconds = Math.max(seconds, 1e-3);
  }

  /**
   * Packs the forcing for sub-step `index` of `count` in this frame, each
   * `dt` long. Returns true if anything pushed on the air this step.
   */
  collect(index: number, count: number, dt: number): boolean {
    const f = this.frame;
    let breaths = 0;
    let stirs = 0;

    /* Raised cosine: every pulse swells and fades, never switches. */
    const envelope = (age: number, seconds: number) =>
      0.5 - 0.5 * Math.cos((2 * Math.PI * age) / seconds);

    this.breaths = age(this.breaths, dt);
    for (const b of this.breaths) {
      if (breaths >= MAX_BREATHS) break;
      const w = envelope(b.age, b.spec.seconds);
      put(f.breath, breaths++, b.x, b.y, b.spec.sigma, b.spec.rate * w * this.gain.breath);
    }

    this.stirs = age(this.stirs, dt);
    for (const s of this.stirs) {
      if (stirs >= MAX_STIRS) break;
      const w = envelope(s.age, s.spec.seconds);
      put(f.stir, stirs++, s.x, s.y, s.spec.sigma, s.spec.energy * w * this.gain.breath);
    }

    const spell = this.spell;
    let warmth = 0;
    if (spell) {
      spell.age += dt;
      /* The hand drags through the air rather than teleporting to the pointer. */
      spell.x = approach(spell.x, spell.targetX, SPELL.follow, dt);
      spell.y = approach(spell.y, spell.targetY, SPELL.follow, dt);
      if (spell.releasing) spell.presence -= dt / SPELL.releaseSeconds;
      warmth = spellRamp(spell.age) * Math.max(spell.presence, 0) * this.gain.spell;
      put(f.plume, 0, spell.x, spell.y, SPELL.width, SPELL.lift * warmth);
      if (spell.presence <= 0) this.spell = null;
    }
    f.plumeShape[0] = SPELL.height;
    f.plumeShape[1] = SPELL.energy * warmth;
    f.plumeShape[2] = SPELL.thinning * warmth;
    /* No hand held: no lift, but never a zero width (the shader divides by it). */
    if (warmth <= 0) put(f.plume, 0, f.plume[0], f.plume[1], SPELL.width, 0);

    /* The wake: this step's slice of the cursor's path. */
    let strength = 0;
    if (this.wakeFrom && this.wakeTo && this.gain.wake > 0) {
      const [x0, y0] = this.wakeFrom;
      const [x1, y1] = this.wakeTo;
      const t0 = index / count;
      const t1 = (index + 1) / count;
      put(
        f.wakeSegment, 0,
        x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0,
        x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1,
      );
      let vx = (x1 - x0) / this.wakeSeconds;
      let vy = (y1 - y0) / this.wakeSeconds;
      const speed = Math.hypot(vx, vy);
      if (speed > WAKE.maxSpeed) {
        vx *= WAKE.maxSpeed / speed;
        vy *= WAKE.maxSpeed / speed;
      }
      strength = (Math.min(speed, WAKE.maxSpeed) / WAKE.maxSpeed) * this.gain.wake;
      put(f.wake, 0, WAKE.sigma, vx * this.gain.wake, vy * this.gain.wake, strength);
      /* A resting hand still thins the fog under it (its presence). Only
         motion counts as activity, so a still cursor lets the air go calm. */
      f.wakePresence = WAKE.presence * this.gain.wake;
    } else {
      f.wake[0] = 0;
      f.wake[3] = 0;
      f.wakePresence = 0;
    }

    f.breathCount = breaths;
    f.stirCount = stirs;
    return breaths > 0 || stirs > 0 || warmth > 0 || strength > 1e-3;
  }

  /** Forgets everything in flight: a resize rebuilds the air. */
  reset(): void {
    this.breaths = [];
    this.stirs = [];
    this.spell = null;
    this.wakeFrom = null;
    this.wakeTo = null;
  }
}

/** Ages every pulse by `dt` and drops the spent ones, in place. */
function age<T extends { age: number; spec: { seconds: number } }>(list: T[], dt: number): T[] {
  let live = 0;
  for (const item of list) {
    item.age += dt;
    if (item.age < item.spec.seconds) list[live++] = item;
  }
  list.length = live;
  return list;
}

/** Writes one vec4 into a packed uniform array without allocating. */
function put(out: Float32Array, slot: number, x: number, y: number, z: number, w: number): void {
  const i = slot * 4;
  out[i] = x;
  out[i + 1] = y;
  out[i + 2] = z;
  out[i + 3] = w;
}

/** How established a spell is: smoothstep over `SPELL.ramp`. */
function spellRamp(age: number): number {
  const t = Math.min(Math.max(age / SPELL.ramp, 0), 1);
  return t * t * (3 - 2 * t);
}
