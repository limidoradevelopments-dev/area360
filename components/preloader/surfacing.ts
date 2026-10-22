import gsap from "gsap";

import { PRELOADER_WORDS, type PreloaderSlot } from "./content";
import { CYCLE, GOLDEN, REDUCED, SINK, SURFACE } from "./motion";

/**
 * ─── Surfacing ───
 *
 * How a word comes and goes in its place (motion.ts, THE IDEA): it surfaces
 * — three strata sheared out of register sliding into it, soft to sharp, a
 * mist's double breathing through — rests as the whole word, now and then
 * quivers at its waterline, and sinks the reverse way; then, after a gap,
 * the place surfaces its next word. Each place keeps its own clock.
 *
 * Every timing is drawn from a golden sequence per place (a stride per
 * place, a stride per turn), so no two places turn over in step and the
 * frame never repeats. Offsets are in em of the place's own size.
 */

export interface Place {
  el: HTMLElement;
  /** The word at rest: the one copy seen between transitions. */
  whole: HTMLElement;
  /** Cap, body and foot: the word cut at its x-height and its baseline. */
  strata: HTMLElement[];
  /** The mist's double. */
  echo: HTMLElement;
  /** All five copies, for the word's text. */
  layers: HTMLElement[];
  word: number;
  far: boolean;
  index: number;
  turns: number;
  run: gsap.core.Timeline | null;
}

/* The stride between places' sequences: the golden ratio's square's
 * fraction, so a place's sequence is not a shifted copy of its neighbour's. */
const PLACE_STRIDE = 0.3819660112501051;

const frac = (x: number) => x - Math.floor(x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = (range: readonly [number, number], t: number) => lerp(range[0], range[1], t);
const blur = (px: number) => `blur(${px.toFixed(2)}px)`;

/** The `k`th golden draw for place `i` at turn `n`, in [0, 1). */
const draw = (n: number, i: number, k: number) => frac((n + 1) * GOLDEN + i * PLACE_STRIDE + k * GOLDEN * GOLDEN);

/** The places, read from the markup in the order the content lists them. */
export function readPlaces(root: HTMLElement, slots: readonly PreloaderSlot[]): Place[] {
  return slots.map((slot, index) => {
    const el = root.querySelector<HTMLElement>(`[data-preloader-slot="${slot.id}"]`)!;
    const layer = (name: string) => el.querySelector<HTMLElement>(`[data-preloader-layer="${name}"]`)!;
    const strata = [layer("cap"), layer("body"), layer("foot")];
    const whole = layer("whole");
    const echo = layer("echo");
    return {
      el,
      whole,
      strata,
      echo,
      layers: [echo, ...strata, whole],
      word: slot.word,
      far: slot.far,
      index,
      turns: 0,
      run: null,
    };
  });
}

/** How long a word takes to surface, at a place's pace. */
export function surfaceSeconds(far: boolean, calm: boolean): number {
  if (calm) return REDUCED.wordSeconds;
  const slow = far ? CYCLE.farSlower : 1;
  const strata = SURFACE.seconds + 2 * (SURFACE.perBand + SURFACE.lagPerBand);
  return Math.max(strata, SURFACE.echo.seconds) * slow;
}

export class Surfacing {
  private stopped = false;

  /**
   * @param schedule wraps work done later (a turn built from a finished
   *   one) so the section's GSAP context still owns what it makes and can
   *   revert it (useGSAP's contextSafe).
   */
  constructor(
    private readonly places: Place[],
    private readonly calm: boolean,
    private readonly schedule: <F extends (...args: never[]) => void>(fn: F) => F,
  ) {}

  /** The first wave: place k surfaces after `delays[k]` and holds
   *  `holds[k]`. */
  start(delays: readonly number[], holds: readonly number[]): void {
    this.places.forEach((place, k) => this.turn(place, delays[k], holds[k]));
  }

  /** Every place's clock stopped where it is. */
  stop(): void {
    this.stopped = true;
    for (const place of this.places) {
      place.run?.kill();
      place.run = null;
    }
  }

  /**
   * The clocks stopped and every word sunk from wherever it is, place k
   * starting at `at[k]`: the curtain's exit. Returns the timeline.
   */
  sinkAll(at: readonly number[]): gsap.core.Timeline {
    this.stop();
    const tl = gsap.timeline();
    this.places.forEach((place, k) => {
      const resting = Number(gsap.getProperty(place.whole, "opacity")) > 0;
      if (this.calm) tl.to(place.whole, { opacity: 0, duration: REDUCED.wordSeconds, ease: "sine.inOut" }, at[k]);
      else this.sink(place, tl, at[k], resting);
    });
    return tl;
  }

  /* ── One turn: surface, hold, sink; the next after a gap ── */

  private turn(place: Place, delay: number, hold: number): void {
    if (this.stopped) return;
    const tl = gsap.timeline({ delay, onComplete: this.schedule(() => this.next(place)) });
    const rest = this.surface(place, tl, 0);
    if (!this.calm) this.ripple(place, tl, rest, hold);
    this.sink(place, tl, rest + hold, true);
    place.run = tl;
  }

  private next(place: Place): void {
    if (this.stopped) return;
    place.turns += 1;
    const n = place.turns;
    const i = place.index;
    const slow = place.far ? CYCLE.farSlower : 1;
    /* Never the same word twice running: one or two on. */
    place.word = (place.word + (draw(n, i, 0) < 0.5 ? 1 : 2)) % PRELOADER_WORDS.length;
    const text = PRELOADER_WORDS[place.word];
    for (const layer of place.layers) layer.textContent = text;
    this.turn(place, pick(CYCLE.gap, draw(n, i, 1)) * slow, pick(CYCLE.hold, draw(n, i, 2)) * slow);
  }

  /** The word surfaces at `at`; returns when it is at rest. */
  private surface(place: Place, tl: gsap.core.Timeline, at: number): number {
    if (this.calm) {
      tl.fromTo(place.whole, { opacity: 0 }, { opacity: 1, duration: REDUCED.wordSeconds, ease: "sine.inOut" }, at);
      return at + REDUCED.wordSeconds;
    }
    const em = fontPx(place.el);
    const slow = place.far ? CYCLE.farSlower : 1;
    const S = SURFACE;
    const E = S.echo;

    tl.set(place.whole, { opacity: 0 }, at);
    place.strata.forEach((band, b) => {
      tl.fromTo(
        band,
        { opacity: 0, x: S.shearEm[b] * em, y: 0, filter: blur(S.blurEm * em) },
        { opacity: 1, x: 0, filter: blur(0), duration: (S.seconds + S.perBand * b) * slow, ease: S.ease },
        at + S.lagPerBand * b * slow,
      );
    });
    tl.fromTo(
      place.echo,
      { opacity: 0, x: E.fromEm * em, y: 0, scale: E.scale, filter: blur(E.blurEm[0] * em) },
      {
        opacity: E.peak,
        x: lerp(E.fromEm, E.toEm, E.peakAt) * em,
        scale: lerp(E.scale, 1, E.peakAt),
        filter: blur(lerp(E.blurEm[0], E.blurEm[1], E.peakAt) * em),
        duration: E.seconds * E.peakAt * slow,
        ease: "sine.out",
      },
      at,
    ).to(
      place.echo,
      {
        opacity: 0,
        x: E.toEm * em,
        scale: 1,
        filter: blur(E.blurEm[1] * em),
        duration: E.seconds * (1 - E.peakAt) * slow,
        ease: "sine.inOut",
      },
      ">",
    );

    /* At rest the whole word stands in for its strata: two complementary
       clips meeting inside a glyph leave a faint seam where each edge is
       antialiased; one copy has none. Same frame, so nothing is seen. */
    const rest = at + surfaceSeconds(place.far, false);
    tl.set(place.whole, { opacity: 1 }, rest)
      .set(place.strata, { opacity: 0, clearProps: "filter" }, rest)
      .set(place.echo, { clearProps: "filter" }, rest);
    return rest;
  }

  /** Now and then, while it rests, the word quivers at its waterline. */
  private ripple(place: Place, tl: gsap.core.Timeline, rest: number, hold: number): void {
    const n = place.turns;
    const i = place.index;
    const R = CYCLE.ripple;
    if (draw(n, i, 3) >= R.chance || hold < R.seconds * 2) return;
    const em = fontPx(place.el);
    const at = rest + (hold - R.seconds) * (0.25 + 0.5 * draw(n, i, 4));
    const half = R.seconds / 2;
    tl.set(place.strata, { opacity: 1, x: 0 }, at)
      .set(place.whole, { opacity: 0 }, at)
      .to(place.strata[2], { x: R.shearEm * em, duration: half, ease: "sine.inOut", yoyo: true, repeat: 1 }, at)
      .to(place.strata[1], { x: -0.5 * R.shearEm * em, duration: half, ease: "sine.inOut", yoyo: true, repeat: 1 }, at + 0.06)
      .set(place.whole, { opacity: 1 }, at + R.seconds + 0.06)
      .set(place.strata, { opacity: 0 }, at + R.seconds + 0.06);
  }

  /**
   * The word sinks at `at`: from rest (the whole word handed to its strata
   * first) or, on the curtain's exit, from wherever it is.
   */
  private sink(place: Place, tl: gsap.core.Timeline, at: number, fromRest: boolean): void {
    if (this.calm) {
      tl.to(place.whole, { opacity: 0, duration: REDUCED.wordSeconds, ease: "sine.inOut" }, at);
      return;
    }
    const em = fontPx(place.el);
    const slow = place.far ? CYCLE.farSlower : 1;
    const K = SINK;
    const E = K.echo;

    if (fromRest) tl.set(place.strata, { opacity: 1, x: 0, y: 0 }, at).set(place.whole, { opacity: 0 }, at);
    place.strata.forEach((band, b) => {
      /* The foot first, then up the word. */
      const order = place.strata.length - 1 - b;
      tl.to(
        band,
        {
          opacity: 0,
          x: K.shearEm[b] * em,
          y: K.liftEm * em,
          filter: blur(K.blurEm * em),
          duration: K.seconds * slow,
          ease: K.ease,
        },
        at + order * K.perBand * slow,
      );
    });
    const breathe = {
      opacity: E.peak,
      x: E.toEm * E.peakAt * em,
      y: E.liftEm * E.peakAt * em,
      scale: 1,
      filter: blur(lerp(E.blurEm[0], E.blurEm[1], E.peakAt) * em),
      duration: E.seconds * E.peakAt * slow,
      ease: "sine.out",
    };
    if (fromRest) tl.fromTo(place.echo, { opacity: 0, x: 0, y: 0, scale: 1, filter: blur(E.blurEm[0] * em) }, breathe, at);
    else tl.to(place.echo, breathe, at);
    tl.to(
      place.echo,
      {
        opacity: 0,
        x: E.toEm * em,
        y: E.liftEm * em,
        filter: blur(E.blurEm[1] * em),
        duration: E.seconds * (1 - E.peakAt) * slow,
        ease: "sine.in",
      },
      ">",
    );
    const gone = at + Math.max(K.seconds + (place.strata.length - 1) * K.perBand, E.seconds) * slow;
    tl.set([...place.strata, place.echo], { clearProps: "filter" }, gone);
  }
}

/** A place's size in px, read when its word moves (offsets are in em). */
function fontPx(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).fontSize) || 16;
}
