"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import { LOST_STRIP } from "./content";
import { ENTRANCE, REDUCED, STRIP } from "./motion";
import RuinStage from "./scene/RuinStage";

/**
 * ─── LostLive ───
 *
 * The 404's live part, loaded only on the 404 (LostShell): the scene's
 * canvas, and the entrance of the words the server drew — the scene up out
 * of the black, then the words down into their masks and the strip in,
 * already falling (motion.ts). The words never wait long for the scene:
 * past `ENTRANCE.wait` they come anyway.
 *
 * The section is the server's: what this changes on it is data-
 * attributes (the stylesheet's states), never its markup.
 */
export default function LostLive({ respectReducedMotion }: { respectReducedMotion: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;
  /* Read once, when the entrance plays: a preference that flips later must
     not replay it. */
  const calmAtEntrance = useRef(calm);
  useEffect(() => {
    calmAtEntrance.current = calm;
  }, [calm]);

  /* When the words come, counted from now: null until then. */
  const [arrival, setArrival] = useState<number | null>(null);
  const arrive = useCallback((after: number) => setArrival((was) => was ?? after), []);

  /* The scene is up: the words as it settles. Or it is late, or there is
     none: the words now, and the still stands in. */
  const onShown = useCallback(() => arrive(0), [arrive]);
  const onUnavailable = useCallback(() => {
    const root = anchor.current?.closest<HTMLElement>("[data-lost]");
    if (root) root.dataset.lostScene = "still";
    arrive(-ENTRANCE.title.at);
  }, [arrive]);
  useEffect(() => {
    const late = window.setTimeout(() => arrive(-ENTRANCE.title.at), ENTRANCE.wait * 1000);
    return () => window.clearTimeout(late);
  }, [arrive]);

  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>("[data-lost]");
    if (arrival === null || !root) return;
    root.dataset.lostArrived = "";
    const m = ENTRANCE;
    const quiet = calmAtEntrance.current;
    const at = (seconds: number) => Math.max(0, seconds + arrival);
    /* Both breaks of the headline are cued, the hidden one too: a window
       resized across the phone's edge later finds its lines landed. */
    const lines = (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(`${selector} [data-reveal-line]`));
    const wide = lines('[data-lost-lines="wide"]');
    const narrow = lines('[data-lost-lines="narrow"]');
    const cues: LineCue[] = [
      ...wide.map((el, k) => ({ el, at: at(m.title.at + k * m.title.stagger) })),
      ...narrow.map((el, k) => ({ el, at: at(m.title.at + k * m.title.stagger) })),
    ];
    const lastLine = m.title.at + (Math.max(wide.length, narrow.length) - 1) * m.title.stagger;
    for (const el of lines("[data-lost-link]")) cues.push({ el, at: at(lastLine + m.link.after) });
    const letGo = raiseLines(cues, m.line, quiet ? REDUCED : null);

    /* The strip: in with the headline, already falling. */
    const strip = root.querySelector<HTMLElement>("[data-lost-strip]");
    const run = root.querySelector<HTMLElement>("[data-lost-strip-run]");
    const fade = strip?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: (quiet ? REDUCED.fadeSeconds : m.strip.seconds) * 1000,
      delay: at(m.strip.at) * 1000,
      easing: "linear",
      fill: "backwards",
    });
    const fall = quiet
      ? null
      : run?.animate([{ transform: "translateY(-50%)" }, { transform: "translateY(0)" }], {
          duration: LOST_STRIP.lines * STRIP.secondsPerLine * 1000,
          iterations: Infinity,
          easing: "linear",
        });
    return () => {
      letGo();
      fade?.cancel();
      fall?.cancel();
    };
  }, [arrival]);

  return (
    <>
      <span ref={anchor} hidden />
      <RuinStage reducedMotion={calm} onShown={onShown} onUnavailable={onUnavailable} />
    </>
  );
}
