"use client";

import { useEffect, useRef } from "react";

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import HeaderClock from "./HeaderClock";
import HeaderMark from "./HeaderMark";
import HeaderNav from "./HeaderNav";
import { HEADER_ENTRANCE, HEADER_REDUCED } from "./motion";
import { startScrollCue } from "./scrollCue";

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
 * THE ENTRANCE waits for the curtain (StageReveal) and plays near the end
 * of the hero's opening shot, the first of the chrome (motion.ts): every
 * line drops into its mask from above, on the compositor
 * (ui/raiseLines.ts), and the nav's rule draws down with its words, then
 * keeps the page's scroll cue (scrollCue.ts).
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
    const calm = calmAtEntrance.current ? HEADER_REDUCED : null;
    /* The DOM's order is the grid's reading order: mark, clock, zone, nav. */
    const cues: LineCue[] = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-line]"), (el, k) => ({
      el,
      at: m.at + k * m.stagger,
    }));
    const stopLines = raiseLines(cues, { ...m.line, easing: m.ease }, calm);

    /* The rule draws down with the nav: from its first word's cue until its
       last word has landed. */
    const rule = root.querySelector<HTMLElement>("[data-header-rule]");
    const ink = rule?.querySelector<HTMLElement>("[data-header-rule-ink]");
    const words = cues.filter((cue) => cue.el.closest("[data-header-nav]"));
    if (!rule || !ink || words.length === 0) return stopLines;
    const drawAt = words[0].at;
    const drawSeconds = words[words.length - 1].at + m.line.seconds - drawAt;
    const stopCue = startScrollCue({ rule, ink }, { drawAt, drawSeconds, calm });
    return () => {
      stopLines();
      stopCue();
    };
  }, [revealed]);

  return (
    <header ref={scope} data-site-header data-reveal-drop className={className}>
      <HeaderMark />
      <HeaderClock />
      <HeaderNav />
    </header>
  );
}
