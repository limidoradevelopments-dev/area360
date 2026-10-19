/**
 * ─── Atmosphere · the hand's air, on the CPU ───
 *
 * What stands in the air and is posed on the CPU — the flowers' tremble,
 * their pollen's drift (bloom/) — answers the visitor's hand. The air the
 * hand moves lives on the GPU (fluid.ts); this is the same push, kept here:
 * each frame the hand moves, a soft puff of the velocity it gives the air,
 * laid where it passed and dying back as the simulated air's own does.
 *
 * WHY NOT READ THE AIR BACK. It was (a pixel-pack buffer and a fence, a
 * patch round the flowers collected a frame later), and in Chrome every
 * collection is a synchronous round trip to the GPU's process that waits
 * behind whatever it is drawing, fence signalled or not: 5.6 ms at the
 * median, 35 ms one time in ten, 70 at worst (measured 2026-10-20,
 * production, 1440×810) — the page's hitches, worst exactly when the hand
 * moved. The hand is the only thing that moves the air at the flowers that
 * anyone can see answered there, and its push is known here: so it is kept
 * here, and nothing is read back from the GPU in the frame loop.
 *
 * The same numbers as the simulation's wake (motion.ts WAKE: its gain, its
 * width, its speed ceiling; FLUID.velocityHalfLife), so a pass of the hand
 * moves the flowers as it moves the mist round them. Gaussian, skipped past
 * three widths (the house rule for pointer forces).
 */

import { FLUID, HAND_AIR, WAKE } from "./motion";

/* Floats a puff: where (cells, y up), the velocity it gives (cells/s). */
const PUFF = 4;

export class HandAir {
  private readonly puffs = new Float32Array(HAND_AIR.puffs * PUFF);
  /* Where the next puff goes (the oldest is overwritten), how many live. */
  private next = 0;
  private live = 0;
  private readonly sigma = WAKE.sigma * HAND_AIR.spread;
  private readonly inv2s2 = 1 / (2 * this.sigma * this.sigma);
  private readonly reach2 = 9 * this.sigma * this.sigma;

  /**
   * The hand passed from `from` to `to` (cells) over `dt` seconds: a puff of
   * the air it dragged along, at the middle of its path, `gain` of the
   * designed push (0 under reduced motion, as the simulation's wake).
   */
  push(from: readonly number[], to: readonly number[], dt: number, gain: number): void {
    if (dt <= 0 || gain <= 0) return;
    let vx = (to[0] - from[0]) / dt;
    let vy = (to[1] - from[1]) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-3) return;
    if (speed > WAKE.maxSpeed) {
      vx *= WAKE.maxSpeed / speed;
      vy *= WAKE.maxSpeed / speed;
    }
    /* The wake accelerates the air by `gain` × the hand's velocity a
       second, at its centre: this frame's share of that. */
    const k = WAKE.gain * gain * dt;
    const o = this.next * PUFF;
    this.puffs[o] = 0.5 * (from[0] + to[0]);
    this.puffs[o + 1] = 0.5 * (from[1] + to[1]);
    this.puffs[o + 2] = vx * k;
    this.puffs[o + 3] = vy * k;
    this.next = (this.next + 1) % HAND_AIR.puffs;
    this.live = Math.min(this.live + 1, HAND_AIR.puffs);
  }

  /** Every puff dies back into still air, as the simulated air's motion
   *  does (FLUID.velocityHalfLife). */
  update(dt: number): void {
    if (this.live === 0) return;
    const fade = Math.exp((-Math.LN2 * dt) / FLUID.velocityHalfLife);
    let alive = 0;
    for (let i = 0; i < this.live; i += 1) {
      const o = i * PUFF;
      this.puffs[o + 2] *= fade;
      this.puffs[o + 3] *= fade;
      if (Math.abs(this.puffs[o + 2]) + Math.abs(this.puffs[o + 3]) > HAND_AIR.least) alive += 1;
    }
    /* All gone: nothing more to sum until the hand moves again. */
    if (alive === 0) this.live = this.next = 0;
  }

  /** The air the hand moved at cell `cx, cy`: velocity (cells/s, y up),
   *  and its speed as the churn. */
  at(cx: number, cy: number, out: [number, number, number]): [number, number, number] {
    let vx = 0;
    let vy = 0;
    const p = this.puffs;
    for (let i = 0; i < this.live; i += 1) {
      const o = i * PUFF;
      const dx = cx - p[o];
      const dy = cy - p[o + 1];
      const d2 = dx * dx + dy * dy;
      if (d2 > this.reach2) continue;
      const w = Math.exp(-d2 * this.inv2s2);
      vx += p[o + 2] * w;
      vy += p[o + 3] * w;
    }
    out[0] = vx;
    out[1] = vy;
    out[2] = Math.hypot(vx, vy);
    return out;
  }
}
