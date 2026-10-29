/**
 * ─── raiseLines ───
 *
 * The house's masked-line reveal (a line slides up out of its mask:
 * data-reveal-mask → data-reveal-line) as Web Animations, for entrances
 * that play while the main thread is at its busiest: the curtain lifting
 * over the hero's first frames, which the engine draws on that thread.
 * GSAP owns entrances everywhere else (AGENTS.md); here a tween ticked from
 * the main thread would hitch with every heavy frame, so the same curve
 * runs on the compositor, on transform and opacity only.
 *
 * LAID ONCE, LET GO ONCE LANDED: each line's end state is written inline
 * as it finishes and its animation cancelled, so nothing holds a layer for
 * the rest of the visit. Cancelled early (an unmount, React's development
 * double mount), a line falls back to its CSS pre-state and can be raised
 * again from it.
 */

export interface LineCue {
  /** The line to raise: a data-reveal-line inside its mask. */
  readonly el: HTMLElement;
  /** Seconds from now. */
  readonly at: number;
}

export interface LineRise {
  readonly fromYPercent: number;
  readonly seconds: number;
  /** A CSS easing, e.g. ui/motion.ts REVEAL_EASE_CSS. */
  readonly easing: string;
}

/** Reduced motion: no travel, a short fade from where the line stands. */
export interface LineFade {
  readonly fadeSeconds: number;
}

/** Lays every cue's entrance in this one task; returns what stops them. */
export function raiseLines(cues: readonly LineCue[], rise: LineRise, calm: LineFade | null): () => void {
  const laid = cues.map(({ el, at }) => {
    /* The calm fade states `transform: none` in both keyframes: held back
       through its delay (fill), the line stands in place, not down in its
       mask where the stylesheet keeps it. */
    const frames: Keyframe[] = calm
      ? [
          { transform: "none", opacity: 0 },
          { transform: "none", opacity: 1 },
        ]
      : [{ transform: `translateY(${rise.fromYPercent}%)` }, { transform: "translateY(0)" }];
    const animation = el.animate(frames, {
      duration: (calm ? calm.fadeSeconds : rise.seconds) * 1000,
      delay: at * 1000,
      easing: calm ? "linear" : rise.easing,
      fill: "both",
    });
    animation.addEventListener(
      "finish",
      () => {
        el.style.transform = "none";
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
