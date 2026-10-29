"use client";

import { useEffect, useRef } from "react";

import RevealLine from "@/components/ui/RevealLine";

import { HEADER_CLOCK } from "./content";
import { CLOCK } from "./motion";

/**
 * ─── HeaderClock ───
 *
 * The time in Sri Lanka, ticking, in a hairline box, its zone under it.
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
  timeZone: HEADER_CLOCK.timeZone,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export default function HeaderClock() {
  const face = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    const el = face.current;
    if (!el) return;
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      el.textContent = TIME.format(now);
      timer = window.setTimeout(tick, 1000 - (now % 1000) + CLOCK.lateMs);
    };
    /* A tab put aside throttles its timers: back in view, it is put right
       at once rather than on its next late tick. */
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      tick();
    };
    tick();
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  return (
    <p data-header-clock>
      <span className="sr-only">{HEADER_CLOCK.label} </span>
      <RevealLine>
        <time ref={face} data-header-time>
          {HEADER_CLOCK.placeholder}
        </time>{" "}
      </RevealLine>
      <RevealLine>{HEADER_CLOCK.zone}</RevealLine>
    </p>
  );
}
