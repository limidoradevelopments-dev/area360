/**
 * ─── Preloader · motion ───
 *
 * Every duration, offset and threshold of the curtain, with its reason.
 *
 * THE IDEA. Far Cry 3's loading screens set words in torn type beside a
 * blurred double, changing on a pulse. Not copied here: the site's world is
 * still water in fog, so a word SURFACES the way a reflection does when a
 * ripple dies. It arrives cut into three strata — its ascenders, its
 * x-height, its descenders — sheared sideways out of register like a
 * reflection broken by a ripple, soft, and slides into register as the water
 * stills, the waterline (the descenders, the band a reflection hangs from)
 * settling last. Behind it a soft double breathes through, the mist it
 * condenses out of: Far Cry's echo, as air. It leaves the reverse way: the
 * waterline breaks first and the strata shear apart and lift into the mist.
 * A resting word now and then quivers at its waterline.
 *
 * WHEN THE WORDS CHANGE IS FAR CRY'S OWN RHYTHM (2026-10-23, read frame by
 * frame from the user's capture of its loading screen; RHYTHM): changes land
 * on a pulse, several places at once, a beat skipped now and then — slowed
 * to the mist's pace.
 *
 * ON THE COMPOSITOR, NOT GSAP. The curtain stands while the hero's scene
 * loads, and that load holds the main thread (shaders, the device measured
 * in the dark): driven from the main thread (GSAP, a blur recomputed every
 * frame) the words ran at ~14 fps on a phone-class GPU. Everything here is a
 * Web Animation on transform and opacity, laid once at the start (one
 * repeating animation per layer, its keyframes fitted, never sampled where a
 * fitted curve will do) and drawn by the compositor; each blur is a fixed
 * filter, applied only while its copy shows. The main thread's only work is
 * the count, 20 times a second. Measured on a phone-class GPU (Intel UHD 630,
 * a phone's size, the CPU slowed 6×): 113–119 fps, with the main thread kept
 * busy or not.
 *
 * TWEENS, NOT SPRINGS: every motion has a fixed job (surface, hold, sink,
 * leave) and nothing retargets mid-flight.
 *
 * Easings are cubic-bezier tuples (the engine makes the CSS and the callable
 * forms from the same four numbers: ui/motion's rule).
 */

export type Curve = readonly [number, number, number, number];

/** The golden ratio's fraction: the stride of every draw here (the words
 *  each place turns to, its ripples). */
export const GOLDEN = 0.6180339887498949;

/** THE PACE: every word's motion runs 1.5× the curtain's first build (the
 *  user's setting, 2026-10-23: "speed 1.5x", after trying 1–2.6×). Every
 *  word duration and the rhythm below are divided by it; the entrance and
 *  exit of the axis, mark and count are not (they were liked as they are). */
export const PACE = 1.5;

/**
 * THE COUNT. It reports what is really loading (the hero's shores, shaders
 * and measuring: ui/loadProgress), never faster than the schedule allows
 * and never back.
 */
export const COUNT = {
  /* The shortest time from the curtain's entrance to 100: the frame must be
   * seen whole and the rhythm's first chords seen (the first is at ~2.5 s).
   * A cold first visit's scene is ready in about this time anyway, so it
   * costs a first visit little; a warm one waits for the words. */
  minSeconds: 3.2,
  /* The schedule the count may not run ahead of: a soft start and a long
   * landing, so the last figures slow into 100 instead of snapping. */
  schedule: [0.3, 0, 0.2, 1] as Curve,
  /* WHILE IT WAITS, IT LEANS. Progress arrives in bursts — nothing before
   * the scene's code has arrived, and on a cold first visit the last, heavy
   * shaders finish seconds after the rest (measured with a forced-cold
   * compile: 79% by 2.8 s, then 79 → 83 over 2.5 s, then all at once). A
   * count standing still for seconds reads as hung, so while it waits it
   * drifts toward at most a third of the remaining way past what has really
   * loaded (`share`), at `rate` e-foldings a second: ~8% in the first second
   * from nothing, ~1 figure a second in a stall. Never to 100: only the
   * scene being ready says that. */
  lead: { share: 0.35, rate: 0.25 },
  /* Smoothing toward the target, in e-foldings a second (ui/easing
   * approach): a report lands within ~0.2 s and never jumps. */
  rate: 5,
  /* And never faster than 85% a second: a figure that leaps reads as fake. */
  maxPerSecond: 0.85,
  /* Short of done it stops at 99: 100 means the scene is ready. */
  ceiling: 0.99,
  /* 100 is held this long before the curtain leaves: it must be read. */
  holdAtFull: 0.35,
  /* Assistive technology hears the value in tens, not every figure. */
  announceStep: 10,
  /* Written 20 times a second, not every frame: a figure needs no more, and
   * every frame of main thread is the scene's while it loads. */
  hz: 20,
} as const;

/**
 * THE ENTRANCE, from hydration (the curtain itself is the first paint: its
 * ground is server-rendered; what stands on it is held in its pre-entrance
 * state by the stylesheet until here).
 */
export const ENTRANCE = {
  /* NOTHING MOVES FOR THE FIRST 0.3 s after the curtain's animations are
   * handed over. The first frame that shows them draws every layer of the
   * curtain for the first time, while the hero, hydrating in the same
   * moment, compiles its shaders on the same GPU: measured on a phone-class
   * GPU with the CPU slowed 6×, that frame took 145–264 ms — the axis would
   * jump in a quarter drawn. Held on the bare ground (as it has been since
   * the first paint), the stall is not seen. */
  lead: 0.3,
  /* The axis draws out from its centre: the first thing, the frame's
   * spine. */
  axis: { at: 0, seconds: 1.4 },
  /* The count rises out of its mask while the axis is drawing. */
  count: { at: 0.2, seconds: 1.0 },
  /* The half mark emerges out of the axis, as if pushed through a slit,
   * once the axis is mostly drawn. */
  mark: { at: 0.35, seconds: 1.5 },
  /* The words surface in a wave out from the axis: each place is released
   * when the wavefront reaches it (AGENTS: geometry, not DOM order). The
   * wave's speed is a word's (÷ PACE). */
  words: { at: 0.45, secondsPerRem: 0.12 },
} as const;

/**
 * A WORD SURFACING. Offsets in em of the word's own size, so every place
 * reads alike at its own scale; seconds at 1× (÷ PACE).
 */
export const SURFACE = {
  /* The strata start out of register: the cap band one way, the x-height
   * band the other, the waterline furthest (a ripple's shear is largest at
   * the water). */
  shearEm: [0.22, -0.14, 0.36] as const,
  /* Each takes a little longer than the one above: the waterline last. */
  seconds: 1.0,
  perBand: 0.14,
  lagPerBand: 0.05,
  ease: [0.22, 1, 0.36, 1] as Curve,
  /* The mist's double: it breathes up to 45% of the word's ink in the first
   * third, then thins away as the word sharpens, drifting from the right
   * past the word toward the axis (Far Cry's echo sits to the left). */
  echo: { peak: 0.45, peakAt: 0.32, seconds: 1.3, fromEm: 0.42, toEm: -0.22, scale: 1.06 },
} as const;

/** A WORD SINKING: the reverse, faster, accelerating away. */
export const SINK = {
  /* The strata shear the other way, a little further than they came. */
  shearEm: [-0.26, 0.18, -0.42] as const,
  /* And lift a little, into the air. */
  liftEm: -0.06,
  seconds: 0.75,
  /* The waterline breaks first, then up the word. */
  perBand: 0.07,
  ease: [0.55, 0, 0.75, 0.25] as Curve,
  echo: { peak: 0.32, peakAt: 0.25, seconds: 0.95, toEm: -0.42, liftEm: -0.12 },
} as const;

/**
 * THE BLUR, AS A CROSS-FADE. A stratum was a blur animated from 0.1em to
 * sharp (and to 0.14em as it sinks): recomputed on the main thread every
 * frame. Now each stratum is two copies — sharp, and soft at a FIXED 0.1em
 * blur — and the blur clearing is the two cross-fading: as the word comes
 * (e, the surfacing's ease) the sharp copy carries e·e² of its ink and the
 * soft one the rest of e (a half-gone blur still reads soft); as it goes
 * (e, the sink's) the blur grows past the soft copy's (0.14 / 0.1) while the
 * ink fades.
 *
 * FITTED, NOT SAMPLED: those four curves as eased keyframes, fitted once
 * (least maximum error) — within 0.1–1.7% of the ink, where seven samples a
 * curve were within 3–11% — and four keyframes where those were fourteen.
 * The browser parses every keyframe (~20 µs each) and the setup's cost was
 * almost all keyframes. Frames identical to the sampled build within 4
 * levels. `at` and `peak`: where a bump turns, as a share of its span and of
 * the ink. A word cut short (a flash: the rhythm moved on before it was up)
 * is still sampled, from wherever it had got to.
 */
export const BLUR = {
  /** The soft copies' fixed blur, in em: the old animated blur's start. */
  softEm: 0.1,
  /** The sinking blur's end, in em: past the soft copy's, so it is all soft
   *  well before the ink is gone. */
  sinkEm: 0.14,
  /** The mist's double's fixed blur, in em: between its old animated 0.16
   *  and 0.46. */
  echoEm: 0.28,
  up: {
    sharp: [0.299, 0.039, 0.136, 1.112] as Curve,
    soft: { at: 0.1588, peak: 0.3849, rise: [0.489, 0.939, 0.758, 0.986] as Curve, fall: [0.294, 0.301, 0.113, 1.018] as Curve },
  },
  down: {
    sharp: { at: 0.8971, fall: [0.589, -0.011, 0.72, 1.013] as Curve },
    soft: { at: 0.7392, peak: 0.4843, rise: [0.572, -0.013, 0.771, 0.986] as Curve, fall: [0.359, -0.01, 0.61, 0.386] as Curve },
  },
} as const;

/** While a word rests. */
export const REST = {
  /* The faint places are further off: they surface and sink more slowly. */
  farSlower: 1.35,
  /* The waterline quiver: how often (a share of holds), how far, how long.
   * Kept rare and small: it is felt, not watched. Never on a short hold. */
  ripple: { chance: 0.45, shearEm: 0.05, seconds: 0.6 },
} as const;

/**
 * FAR CRY 3'S RHYTHM, read frame by frame from the user's capture of its
 * loading screen (a 2 s loop of 50 frames, 40 ms each): the moment, in ms,
 * each of its places changes word. Its words change on a pulse ~120–160 ms
 * apart, a beat skipped now and then (240–280); on a beat one to four places
 * change together — chords between single changes, the fullest about 70%
 * through — and a word flashes for a beat or holds for most of a second.
 *
 * Its places given to ours by role: its busiest big word to the middle one
 * (c); its small word under it to the small one (b); its big mirrored word
 * to the other big one (a); its small mirrored ones to the turned reflection
 * (f) and the faint low word (d); its steady word (LOADING, which never
 * changes) to the bottom one (e), which changes only on the two fullest
 * chords.
 */
export const RHYTHM = {
  loopMs: 2000,
  places: {
    c: [120, 280, 1040, 1160, 1440, 1880],
    b: [120, 560, 1040, 1280, 1880],
    a: [680, 1160, 1440, 1720],
    f: [440, 840, 1440, 1720],
    d: [120, 560, 880, 1160, 1440],
    e: [120, 1440],
  },
  /* Begun on its chord at 1040 ms: the rhythm opens on a chord, and its
   * fullest comes ~1.9 s later, inside the shortest visit. */
  fromMs: 1040,
  /* OURS, NOT ITS: stretched to the scene's pace — ×7 at 1×, ÷ PACE: its
   * 0.12–0.16 s beat becomes 0.56–0.75 s, a skipped beat ~1.2 s, its 2 s
   * loop 9.3 s. The pattern kept, as calm as the mist: at the game's pace it
   * would be a strobe over still water (the user: "match it to our
   * environment's rhythm"). */
  stretch: 7,
  /* On a beat the old word starts to sink and the new one surfaces a moment
   * after (÷ PACE): the two cross in the blur, its double exposure in our
   * water. Its own gap is a 40 ms frame (0.28 s stretched); a little more
   * here, as a sink starts slowly (an ease-in): the new word rises as the
   * old goes into the mist, not over it. */
  overlap: 0.4,
  /* The frame is held whole this long after the entrance before the first
   * beat (÷ PACE). */
  lead: 0.9,
  /* The words run this many loops of the rhythm before they repeat (each
   * place's word stacks repeat with them): 18.7 s, longer than a visit. */
  loops: 2,
} as const;

/**
 * THE EXIT, once the count has held 100. Everything leaves INTO the axis,
 * and the scene rises out of the same ground (the hero's #111111), so
 * there is no seam between the curtain and the scene. Not ÷ PACE.
 */
export const EXIT = {
  /* The words sink from the outermost in, converging on the axis. */
  words: { at: 0, spread: 0.3 },
  /* The count lifts out of its mask. */
  count: { at: 0.15, seconds: 0.7 },
  /* The mark slides back into the axis. */
  mark: { at: 0.3, seconds: 0.85 },
  /* The axis closes to its centre; the page is told the curtain is lifting
   * as it begins (StageReveal), so the scene's arrival and fade (hero
   * motion.ts ENTRANCE) start under it. */
  axis: { at: 0.75, seconds: 0.8 },
  revealAt: 0.75,
  /* The ground itself fades last, over the scene coming up beneath it. */
  ground: { at: 0.9, seconds: 0.8, ease: [0.45, 0, 0.55, 1] as Curve },
} as const;

/** The ease of the in-and-out moves (the quiver, the doubles' breaths). */
export const SINE = {
  out: [0.61, 1, 0.88, 1] as Curve,
  in: [0.12, 0, 0.39, 0] as Curve,
  inOut: [0.37, 0, 0.63, 1] as Curve,
} as const;

/**
 * REDUCED MOTION (only when the `respectReducedMotion` prop is on and the
 * visitor asks): no travel, shear, blur or clipping — everything fades, and
 * a place's word cross-fades to the next, on the same rhythm.
 */
export const REDUCED = {
  fadeSeconds: 0.4,
  wordSeconds: 0.6,
} as const;
