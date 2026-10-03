/**
 * ─── Easing primitives ───
 *
 * Two things the rest of the system needs and neither GSAP nor CSS provides in
 * a usable form.
 *
 *
 * A CUBIC-BEZIER THAT CAN BE CALLED
 *
 * Some motion here is not on a clock and has to be EVALUATED at an arbitrary
 * progress. The preloader's line is the lower of a designed schedule and what
 * has actually finished downloading, so every frame it must ask "where should
 * the curve be at t?" for a t it did not choose. GSAP also takes a function as
 * an ease, which is the only way to hand it a curve that is not one of its
 * stock names.
 *
 * `gsap.parseEase` does NOT understand a `cubic-bezier(...)` string, so this is
 * the same Newton-Raphson solve browsers run for the CSS function. It keeps
 * every curve in the system expressible as the same four numbers, which means
 * a value in `motion.ts` can be pasted into a stylesheet and behave
 * identically.
 *
 * P0 is (0,0) and P3 is (1,1), so only the two middle control points vary.
 * The x polynomial has to be inverted numerically because a cubic bezier is
 * parameterised by its own t, not by x — and t is not x unless the curve is
 * the identity.
 */

export type Easing = (t: number) => number;

/* Newton converges in a handful of steps everywhere the slope is healthy.
 * Where it is not — the flat shoulders of a strongly eased curve — it can
 * diverge, so a bisection fallback takes over. Both are cheap; this runs once
 * per frame, on one number. */
const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_EPSILON = 1e-7;
const SUBDIVISION_ITERATIONS = 12;

const a = (v1: number, v2: number) => 1 - 3 * v2 + 3 * v1;
const b = (v1: number, v2: number) => 3 * v2 - 6 * v1;
const c = (v1: number) => 3 * v1;

/** Horner's form of the bezier polynomial for one axis. */
const sample = (t: number, v1: number, v2: number) =>
  ((a(v1, v2) * t + b(v1, v2)) * t + c(v1)) * t;

const slope = (t: number, v1: number, v2: number) =>
  3 * a(v1, v2) * t * t + 2 * b(v1, v2) * t + c(v1);

function solveT(x: number, x1: number, x2: number): number {
  let t = x;

  for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
    const currentSlope = slope(t, x1, x2);
    if (currentSlope === 0) break;
    if (Math.abs(currentSlope) < NEWTON_MIN_SLOPE) break;
    t -= (sample(t, x1, x2) - x) / currentSlope;
  }

  // Newton either landed or bailed on a flat shoulder. Bisection cannot fail.
  if (t >= 0 && t <= 1 && Math.abs(sample(t, x1, x2) - x) < SUBDIVISION_EPSILON) {
    return t;
  }

  let low = 0;
  let high = 1;
  let mid = x;

  for (let i = 0; i < SUBDIVISION_ITERATIONS; i += 1) {
    mid = (low + high) / 2;
    const value = sample(mid, x1, x2);
    if (Math.abs(value - x) < SUBDIVISION_EPSILON) return mid;
    if (value < x) low = mid;
    else high = mid;
  }

  return mid;
}

/**
 * Returns `cubic-bezier(x1, y1, x2, y2)` as a callable easing.
 *
 * A linear curve short-circuits, and the endpoints are returned exactly rather
 * than solved — a preloader that lands on 99.97% is a preloader that never
 * says it finished.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  if (x1 === y1 && x2 === y2) return (t) => t;

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sample(solveT(t, x1, x2), y1, y2);
  };
}

/** Keeps a value inside [0, 1]. Used on every frame, so it is written out here. */
export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Frame-rate independent exponential approach.
 *
 * `current + (target - current) * rate * dt` is the version everyone writes and
 * it is wrong: the step is proportional to dt, so the same motion converges
 * differently at 60Hz and 120Hz, and a long frame can overshoot past the
 * target. Going through `1 - e^(-rate * dt)` makes the fraction closed over the
 * whole frame instead of sampled at its start, which is exact at any frame
 * length and can never overshoot.
 *
 * `rate` is in units of e-foldings per second: the gap closes to ~37% of itself
 * after 1/rate seconds.
 */
export function approach(
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
): number {
  return current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));
}
