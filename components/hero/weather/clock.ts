/**
 * ─── Weather · the stillness clock ───
 *
 * One number, `level`, from 0 (the air as it is) to 1 (the weather fully
 * turned), driven by how long the visitor has been still. Per-frame state,
 * outside React; the stage updates it once a frame and passes it on.
 */

import { approach } from "@/components/ui/easing";

import { STILLNESS } from "./motion";

export class StillnessClock {
  /* Seconds since the visitor last did anything. */
  private still = 0;
  private current = 0;

  /** 0 = clear air … 1 = full weather. */
  get level(): number {
    return this.current;
  }

  /** Seconds the visitor has been still. */
  get stillFor(): number {
    return this.still;
  }

  /** The visitor moved, pressed, scrolled or typed. */
  stir(): void {
    this.still = 0;
  }

  update(dt: number): void {
    this.still += dt;
    const arriving = this.still >= STILLNESS.onsetAfter;
    const seconds = arriving ? STILLNESS.arriveSeconds : STILLNESS.recedeSeconds;
    this.current = approach(this.current, arriving ? 1 : 0, 1 / seconds, dt);
  }
}
