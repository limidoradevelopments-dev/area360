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
 * never apply this to a section-sized element. Its pre-state is the
 * stylesheet's (tokens.css --space-reveal-card-from, --size-reveal-card-from,
 * --blur-reveal-card-from): the same values, so the tween starts where the
 * server's first paint holds the card.
 */
export const CARD_ENTRANCE = {
  fromY: "1.5rem",
  fromScale: 0.98,
  fromBlurPx: 8,
  seconds: 0.9,
  stagger: 0.1,
} as const;

/** Masked line reveal: the line slides up out of its own overflow boundary.
 *  Its pre-state is the stylesheet's (tokens.css --size-reveal-line-from:
 *  the same share). */
export const LINE_ENTRANCE = {
  fromYPercent: 110,
  seconds: 1.0,
  stagger: 0.1,
} as const;

/**
 * The same reveal the other way: the line comes DOWN into its mask from
 * above it (the user, 2026-10-30, for everything over the hero: "top to
 * bottom"). Its pre-state is the stylesheet's (utilities.css,
 * data-reveal-drop on the part's root).
 */
export const LINE_DROP = {
  ...LINE_ENTRANCE,
  fromYPercent: -LINE_ENTRANCE.fromYPercent,
} as const;

/**
 * THE EYE TAG's entrance (ui/EyeTag: a short lead and a word spelled one
 * letter a tile, 2026-11-11), shared by every section that sets one.
 *
 * THE LEAD drops into its masks as every line over the night does; THE
 * WORD IS STRUCK, letter by letter, left to right: each letter drops into
 * its tile as a light runs over the tile's edge — a hairline of the whole
 * white that flashes in fast and dies slowly (`glint`: the site's glare,
 * never a pulse: sharp, light, gone) — and the tile's own edge comes up
 * under it. So the eye is led along the word once, at the pace of a
 * reading glance (`tileStagger`: eight letters in ~0.5 s). ONE PASS: no
 * loop, nothing left running.
 */
export const EYE_TAG = {
  /** Once most of it is on the screen. */
  threshold: 0.6,
  /** The lead's lines, as every paragraph's (LINE_ENTRANCE.stagger less). */
  lineStagger: 0.08,
  /** The word begins as the lead's first line lands its first half. */
  wordAt: 0.3,
  tileStagger: 0.07,
  /** A tile's edge comes up under the glint, a beat after it is struck. */
  frameDelay: 0.08,
  frameSeconds: 0.6,
  /** The glint: up in `peak` of its time, then a long fall. */
  glintSeconds: 0.9,
  glintPeak: 0.12,
} as const;

/** The eye tag under reduced motion: no travel and no glint, a short fade. */
export const EYE_TAG_REDUCED = { fadeSeconds: 0.2 } as const;
