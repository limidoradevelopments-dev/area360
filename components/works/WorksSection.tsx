"use client";

import { useEffect, useRef } from "react";

import EyeTag from "@/components/ui/EyeTag";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import WorkCard from "./WorkCard";
import WorksTitle from "./WorksTitle";
import { numeralOf, slotOf, WORKS, WORKS_HEADING, WORKS_TAG } from "./content";
import { BREATH } from "./motion";

/**
 * ─── WorksSection ───
 *
 * The works, the nav's #works (the user's 1920 frames, 2026-11-06,
 * 2026-11-11 and 2026-11-12): the section's title on the page's axis — a
 * statement in two lines — and the eye tag at the left margin beside it
 * (ui/EyeTag: "Every work has a meaning & communicates with F E E L I N G
 * S"), over the works' cards on the page's twelve columns — three thirds,
 * the middle one square, then two wide ones at the margins — each its
 * picture, and under it its numeral, its name and its scope, linking to
 * its own page (app/works/[slug]).
 *
 * IT FOLLOWS THE PROMISE in the page's own flow (2026-11-02: nothing laid
 * over anything): as it comes up, the moth's letters have bloomed off the
 * mark and fade out above its top edge (promise/assembly.ts).
 *
 * THE PICTURES' MOTION IS CSS (works.css): their depth, and the square
 * card's sink into line with its row — scroll-driven animations on the
 * compositor, nothing of them here.
 *
 * ONE ENTRANCE, THE TAG'S (2026-11-12, the user: the title "doesn't need an
 * appear animation", only the eye tag): the tag plays its own once it is
 * seen and the curtain has lifted (ui/EyeTag, held by `ready`). The title
 * and the cards are simply there.
 *
 * THE BREATH (motion.ts BREATH, breath.ts): over a card's picture, the
 * visitor's breath on the glass. ITS OWN CHUNK, asked for only where a
 * hand can hover (a mouse, a pen: never touch, whose movement is the
 * scroll) once the section is within a screen of the screen.
 */
export interface WorksSectionProps {
  className?: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the pictures keep still (no parallax, and the
   * square card stands in line with its row: no sink), nothing breathes on
   * the glass and the tag only fades in.
   */
  respectReducedMotion?: boolean;
}

/* The heading's id: the section is labelled by it. */
const HEADING_ID = "works-heading";

export default function WorksSection({ className, respectReducedMotion = false }: WorksSectionProps) {
  const section = useRef<HTMLElement>(null);
  const { revealed } = useStageReveal();

  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;

  /* The breath: where a hand can hover, once the section nears. */
  useEffect(() => {
    const root = section.current;
    if (!revealed || !root || calm) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        near.disconnect();
        import("./breath").then(({ startBreath }) => {
          if (!cancelled) stop = startBreath(root);
        });
      },
      { rootMargin: BREATH.wakeMargin },
    );
    near.observe(root);
    return () => {
      cancelled = true;
      near.disconnect();
      stop?.();
    };
  }, [revealed, calm]);

  return (
    <section
      ref={section}
      id="works"
      aria-labelledby={HEADING_ID}
      data-works
      data-works-calm={calm ? "" : undefined}
      className={className}
    >
      <header data-works-head>
        {/* The tag first: left of the title at every size, so first for a
            reader too (AGENTS.md §9: the source is the reading order). */}
        <EyeTag
          lines={WORKS_TAG.lines}
          narrow
          word={WORKS_TAG.word}
          ready={revealed}
          respectReducedMotion={respectReducedMotion}
        />
        <WorksTitle id={HEADING_ID} lines={WORKS_HEADING} />
      </header>
      {WORKS.map((work, index) => (
        <WorkCard key={work.slug} work={work} slot={slotOf(index)} numeral={numeralOf(index)} />
      ))}
    </section>
  );
}
