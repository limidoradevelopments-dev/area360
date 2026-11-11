/**
 * ─── wipeIn ───
 *
 * A rule drawn in from one end: the house's directional wipe (ui/motion.ts
 * WIPE_EASE: held back, then fast through its middle, arriving rather than
 * drifting) as a Web Animation on the rule's clip, for anything that waits
 * undrawn under data-reveal-wipe (utilities.css) — the embossed dots, a
 * link's hairline. A clip on a strip a few pixels tall: a small paint a
 * frame, for under a second.
 *
 * LAID ONCE, LET GO ONCE LANDED, as raiseLines and floatCards are: drawn,
 * its clip is written away inline and the animation cancelled. Cancelled
 * early (an unmount), the rule falls back to its CSS pre-state.
 */

export interface WipeCue {
  /** A data-reveal-wipe: drawn from its start, or from its end where its
   *  value is "end". */
  readonly el: HTMLElement;
  /** Seconds from now. */
  readonly at: number;
}

export interface Wipe {
  readonly seconds: number;
  /** A CSS easing, e.g. ui/motion.ts WIPE_EASE_CSS. */
  readonly easing: string;
}

/** Reduced motion: no travel, a short fade. */
export interface WipeFade {
  readonly fadeSeconds: number;
}

const DRAWN = "inset(0 0 0 0)";

/** Lays every cue's wipe in this one task; returns what stops them. */
export function wipeIn(cues: readonly WipeCue[], wipe: Wipe, calm: WipeFade | null): () => void {
  const laid = cues.map(({ el, at }) => {
    const undrawn = el.getAttribute("data-reveal-wipe") === "end" ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
    const frames: Keyframe[] = calm
      ? [
          { clipPath: DRAWN, opacity: 0 },
          { clipPath: DRAWN, opacity: 1 },
        ]
      : [{ clipPath: undrawn }, { clipPath: DRAWN }];
    const animation = el.animate(frames, {
      duration: (calm ? calm.fadeSeconds : wipe.seconds) * 1000,
      delay: at * 1000,
      easing: calm ? "linear" : wipe.easing,
      fill: "both",
    });
    animation.addEventListener(
      "finish",
      () => {
        el.style.clipPath = "none";
        animation.cancel();
      },
      { once: true },
    );
    return animation;
  });
  return () => {
    for (const animation of laid) animation.cancel();
  };
}
