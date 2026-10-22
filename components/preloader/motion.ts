/**
 * ─── Preloader · motion ───
 *
 * Every duration, offset and threshold of the curtain, with its reason.
 *
 * THE IDEA. Far Cry 3's loading screens set a line in torn type beside a
 * blurred double of itself, fragments flickering in and out. Not copied
 * here: the site's world is still water in fog, so a word SURFACES the way
 * a reflection does when a ripple dies. It arrives cut into three strata —
 * its ascenders, its x-height, its descenders — sheared sideways out of
 * register like a reflection broken by a ripple, soft, and slides into
 * register as the water stills, the waterline (the descenders, the band a
 * reflection hangs from) settling last. Behind it a soft double breathes
 * through, the mist it condenses out of: Far Cry's echo, as air. It leaves
 * the reverse way: the waterline breaks first and the strata shear apart and
 * lift into the mist. A resting word now and then quivers at its waterline,
 * the flicker of the reference turned into water.
 *
 * TWEENS, NOT SPRINGS: every motion has a fixed job (surface, hold, sink,
 * leave) and nothing retargets mid-flight; GSAP owns it all, on its own
 * ticker, so the count and the words share one clock (and the in-app
 * browser's frozen frames can be driven by hand: AGENTS, Verifying Motion).
 */

import { cubicBezier } from "@/components/ui/easing";
import { REVEAL_EASE_FN, WIPE_EASE_FN } from "@/components/ui/motion";

/** The golden ratio's fraction: the stride of every schedule here, so no
 *  two places turn over in step and no sequence repeats (AGENTS: ambient
 *  loops never repeat). */
export const GOLDEN = 0.6180339887498949;

/**
 * THE COUNT. It reports what is really loading (the hero's shores, shaders
 * and measuring: ui/loadProgress), never faster than the schedule allows
 * and never back.
 */
export const COUNT = {
  /* The shortest time from the curtain's entrance to 100: the frame must be
   * seen whole and a word or two seen turning over (the first wave is in by
   * ~2.2 s and the first sinks start ~2.4 s). A cold first visit's scene
   * is ready in about this time anyway, so it costs a first visit little;
   * a warm one waits for the words. */
  minSeconds: 3.2,
  /* The schedule the count may not run ahead of: a soft start and a long
   * landing, so the last figures slow into 100 instead of snapping. */
  schedule: cubicBezier(0.3, 0, 0.2, 1),
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
} as const;

/**
 * THE ENTRANCE, from hydration (the curtain itself is the first paint: its
 * ground is server-rendered; what stands on it is held in its pre-entrance
 * state by the stylesheet until here).
 */
export const ENTRANCE = {
  /* The axis draws out from its centre: the first thing, the frame's
   * spine. */
  axis: { at: 0, seconds: 1.4, ease: REVEAL_EASE_FN },
  /* The count rises out of its mask while the axis is drawing. */
  count: { at: 0.2, seconds: 1.0, ease: REVEAL_EASE_FN },
  /* The half mark emerges out of the axis, as if pushed through a slit,
   * once the axis is mostly drawn. */
  mark: { at: 0.35, seconds: 1.5, ease: REVEAL_EASE_FN },
  /* The words surface in a wave out from the axis: each place is released
   * when the wavefront reaches it (AGENTS: geometry, not DOM order). */
  words: { at: 0.45, secondsPerRem: 0.12 },
  /* Their first hold: long enough for the frame to be seen whole, spread a
   * little (golden) so they do not all sink at once. */
  firstHold: { seconds: 0.9, spread: 1.3 },
} as const;

/**
 * A WORD SURFACING. Offsets in em of the word's own size, so every place
 * reads alike at its own scale.
 */
export const SURFACE = {
  /* The strata start out of register: the cap band one way, the x-height
   * band the other, the waterline furthest (a ripple's shear is largest at
   * the water). */
  shearEm: [0.22, -0.14, 0.36] as const,
  /* Each stratum soft at first (a reflection on moving water). */
  blurEm: 0.1,
  /* Each takes a little longer than the one above: the waterline last. */
  seconds: 1.0,
  perBand: 0.14,
  lagPerBand: 0.05,
  ease: REVEAL_EASE_FN,
  /* The mist's double: it breathes up to 45% of the word's ink in the first
   * third, then thins away as the word sharpens, drifting from the right
   * past the word toward the axis (Far Cry's echo sits to the left). */
  echo: {
    peak: 0.45,
    peakAt: 0.32,
    seconds: 1.3,
    fromEm: 0.42,
    toEm: -0.22,
    blurEm: [0.34, 0.16] as const,
    scale: 1.06,
  },
} as const;

/** A WORD SINKING: the reverse, faster, accelerating away. */
export const SINK = {
  /* The strata shear the other way, a little further than they came. */
  shearEm: [-0.26, 0.18, -0.42] as const,
  blurEm: 0.14,
  /* And lift a little, into the air. */
  liftEm: -0.06,
  seconds: 0.75,
  /* The waterline breaks first, then up the word. */
  perBand: 0.07,
  ease: cubicBezier(0.55, 0, 0.75, 0.25),
  echo: {
    peak: 0.32,
    peakAt: 0.25,
    seconds: 0.95,
    toEm: -0.42,
    liftEm: -0.12,
    blurEm: [0.2, 0.46] as const,
  },
} as const;

/**
 * THE TURNOVER. Each place holds its word, lets it sink, waits, and
 * surfaces the next — on its own clock: hold and gap are drawn from a
 * golden sequence per place, so the frame is always nearly whole, one or
 * two places turning at a time.
 */
export const CYCLE = {
  hold: [1.6, 3.2] as const,
  gap: [0.25, 0.8] as const,
  /* The faint places are further off: they turn over more slowly. */
  farSlower: 1.35,
  /* The waterline quiver while a word rests: how often (a share of holds),
   * how far, how long. Kept rare and small: it is felt, not watched. */
  ripple: { chance: 0.45, shearEm: 0.05, seconds: 0.6 },
} as const;

/**
 * THE EXIT, once the count has held 100. Everything leaves INTO the axis,
 * and the scene rises out of the same ground (the hero's #111111), so
 * there is no seam between the curtain and the scene.
 */
export const EXIT = {
  /* The words sink from the outermost in, converging on the axis. */
  words: { at: 0, spread: 0.3 },
  /* The count lifts out of its mask. */
  count: { at: 0.15, seconds: 0.7, ease: WIPE_EASE_FN },
  /* The mark slides back into the axis. */
  mark: { at: 0.3, seconds: 0.85, ease: WIPE_EASE_FN },
  /* The axis closes to its centre; the page is told the curtain is lifting
   * as it begins (StageReveal), so the scene's arrival and fade (hero
   * motion.ts ENTRANCE) start under it. */
  axis: { at: 0.75, seconds: 0.8, ease: WIPE_EASE_FN },
  revealAt: 0.75,
  /* The ground itself fades last, over the scene coming up beneath it. */
  ground: { at: 0.9, seconds: 0.8, ease: cubicBezier(0.45, 0, 0.55, 1) },
} as const;

/**
 * REDUCED MOTION (only when the `respectReducedMotion` prop is on and the
 * visitor asks): no travel, shear, blur or clipping — everything fades, and
 * a place's word cross-fades to the next.
 */
export const REDUCED = {
  fadeSeconds: 0.4,
  wordSeconds: 0.6,
} as const;
