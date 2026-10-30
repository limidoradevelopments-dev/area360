/**
 * ─── Settings · motion ───
 *
 * Tween, not spring: the button arrives once, and the panel opens and
 * closes to fixed states. An open interrupted by a close reverses from
 * where it got to (overwrite), so nothing needs a velocity carried.
 */

import { CARD_ENTRANCE, REVEAL_EASE, REVEAL_EASE_FN } from "@/components/ui/motion";
import { cubicBezier } from "@/components/ui/easing";
import { STAGE_CUES } from "@/components/ui/stageCues";

export const DOCK_MOTION = {
  ease: REVEAL_EASE_FN,

  /* THE BUTTON WAITS FOR THE SHOT. The curtain lifts and the hero's
   * opening shot widens over 4.2 s (hero/stage/motion.ts ARRIVAL.zoom): the
   * stone first, then the headline, then — near the shot's end — the
   * chrome, down the page; the dock is its foot, last (ui/stageCues.ts).
   * It comes DOWN into place, as every line over the hero does (the user,
   * 2026-10-30: "top to bottom"): the lift is negative, from above; its
   * pre-state is settings.css's. */
  enterDelay: STAGE_CUES.chrome.foot,
  enterSeconds: 0.9,
  enterLiftRem: -0.75,

  /* The panel floats up out of a blur, as a card does (ui/motion.ts
   * CARD_ENTRANCE), shorter: it answers a click, and at the card's 0.9 s a
   * menu reads as slow. Blur is fine here: a 240 px layer, once. */
  open: {
    seconds: 0.45,
    fromY: "0.5rem",
    fromScale: CARD_ENTRANCE.fromScale,
    fromBlurPx: 6,
  },

  /* Out faster than in, and a shorter way: a dismissal should not hold the
   * eye. Ease-in, so it leaves rather than settles. */
  close: {
    seconds: 0.18,
    toY: "0.25rem",
    toScale: 0.99,
    ease: cubicBezier(0.4, 0, 1, 1),
  },

  /* The drawn cross travelling to the new choice's parentheses (a Framer
   * layoutId: one mark, moved). The reveal curve, short: it follows a
   * click directly, and at 22px a row a longer travel would trail it. */
  pick: { duration: 0.32, ease: REVEAL_EASE },
} as const;

/**
 * THE SOUND WAVE (soundWave.ts, SoundToggle.tsx). At rest a still, low
 * wave — the frame's line; switched on, it rises and travels, its swell
 * coming and going like a voice; switched off, it slows and settles where
 * it is, never snapping back to a pose.
 */
export const SOUND = {
  /* The first tone's length (px of the 24px drawing): two and a half
   * crests across, the second tone a golden ratio shorter. */
  wavelength: 9.5,
  /* How much of the line is the first tone; the rest the second, and the
   * second's offset so the two never start in step. */
  mix: 0.72,
  offset: 1.3,
  /* The envelope's power: 1 a sine's arch; higher holds the ends flatter. */
  envelope: 1.4,
  /* Heights, shares of the half-box: at rest (the frame's quiet line, ~2 px
   * crest to trough), and playing at the swell's top (~7 px, the box's
   * height less the stroke). At a rest of 0.55 and a swell floor of 0.45
   * the playing wave stood barely a pixel taller than the still one (3.2
   * → 3.3–4.5 px, measured) and read as not playing at all. */
  rest: 0.4,
  full: 1,
  /* Radians a second the wave travels while playing: ~1.3 crests a
   * second, a slow voice, not a buzz. */
  speed: 8.5,
  /* The swell: its rate (Hz of the first term) and its floor (0–1). */
  swell: { rate: 0.55, floor: 0.72 },
  /* How fast it starts and stops (ui/easing.ts approach, e-foldings a
   * second): on in ~0.4 s, off in ~0.6 s — sound fades out slower than it
   * comes in. */
  rise: 7,
  fall: 5,
  /* Below this share of playing, a stopping wave is at rest and its loop
   * parks (AGENTS.md: park idle loops). */
  restEpsilon: 0.002,
} as const;

/**
 * A NEW QUALITY RELOADS THE PAGE (2026-10-29, the user: "once a quality is
 * selected the page needs to refresh, so they notice something happen").
 * The cross travels to the choice first (`pick`), then the page goes to
 * the night — the same #111111 the curtain stands on — and reloads, and
 * the scene comes up again at its new quality. `after`: from the choice
 * to the fade's start; `fade`: the fade.
 */
export const RELOAD = {
  after: 0.28,
  fade: 0.5,
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Reduced motion: the panel and button simply appear, a short fade. */
export const DOCK_REDUCED = {
  seconds: 0.15,
} as const;
