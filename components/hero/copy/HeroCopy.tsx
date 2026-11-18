"use client";

import { useEffect, useRef } from "react";

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { readerPx } from "@/components/ui/scale";
import { useStageReveal } from "@/components/ui/StageReveal";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import { HERO_LEDE, HERO_SOCIAL, HERO_SPECIALIZED, HERO_TITLE } from "../content";
import HeroFoot from "./HeroFoot";
import HeroList from "./HeroList";
import HeroPlace from "./HeroPlace";
import HeroStatement from "./HeroStatement";
import { COPY_ENTRANCE, COPY_REDUCED } from "./motion";

/**
 * ─── HeroCopy ───
 *
 * The words over the scene (the user's 1920 and 390 frames, 2026-11-18):
 * the statement at the top left, the two lists and the place across the
 * top beside it (under it on a tablet, stacked on a phone), the mark and
 * the byline at the foot — on the hero's twelve columns, four on a phone
 * (copy.css). A layer over the stage that never takes the pointer but at
 * its links: the scene reads the hand through it.
 *
 * Owns the words' entrance: it waits for the curtain (StageReveal), then
 * the statement comes down into place, and the chrome with the header's
 * contact near the end of the opening shot (motion.ts), each line
 * dropping into its own mask from above, on the compositor.
 */
export interface HeroCopyProps {
  /** The headline's id: the section is labelled by it. */
  headingId: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines lose their drop and only fade in.
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
    const lines = (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector));
    const cues = [
      ...passage(root, "[data-hero-title]", m.title.at, m.title.stagger),
      ...passage(root, "[data-hero-lede]", m.lede.at, m.lede.stagger),
      ...wavefront(lines("[data-hero-list] [data-reveal-line], [data-hero-place] [data-reveal-line]"), m.band),
      ...wavefront(lines("[data-hero-mark] [data-reveal-line], [data-hero-byline] [data-reveal-line]"), m.foot),
    ];
    return raiseLines(cues, { ...m.line, easing: m.ease }, calmAtEntrance.current ? COPY_REDUCED : null);
  }, [revealed]);

  return (
    <div ref={scope} data-hero-copy data-reveal-drop>
      <HeroStatement headingId={headingId} title={HERO_TITLE} lede={HERO_LEDE} />
      <HeroList name="specialized" label={HERO_SPECIALIZED.label} items={HERO_SPECIALIZED.items} />
      <HeroList name="social" label={HERO_SOCIAL.label} items={HERO_SOCIAL.links} nav />
      <HeroPlace />
      <HeroFoot />
    </div>
  );
}

/**
 * A passage's phrases by the line each stands on (its mask's top: the
 * phrase itself waits translated out of it), the lines in reading order a
 * stagger apart, the phrases on one line together: they read as one line
 * dropping in, whichever frame's breaks are shown.
 */
function passage(root: HTMLElement, selector: string, at: number, stagger: number): LineCue[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>(`${selector} [data-reveal-line]`));
  const tops = els.map((el) => Math.round((el.parentElement ?? el).getBoundingClientRect().top));
  const rows = [...new Set(tops)].sort((a, b) => a - b);
  return els.map((el, k) => ({ el, at: at + rows.indexOf(tops[k]) * stagger }));
}

/**
 * Each line's cue by where it stands: a front leaving the set's top left
 * corner, reaching a line `down` seconds a rem below it and `across`
 * seconds over the set's whole width. One layout read for the set. A line
 * not shown (the phone's mark) has no place: it takes the first cue.
 */
function wavefront(els: readonly HTMLElement[], cue: { at: number; down: number; across: number }): LineCue[] {
  const rects = els.map((el) => el.getBoundingClientRect());
  const shown = rects.filter((r) => r.height > 0);
  if (shown.length === 0) return els.map((el) => ({ el, at: cue.at }));
  const top = Math.min(...shown.map((r) => r.top));
  const left = Math.min(...shown.map((r) => r.left));
  const width = Math.max(...shown.map((r) => r.right)) - left || 1;
  const rem = readerPx();
  return els.map((el, k) => {
    const r = rects[k];
    if (r.height === 0) return { el, at: cue.at };
    return { el, at: cue.at + ((r.top - top) / rem) * cue.down + ((r.left - left) / width) * cue.across };
  });
}
