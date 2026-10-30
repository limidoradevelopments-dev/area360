"use client";

import { useEffect, useRef } from "react";

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import { HERO_LEDE, HERO_TITLE } from "../content";
import HeroLede from "./HeroLede";
import HeroNotes from "./HeroNotes";
import HeroTitle from "./HeroTitle";
import { COPY_ENTRANCE, COPY_REDUCED } from "./motion";

/**
 * ─── HeroCopy ───
 *
 * The words over the scene (the user's frames, 2026-10-30): the headline,
 * the copy under it, and the two notes at the margins, on the hero's
 * twelve columns (four on a phone). A layer over the stage that never
 * takes the pointer: the scene reads the hand through it (copy.css).
 *
 * Owns the words' entrance: it waits for the curtain (StageReveal), then
 * the headline comes down into place, the copy after it, and the notes
 * with the chrome near the end of the opening shot (motion.ts), each line
 * dropping into its own mask from above, on the compositor.
 */
export interface HeroCopyProps {
  /** The headline's id: the section is labelled by it. */
  headingId: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines lose their rise and only fade in.
   */
  respectReducedMotion?: boolean;
}

export default function HeroCopy({ headingId, respectReducedMotion = false }: HeroCopyProps) {
  const scope = useRef<HTMLDivElement>(null);
  const { revealed } = useStageReveal();

  /* Read once, when the entrance plays: a preference that flips later must
     not replay it. */
  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;
  const calmAtEntrance = useRef(calm);
  useEffect(() => {
    calmAtEntrance.current = calm;
  }, [calm]);

  useEffect(() => {
    const root = scope.current;
    if (!revealed || !root) return;
    const m = COPY_ENTRANCE;
    const part = (selector: string, at: number, stagger: number): LineCue[] =>
      Array.from(root.querySelectorAll<HTMLElement>(`${selector} [data-reveal-line]`), (el, k) => ({
        el,
        at: at + k * stagger,
      }));
    const cues = [
      ...part("[data-hero-title]", m.title.at, m.title.stagger),
      ...part("[data-hero-lede]", m.lede.at, m.lede.stagger),
      ...part("[data-hero-note]", m.notes.at, m.notes.stagger),
    ];
    return raiseLines(cues, { ...m.line, easing: m.ease }, calmAtEntrance.current ? COPY_REDUCED : null);
  }, [revealed]);

  return (
    <div ref={scope} data-hero-copy data-reveal-drop>
      <HeroTitle id={headingId} lines={HERO_TITLE} />
      <HeroLede lines={HERO_LEDE} />
      <HeroNotes />
    </div>
  );
}
