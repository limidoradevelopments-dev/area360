import { cubicBezier } from "./easing";

/**
 * ─── Shared Motion Tokens ───
 *
 * Curves every feature may share. Each is exported three ways — tuple
 * (Framer Motion / the four numbers), CSS string, and callable (GSAP takes a
 * function as an ease) — built from the one tuple so they cannot drift apart.
 *
 * Feature-specific timings do NOT go here. They go in that feature's own
 * `motion.ts`, next to the reasoning for each number.
 */

/**
 * The reveal curve — a deep ease-out with no overshoot. Things arrive and
 * stop; nothing bounces past its mark.
 */
export const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;
export const REVEAL_EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";
export const REVEAL_EASE_FN = cubicBezier(...REVEAL_EASE);

/**
 * The commitment wipe — `cubic-bezier(0.78, 0, 0.3, 1)`. Asymmetric on
 * purpose: held back for the first fifth, ~3x peak velocity through the
 * middle, and a tail SHORTER than the head so the fill arrives rather than
 * drifting into place. Symmetric in-outs float at both ends and read generic.
 */
export const WIPE_EASE = [0.78, 0, 0.3, 1] as const;
export const WIPE_EASE_CSS = "cubic-bezier(0.78, 0, 0.3, 1)";
export const WIPE_EASE_FN = cubicBezier(...WIPE_EASE);

/** Tactile press — a short, purely decelerating settle. */
export const PRESS_EASE_CSS = "cubic-bezier(0.33, 1, 0.68, 1)";
export const PRESS_DURATION_MS = 180;

/**
 * Card entrance: float up slightly, scale 0.98 → 1, blur drops away. The
 * blur is cheap on a card-sized layer and expensive on a full-viewport one —
 * never apply this to a section-sized element.
 */
export const CARD_ENTRANCE = {
  fromY: "1.5rem",
  fromScale: 0.98,
  fromBlurPx: 8,
  seconds: 0.9,
  stagger: 0.1,
} as const;

/** Masked line reveal: the line slides up out of its own overflow boundary. */
export const LINE_ENTRANCE = {
  fromYPercent: 110,
  seconds: 1.0,
  stagger: 0.1,
} as const;
