/**
 * ─── Atmosphere · ambient ───
 *
 * The fog's life when nobody touches it. Nothing here is random: every
 * "irregular" value comes from a low-discrepancy sequence, which spreads
 * evenly, never clumps and never repeats. Random gusts bunch up and leave
 * long silences, and a visitor reads the bunching as a pattern.
 */

import { BREATHING, GUST, PHI } from "./motion";

/* The plastic number: the R2 sequence's generator, the best-spread 2D
 * low-discrepancy sequence known (Roberts, 2018). */
const PLASTIC = 1.324717957244746;
const R2_X = 1 / PLASTIC;
const R2_Y = 1 / (PLASTIC * PLASTIC);

const fract = (v: number) => v - Math.floor(v);

/**
 * Schedules gusts on the engine clock. `quietUntil` is pushed forward by
 * every touch, so the forest never breathes over the visitor's own gesture.
 */
export class Gusts {
  private count = 0;
  private nextAt: number;

  constructor(now: number) {
    this.nextAt = now + GUST.firstAfter;
  }

  /** Where the next gust falls, as shares of the frame (y from the top), or null. */
  due(now: number, quietUntil: number): [number, number] | null {
    if (now < this.nextAt) return null;
    if (now < quietUntil) {
      this.nextAt = quietUntil + this.gap();
      return null;
    }
    const n = this.count;
    this.count += 1;
    this.nextAt = now + this.gap();
    const [x0, x1] = GUST.region.x;
    const [y0, y1] = GUST.region.y;
    return [x0 + (x1 - x0) * fract(0.5 + n * R2_X), y0 + (y1 - y0) * fract(0.5 + n * R2_Y)];
  }

  /** Golden-ratio sequence over [minGap, maxGap]. */
  private gap(): number {
    return GUST.minGap + (GUST.maxGap - GUST.minGap) * fract(0.5 + this.count / PHI);
  }
}

/**
 * The fog's breathing, −1…1. Two sines at the golden ratio: quasi-periodic,
 * so the thickening and thinning never settles into a loop the eye can count.
 */
export function breathing(t: number): number {
  const w = BREATHING.secondWeight;
  const a = Math.sin((Math.PI * 2 * t) / BREATHING.period);
  const b = Math.sin((Math.PI * 2 * t) / (BREATHING.period * PHI) + 1.7);
  return (1 - w) * a + w * b;
}
