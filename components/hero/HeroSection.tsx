"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";

import { cx } from "@/components/ui/cx";
import { loadProgress } from "@/components/ui/loadProgress";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import { MIST } from "./atmosphere/optics";
import HeroCopy from "./copy/HeroCopy";
import { followDescent } from "./descent";
import HeroStill from "./HeroStill";
import { BACKDROP } from "./stage/layers";
import StageCanvas from "./stage/StageCanvas";
import { descentLight, ENTRANCE, REDUCED } from "./motion";

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
 *   [data-hero-frame]               PINNED to the screen (hero.css), on the
 *                                   same ground: the page scrolls over it
 *     [data-hero-scene]             the scene's light (the descent fades it)
 *       [data-hero-still]           the scene's frame as a picture — only
 *                                   where there is no scene: no WebGL2, a
 *                                   lost context, no scripting
 *       [data-hero-stage]           the scene (WebGL), coming up out of the
 *                                   black as it arrives (motion.ts ENTRANCE)
 *   [data-hero-copy]                the words over it: the headline (the
 *                                   section's h1), the copy, the notes
 *                                   (copy/). Never takes the pointer, so the
 *                                   scene reads the hand through it. They
 *                                   scroll with the page.
 *
 * THE DESCENT (2026-10-30, the user: scrolling on, the camera goes down
 * while the hero fades and the page scrolls to the next section). The
 * scene stays pinned while the section's height scrolls by: the words and
 * the header go with the page at its speed, the camera sinks toward the
 * water with the scroll, held on the stone (stage/motion.ts DESCENT,
 * StageCanvas), and the scene's
 * light goes into the ground the next section stands on (motion.ts
 * DESCENT_FADE), which rises over it from below (promise.css: its veil).
 * The scroll is its clock (descent.ts): scrolled back, it comes back.
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
 * THE WORDS (2026-10-30, the user's frames): the headline, the copy and the
 * notes are this section's (copy/HeroCopy, arriving after the stone, as
 * the scene settles); the nav and the clock are the site's header
 * (components/header), over the top of this frame.
 */
export interface HeroSectionProps {
  className?: string;
  /**
   * Off by default: the scene moves for everyone. When on and the visitor
   * prefers reduced motion, the scene stops moving on its own — no lean, no
   * gusts, no breathing, no billowing, the wind slowed to a quarter, no
   * cursor wake — and the canvas arrives with a short fade, the words with
   * it, without their rise. Touching the fog and holding still in it work:
   * that motion is the visitor's own. Scrolled past, the scene's light still
   * goes; the camera stays where it stands.
   */
  respectReducedMotion?: boolean;
}

/* The name the scene loads under in the page's load store. */
const LOAD_NAME = "hero";
/* The headline's id: the section is labelled by it. */
const HEADING_ID = "hero-heading";

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

  /* THE DESCENT'S LIGHT, written straight to the scene on every scroll
     (per-frame work outside React): its opacity, and once it is gone the
     scene marked dark (data-dark: out of the visibility tree, hero.css;
     and the next section's veil gives way to its whole ground,
     promise.css). The mark changes only as the light crosses zero: a
     toggle to the state it is in writes nothing. */
  useEffect(() => {
    const section = scope.current;
    const scene = section?.querySelector<HTMLElement>("[data-hero-scene]");
    if (!section || !scene) return;
    return followDescent(section, (progress) => {
      const light = descentLight(progress);
      scene.style.opacity = light < 1 ? String(light) : "";
      scene.toggleAttribute("data-dark", light <= 0);
    });
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
      aria-labelledby={HEADING_ID}
      data-hero-ground
      data-hero-fallback={fallback ? "" : undefined}
      className={cx("relative h-svh w-full overflow-clip", "select-none touch-pan-y", className)}
    >
      <div data-hero-frame>
        <div data-hero-scene>
          <HeroStill />
          <StageCanvas
            reducedMotion={reduced}
            started={revealed}
            onReady={markReady}
            onProgress={(fraction) => loadProgress.report(LOAD_NAME, fraction)}
            onUnavailable={restoreStill}
          />
        </div>
      </div>
      <HeroCopy headingId={HEADING_ID} respectReducedMotion={respectReducedMotion} />
    </section>
  );
}
