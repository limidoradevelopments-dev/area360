"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";

import { cx } from "@/components/ui/cx";
import { loadProgress } from "@/components/ui/loadProgress";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import { MIST } from "./atmosphere/optics";
import HeroStill from "./HeroStill";
import { BACKDROP } from "./stage/layers";
import StageCanvas from "./stage/StageCanvas";
import { HERO_HEADING } from "./content";
import { ENTRANCE, REDUCED } from "./motion";

/**
 * ─── HeroSection ───
 *
 * Still Water. A stone stands in a lake, in fog, seen from the shore. The
 * visitor's lean moves the camera a few centimetres; their hand moves the
 * air in front of the stone.
 *
 * LAYERS, bottom to top:
 *   the section's own background   #111111 (CSS, [data-hero-ground]): the
 *                                   first paint, the preloader's own ground
 *   [data-hero-still]               the scene's frame as a picture — only
 *                                   where there is no scene: no WebGL2, a
 *                                   lost context, no scripting
 *   [data-hero-stage]               the scene (WebGL), coming up out of the
 *                                   black as it arrives (motion.ts ENTRANCE)
 *
 * THE SCENE ARRIVES, NOT A PICTURE (2026-10-20, the user: it read as an
 * image or a video). The first paint was the scene's own first frame as a
 * picture, which the canvas faded in over unseen — so the first thing the
 * visitor saw was a photograph. Now the frame is the ground until the scene
 * is ready (the preloader stands there), then the scene comes up out of it
 * with the camera settling into place and the air rolling. The still is
 * fetched only when it is shown (lazy, and undisplayed until then).
 *
 * BEHIND THE CURTAIN (2026-10-23): the preloader (components/preloader)
 * stands in front while the scene loads and counts it — the engine reports
 * its progress into the page's load store (ui/loadProgress), and its being
 * ready (or unavailable) is what lets the curtain go. A ready scene holds,
 * drawing nothing, until the curtain begins to lift (StageReveal); then it
 * comes up and arrives. Outside a curtain it starts at once, as before.
 *
 * THE SHORES ARE ASKED FOR WITH THE PAGE. The engine fetches its images (the
 * shores' two, the low mist's veil) itself, but only once its code has
 * arrived; preloaded from the page's own head they download alongside the
 * script and are waiting when it asks (fetch, CORS, as the engine's own
 * request is — or the browser fetches them twice).
 *
 * PHASES 0–1: the stage — the camera, the fog, the parallax, the film — the
 * shores (one photograph with a depth for every pixel, framed and graded as
 * the user's 1200×700 design), the lake's moving surface and the stone.
 * What stands on the stone comes next; the weather arrives later, the
 * headline, nav and copy with the entrance in phase 5.
 */
export interface HeroSectionProps {
  className?: string;
  /**
   * Off by default: the scene moves for everyone. When on and the visitor
   * prefers reduced motion, the scene stops moving on its own — no lean, no
   * gusts, no breathing, no billowing, the wind slowed to a quarter, no
   * cursor wake — and the canvas arrives with a short fade. Touching the fog
   * and holding still in it work: that motion is the visitor's own.
   */
  respectReducedMotion?: boolean;
}

/* The name the scene loads under in the page's load store. */
const LOAD_NAME = "hero";

export default function HeroSection({ className, respectReducedMotion = false }: HeroSectionProps) {
  preload(BACKDROP.plateUrl, { as: "fetch", crossOrigin: "anonymous" });
  preload(BACKDROP.depthUrl, { as: "fetch", crossOrigin: "anonymous" });
  if (MIST.on) preload(MIST.url, { as: "fetch", crossOrigin: "anonymous" });

  const scope = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const { revealed } = useStageReveal();
  /* No scene (no WebGL2, or the context was lost): the still stands in. */
  const [fallback, setFallback] = useState(false);

  const prefersReduced = usePrefersReducedMotion();
  const reduced = respectReducedMotion && prefersReduced;
  /* The entrance reads this once, when it plays. A preference that flips
     later must not replay it. */
  const reducedAtEntrance = useRef(reduced);
  useEffect(() => {
    reducedAtEntrance.current = reduced;
  }, [reduced]);

  useEffect(() => {
    loadProgress.begin(LOAD_NAME);
  }, []);

  /* The stage's one fade at a time (motion.ts ENTRANCE: on the compositor).
     A new one replaces it from wherever it got to; none queues. */
  const fade = useRef<Animation | null>(null);
  const fadeStage = (frames: Keyframe[], seconds: number, easing: string) => {
    const stage = scope.current?.querySelector<HTMLElement>("[data-hero-stage]");
    if (!stage) return;
    fade.current?.cancel();
    fade.current = stage.animate(frames, { duration: seconds * 1000, easing, fill: "forwards" });
  };

  useEffect(() => {
    if (!ready || !revealed) return;
    const calm = reducedAtEntrance.current;
    /* From the CSS pre-state (hero.css), stated, never read. */
    fadeStage([{ opacity: 0 }, { opacity: 1 }], calm ? REDUCED.fadeSeconds : ENTRANCE.fadeSeconds, ENTRANCE.ease);
  }, [ready, revealed]);

  const markReady = () => {
    setReady(true);
    loadProgress.finish(LOAD_NAME);
  };

  /* The scene is gone (no WebGL2, or the context was lost): the still is
     the hero. */
  const restoreStill = () => {
    setFallback(true);
    loadProgress.finish(LOAD_NAME);
    const stage = scope.current?.querySelector<HTMLElement>("[data-hero-stage]");
    const from = stage ? getComputedStyle(stage).opacity : "0";
    fadeStage([{ opacity: from }, { opacity: 0 }], REDUCED.fadeSeconds, REDUCED.out);
  };

  return (
    <section
      ref={scope}
      aria-labelledby="hero-heading"
      data-hero-ground
      data-hero-fallback={fallback ? "" : undefined}
      className={cx("relative h-svh w-full overflow-clip", "select-none touch-pan-y", className)}
    >
      <h1 id="hero-heading" className="sr-only">
        {HERO_HEADING}
      </h1>
      <HeroStill />
      <StageCanvas
        reducedMotion={reduced}
        started={revealed}
        onReady={markReady}
        onProgress={(fraction) => loadProgress.report(LOAD_NAME, fraction)}
        onUnavailable={restoreStill}
      />
    </section>
  );
}
