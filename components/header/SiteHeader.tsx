"use client";

import { useEffect, useRef } from "react";

import { raiseLines } from "@/components/ui/raiseLines";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import { wipeIn } from "@/components/ui/wipeIn";

import HeaderContact from "./HeaderContact";
import { HEADER_ENTRANCE, HEADER_REDUCED } from "./motion";

/**
 * ─── SiteHeader ───
 *
 * The page's head, over the hero's frame (the user's frames, 2026-11-18):
 * the contact at the right margin. Its own feature, not the hero's: it
 * belongs to the site.
 *
 * THE GRID IS THE HERO'S: twelve columns (four on a phone) between the
 * master margins, from the same top edge, so the contact's capitals meet
 * the top row's below it (header.css, hero/copy/copy.css).
 *
 * THE ENTRANCE waits for the curtain (StageReveal) and plays near the end
 * of the hero's opening shot, with the rest of the chrome (motion.ts): the
 * line drops into its mask from above, on the compositor
 * (ui/raiseLines.ts), and its rule is drawn in under it (ui/wipeIn.ts).
 */
export interface SiteHeaderProps {
  className?: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the line loses its drop and the rule its wipe,
   * and both only fade in.
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
    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-line]"), (el) => ({ el, at: m.at }));
    const rules = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-wipe]"), (el) => ({
      el,
      at: m.at + m.rule.after,
    }));
    const stopLines = raiseLines(lines, { ...m.line, easing: m.ease }, calm);
    const stopRules = wipeIn(rules, { seconds: m.rule.seconds, easing: m.rule.ease }, calm);
    return () => {
      stopLines();
      stopRules();
    };
  }, [revealed]);

  return (
    <header ref={scope} data-site-header data-reveal-drop className={className}>
      <HeaderContact />
    </header>
  );
}
