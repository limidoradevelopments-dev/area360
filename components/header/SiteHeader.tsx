"use client";

import { useEffect, useRef } from "react";

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import HeaderClock from "./HeaderClock";
import HeaderMark from "./HeaderMark";
import HeaderNav from "./HeaderNav";
import { HEADER_ENTRANCE, HEADER_REDUCED } from "./motion";

/**
 * ─── SiteHeader ───
 *
 * The page's head, over the hero's frame (the user's frames, 2026-10-30):
 * the mark at the left margin, the time in Sri Lanka at the copy's column,
 * the nav at the right margin. Its own feature, not the hero's: the nav
 * belongs to the site, and every section to come sits under it.
 *
 * THE GRID IS THE HERO'S: twelve columns (four on a phone) between the
 * master margins, so the clock stands on the same column as the headline's
 * axis below it (header.css, hero/copy/copy.css).
 *
 * THE ENTRANCE waits for the curtain (StageReveal) and plays as the chrome
 * does, with the dock (motion.ts): every line rises out of its mask, on
 * the compositor (ui/raiseLines.ts).
 */
export interface SiteHeaderProps {
  className?: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines lose their rise and only fade in.
   */
  respectReducedMotion?: boolean;
}

export default function SiteHeader({ className, respectReducedMotion = false }: SiteHeaderProps) {
  const scope = useRef<HTMLElement>(null);
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
    const m = HEADER_ENTRANCE;
    /* The DOM's order is the grid's reading order: mark, clock, zone, nav. */
    const cues: LineCue[] = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-line]"), (el, k) => ({
      el,
      at: m.at + k * m.stagger,
    }));
    return raiseLines(cues, { ...m.line, easing: m.ease }, calmAtEntrance.current ? HEADER_REDUCED : null);
  }, [revealed]);

  return (
    <header ref={scope} data-site-header className={className}>
      <HeaderMark />
      <HeaderClock />
      <HeaderNav />
    </header>
  );
}
