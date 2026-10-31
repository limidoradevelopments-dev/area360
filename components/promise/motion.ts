/**
 * ─── Promise · motion ───
 *
 * The passages' entrance (2026-10-30, the user: "a one-time appear
 * animation, just like the hero's text, top to bottom"): every line comes
 * DOWN into its mask from above, as the hero's do (ui/motion.ts
 * LINE_DROP), once, as its passage comes into view.
 *
 * ON THE COMPOSITOR (ui/raiseLines.ts), as the hero's words are: the
 * passage above arrives while the hero's scene is still drawing on the
 * main thread behind it (the descent), and a tween ticked there would
 * hitch with its frames.
 *
 * Tween, not spring: the lines arrive once and stay.
 */

import { LINE_DROP, REVEAL_EASE_CSS } from "@/components/ui/motion";

export const PROMISE_REVEAL = {
  /* How much of a passage is on screen before its lines fall: a third.
   * The passage above then comes in while the dark rises over the hero's
   * scene, its first lines clear of the screen's foot. */
  threshold: 0.35,
  ease: REVEAL_EASE_CSS,
  /* 1 s a line, from a line above its mask: the hero's. */
  line: LINE_DROP,
  /* Down the passage, line after line through both its paragraphs: the
   * hero's copy's stagger. */
  stagger: 0.08,
} as const;

/** Reduced motion: no travel, a short fade (the hero's words' own). */
export const PROMISE_REDUCED = {
  fadeSeconds: 0.4,
} as const;

/**
 * THE STARS' ENTRANCE (PromiseSection, starLight.ts): once the cluster is
 * on the screen, each star comes out in turn — from a point to its size,
 * its light coming up with it — and then lives (STAR_LIGHT).
 */
export const PROMISE_STARS_REVEAL = {
  /* The cluster (~55px) all but whole on the screen: a star that comes out
   * under the screen's foot is missed. */
  threshold: 0.9,
} as const;

/* The golden ratio. Two loops whose periods stand in it never come round
 * together, so what they make together never repeats (AGENTS.md). */
const PHI = 1.618033988749895;

/* A sine's in-out: a loop run back and forth on it is a sine wave. */
const SINE_EASE = "cubic-bezier(0.37, 0, 0.63, 1)";

/* A flare's two curves: up fast and stopping, then dying back fast and
   slowing — light, not a tween. */
const FLARE_UP = "cubic-bezier(0.3, 0, 0.1, 1)";
const FLARE_DOWN = "cubic-bezier(0.2, 0.6, 0.35, 1)";

/* A flicker between two flashes: quick both ways. */
const FLICKER = "cubic-bezier(0.4, 0, 0.6, 1)";

/**
 * THE STARS' LIGHT (PromiseStars, starLight.ts, promise.css; the user,
 * 2026-11-01: the stars glow "like the first one", the crown's top jewel;
 * then, of a first build, "now it's like a pulse — combine your first
 * crown glow and make something realistic").
 *
 * WHY THE FIRST BUILD PULSED: the whole star grew and shrank, and its
 * bloom brightened evenly with it, on a smooth curve — a breath. Light
 * does not do that; the eye's glare does something else.
 *
 * WHAT IS REAL ABOUT A GLOW (the research, 2026-10-31):
 *
 *   THE EYE MAKES IT. Spencer, Shirley, Zimmerman and Greenberg,
 *   "Physically-Based Glare Effects for Digital Images" (SIGGRAPH 1995):
 *   round a bright point the eye adds BLOOM — scatter in the cornea, lens
 *   and retina: a sharp core and a long tail falling as a power law, not
 *   a Gaussian — and FLARE, whose ciliary corona is the fine radial
 *   needles of a star. So each star has a halo on a power-law curve (the
 *   great one a wide veil too, the crown's first light), its rays
 *   scattered (the bloom) and its crossing burnt out — all STILL, the
 *   star's steady light — and over it a GLINT: thin streaks of glare
 *   through the crossing, past the drawn rays, and a flash at its heart.
 *   The drawn star never moves.
 *
 *   IT IS NEVER STILL, AND NEVER EVEN. Ritschel, Ihrke, Frisvad, Coppens,
 *   Myszkowski and Seidel, "Temporal Glare" (Eurographics 2009): glare is
 *   SEEN FLUCTUATING — the pupil wavers, the lens moves — and observers
 *   judged moving glare brighter and more real than still. So the glint
 *   SCINTILLATES, unevenly: a sharp flash, a flicker back as it dies, a
 *   smaller flash later, a tremor, calm — its streaks reaching further as
 *   it brightens (a star's spikes lengthen with its brightness); over the
 *   flashes their strength wanders on a slower clock; and the two streaks'
 *   lengths waver apart (HIPPUS, the pupil's own unrest). The veil, the
 *   light scattered wide, breathes on a clock of its own. The specks
 *   flicker, never grow.
 *
 *   ONLY OPACITY AND TRANSFORM MOVE. Chrome's own advice ("Animating a
 *   blur"): a blur costs by its radius and area every time it is drawn,
 *   but a still one is drawn once and kept; animate copies' opacity, not
 *   the blur. Every shape here is drawn once; once the stars are out, ten
 *   Web Animations move small layers on the compositor; the main thread
 *   does nothing per frame; all of it stops while the cluster is off the
 *   screen (wakeMargin).
 *
 * Every loop at its own period, irrational to the others' (φ, φ², √2, √3
 * of the great star's), so the cluster never comes round the same; the
 * flashes' timing is set, never random.
 */
export const STAR_LIGHT = {
  /* Every loop that runs back and forth runs on a sine. */
  ease: SINE_EASE,

  /* COMING OUT: each star from a quarter of its size to its size, about
   * its crossing, its light with it, over 1.6 s on the reveal curve (out
   * fast, settling long). IN TURN BY DISTANCE, a wavefront from the great
   * star's crossing, not a list (AGENTS.md): the great one at `lead`, then
   * each star `perPx` seconds a pixel further — the small one 15px off,
   * the low speck 26, the left one 35. Under reduced motion, each fades in
   * where it stands. */
  rise: { seconds: 1.6, fromScale: 0.25, ease: REVEAL_EASE_CSS, lead: 0.15, perPx: 0.014 },
  /* Each star's distance from the great one's crossing, in the frame's px
   * (promise.css places them). */
  distance: { great: 0, small: 15, "speck-low": 26, "speck-left": 35 },

  /* THE SCINTILLATION, the glint's (the great star and the small one): in
   * each period a flash — up in a quarter second, dying back — a flicker
   * back up as it dies, then calm; later a smaller flash and a tremor;
   * then calm again. `opacity` is the glint's strength from its resting
   * 0.35 (promise.css), `scale` its streaks' reach from their resting 0.8:
   * at the brightest they run past the drawn rays. */
  flare: [
    { offset: 0, opacity: 0.35, scale: 0.8, easing: FLARE_UP },
    { offset: 0.035, opacity: 1, scale: 1.2, easing: FLARE_DOWN },
    { offset: 0.2, opacity: 0.5, scale: 0.9, easing: FLICKER },
    { offset: 0.26, opacity: 0.62, scale: 0.95, easing: FLARE_DOWN },
    { offset: 0.31, opacity: 0.4, scale: 0.84, easing: "ease-out" },
    { offset: 0.5, opacity: 0.35, scale: 0.8 },
    { offset: 0.62, opacity: 0.35, scale: 0.8, easing: FLARE_UP },
    { offset: 0.645, opacity: 0.7, scale: 1.05, easing: FLARE_DOWN },
    { offset: 0.72, opacity: 0.45, scale: 0.86, easing: FLICKER },
    { offset: 0.76, opacity: 0.52, scale: 0.9, easing: FLARE_DOWN },
    { offset: 0.84, opacity: 0.35, scale: 0.8 },
    { offset: 1, opacity: 0.35, scale: 0.8 },
  ],
  /* Each glint's period, seconds from its star's coming out to its first
   * flash (the great star's as its light settles: the light catching it),
   * and over the flashes their strength between 1 and `low` and back on a
   * period φ² longer: one flash bright, the next faint, never the same
   * sequence twice. Starts at 1, so the first flash is a bright one. */
  glints: {
    great: { seconds: 7.3, firstAt: 1.9, envelope: 7.3 * PHI * PHI, low: 0.5 },
    small: { seconds: 7.3 * PHI, firstAt: 3.6, envelope: 7.3 * PHI * PHI * PHI, low: 0.5 },
  },
  /* THE HIPPUS: each streak's length wavers by a few per cent, the long one
   * on one period and the short one on another, φ apart (the small star's
   * long one only: its short one is a few pixels). Under ~5% it is not
   * seen; over ~15% the streaks visibly pump. */
  hippus: { acrossSeconds: 3.3, across: 0.08, upSeconds: 3.3 * PHI, up: 0.12 },

  /* THE GREAT STAR'S VEIL BREATHES: its strength between 1 and `low` and
   * its spread a few per cent, on a clock of its own. Slow and shallow:
   * air, not a pulse. */
  veil: { seconds: 7.4 * PHI, low: 0.7, scale: 0.03 },

  /* THE SPECKS FLICKER, never grow: once a period each, a flash, a flicker
   * back as it dies, and later a smaller one, from and to their resting
   * strength. `flickerAt` is where in the period the first flash starts. */
  flicker: [
    { offset: 0, opacity: 0.6 },
    { offset: 0.18, opacity: 0.6, easing: FLARE_UP },
    { offset: 0.205, opacity: 1, easing: FLARE_DOWN },
    { offset: 0.3, opacity: 0.64, easing: FLICKER },
    { offset: 0.34, opacity: 0.8, easing: FLARE_DOWN },
    { offset: 0.42, opacity: 0.6 },
    { offset: 0.7, opacity: 0.6, easing: FLARE_UP },
    { offset: 0.72, opacity: 0.84, easing: FLARE_DOWN },
    { offset: 0.8, opacity: 0.6 },
    { offset: 1, opacity: 0.6 },
  ],
  flickerAt: 0.18,
  flickers: {
    "speck-low": { seconds: 7.3 * Math.SQRT2, firstAt: 4.4 },
    "speck-left": { seconds: 7.3 * Math.sqrt(3), firstAt: 6.1 },
  },

  /* PARKED OFF THE SCREEN: the loops pause while the cluster is further
   * than this outside it (an IntersectionObserver rootMargin), so a page
   * scrolled away runs nothing; with this much margin they are running
   * again before it is back in sight. */
  wakeMargin: "15% 0px",
} as const;
