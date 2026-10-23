"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/components/ui/cx";
import { approach, clamp01, cubicBezier } from "@/components/ui/easing";
import { loadProgress } from "@/components/ui/loadProgress";
import { REVEAL_EASE_CSS, WIPE_EASE_CSS } from "@/components/ui/motion";
import { useStageReveal } from "@/components/ui/StageReveal";

import PreloaderCount from "./PreloaderCount";
import PreloaderMark from "./PreloaderMark";
import PreloaderWords from "./PreloaderWords";
import { PRELOADER_SLOTS, formatCount } from "./content";
import { COUNT, ENTRANCE, EXIT, PACE, REDUCED, RHYTHM } from "./motion";
import { Surfacing, readPlaces, surfaceSeconds } from "./surfacing";

/**
 * ─── Preloader ───
 *
 * The curtain in front of the page while the hero's scene loads, built on
 * the user's frame (2026-10-23): a hairline axis, the half mark to its
 * left, the words to its right, the count at the top — Cormorant Garamond,
 * #585858 on #111111. The words surface and sink like reflections on still
 * water, on Far Cry 3's own rhythm (motion.ts, THE IDEA; surfacing.ts).
 *
 * THE COUNT IS REAL. The hero reports its scene's progress (its shores'
 * bytes, its shaders compiled, the device measured in the dark) into the
 * page's load store (ui/loadProgress); the count follows it, never ahead of
 * a minimum schedule (the frame must be seen) and never back. 100 means
 * the scene is ready to be seen — or that it never will be (no WebGL2: the
 * still stands in).
 *
 * THE HAND-OFF. Everything leaves into the axis, the axis closes to its
 * centre, and as it begins to close the page is told the curtain is lifting
 * (StageReveal): the scene, held ready until then, starts its arrival and
 * comes up out of the same #111111 as this ground fades over it.
 *
 * EVERYTHING MOVES ON THE COMPOSITOR (motion.ts): Web Animations on
 * transform and opacity, laid once. The main thread only writes the count,
 * 20 times a second, straight to the DOM.
 */
export interface PreloaderProps {
  className?: string;
  /**
   * Off by default: the signature motion plays for everyone. When on and the
   * visitor prefers reduced motion, there is no shear, blur, travel or
   * clipping: the axis, the mark, the count and each word simply fade, and a
   * place's word cross-fades to the next, on the same rhythm.
   */
  respectReducedMotion?: boolean;
}

const schedule = cubicBezier(...COUNT.schedule);
const groundEase = `cubic-bezier(${EXIT.ground.ease.join(", ")})`;

export default function Preloader({ className, respectReducedMotion = false }: PreloaderProps) {
  const scope = useRef<HTMLDivElement>(null);
  const { reveal } = useStageReveal();

  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const done = () => root.setAttribute("data-preloader-done", "");

    /* Frame captures and frozen-clock harnesses ask for the page with no
       curtain (its frames would never tick). */
    if (new URLSearchParams(window.location.search).has("nopreload")) {
      done();
      reveal();
      return;
    }

    /* Read once: a preference that flips mid-curtain must not restart it. */
    const calm = respectReducedMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pick = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    const anchor = pick<HTMLElement>("[data-preloader-anchor]");
    const axis = pick<HTMLElement>("[data-preloader-axis]");
    const mark = pick<SVGElement>("[data-preloader-mark] svg");
    const count = pick<HTMLElement>("[data-preloader-count]");
    const figure = pick<HTMLElement>("[data-preloader-count-line]");

    const own: Animation[] = [];
    const timers: number[] = [];
    /** One move of the frame (not a word), `at` seconds on. No start time is
     *  given: everything the entrance makes is made in this one task, and
     *  the browser starts it all together (surfacing.ts, LAID ONCE). */
    const move = (el: Element, frames: Keyframe[], seconds: number, at: number, easing: string) => {
      own.push(el.animate(frames, { duration: seconds * 1000, delay: at * 1000, easing, fill: "both" }));
    };
    const later = (seconds: number, run: () => void) => timers.push(window.setTimeout(run, seconds * 1000));

    const places = readPlaces(root, PRELOADER_SLOTS);
    const surfacing = new Surfacing(places, calm);

    /* ── The entrance ── */
    const lead = ENTRANCE.lead;
    if (calm) {
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      move(axis, [{ transform: "scaleY(1)", opacity: 0 }, { transform: "scaleY(1)", opacity: 1 }], REDUCED.fadeSeconds, lead, "linear");
      move(mark, [{ transform: "translateX(0)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], REDUCED.fadeSeconds, lead, "linear");
      move(figure, [{ transform: "translateY(0)", ...fade[0] }, { transform: "translateY(0)", ...fade[1] }], REDUCED.fadeSeconds, lead, "linear");
    } else {
      const E = ENTRANCE;
      move(axis, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], E.axis.seconds, lead + E.axis.at, REVEAL_EASE_CSS);
      move(figure, [{ transform: "translateY(110%)" }, { transform: "translateY(0)" }], E.count.seconds, lead + E.count.at, REVEAL_EASE_CSS);
      move(mark, [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], E.mark.seconds, lead + E.mark.at, REVEAL_EASE_CSS);
    }

    /* The words surface in a wave out from the axis, released by their
       distance from it (AGENTS: geometry, not DOM order); the rhythm begins
       once the frame has been seen whole. */
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const centre = anchor.getBoundingClientRect();
    const distance = places.map((place) => {
      const box = place.entrance.el.getBoundingClientRect();
      return Math.hypot(box.left + box.width / 2 - centre.left, box.top + box.height / 2 - centre.top) / rem;
    });
    const delays = distance.map((d) => lead + ENTRANCE.words.at + (d * ENTRANCE.words.secondsPerRem) / PACE);
    const whole = Math.max(...places.map((place, k) => delays[k] + surfaceSeconds(place.far, calm)));
    surfacing.start(delays, whole + RHYTHM.lead / PACE);

    /* ── The exit ── */
    /* Gone: out of the tree, and every animation it made let go. */
    const finish = () => {
      done();
      for (const a of own) a.cancel();
      surfacing.dispose();
    };
    const leave = () => {
      /* Outermost first: the words converge on the axis as they go. */
      const far = Math.max(...distance);
      const near = Math.min(...distance);
      surfacing.sinkAll(distance.map((d) => EXIT.words.at + EXIT.words.spread * (far === near ? 0 : (far - d) / (far - near))));
      if (calm) {
        const out = [{ opacity: 1 }, { opacity: 0 }];
        for (const el of [figure, mark, axis]) move(el, out, REDUCED.fadeSeconds, 0, "linear");
        move(root, out, REDUCED.fadeSeconds, REDUCED.fadeSeconds, "linear");
        later(REDUCED.fadeSeconds, reveal);
        later(2 * REDUCED.fadeSeconds, finish);
        return;
      }
      move(figure, [{ transform: "translateY(0)" }, { transform: "translateY(-110%)" }], EXIT.count.seconds, EXIT.count.at, WIPE_EASE_CSS);
      move(mark, [{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], EXIT.mark.seconds, EXIT.mark.at, WIPE_EASE_CSS);
      move(axis, [{ transform: "scaleY(1)" }, { transform: "scaleY(0)" }], EXIT.axis.seconds, EXIT.axis.at, WIPE_EASE_CSS);
      move(root, [{ opacity: 1 }, { opacity: 0 }], EXIT.ground.seconds, EXIT.ground.at, groundEase);
      later(EXIT.revealAt, reveal);
      later(EXIT.ground.at + EXIT.ground.seconds, finish);
    };

    /* ── The count ── */
    let ticking = 0;
    const startedAt = performance.now();
    let last = startedAt;
    let shown = 0;
    let written = -1;
    let announced = 0;
    let fullAt = -1;
    const tick = () => {
      const now = performance.now();
      const t = (now - startedAt) / 1000;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      /* Nothing registered by the time the schedule has run: nothing heavy
         is loading on this page. */
      const settled = loadProgress.settled || (loadProgress.count === 0 && t > COUNT.minSeconds);
      const loaded = settled ? 1 : Math.min(COUNT.ceiling, loadProgress.value);
      const target = Math.min(loaded, schedule(clamp01(t / COUNT.minSeconds)));
      let next = Math.min(approach(shown, target, COUNT.rate, dt), shown + COUNT.maxPerSecond * dt);
      if (!settled) {
        /* Waiting on the load: lean ahead, slowly and only so far. */
        const reach = Math.min(schedule(clamp01(t / COUNT.minSeconds)), loaded + COUNT.lead.share * (COUNT.ceiling - loaded));
        if (reach > shown) next = Math.max(next, approach(shown, reach, COUNT.lead.rate, dt));
      }
      shown = Math.max(shown, next);
      const percent = settled && target >= 1 && shown > 0.995 ? 100 : Math.min(99, Math.floor(shown * 100));

      if (percent !== written) {
        written = percent;
        figure.textContent = formatCount(percent);
        const step = Math.floor(percent / COUNT.announceStep) * COUNT.announceStep;
        if (step !== announced) {
          announced = step;
          count.setAttribute("aria-valuenow", String(step));
        }
      }
      if (percent === 100) {
        if (fullAt < 0) fullAt = t;
        if (t - fullAt >= COUNT.holdAtFull) return leave();
      }
      ticking = window.setTimeout(tick, 1000 / COUNT.hz);
    };
    ticking = window.setTimeout(tick, 1000 / COUNT.hz);

    return () => {
      window.clearTimeout(ticking);
      for (const id of timers) window.clearTimeout(id);
      for (const a of own) a.cancel();
      surfacing.dispose();
    };
  }, [respectReducedMotion, reveal]);

  return (
    <div ref={scope} data-preloader className={cx(className)}>
      <PreloaderCount />
      <div data-preloader-anchor aria-hidden="true">
        <span data-preloader-axis />
        <PreloaderMark />
        <PreloaderWords />
      </div>
    </div>
  );
}
