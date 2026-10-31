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
 *
 * WHOLE PIXELS OF TRAVEL (2026-10-31, the user: a line came down, and once
 * down it went a hair back up). Chrome makes a moving layer's tiles once,
 * where its animation starts, and does not make them again while the
 * transform is animated; the line is drawn from those tiles all the way
 * down. Carried a fraction of a pixel — 110% of an 18.75 px line is
 * 20.625 px — the text landed 0.375 px off the screen's pixels, soft, and
 * snapped onto them when let go: a hop. So the travel is a whole number of
 * the screen's pixels, never less than the share asked for, and the tiles
 * start on the very grid the line lands on (measured in headless Chrome
 * over the promise's lines: the hop 0.28–0.35 px → under 0.01 px).
 */

export interface LineCue {
  /** The line to raise: a data-reveal-line inside its mask. */
  readonly el: HTMLElement;
  /** Seconds from now. */
  readonly at: number;
}

export interface LineRise {
  /** A share of the line's height, laid as whole pixels of the screen. */
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
  /* Every line's travel read before any is laid: one layout for the set,
     not one per line. Its height as the stylesheet's percentage reads it,
     fractions and all (the pre-state is a translate: it changes no height). */
  const travel = calm
    ? []
    : cues.map(({ el }) => wholePixels((el.getBoundingClientRect().height * rise.fromYPercent) / 100));
  const laid = cues.map(({ el, at }, k) => {
    /* The calm fade states `transform: none` in both keyframes: held back
       through its delay (fill), the line stands in place, not down in its
       mask where the stylesheet keeps it. */
    const frames: Keyframe[] = calm
      ? [
          { transform: "none", opacity: 0 },
          { transform: "none", opacity: 1 },
        ]
      : [{ transform: `translateY(${travel[k]}px)` }, { transform: "translateY(0)" }];
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

/** CSS px → the nearest whole number of the screen's pixels AWAY from zero,
 *  so a line still clears its mask (the slack: a float a hair over a whole
 *  pixel would round a pixel further). */
function wholePixels(px: number): number {
  const ratio = window.devicePixelRatio || 1;
  return (Math.sign(px) * Math.ceil(Math.abs(px) * ratio - 1e-6)) / ratio;
}
