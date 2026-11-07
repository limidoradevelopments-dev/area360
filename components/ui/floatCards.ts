/**
 * ─── floatCards ───
 *
 * The house's card entrance (ui/motion.ts CARD_ENTRANCE: a card floats up,
 * scales 0.98 → 1 and its blur drops away) as Web Animations, on the
 * compositor — for a section whose script must stay out of GSAP's chunk
 * (the page's first load: AGENTS.md, Loading), as raiseLines is for lines.
 *
 * ITS PRE-STATE IS THE STYLESHEET'S (utilities.css data-reveal-card, from
 * tokens.css), so the server's first paint holds every card where its
 * entrance starts.
 *
 * LAID ONCE, LET GO ONCE LANDED: each card's end state is written inline as
 * it finishes and its animation cancelled, so no layer (and no filter
 * region, which a blur is) is held for the visit. Cancelled early (an
 * unmount), a card falls back to its CSS pre-state.
 *
 * WHOLE PIXELS OF TRAVEL, as raiseLines: Chrome rasterises a moving layer
 * once, where its animation starts; carried a fraction of a pixel (1.5rem
 * at a 20.8px root is 31.2px), a card landed soft and snapped onto the
 * screen's pixels when let go.
 */

import { CARD_ENTRANCE, REVEAL_EASE_CSS } from "./motion";

export interface CardCue {
  /** A data-reveal-card. */
  readonly el: HTMLElement;
  /** Seconds from now. */
  readonly at: number;
}

/** Reduced motion: no travel, scale or blur, a short fade. */
export interface CardFade {
  readonly fadeSeconds: number;
}

/** Lays every cue's entrance in this one task; returns what stops them. */
export function floatCards(cues: readonly CardCue[], calm: CardFade | null): () => void {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const ratio = window.devicePixelRatio || 1;
  const travel = Math.ceil(parseFloat(CARD_ENTRANCE.fromY) * rem * ratio - 1e-6) / ratio;
  const from: Keyframe = calm
    ? { opacity: 0, transform: "none", filter: "none" }
    : {
        opacity: 0,
        transform: `translateY(${travel}px) scale(${CARD_ENTRANCE.fromScale})`,
        filter: `blur(${CARD_ENTRANCE.fromBlurPx}px)`,
      };
  const to: Keyframe = { opacity: 1, transform: "none", filter: "none" };
  const laid = cues.map(({ el, at }) => {
    const animation = el.animate([from, to], {
      duration: (calm ? calm.fadeSeconds : CARD_ENTRANCE.seconds) * 1000,
      delay: at * 1000,
      easing: calm ? "linear" : REVEAL_EASE_CSS,
      fill: "both",
    });
    animation.addEventListener(
      "finish",
      () => {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.filter = "none";
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
