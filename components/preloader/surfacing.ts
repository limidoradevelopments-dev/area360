import { cubicBezier, type Easing } from "@/components/ui/easing";

import { PRELOADER_WORDS, type PreloaderSlot } from "./content";
import { BLUR, GOLDEN, PACE, REDUCED, REST, RHYTHM, SINE, SINK, SURFACE, type Curve } from "./motion";

/**
 * ─── Surfacing ───
 *
 * How the words come and go (motion.ts, THE IDEA), on Far Cry's rhythm
 * (RHYTHM), as Web Animations the compositor draws.
 *
 * A PLACE IS FOUR STACKS. The first holds the frame's own word: it surfaces
 * in the entrance's wave and sinks on the place's first beat, and is then
 * put away. The other three hold one word each, written once by the server
 * and never again — a turn is that word's stack surfacing; nothing is ever
 * written into a layer while the curtain stands (a write re-rasterises, and
 * its blur with it). Turn n surfaces just after beat n−1 and sinks on beat
 * n; the old word sinking and the new one surfacing cross in the blur.
 *
 * LAID ONCE, BEFORE ANYTHING MOVES. Each stack's turns are one repeating
 * animation per layer, and every animation of the curtain is made in one
 * task at its start, none given a start time: the browser starts them all
 * together once they have reached the compositor. Built turn by turn, every
 * turn cost the main thread a frame (~90 ms on a slow phone) and the
 * compositor waits for a commit it has been promised — the motion paused;
 * laid place by place after the entrance had begun, each task's commit still
 * stopped the compositor (100–250 ms with the CPU slowed 6×). Laid at once,
 * that cost falls before the first move, on the bare ground. A stack's
 * turns never touch (its next comes two beats on at least), so each repeats
 * from just before its first.
 *
 * Offsets are in em of the place's own size; times in seconds from the
 * curtain's start.
 */

export interface Stack {
  el: HTMLElement;
  /** Its word: an index into PRELOADER_WORDS. */
  word: number;
  echo: HTMLElement;
  /** The double the exit breathes out (the live one's loop is gone then). */
  out: HTMLElement;
  bands: { shear: HTMLElement; sharp: HTMLElement; soft: HTMLElement }[];
  anims: Animation[];
}

export interface Place {
  id: PreloaderSlot["id"];
  el: HTMLElement;
  /** The frame's word, for the entrance; then the three words. */
  entrance: Stack;
  stacks: Stack[];
  word: number;
  far: boolean;
  index: number;
}

/* ── Small maths ── */

/* The stride between places' draws: the golden ratio's square's fraction,
 * so one place's sequence is not a shifted copy of its neighbour's. */
const PLACE_STRIDE = 0.3819660112501051;
const frac = (x: number) => x - Math.floor(x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The `k`th golden draw for place `i` at turn `n`, in [0, 1). */
const draw = (n: number, i: number, k: number) => frac((n + 1) * GOLDEN + i * PLACE_STRIDE + k * GOLDEN * GOLDEN);
/** Seconds at 1× to seconds at the curtain's pace. */
const sec = (s: number) => s / PACE;
/** How much of a stratum the sharp copy carries when `c` of the old blur
 *  has cleared (motion.ts BLUR). */
const sharpShare = (c: number) => c * c;

/* Each curve as the CSS easing and the callable, from the same numbers. */
const css = (c: Curve) => `cubic-bezier(${c.join(", ")})`;
const STEP = "steps(1, end)";
const callables = new Map<string, Easing>();
function easeOf(name: string): Easing {
  let fn = callables.get(name);
  if (!fn) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(name);
    const [x1, y1, x2, y2] = m ? m[1].split(",").map(Number) : [0, 0, 1, 1];
    fn = name === STEP ? () => 0 : cubicBezier(x1, y1, x2, y2);
    callables.set(name, fn);
  }
  return fn;
}
const sinkFn = cubicBezier(...SINK.ease);

/* ── Curves: [time, value, easing] points; a value a number or a vector ── */

type Value = number | number[];
type Point = [number, Value, string?];

const mix = (a: Value, b: Value, e: number): Value =>
  Array.isArray(a) ? a.map((v, i) => v + ((b as number[])[i] - v) * e) : a + ((b as number) - a) * e;

function valueAt(points: Point[], t: number): Value {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0, e = "linear"] = points[i];
    const [t1, v1] = points[i + 1];
    if (t < t1) return t1 > t0 ? mix(v0, v1, e === "linear" ? (t - t0) / (t1 - t0) : easeOf(e)((t - t0) / (t1 - t0))) : v1;
  }
  return points[points.length - 1][1];
}

/** The curve up to `at`, exactly: an eased span cut through is resampled
 *  (its ease over the shortened span would be another curve). */
function cutAt(points: Point[], at: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const [t0, v0, e = "linear"] = points[i];
    if (t0 >= at) break;
    const next = points[i + 1];
    if (next && next[0] > at && e !== "linear") {
      out.push([t0, v0]);
      for (let j = 1; j < 4; j++) {
        const t = t0 + ((at - t0) * j) / 4;
        out.push([t, valueAt(points, t)]);
      }
    } else out.push(points[i]);
  }
  out.push([at, valueAt(points, at)]);
  return out;
}

/** A tween's curve as samples (for a word cut short, sinking from where it
 *  got to: a product of eases no one curve carries). */
function sampled(t0: number, d: number, fn: (u: number) => number, n = 5): Point[] {
  const out: Point[] = [];
  for (let j = 0; j <= n; j++) out.push([t0 + (d * j) / n, fn(j / n)]);
  return out;
}

type Frame = [number, string | number, string?];

/** Keyframes from points over `length` seconds, local to the animation. */
function keyframes(prop: "opacity" | "transform", points: readonly Frame[], length: number): Keyframe[] {
  const out: Keyframe[] = [];
  for (const [t, v, easing = "linear"] of points) {
    const offset = Math.min(1, Math.max(0, t / length));
    if (out.length && offset < (out[out.length - 1].offset as number)) continue;
    if (out.length && Math.abs((out[out.length - 1].offset as number) - offset) < 1e-7) out.pop();
    out.push({ offset, [prop]: v, easing });
  }
  if ((out[0].offset as number) > 0) out.unshift({ ...out[0], offset: 0 });
  if ((out[out.length - 1].offset as number) < 1) out.push({ ...out[out.length - 1], offset: 1, easing: "linear" });
  return out;
}

const translate = (v: Value) => {
  const [x, y] = v as number[];
  return `translate(${x.toFixed(4)}em, ${y.toFixed(4)}em)`;
};
const translateScale = (v: Value) => {
  const [x, y, s] = v as number[];
  return `translate(${x.toFixed(4)}em, ${y.toFixed(4)}em) scale(${s.toFixed(4)})`;
};

/* ── Durations at a place's pace ── */

const slowOf = (place: Place) => (place.far ? REST.farSlower : 1);

/** How long a word takes to surface, at a place's pace. */
export function surfaceSeconds(far: boolean, calm: boolean): number {
  if (calm) return REDUCED.wordSeconds;
  const strata = SURFACE.seconds + 2 * (SURFACE.perBand + SURFACE.lagPerBand);
  return sec(Math.max(strata, SURFACE.echo.seconds)) * (far ? REST.farSlower : 1);
}

function sinkSeconds(far: boolean, calm: boolean): number {
  if (calm) return REDUCED.wordSeconds;
  return sec(Math.max(SINK.seconds + 2 * SINK.perBand, SINK.echo.seconds)) * (far ? REST.farSlower : 1);
}

/* ── The markup ── */

function readStack(el: HTMLElement): Stack {
  const one = (selector: string) => el.querySelector<HTMLElement>(selector)!;
  return {
    el,
    word: Number(el.dataset.preloaderWord),
    echo: one("[data-preloader-echo]"),
    out: one("[data-preloader-out]"),
    bands: [...el.querySelectorAll<HTMLElement>("[data-preloader-band]")].map((band) => ({
      shear: band.querySelector<HTMLElement>("[data-preloader-shear]")!,
      sharp: band.querySelector<HTMLElement>('[data-preloader-ink="sharp"]')!,
      soft: band.querySelector<HTMLElement>('[data-preloader-ink="soft"]')!,
    })),
    anims: [],
  };
}

/** The places, read from the markup in the order the content lists them. */
export function readPlaces(root: HTMLElement, slots: readonly PreloaderSlot[]): Place[] {
  return slots.map((slot, index) => {
    const el = root.querySelector<HTMLElement>(`[data-preloader-slot="${slot.id}"]`)!;
    const stacks = [...el.querySelectorAll<HTMLElement>("[data-preloader-stack]")].map(readStack);
    return {
      id: slot.id,
      el,
      entrance: stacks[0],
      stacks: stacks.slice(1),
      word: slot.word,
      far: slot.far,
      index,
    };
  });
}

/* ── The engine ── */

interface Turn {
  n: number;
  /** When it surfaces and when it sinks, in seconds from the start. */
  s: number;
  k: number;
}

export class Surfacing {
  /** The document timeline's time the curtain's animations started at (ms),
   *  once the browser has started them. */
  private origin: number | null = null;
  private scoreAt = 0;
  private timers: number[] = [];
  private pending: (() => void)[] = [];
  private stopped = false;

  constructor(
    private readonly places: Place[],
    private readonly calm: boolean,
  ) {}

  /**
   * Everything laid now, in this task, with the curtain's other first
   * moves: the entrance's words, place k surfacing at `delays[k]` seconds
   * from the start, and Far Cry's rhythm from `scoreAt` on.
   */
  start(delays: readonly number[], scoreAt: number): void {
    this.scoreAt = scoreAt;
    this.places.forEach((place, k) => this.placeScore(place, delays[k]));
    /* Its start, once the browser has given it one: the timers below are
       counted from it. */
    const first = this.places[0].entrance.anims[0];
    void first?.ready.then(() => {
      if (this.stopped) return;
      this.origin = Number(first.startTime);
      for (const run of this.pending.splice(0)) run();
    });
  }

  /** Every clock stopped where it is, every timer cleared. */
  stop(): void {
    this.stopped = true;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }

  /** Everything this made, gone (an unmount). */
  dispose(): void {
    this.stop();
    for (const place of this.places) for (const stack of [place.entrance, ...place.stacks]) this.clear(stack);
  }

  /**
   * The clocks stopped and every word sunk from wherever it is, place k
   * starting `at[k]` seconds from now: the curtain's exit.
   */
  sinkAll(at: readonly number[]): void {
    this.stop();
    const K = SINK;
    const KE = K.echo;
    this.places.forEach((place, p) => {
      const slow = slowOf(place);
      for (const stack of [place.entrance, ...place.stacks]) {
        if (stack.el.hasAttribute("data-preloader-spent")) continue;
        /* Held where it stands: its values kept, its loops gone. */
        for (const a of stack.anims) {
          try {
            a.commitStyles();
          } catch {
            /* Not rendered: nothing to keep. */
          }
          a.cancel();
        }
        stack.anims = [];
        if (this.calm) {
          this.play(stack.el, [{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED.wordSeconds, delay: at[p], easing: css(SINE.inOut) }, stack);
          continue;
        }
        const em = parseFloat(getComputedStyle(stack.el).fontSize) || 16;
        let shown = false;
        stack.bands.forEach(({ shear, sharp, soft }, b) => {
          const sh0 = Number(getComputedStyle(sharp).opacity);
          const so0 = Number(getComputedStyle(soft).opacity);
          const o0 = sh0 + so0;
          if (o0 < 0.01) return;
          shown = true;
          const m = new DOMMatrixReadOnly(getComputedStyle(shear).transform);
          const d = sec(K.seconds) * slow;
          const delay = at[p] + sec(K.perBand * (2 - b)) * slow;
          const fall = this.fall(o0, Math.sqrt(sh0 / o0));
          this.play(shear, [{ transform: translate([m.m41 / em, m.m42 / em]), easing: css(K.ease) }, { transform: translate([K.shearEm[b], K.liftEm]) }], { duration: d, delay }, stack);
          const ink = (i: 0 | 1) => sampled(0, d, (u) => fall(sinkFn(u))[i]).map(([t, v]): Frame => [t, v as number]);
          this.play(sharp, keyframes("opacity", ink(0), d), { duration: d, delay }, stack);
          this.play(soft, keyframes("opacity", ink(1), d), { duration: d, delay }, stack);
        });
        /* Its double breathes out from where it stood. */
        const e0 = Number(getComputedStyle(stack.echo).opacity);
        if (!shown && e0 < 0.01) continue;
        stack.echo.style.opacity = "0";
        this.play(
          stack.out,
          [
            { opacity: e0, transform: translateScale([0, 0, 1]), easing: css(SINE.out) },
            { opacity: Math.max(e0, KE.peak), transform: translateScale([KE.toEm * KE.peakAt, KE.liftEm * KE.peakAt, 1]), offset: KE.peakAt, easing: css(SINE.in) },
            { opacity: 0, transform: translateScale([KE.toEm, KE.liftEm, 1]) },
          ],
          { duration: sec(KE.seconds) * slow, delay: at[p] },
          stack,
        );
      }
    });
  }

  /* ── Laying the rhythm ── */

  /** A place: the entrance's word, held to its first beat, then its turns
   *  on the word stacks. */
  private placeScore(place: Place, enterAt: number): void {
    const { moments, period } = this.momentsOf(place);
    const N = moments.length;
    const beat = (n: number) => this.scoreAt + moments[n % N] + Math.floor(n / N) * period;
    const sinkS = sinkSeconds(place.far, this.calm);
    const first = beat(0);
    this.lay(place, place.entrance, [{ n: 0, s: enterAt, k: first }], enterAt - 0.01, first + sinkS - enterAt + 0.1, true);
    /* Its part over, its layers go. */
    this.at(first + sinkS + 0.2, () => {
      this.clear(place.entrance);
      place.entrance.el.setAttribute("data-preloader-spent", "");
    });
    const overlap = sec(RHYTHM.overlap);
    const words = this.wordsOf(place, N);
    const turns = words.map((word, i) => ({ word, turn: { n: i + 1, s: beat(i) + overlap, k: beat(i + 1) } }));
    for (const stack of place.stacks) {
      const mine = turns.filter((t) => t.word === stack.word).map((t) => t.turn);
      if (mine.length) this.lay(place, stack, mine, mine[0].s - 0.01, period, false);
    }
  }

  /** A place's beats (seconds from the rhythm's start, over its loops),
   *  dropping any too soon after the one before for its two words to cross
   *  (the faint places sink slower). */
  private momentsOf(place: Place): { moments: number[]; period: number } {
    const R = RHYTHM;
    const loop = sec((R.loopMs / 1000) * R.stretch);
    const one = R.places[place.id]
      .map((ms) => sec((((ms - R.fromMs + R.loopMs) % R.loopMs) / 1000) * R.stretch))
      .sort((x, y) => x - y);
    const period = loop * R.loops;
    const all: number[] = [];
    for (let j = 0; j < R.loops; j++) for (const m of one) all.push(m + j * loop);
    const least = sinkSeconds(place.far, this.calm) - sec(R.overlap) + 0.05;
    const kept: number[] = [];
    for (const m of all) if (!kept.length || m - kept[kept.length - 1] >= least) kept.push(m);
    while (kept.length > 2 && kept[0] + period - kept[kept.length - 1] < least) kept.pop();
    return { moments: kept, period };
  }

  /** The words of a place's turns over one period: one or two on, never
   *  the same, and never the same across the period's seam either (its last
   *  turn is followed by its first). */
  private wordsOf(place: Place, N: number): number[] {
    const words: number[] = [];
    let prev = place.word;
    for (let n = 1; n <= N; n++) {
      prev = (prev + (draw(n, place.index, 0) < 0.5 ? 1 : 2)) % PRELOADER_WORDS.length;
      words.push(prev);
    }
    /* The third word: 0 + 1 + 2 less the two it must differ from. */
    if (N > 1 && words[N - 1] === words[0]) words[N - 1] = 3 - words[N - 2] - words[0];
    return words;
  }

  /** Lays a stack's turns on its layers, from `start` over `length`,
   *  repeating unless `once`. Between its turns a stack is hidden, so its
   *  strata jump back out of register there, unseen. */
  private lay(place: Place, stack: Stack, turns: Turn[], start: number, length: number, once: boolean): void {
    if (this.stopped) return;
    const parts = turns.map((t) => this.turnPoints(place, t));
    const join = (pick: (part: TurnPoints) => Point[]) => {
      const all: Point[] = [];
      for (const part of parts) {
        const points = pick(part);
        if (all.length && points.length) all.push([points[0][0] - 0.001, all[all.length - 1][1], STEP]);
        all.push(...points);
      }
      return all;
    };
    const timing = { duration: length, delay: start, iterations: once ? 1 : Infinity };
    const put = (el: HTMLElement, prop: "opacity" | "transform", points: Point[], format?: (v: Value) => string) => {
      if (!points.length) return;
      const local = points.map(([t, v, e]): Frame => [t - start, format ? format(v) : (v as number), e]);
      local.push([length, local[local.length - 1][1]]);
      this.play(el, keyframes(prop, local, length), timing, stack);
    };
    stack.bands.forEach(({ shear, sharp, soft }, b) => {
      put(sharp, "opacity", join((p) => p.sharp[b]));
      put(soft, "opacity", join((p) => p.soft[b]));
      put(shear, "transform", join((p) => p.shear[b]), translate);
    });
    put(stack.echo, "opacity", join((p) => p.echoO));
    put(stack.echo, "transform", join((p) => p.echoT), translateScale);
  }

  /**
   * One turn (seconds from the start): it surfaces at `s` and sinks at `k`,
   * from wherever it has got to — a word the rhythm moves on from before it
   * is fully up sinks from there: Far Cry's flashes, in our water.
   */
  private turnPoints(place: Place, { n, s, k }: Turn): TurnPoints {
    const slow = slowOf(place);
    const out: TurnPoints = { shear: [[], [], []], sharp: [[], [], []], soft: [[], [], []], echoO: [], echoT: [] };
    if (this.calm) {
      const fade = REDUCED.wordSeconds;
      let ink: Point[] = [[s, 0, css(SINE.inOut)], [s + fade, 1]];
      ink = k < s + fade ? cutAt(ink, k) : [...ink, [k, 1]];
      ink[ink.length - 1] = [k, ink[ink.length - 1][1], css(SINE.inOut)];
      ink.push([k + fade, 0]);
      for (let b = 0; b < 3; b++) {
        out.sharp[b] = ink;
        out.shear[b] = [[s, [0, 0]]];
      }
      return out;
    }
    const S = SURFACE;
    const K = SINK;
    const R = REST.ripple;
    const Rs = sec(R.seconds);
    const rest = surfaceSeconds(place.far, false);
    const hold = k - (s + rest);
    /* The quiver: only on some holds, never a short one. */
    const ripple =
      draw(n, place.index, 3) < R.chance && hold >= Rs * 2 ? s + rest + (hold - Rs) * (0.25 + 0.5 * draw(n, place.index, 4)) : null;
    const kd = sec(K.seconds) * slow;
    const U = BLUR.up.soft;
    const D = BLUR.down.sharp;
    const Q = BLUR.down.soft;

    for (let b = 0; b < 3; b++) {
      const u0 = s + sec(S.lagPerBand * b) * slow;
      const sd = sec(S.seconds + S.perBand * b) * slow;
      const k0 = k + sec(K.perBand * (2 - b)) * slow;
      /* Up: out of register into it, the blur clearing as it comes. */
      let shear: Point[] = [[s, [S.shearEm[b], 0]], [u0, [S.shearEm[b], 0], css(S.ease)], [u0 + sd, [0, 0]]];
      if (ripple !== null && b > 0) {
        const r0 = ripple + (b === 1 ? sec(0.06) : 0);
        const amp = (b === 2 ? 1 : -0.5) * R.shearEm;
        shear.push([r0, [0, 0], css(SINE.inOut)], [r0 + Rs / 2, [amp, 0], css(SINE.inOut)], [r0 + Rs, [0, 0]]);
      }
      let sharp: Point[] = [[s, 0], [u0, 0, css(BLUR.up.sharp)], [u0 + sd, 1]];
      let soft: Point[] = [[s, 0], [u0, 0, css(U.rise)], [u0 + sd * U.at, U.peak, css(U.fall)], [u0 + sd, 0]];
      /* Down: out of register again and lifted, into the blur as its ink
         fades — from where it stands. */
      shear = cutAt(shear, k0);
      shear[shear.length - 1] = [k0, shear[shear.length - 1][1], css(K.ease)];
      shear.push([k0 + kd, [K.shearEm[b], K.liftEm]]);
      if (k0 >= u0 + sd) {
        sharp.push([k0, 1, css(D.fall)], [k0 + kd * D.at, 0]);
        soft.push([k0, 0, css(Q.rise)], [k0 + kd * Q.at, Q.peak, css(Q.fall)], [k0 + kd, 0]);
      } else {
        sharp = cutAt(sharp, k0);
        soft = cutAt(soft, k0);
        const sh0 = sharp[sharp.length - 1][1] as number;
        const o0 = sh0 + (soft[soft.length - 1][1] as number);
        const fall = this.fall(o0, o0 > 0 ? Math.sqrt(sh0 / o0) : 0);
        sharp.push(...sampled(k0, kd, (u) => fall(sinkFn(u))[0]).slice(1));
        soft.push(...sampled(k0, kd, (u) => fall(sinkFn(u))[1]).slice(1));
      }
      out.shear[b] = shear;
      out.sharp[b] = sharp;
      out.soft[b] = soft;
    }

    /* The mist's double: breathes through from the right as the word
       surfaces, and out, lifting, as it sinks — from where it stands. */
    const E = S.echo;
    const KE = K.echo;
    const Ed = sec(E.seconds) * slow;
    const Ek = sec(KE.seconds) * slow;
    const cut = k < s + Ed;
    const echoO = cutAt([[s, 0, css(SINE.out)], [s + Ed * E.peakAt, E.peak, css(SINE.inOut)], [s + Ed, 0]], k);
    const echoT = cutAt(
      [
        [s, [E.fromEm, 0, E.scale], css(SINE.out)],
        [s + Ed * E.peakAt, [lerp(E.fromEm, E.toEm, E.peakAt), 0, lerp(E.scale, 1, E.peakAt)], css(SINE.inOut)],
        [s + Ed, [E.toEm, 0, 1]],
      ],
      k,
    );
    const e0 = echoO[echoO.length - 1][1] as number;
    /* Unseen between its breaths, it is back at rest for the next. */
    const v0 = cut ? (echoT[echoT.length - 1][1] as number[]) : [0, 0, 1];
    const away = (f: number) => [v0[0] + KE.toEm * f, v0[1] + KE.liftEm * f, v0[2]];
    echoO[echoO.length - 1] = [k, e0, css(SINE.out)];
    echoO.push([k + Ek * KE.peakAt, Math.max(e0, KE.peak), css(SINE.in)], [k + Ek, 0]);
    echoT[echoT.length - 1] = [k, v0, css(SINE.out)];
    echoT.push([k + Ek * KE.peakAt, away(KE.peakAt), css(SINE.in)], [k + Ek, away(1)]);
    out.echoO = echoO;
    out.echoT = echoT;
    return out;
  }

  /** A stratum sinking from `o0` of its ink, `c0` of its blur cleared: its
   *  sharp and soft copies' ink at the sink's progress e. */
  private fall(o0: number, c0: number): (e: number) => [number, number] {
    const grow = BLUR.sinkEm / BLUR.softEm;
    return (e) => {
      const c = c0 * (1 - Math.min(1, grow * e));
      return [o0 * (1 - e) * sharpShare(c), o0 * (1 - e) * (1 - sharpShare(c))];
    };
  }

  /* ── Plumbing ── */

  /** One animation, its start left to the browser (see LAID ONCE): made in
   *  the same task as the curtain's others, it starts with them. */
  private play(el: HTMLElement, frames: Keyframe[], timing: { duration: number; delay?: number; iterations?: number; easing?: string }, stack: Stack): void {
    const a = el.animate(frames, {
      duration: timing.duration * 1000,
      delay: (timing.delay ?? 0) * 1000,
      iterations: timing.iterations ?? 1,
      easing: timing.easing ?? "linear",
      fill: timing.iterations === Infinity ? "none" : "both",
    });
    stack.anims.push(a);
  }

  private clear(stack: Stack): void {
    for (const a of stack.anims) a.cancel();
    stack.anims = [];
  }

  /** `run` at `t` seconds from the start (once there is one). */
  private at(t: number, run: () => void): void {
    const set = () => this.after((this.origin as number) + t * 1000 - Number(document.timeline.currentTime), run);
    if (this.origin === null) this.pending.push(set);
    else set();
  }

  private after(ms: number, run: () => void): void {
    const id = window.setTimeout(() => {
      if (!this.stopped) run();
    }, Math.max(0, ms));
    this.timers.push(id);
  }
}

interface TurnPoints {
  shear: Point[][];
  sharp: Point[][];
  soft: Point[][];
  echoO: Point[];
  echoT: Point[];
}
