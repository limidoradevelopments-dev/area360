"use client";

import { useSyncExternalStore } from "react";

/**
 * ─── usePrefersReducedMotion ───
 *
 * The visitor's reduced-motion preference as a boolean, live. For motion
 * that is not a GSAP tween (a render loop, a simulation), where
 * `gsap.matchMedia()` has nothing to attach to.
 *
 * The server snapshot is `false`: the server cannot know, and the signature
 * motion plays by default anyway (house rule: `respectReducedMotion` is
 * opt-in per section).
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

export default usePrefersReducedMotion;
