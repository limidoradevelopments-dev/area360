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

/**
 * THE CALLIGRAM (calligram.ts): how the passages' letters are set along
 * the mark's lines once they have landed (the user's frame, 2026-11-02:
 * the moth written in words along its outlines). In ems of the copy, so
 * it holds at every size.
 */
export const CALLIGRAM = {
  /* THE LETTERS AS LARGE AS THE LINES ALLOW, the words no closer than 1.5
   * spaces: dense enough that the words close up into an outline (the
   * frame's "MOTH MOTH"), apart enough that each still reads as a word. Up
   * to 1.35 of the copy: at 1440 the passages fill the lines at ~1.1 (the
   * letters ~15.5px); larger and the moth turns to display type, the
   * copy's quiet voice lost. On a phone the copy is wider for the mark's
   * size, and the letters come out at ~0.65 of it. */
  largest: 1.35,
  tightest: 1.5,
  /* THE TAPER: a letter's height, centred on its line, as 0.8 em (its
   * x-height and most of its ascenders; an ascender over a descender is
   * left to pass), with 0.2 em clear of the next line. Two lines closer
   * than that make their letters smaller, down to 0.55 of the rest; where
   * the room is less still (the very tips), the line is left bare. */
  letterHeight: 0.8,
  clear: 0.2,
  smallest: 0.55,
  /* No word laid over a turn sharper than ~34° across one letter: the
   * wings' outer corners. Laid over one, its letters splay. */
  sharpest: 0.6,
  /* An antenna's words begin 6% up it, clear of the wings' roots. */
  antennaLead: 0.06,
  /* The mark's room is read every 2 units of its drawing (~2px at 1440),
   * and a line's own turn back on itself counts only 18 units along it
   * (under that it is the line's own bend, not a tip). */
  roomStep: 2,
  roomReach: 18,
} as const;

/* A falling flake's path is a pendulum's (Andersen, Pesavento & Wang,
 * "Unsteady aerodynamics of fluttering and tumbling plates", JFM 2005):
 * side to side, tilted toward the end of each swing, and RISING A LITTLE
 * AT EACH TURN, where it stalls. */

/**
 * THE ASSEMBLY (assembly.ts, shaders/letters.ts; the user, 2026-11-02: as
 * each passage reaches the top of the screen its letters break away, come
 * down, and assemble the mark). THE SCROLL IS ITS CLOCK: every letter's
 * place is a function of how far the page has scrolled — scrolled back,
 * it goes back up into its line — and of the time only for the flutter of
 * a letter in the air, which dies to nothing at both ends.
 *
 * Distances of scroll are shares of the screen's height (svh), so the
 * pace is the same on every screen.
 *
 *   BREAKING. A line breaks as it crosses `breakLine` from the screen's
 *   top; its letters leave in reading order across `ripple`. A letter
 *   leaving its line stops there — the page goes on up without it — and
 *   falls: down first, then gliding to its place in the air.
 *
 *   IN THE AIR. Nearer than the page: larger, out of focus and dimmer for
 *   it (its light spread over more), fluttering as a falling plate does,
 *   turning, and glinting as its face catches the light. Its place in the
 *   air is its place on the mark, spread out about the mark's middle and
 *   scattered — a cloud with no shape yet.
 *
 *   SETTLING. Over `settle`, each letter leaves the cloud for its place on
 *   the mark, coming into focus as it lands, a reflected letter turning
 *   over to show its back. The mark is held at the screen's middle (the
 *   stage's pin) while its letters land: the passage above writes the
 *   forewings, the passage below the hindwings and then the antennae, each
 *   line written outward from the body, both wings together — the last
 *   words, "bring it to life.", reaching the right antenna's tip last.
 *
 *   THE LIGHT. Landed, the scales catch the light once: a sheen across the
 *   mark from its body outward, as the page scrolls on through the pin.
 *
 *   THE BLOOM (2026-11-02, the user: going on to the works, the letters
 *   "break again and fall down and disappear" — "like a bloom, or
 *   something falling after a blast, but no visual blast"; the page
 *   scrolling on as it always does). After a breath, the moth lets its
 *   letters go from its body outward, all within a moment, and they OPEN
 *   AS ONE WIDENING SHELL — the moth's own shape, growing, loosening — as
 *   a firework's stars leave their shell: some toward the eye (larger,
 *   soft), some away (smaller, dimmer); the air stops them almost at once
 *   (stars are stopped within a second); then they hang, sway and drift
 *   down at a steady pace like embers, or a dandelion's seeds under their
 *   pappus (Cummins et al., "A separated vortex ring underlies the flight
 *   of the dandelion", Nature 2018: a slow, steady fall), their light
 *   burning out with a last uneven flicker. Each catches a little light as
 *   it lets go: light, never a flash. The mark's engraving, empty, goes on
 *   up with the page, and the letters, left in the air, are gone before
 *   they reach the works below. While the page moves, each is smeared
 *   along its own way, as a film frame's shutter smears a moving light.
 *   Scrolled back, they gather again onto the moth.
 */
export const ASSEMBLY = {
  /* A line breaks as its top crosses 22% of the screen from the top: "as
   * it reaches the top", with the screen above it for a letter to be
   * carried up a little as it breaks. At 0 a line would break as it left. */
  breakLine: 0.22,
  /* A line's letters leave over 8% of a screen of scroll, first to last:
   * the line comes apart as a wave in reading order, not all at once. */
  ripple: 0.08,
  /* A LETTER LOOSENS BEFORE IT FALLS: for a tenth of a screen of scroll it
   * rides on with the page where it stood, coming toward the eye — larger,
   * out of focus, dimmer — so a line dissolves into soft light where it
   * is; falling while still sharp, its letters read as type strewn over
   * the lines below (tried: a band of letters across the passage). Then it
   * falls from its line to its place in the air over half a screen of
   * scroll, and settles from there onto the mark over 0.45: slower than
   * the page — it is left behind — never so slow it hangs. */
  loosen: 0.1,
  fall: 0.5,
  settle: 0.45,
  /* THE PIN: the mark held at the screen's middle for 1.5 screens of
   * scroll (promise.css --size-promise-pin), and then let go to move on
   * with the page as every section does; and when, in screens of scroll
   * after the mark is held, each part lands — its first letter to its
   * last — and the sheen crosses. The passages overlap: the hindwings
   * begin as the forewings finish. */
  land: {
    fore: [0, 0.42],
    hind: [0.36, 0.73],
    antenna: [0.68, 0.96],
  },
  sheen: [0.99, 1.25],
  /* THE BLOOM, in screens of scroll after the mark is held:
   *
   *   WAVE — the letters let go from the body outward, by their distance
   *   from it, over [1.3, 1.42] (a breath after the sheen; one movement,
   *   not a sequence), give or take each one's own 0.02; all of it while
   *   the mark is still held (let go at 1.5), so every letter leaves a
   *   still mark and the engraving goes on up empty.
   *
   *   OPEN — out from the body by half its distance from it, plus 4.5% of
   *   the screen's height (so the letters at the body move too), and up to
   *   a third of that across, each its own way: the shape widening and
   *   loosening at once. Its depth its own, from away (−1) to toward (1).
   *   THE AIR STOPS IT: the opening settled to 63% in 0.05 of a screen of
   *   scroll (a burst; slower, it read as a scaling), the drift reaching
   *   its pace in 0.12.
   *
   *   DRIFT — down at 0.8 px a px of scroll on the screen, each its own
   *   0.7–1.3 of it: left in the air as the page goes on up, so it is seen
   *   to fall past the engraving going up (at 0.55 it seemed to hang where
   *   it was), and against the page it sinks at ~1.8, meeting the next
   *   section's edge within a third to two thirds of a screen.
   *
   *   LIGHT — halving every 0.55 of a screen (embers; at 0.18 they were out
   *   before they had fallen), catching 0.4 toward white as it lets go,
   *   gone by 1.7 (its last fifth faded out; 0.4 and 1.3, then 0.3 and 0.95, before they fell into the works: they were out before they crossed its pictures).
   *
   *   INTO THE WORKS (2026-11-07, the user: they "fall into this works
   *   section and blurred disappear without hiding the end of the promise
   *   section … match it to this dark ethereal vibe"). The air layer's
   *   canvas reaches below its foot — the promise's end — into the works
   *   (promise.css --size-promise-air-below); from `edge` of a screen
   *   above that end a letter goes out of focus and spreads as it sinks,
   *   and its light goes as it reaches the canvas's foot. It was faded
   *   over the last 22% of a screen ABOVE the end, so the letters were
   *   gone before the works came, and the promise's end read as a cut
   *   (life 0.95 and half-life 0.3 then: they burnt out on the way).
   *
   *   SHUTTER — a moving letter is smeared by its speed on the screen over
   *   1/50 s, a film frame's exposure, at most 8× its height. */
  bloom: {
    wave: [1.3, 1.42],
    jitter: 0.02,
    open: 0.5,
    push: 0.045,
    across: 0.33,
    opening: 0.05,
    settling: 0.12,
    drift: 0.8,
    halfLife: 0.55,
    catch: 0.4,
    life: 1.7,
    edge: 0.08,
    shutter: 1 / 50,
  },
  /* THE SCROLL'S SPEED, for the streak: followed at 12 a second (approach,
   * ui/easing.ts), so a wheel's notches read as one motion; drawn on until
   * it is under 5px a second, then the streaks are gone and the loop
   * parks. */
  speed: { follow: 12, rest: 5 },
  /* THE CLOUD: each letter's place in the air is its place on the mark
   * spread 55% further from the mark's middle, scattered by up to 22% of
   * the mark's width — wide enough that no moth shows in it. */
  spread: 0.55,
  scatter: 0.22,
  /* IN THE AIR, at a letter's nearest: 60% larger, out of focus (the
   * atlas's softest copy), and its light 45% spread — never brighter: the
   * glint is what flashes. Each letter's nearness is its own, 0.35–1. */
  near: { grow: 0.6, dim: 0.45, least: 0.35 },
  /* THE FLUTTER: a swing of 9–22px side to side with the tilt into each
   * turn (0.45 rad) and its rise (a third of the swing); a swing every
   * 0.3 screens of scroll, and on its own clock every 4.6–7.4 s when the
   * page is still, so a letter left in the air keeps falling, slowly. A
   * slow turn in the plane (up to 0.5 rad), and a tip about the
   * horizontal and the vertical (up to 1 rad and 0.6 rad): the flake's
   * face to the light and away. */
  flutter: { swing: [9, 22], tilt: 0.45, rise: 0.33, perScreen: 0.3, seconds: [4.6, 7.4], turn: 0.5, tip: 1, yaw: 0.6 },
  /* THE GLINT: a letter's face meeting the light at 0.5 rad of tip flashes
   * it toward white, sharply (a power of 36) and lightly (0.55): light
   * caught on a scale, as the stars' glints are — never a pulse. */
  glint: { at: 0.5, sharpness: 36, strength: 0.55 },
  /* THE SETTLE'S SWOOP: a letter comes onto its place on a slight curve,
   * up to 18% of the way off the straight, one side or the other. */
  swoop: 0.18,
  /* THE SHEEN: landed, each letter brightens from the copy's 80% toward
   * white as a band (a fifth of the mark's half-width) passes it, from the
   * body outward. */
  sheenBand: 0.2,
  sheenLift: 0.2,
  /* The atlas's two soft copies of every letter (glyphAtlas.ts), σ in CSS
   * px: a little out of focus, and a letter at its nearest — a 14px letter
   * at 3.2 is a soft light with its shape still in it, not a blot. */
  soft: [1.1, 3.2] as readonly [number, number],
  /* The canvas is drawn at the screen's pixels up to 2 a CSS px: finer is
   * not seen in letters this size, and costs fill on a phone. */
  maxPixelRatio: 2,
  /* ASKED FOR on the first scroll after the curtain lifts, or 5 s after it
   * if no one scrolls: the hero's opening shot is over by then (4.2 s), and
   * nothing of this — its script, its tiny shader — is in its way. */
  loadAfter: 5,
  /* PARKED OFF THE SCREEN: nothing is drawn while the section is further
   * than this from the screen; with this margin the engine is measured
   * and ready before the first line can break. */
  wakeMargin: "100% 0px",
} as const;
