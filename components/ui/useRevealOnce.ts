"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * ─── useRevealOnce ───
 *
 * Flips to true the first time the element crosses `threshold`, then stops
 * observing. One state change per section per session, so ordinary React
 * state is right here — unlike per-frame values, which live in refs.
 *
 * WHY NOT SCROLLTRIGGER. The house pattern is native `position: sticky` for
 * pins and plain measurement for progress. ScrollTrigger's pin is the part
 * that fights Lenis; the part that merely detects "on screen" is what an
 * IntersectionObserver already does, for free.
 *
 * No IntersectionObserver means an old browser, not a hidden section, so it
 * reveals immediately rather than never.
 */
export function useRevealOnce<T extends Element>(
  threshold = 0.2,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  /* Resolved at init rather than in the effect, so the fallback costs no
     extra render. The value never reaches markup, so the server (where the
     observer is always missing) disagreeing with the client is harmless. */
  const [revealed, setRevealed] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || revealed) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, revealed]);

  return [ref, revealed];
}

export default useRevealOnce;
