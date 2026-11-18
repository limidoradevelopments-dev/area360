"use client";

import { useEffect, useRef } from "react";

import RevealLine from "@/components/ui/RevealLine";

import { HERO_CLOCK } from "../content";
import { CLOCK } from "./motion";

/**
 * ─── HeroClock ───
 *
 * The time in Sri Lanka, ticking, in a hairline box (moved here from the
 * header on 2026-11-18: the frames set it under the place it tells the time
 * of).
 *
 * WRITTEN STRAIGHT TO THE DOM, ON THE SECOND (AGENTS.md: per-frame work
 * outside React; motion.ts CLOCK). The page is exported static, so the
 * server's markup holds only a placeholder as wide as any time; the first
 * tick writes the real one before the curtain lifts, and React, which
 * never re-renders this, keeps no other copy to fight it. Nothing
 * announces the ticks: a live region would read the time every second.
 */

/* en-GB on a 24-hour cycle: "16:12:28". `hourCycle`, not `hour12: false`:
   some engines print midnight as "24:00:00" under the latter. */
const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: HERO_CLOCK.timeZone,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export default function HeroClock() {
  const face = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    const el = face.current;
    if (!el) return;
    let timer = 0;
    let near = true;
    const tick = () => {
      const now = Date.now();
      el.textContent = TIME.format(now);
      timer = window.setTimeout(tick, 1000 - (now % 1000) + CLOCK.lateMs);
    };
    /* PARKED WHILE UNSEEN (2026-10-31, the load audit): a write a second to
       a box no one sees still restyles it, and wakes the CPU. No timer
       while the box is off the screen or the tab put aside; back, it is
       put right at once — the margin starts it before the box is seen, so
       no stale time is ever drawn. */
    const sync = () => {
      const seen = near && document.visibilityState === "visible";
      if (seen && !timer) tick();
      else if (!seen && timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    };
    /* The box, not the time: the time sits in a reveal mask, clipped out
       of sight until the entrance drops it in. */
    const sight = new IntersectionObserver(
      ([entry]) => {
        near = entry?.isIntersecting ?? true;
        sync();
      },
      { rootMargin: CLOCK.wakeMargin },
    );
    sight.observe(el.closest("[data-hero-clock]") ?? el);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      sight.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <p data-hero-clock>
      <span className="sr-only">{HERO_CLOCK.label} </span>
      <RevealLine>
        <time ref={face} data-hero-time>
          {HERO_CLOCK.placeholder}
        </time>
      </RevealLine>
    </p>
  );
}
