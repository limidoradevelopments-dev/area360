"use client";

import { useEffect, useRef } from "react";

import EyeTag from "@/components/ui/EyeTag";
import { raiseLines } from "@/components/ui/raiseLines";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import { useRevealOnce } from "@/components/ui/useRevealOnce";

import WorkCard from "./WorkCard";
import WorksTitle from "./WorksTitle";
import { numeralOf, spanOf, WORKS, WORKS_HEADING, WORKS_TAG } from "./content";
import { BREATH, WORKS_REDUCED, WORKS_REVEAL } from "./motion";

/**
 * ─── WorksSection ───
 *
 * The works, the nav's #works (the user's 1920 frames, 2026-11-06 and
 * 2026-11-11): the section's title on the page's axis — a statement in
 * two lines — and the eye tag at the left margin beside it (ui/EyeTag:
 * "Every work has a meaning & communicates with F E E L I N G S"), over
 * the works' cards on the page's twelve columns — a wide card and two
 * narrow ones, then two wide — each its numeral, its picture, its name
 * and its scope, linking to its own page (app/works/[slug]).
 *
 * IT FOLLOWS THE PROMISE in the page's own flow (2026-11-02: nothing laid
 * over anything): as it comes up, the moth's letters have bloomed off the
 * mark and fade out above its top edge (promise/assembly.ts).
 *
 * THE PICTURES' DEPTH IS CSS (works.css): a scroll-driven animation on the
 * compositor, nothing of it here.
 *
 * THE ENTRANCE, ONCE, after the curtain: the title's lines drop into their
 * masks; the tag plays its own (ui/EyeTag, held for the curtain)
 * (motion.ts WORKS_REVEAL). THE CARDS HAVE NONE (2026-11-11, the user:
 * "card one time appear animation remove completely"): they are simply
 * there, their pictures' depth and the breath their only motion. Web Animations, not GSAP: GSAP's chunk stays
 * off the page's first load (AGENTS.md, Loading).
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
   * prefers reduced motion, the title and cards only fade in (no travel,
   * no blur), the pictures keep still (no parallax) and nothing breathes
   * on the glass.
   */
  respectReducedMotion?: boolean;
}

/* The heading's id: the section is labelled by it. */
const HEADING_ID = "works-heading";

export default function WorksSection({ className, respectReducedMotion = false }: WorksSectionProps) {
  const section = useRef<HTMLElement>(null);
  const [title, titleSeen] = useRevealOnce<HTMLHeadingElement>(WORKS_REVEAL.titleThreshold);
  const { revealed } = useStageReveal();

  /* Read once, when an entrance plays: a preference that flips later must
     not replay it. */
  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;
  const calmAtEntrance = useRef(calm);
  useEffect(() => {
    calmAtEntrance.current = calm;
  }, [calm]);

  /* The title, once it is in view and the curtain has lifted: its lines in
     reading order. */
  useEffect(() => {
    const root = title.current;
    if (!revealed || !titleSeen || !root) return;
    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-line]"), (el, k) => ({
      el,
      at: k * WORKS_REVEAL.titleStagger,
    }));
    return raiseLines(lines, WORKS_REVEAL.title, calmAtEntrance.current ? WORKS_REDUCED : null);
  }, [revealed, title, titleSeen]);

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
        {/* The tag first: over the title on a phone, so first for a
            reader too (AGENTS.md §9: the source is the reading order). */}
        <EyeTag lines={WORKS_TAG.lines} word={WORKS_TAG.word} ready={revealed} respectReducedMotion={respectReducedMotion} />
        <WorksTitle ref={title} id={HEADING_ID} lines={WORKS_HEADING} />
      </header>
      {WORKS.map((work, index) => (
        <WorkCard key={work.slug} work={work} span={spanOf(index)} numeral={numeralOf(index)} />
      ))}
    </section>
  );
}
