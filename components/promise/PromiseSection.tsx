"use client";

import { useEffect, useRef } from "react";

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { splitLines, type SplitLines } from "@/components/ui/splitLines";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import { useRevealOnce } from "@/components/ui/useRevealOnce";

import PromisePassage from "./PromisePassage";
import PromiseStage from "./PromiseStage";
import PromiseStars from "./PromiseStars";
import { PROMISE_ABOVE, PROMISE_BELOW, PROMISE_HEADING } from "./content";
import { PROMISE_REDUCED, PROMISE_REVEAL, PROMISE_STARS_REVEAL } from "./motion";
import { lightStars } from "./starLight";

/**
 * ─── PromiseSection ───
 *
 * The reality promise: after the hero, on the same black, a passage, the
 * stars (the user's four, each with its light), a passage, and the stage the mark
 * will take; every paragraph between rows of amber dots on the page's
 * grid (promise.css).
 *
 * IT RISES OVER THE HERO'S SCENE (the descent, hero/HeroSection): the
 * scene stays pinned behind the page and goes dark as the hero scrolls
 * by, and this section's ground comes up over it from below (its veil).
 *
 * THE ENTRANCE, ONCE (2026-10-30, the user: "just like the hero's text,
 * top to bottom"): as each passage comes into view, its paragraphs are
 * split into the lines the browser drew (ui/splitLines.ts: they wrap with
 * their block, so the lines are measured, not authored) and every line
 * drops into its mask from above, down the passage (motion.ts), on the
 * compositor (ui/raiseLines.ts). Landed, the paragraphs are given back
 * their own text, wrapping with their block again.
 *
 * THE STARS, ONCE: as the cluster comes into view, each star comes out in
 * turn, from a point to its size with its light, and lives on
 * (starLight.ts) — parked while it is off the screen.
 *
 * STILL TO COME: the scroll's own work. Its hooks are in place
 * (data-promise-passage, -text, -stars, -stage, -mark).
 *
 * NO VISIBLE HEADING: the frame has none. The section is labelled by a
 * heading for a reader of the page only.
 */
export interface PromiseSectionProps {
  className?: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines lose their fall and only fade in, and
 * the stars fade in and stay still (no flares, no twinkle).
   */
  respectReducedMotion?: boolean;
}

/* The heading's id: the section is labelled by it. */
const HEADING_ID = "promise-heading";

export default function PromiseSection({ className, respectReducedMotion = false }: PromiseSectionProps) {
  const [above, aboveSeen] = useRevealOnce<HTMLDivElement>(PROMISE_REVEAL.threshold);
  const [below, belowSeen] = useRevealOnce<HTMLDivElement>(PROMISE_REVEAL.threshold);
  const [stars, starsSeen] = useRevealOnce<HTMLDivElement>(PROMISE_STARS_REVEAL.threshold);

  /* Read once, when an entrance plays: a preference that flips later must
     not replay it. */
  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;
  const calmAtEntrance = useRef(calm);
  useEffect(() => {
    calmAtEntrance.current = calm;
  }, [calm]);

  useEffect(() => {
    if (aboveSeen && above.current) return dropPassage(above.current, calmAtEntrance.current);
  }, [above, aboveSeen]);

  useEffect(() => {
    if (starsSeen && stars.current) {
      return lightStars(stars.current, { calm: calmAtEntrance.current ? PROMISE_REDUCED : null });
    }
  }, [stars, starsSeen]);

  useEffect(() => {
    if (belowSeen && below.current) return dropPassage(below.current, calmAtEntrance.current);
  }, [below, belowSeen]);

  return (
    <section aria-labelledby={HEADING_ID} data-promise data-reveal-drop className={className}>
      <h2 id={HEADING_ID} className="sr-only">
        {PROMISE_HEADING}
      </h2>
      <PromisePassage ref={above} place="above" paragraphs={PROMISE_ABOVE} />
      <PromiseStars ref={stars} />
      <PromisePassage ref={below} place="below" paragraphs={PROMISE_BELOW} />
      <PromiseStage />
    </section>
  );
}

/**
 * A passage's lines, dropped into their masks from above, top to bottom
 * through its paragraphs; its paragraphs given back their text once every
 * line has landed. Returns what stops it (an unmount): the lines let go
 * and the text given back as it is.
 */
function dropPassage(passage: HTMLElement, calm: boolean): () => void {
  let stopped = false;
  let stopLines: (() => void) | null = null;
  const splits: SplitLines[] = [];
  const giveBack = () => {
    for (const split of splits) split.revert();
    splits.length = 0;
  };

  /* Split in the face the lines are drawn in: measured in a fallback,
     they would break in the wrong places once the face arrived. */
  document.fonts.ready.then(() => {
    if (stopped) return;
    for (const paragraph of passage.querySelectorAll<HTMLElement>("[data-promise-text]")) {
      splits.push(splitLines(paragraph));
    }
    const m = PROMISE_REVEAL;
    const cues: LineCue[] = splits.flatMap((split) => split.lines).map((el, k) => ({ el, at: k * m.stagger }));
    stopLines = raiseLines(cues, { ...m.line, easing: m.ease }, calm ? PROMISE_REDUCED : null);
    /* Every line's own animation, laid just now: once all have landed, the
       text goes back. An early stop rejects them, and gives it back itself. */
    const landed = cues.flatMap(({ el }) => el.getAnimations().map((animation) => animation.finished));
    Promise.all(landed).then(
      () => {
        if (!stopped) giveBack();
      },
      () => {},
    );
  });

  return () => {
    stopped = true;
    stopLines?.();
    giveBack();
  };
}
