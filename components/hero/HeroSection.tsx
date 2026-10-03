"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { cx } from "@/components/ui/cx";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import HeroStill from "./HeroStill";
import { BACKDROP } from "./stage/layers";
import StageCanvas from "./stage/StageCanvas";
import { HERO_HEADING } from "./content";
import { ENTRANCE, REDUCED } from "./motion";

gsap.registerPlugin(useGSAP);

/**
 * ─── HeroSection ───
 *
 * Still Water. A stone stands in a lake, in fog, seen from the shore. The
 * visitor's lean moves the camera a few centimetres; their hand moves the
 * air in front of the stone.
 *
 * LAYERS, bottom to top:
 *   the section's own background   the frame's light, band by band (CSS,
 *                                   [data-hero-ground])
 *   [data-hero-still]               the static still's layer (phase 5)
 *   [data-hero-stage]               the scene (WebGL), faded in over it
 *
 * The static layers are the first paint and the whole fallback. Once the
 * canvas is fully opaque they leave the visibility tree; if the context is
 * ever lost they come straight back.
 *
 * THE SHORES ARE ASKED FOR WITH THE PAGE. The engine fetches its two images
 * itself, but only once its code has arrived; preloaded from the page's own
 * head they download alongside the script and are waiting when it asks
 * (fetch, CORS, as the engine's own request is — or the browser fetches
 * them twice).
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

export default function HeroSection({ className, respectReducedMotion = false }: HeroSectionProps) {
  preload(BACKDROP.plateUrl, { as: "fetch", crossOrigin: "anonymous" });
  preload(BACKDROP.depthUrl, { as: "fetch", crossOrigin: "anonymous" });

  const scope = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  const prefersReduced = usePrefersReducedMotion();
  const reduced = respectReducedMotion && prefersReduced;
  /* The entrance reads this once, when it plays. A preference that flips
     later must not replay it. */
  const reducedAtEntrance = useRef(reduced);
  useEffect(() => {
    reducedAtEntrance.current = reduced;
  }, [reduced]);

  const { contextSafe } = useGSAP(
    () => {
      if (!ready) return;
      const calm = reducedAtEntrance.current;
      const tl = gsap.timeline({ defaults: { overwrite: true } });
      tl.fromTo(
        "[data-hero-stage]",
        { opacity: 0 },
        {
          opacity: 1,
          duration: calm ? REDUCED.fadeSeconds : ENTRANCE.fadeSeconds,
          ease: ENTRANCE.ease,
        },
      );
      /* Fully covered: the static paint stops compositing. */
      tl.set("[data-hero-still]", { visibility: "hidden" });
    },
    { scope, dependencies: [ready] },
  );

  /* The scene is gone (no WebGL2, or the context was lost): the static paint
     is the hero again. */
  const restoreStill = contextSafe(() => {
    gsap.set("[data-hero-still]", { visibility: "visible" });
    gsap.to("[data-hero-stage]", { opacity: 0, duration: REDUCED.fadeSeconds, overwrite: true });
  });

  return (
    <section
      ref={scope}
      aria-labelledby="hero-heading"
      data-hero-ground
      className={cx("relative h-svh w-full overflow-clip", "select-none touch-pan-y", className)}
    >
      <h1 id="hero-heading" className="sr-only">
        {HERO_HEADING}
      </h1>
      <HeroStill />
      <StageCanvas reducedMotion={reduced} onReady={() => setReady(true)} onUnavailable={restoreStill} />
    </section>
  );
}
