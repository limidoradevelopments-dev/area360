"use client";

import { useEffect, useRef } from "react";

import { floatCards, type CardCue } from "@/components/ui/floatCards";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import type { BreathHooks } from "@/components/works/breath";
import type { Work } from "@/components/works/content";
import { BREATH } from "@/components/works/motion";

import WorkFoot from "./WorkFoot";
import WorkPanel from "./WorkPanel";
import WorkPictures from "./WorkPictures";
import { WORK_TOGGLE } from "./content";
import { playFoot, playPanel } from "./entrance";
import { startFold } from "./fold";
import { WORK_ENTRANCE, WORK_REDUCED } from "./motion";

/**
 * ─── WorkDetailSection ───
 *
 * A work's own page (the user's frames, 2026-11-11: their 1920 frame, its
 * grid overlay and their phone frames, open and folded). ONE TEMPLATE FOR
 * EVERY WORK (app/works/[slug]), made at the build from its entry in
 * components/works/content.ts.
 *
 * ON A WIDE SCREEN, A SPREAD: the work's words on the left five columns,
 * held at the top of the screen (WorkPanel), its foot held at the bottom
 * (WorkFoot), while its pictures scroll past on the right seven
 * (WorkPictures). ON A PHONE, ONE COLUMN: the panel stays at the top, its
 * details folding away as the pictures come up and opening again from its
 * toggle (fold.ts), and the foot ends the page.
 *
 * THE ENTRANCE, ONCE, as the page opens (entrance.ts): top to bottom, every
 * line drops into its mask, the dots draw in; each picture floats up as it
 * comes into view. Web Animations: no GSAP on the page (AGENTS.md,
 * Loading).
 *
 * THE BREATH (2026-11-11, the user: the works' "mouse movement shader"
 * over these pictures too): the visitor's breath on the glass in front of
 * each picture, the works' own (works/breath.ts, its own chunk, shared
 * with the home page's), asked for only where a hand can hover (a mouse,
 * a pen: never touch) once the pictures are within a screen.
 *
 * A PANEL TALLER THAN THE SCREEN (a laptop's short screen, a phone on its
 * side): it is measured, and held by its foot instead, above the page's
 * foot, so every word of it can be scrolled to (work-detail.css).
 */
export interface WorkDetailSectionProps {
  work: Work;
  /** The work after it, for the foot's way on. */
  next: Work;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, lines, dots and pictures only fade in, and the
   * phone's details go and come without the pictures travelling.
   */
  respectReducedMotion?: boolean;
}

const TITLE_ID = "work-title";
const DETAILS_ID = "work-details";
/* The phone's band (AGENTS.md: the two breakpoints). */
const PHONE = "(max-width: 767.98px)";
/* The breath's glass here: each picture's own box, no parallax layer. */
const GLASS: BreathHooks = { frame: "[data-wp-glass]", layer: "[data-wp-image]", image: "img[data-wp-image]" };

export default function WorkDetailSection({ work, next, respectReducedMotion = false }: WorkDetailSectionProps) {
  const page = useRef<HTMLElement>(null);

  /* Read once, when an entrance plays: a preference that flips later must
     not replay it. */
  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;
  const calmAtEntrance = useRef(calm);
  useEffect(() => {
    calmAtEntrance.current = calm;
  }, [calm]);

  /* The panel's entrance, then, on a phone, its fold. The fold waits for
     the entrance: both move the details' lines. */
  useEffect(() => {
    const root = page.current;
    const panel = root?.querySelector<HTMLElement>("[data-wp-panel]");
    if (!root || !panel) return;
    let alive = true;
    let entered = false;
    let stopEntrance: (() => void) | null = null;
    let stopFold: (() => void) | null = null;
    let timer = 0;
    const phone = window.matchMedia(PHONE);

    const syncFold = () => {
      if (!alive || !entered) return;
      const details = root.querySelector<HTMLElement>("[data-wp-details]");
      const toggle = root.querySelector<HTMLButtonElement>("[data-wp-toggle]");
      if (phone.matches && details && toggle && !stopFold) {
        const movers = Array.from(root.querySelectorAll<HTMLElement>("[data-wp-media], [data-wp-foot]"));
        stopFold = startFold({ root, details, toggle, movers }, { calm: calmAtEntrance.current, labels: WORK_TOGGLE });
      } else if (!phone.matches && stopFold) {
        stopFold();
        stopFold = null;
      }
    };
    phone.addEventListener("change", syncFold);

    /* Its paragraphs are split into the lines the browser drew: in the
       face they are drawn in. */
    document.fonts.ready.then(() => {
      if (!alive) return;
      const entrance = playPanel(panel, calmAtEntrance.current);
      stopEntrance = entrance.stop;
      timer = window.setTimeout(() => {
        entered = true;
        syncFold();
      }, entrance.seconds * 1000);
    });

    return () => {
      alive = false;
      phone.removeEventListener("change", syncFold);
      window.clearTimeout(timer);
      stopEntrance?.();
      stopFold?.();
    };
  }, []);

  /* The foot, as it comes into view: with the panel's last lines on a wide
     screen (it is there from the start), at the page's end on a phone. */
  useEffect(() => {
    const foot = page.current?.querySelector<HTMLElement>("[data-wp-foot]");
    if (!foot) return;
    const opened = performance.now();
    let stop: (() => void) | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const waited = (performance.now() - opened) / 1000;
        stop = playFoot(foot, Math.max(0, WORK_ENTRANCE.footAt - waited), calmAtEntrance.current);
      },
      { threshold: 0.5 },
    );
    observer.observe(foot);
    return () => {
      observer.disconnect();
      stop?.();
    };
  }, []);

  /* The pictures, each as it comes into view: those that come in
     together, top to bottom; the first screen's after the panel's first
     lines. */
  useEffect(() => {
    const root = page.current;
    if (!root) return;
    const opened = performance.now();
    const stops: (() => void)[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        const arriving = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!arriving.length) return;
        const wait = Math.max(0, WORK_ENTRANCE.firstCardAt - (performance.now() - opened) / 1000);
        const cues: CardCue[] = arriving.map((entry, k) => {
          observer.unobserve(entry.target);
          return { el: entry.target as HTMLElement, at: wait + k * WORK_ENTRANCE.cardStagger };
        });
        stops.push(floatCards(cues, calmAtEntrance.current ? WORK_REDUCED : null));
      },
      { threshold: WORK_ENTRANCE.cardThreshold },
    );
    for (const card of root.querySelectorAll("[data-wp-media] [data-reveal-card]")) observer.observe(card);
    return () => {
      observer.disconnect();
      for (const stop of stops) stop();
    };
  }, []);

  /* The breath: where a hand can hover, once the pictures near. */
  useEffect(() => {
    const media = page.current?.querySelector<HTMLElement>("[data-wp-media]");
    if (!media || calm) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        near.disconnect();
        import("@/components/works/breath").then(({ startBreath }) => {
          if (!cancelled) stop = startBreath(media, GLASS);
        });
      },
      { rootMargin: BREATH.wakeMargin },
    );
    near.observe(media);
    return () => {
      cancelled = true;
      near.disconnect();
      stop?.();
    };
  }, [calm]);

  /* The panel's and the foot's heights, for holding a panel taller than the
     screen by its foot (work-detail.css). Written to the page as custom
     properties: read by its one sticky rule, nothing else. */
  useEffect(() => {
    const root = page.current;
    const panel = root?.querySelector<HTMLElement>("[data-wp-panel]");
    const foot = root?.querySelector<HTMLElement>("[data-wp-foot]");
    if (!root || !panel || !foot) return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--size-wp-panel", `${panel.offsetHeight}px`);
      root.style.setProperty("--size-wp-foot", `${foot.offsetHeight}px`);
    });
    observer.observe(panel);
    observer.observe(foot);
    return () => observer.disconnect();
  }, []);

  return (
    <article ref={page} aria-labelledby={TITLE_ID} data-work-page>
      <WorkPanel work={work} titleId={TITLE_ID} detailsId={DETAILS_ID} />
      <WorkPictures work={work} />
      <WorkFoot next={next} />
    </article>
  );
}
