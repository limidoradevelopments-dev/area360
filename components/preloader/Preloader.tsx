"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { cx } from "@/components/ui/cx";
import { approach, clamp01 } from "@/components/ui/easing";
import { loadProgress } from "@/components/ui/loadProgress";
import { useStageReveal } from "@/components/ui/StageReveal";

import PreloaderCount from "./PreloaderCount";
import PreloaderMark from "./PreloaderMark";
import PreloaderWords from "./PreloaderWords";
import { PRELOADER_SLOTS, formatCount } from "./content";
import { COUNT, ENTRANCE, EXIT, GOLDEN, REDUCED } from "./motion";
import { Surfacing, readPlaces, surfaceSeconds } from "./surfacing";

gsap.registerPlugin(useGSAP);

/**
 * ─── Preloader ───
 *
 * The curtain in front of the page while the hero's scene loads, built on
 * the user's frame (2026-10-23): a hairline axis, the half mark to its
 * left, the words to its right, the count at the top — Cormorant Garamond,
 * #585858 on #111111. Inspired by Far Cry 3's loading screens, not copied:
 * the words surface and sink like reflections on still water (motion.ts,
 * THE IDEA; surfacing.ts).
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
 * Per-frame work (the count) runs on GSAP's ticker, outside React: the
 * figure is written straight to the DOM.
 */
export interface PreloaderProps {
  className?: string;
  /**
   * Off by default: the signature motion plays for everyone. When on and the
   * visitor prefers reduced motion, there is no shear, blur, travel or
   * clipping: the axis, the mark, the count and each word simply fade, and a
   * place's word cross-fades to the next.
   */
  respectReducedMotion?: boolean;
}

export default function Preloader({ className, respectReducedMotion = false }: PreloaderProps) {
  const scope = useRef<HTMLDivElement>(null);
  const { reveal } = useStageReveal();

  useGSAP(
    (_context, contextSafe) => {
      const root = scope.current;
      if (!root || !contextSafe) return;
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

      const places = readPlaces(root, PRELOADER_SLOTS);
      const surfacing = new Surfacing(places, calm, contextSafe);

      /* ── The entrance ── */
      const enter = gsap.timeline({ defaults: { overwrite: true } });
      if (calm) {
        gsap.set(axis, { scaleY: 1 });
        gsap.set(mark, { xPercent: 0, x: 0 });
        gsap.set(figure, { yPercent: 0, y: 0 });
        enter.fromTo([axis, mark, figure], { opacity: 0 }, { opacity: 1, duration: REDUCED.fadeSeconds });
      } else {
        const E = ENTRANCE;
        enter
          .fromTo(axis, { scaleY: 0 }, { scaleY: 1, duration: E.axis.seconds, ease: E.axis.ease }, E.axis.at)
          /* `y: 0` / `x: 0` ARE LOAD-BEARING: GSAP reads the stylesheet's
             pre-state transform as px and would stack the percent on it. */
          .fromTo(
            figure,
            { yPercent: 110, y: 0 },
            { yPercent: 0, duration: E.count.seconds, ease: E.count.ease },
            E.count.at,
          )
          .fromTo(
            mark,
            { xPercent: 100, x: 0 },
            { xPercent: 0, duration: E.mark.seconds, ease: E.mark.ease },
            E.mark.at,
          );
      }

      /* The words surface in a wave out from the axis: released by their
         distance from it, then all held until the frame has been seen
         whole. */
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const centre = anchor.getBoundingClientRect();
      const distance = places.map((place) => {
        const box = place.el.getBoundingClientRect();
        return Math.hypot(box.left + box.width / 2 - centre.left, box.top + box.height / 2 - centre.top) / rem;
      });
      const delays = distance.map((d) => ENTRANCE.words.at + d * ENTRANCE.words.secondsPerRem);
      const ends = places.map((place, k) => delays[k] + surfaceSeconds(place.far, calm));
      const whole = Math.max(...ends);
      const holds = places.map(
        (_, k) => whole - ends[k] + ENTRANCE.firstHold.seconds + ENTRANCE.firstHold.spread * ((((k + 1) * GOLDEN) % 1)),
      );
      surfacing.start(delays, holds);

      /* ── The exit ── */
      const leave = contextSafe(() => {
        /* Outermost first: the words converge on the axis as they go. */
        const far = Math.max(...distance);
        const near = Math.min(...distance);
        const at = distance.map((d) => EXIT.words.spread * (far === near ? 0 : (far - d) / (far - near)));
        const exit = gsap.timeline({ defaults: { overwrite: true }, onComplete: done });
        exit.add(surfacing.sinkAll(at), EXIT.words.at);
        if (calm) {
          exit
            .to([figure, mark, axis], { opacity: 0, duration: REDUCED.fadeSeconds }, 0)
            .call(reveal, [], REDUCED.fadeSeconds)
            .to(root, { opacity: 0, duration: REDUCED.fadeSeconds }, REDUCED.fadeSeconds);
          return;
        }
        exit
          .to(figure, { yPercent: -110, duration: EXIT.count.seconds, ease: EXIT.count.ease }, EXIT.count.at)
          .to(mark, { xPercent: 100, duration: EXIT.mark.seconds, ease: EXIT.mark.ease }, EXIT.mark.at)
          .to(axis, { scaleY: 0, duration: EXIT.axis.seconds, ease: EXIT.axis.ease }, EXIT.axis.at)
          .call(reveal, [], EXIT.revealAt)
          .to(root, { opacity: 0, duration: EXIT.ground.seconds, ease: EXIT.ground.ease }, EXIT.ground.at);
      });

      /* ── The count ── */
      const startedAt = gsap.ticker.time;
      let shown = 0;
      let written = -1;
      let announced = 0;
      let fullAt = -1;
      const tick = (time: number, deltaMs: number) => {
        const t = time - startedAt;
        const dt = Math.min(deltaMs / 1000, 0.1);
        /* Nothing registered by the time the schedule has run: nothing
           heavy is loading on this page. */
        const settled = loadProgress.settled || (loadProgress.count === 0 && t > COUNT.minSeconds);
        const loaded = settled ? 1 : Math.min(COUNT.ceiling, loadProgress.value);
        const schedule = COUNT.schedule(clamp01(t / COUNT.minSeconds));
        const target = Math.min(loaded, schedule);
        let next = Math.min(approach(shown, target, COUNT.rate, dt), shown + COUNT.maxPerSecond * dt);
        if (!settled) {
          /* Waiting on the load: lean ahead, slowly and only so far. */
          const reach = Math.min(schedule, loaded + COUNT.lead.share * (COUNT.ceiling - loaded));
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
        if (percent < 100) return;
        if (fullAt < 0) fullAt = t;
        if (t - fullAt < COUNT.holdAtFull) return;
        gsap.ticker.remove(tick);
        leave();
      };
      gsap.ticker.add(tick);

      return () => {
        gsap.ticker.remove(tick);
        surfacing.stop();
      };
    },
    { scope, dependencies: [] },
  );

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
