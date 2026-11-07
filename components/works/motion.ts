/**
 * ─── Works · motion ───
 *
 * Every duration, distance and threshold the works move by, with why.
 *
 * THE PARALLAX IS THE STYLESHEET'S (works.css, THE DEPTH): a scroll-driven
 * CSS animation on the compositor, linear in the scroll, so nothing of it
 * is here — no script reads it.
 *
 * Tween, not spring, for the entrances: each has a fixed job, to arrive
 * once. The breath is neither: a field the hand lays and the air takes
 * away, worked out from each puff's age every frame (breath.ts).
 */

import { LINE_DROP, REVEAL_EASE_CSS } from "@/components/ui/motion";

export const WORKS_REVEAL = {
  /* The heading drops into its mask from above, as every heading after the
   * hero's does (the promise's, the 404's): the house's line, the reveal
   * curve. Once most of it is on the screen. */
  title: { ...LINE_DROP, easing: REVEAL_EASE_CSS },
  titleThreshold: 0.6,
  /* Each card floats up (ui/floatCards) once a sixth of it is on the
   * screen — a row comes in together, its cards LEFT TO RIGHT by where
   * they stand (geometry, not the list's order), 0.1 s apart. */
  cardThreshold: 0.15,
  cardStagger: 0.1,
} as const;

/** Reduced motion (respectReducedMotion): the lines and cards fade, no
 *  travel, no blur. */
export const WORKS_REDUCED = { fadeSeconds: 0.2 } as const;

/**
 * THE BREATH (2026-11-06, the user: over a work's picture, "a WebGL shader
 * that talks with emotions … the site's dark ethereal vibe … our mist or
 * our water … unique … not flashy, high-end"). The visitor's breath on the
 * glass in front of a memory: where the hand moves it fogs the glass in
 * wisps; where it rests, the visitor breathes — slowly, unevenly, a calm
 * person's breath; and it goes as condensation goes, the thin of it
 * first, its last islands where the glass holds it longest.
 *
 * WHY IT LASTS AS IT DOES: condensation's film evaporates by a THICKNESS A
 * SECOND, not by a share of itself, so its thin margin clears first and the
 * front retreats into the thick of it (Beysens, "The formation of dew",
 * Atmos. Res. 1995; breath figures: Rayleigh, Nature 1911). Every puff is
 * a deposit less what has evaporated since (`evaporation`, after `hold`).
 *
 * Sizes in rem: a breath is the same share of a card at any screen, the
 * root scaler growing both.
 */
export const BREATH = {
  /** The most puffs alive on one card; the shader's array (shaders/
   *  breath.ts). The oldest goes first, nearly gone by then. */
  puffs: 32,

  /** A puff's radius grows while it is laid, as breath spreads over cold
   *  glass: r·(1 + spread·√age). */
  spread: 0.32,
  /** Thickness lost a second, once `hold` has passed (a puff's deposit is
   *  its strength at its core, up to ×1.45 where the glass holds it). */
  evaporation: 0.34,
  hold: 0.3,

  /* ── The hand moving: wisps ──
   * A puff every `spacingRem` of travel, further apart as the hand goes
   * faster (`spacingSeconds` of its travel), each stretched along the way
   * toward the next (`reach` of the way), so the trace holds together
   * where the glass holds a breath and breaks into islands where it does
   * not. A fast hand breathes less on the glass: its strength halves at
   * `speedHalf` px a second. FAINT ON PURPOSE: drawn as a whole tube at
   * half a breath it read as a smoke cursor's trail; the breath at rest is
   * the gesture, this only its trace. */
  trail: {
    radiusRem: 1.75,
    spacingRem: 1.5,
    spacingSeconds: 0.05,
    strength: 0.32,
    speedHalf: 1600,
    reach: 0.8,
    stretchMost: 2.2,
    form: 0.16,
    /** The hand's speed, followed (e-foldings a second). */
    follow: 10,
  },

  /* ── Coming in: one breath, leaning in to look ── */
  enter: {
    radiusRem: 4.25,
    strength: 0.72,
    form: 0.55,
  },

  /* ── The hand at rest: breathing ──
   * Still for `restAfter` (moved under `restTravelPx`), the visitor
   * breathes on the glass: an exhale `form` long, every ~`period`,
   * swung by two sines a golden ratio apart (an ambient loop never
   * repeats: AGENTS.md) — 6.1 s, a calm breath, never a pulse. */
  exhale: {
    radiusRem: 5.5,
    strength: 1,
    form: 1.1,
    period: 6.1,
    swing: 0.18,
    restAfter: 0.5,
    restTravelPx: 4,
  },

  /** The hand moving to another card: what it breathed on this one fades
   *  out (as a picture of it) while the new one takes the glass. */
  handOff: 0.9,

  /** Asked for while the section is within a screen of the screen. */
  wakeMargin: "100% 0px",
} as const;
