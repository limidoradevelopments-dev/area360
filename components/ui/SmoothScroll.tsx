"use client";

import { ReactLenis, useLenis } from "lenis/react";
import type { LenisOptions } from "lenis";
import type { ReactNode } from "react";

export interface SmoothScrollProps {
  children: ReactNode;
  /**
   * Additional or override Lenis options.
   */
  options?: Partial<LenisOptions>;
  /**
   * Whether to respect prefers-reduced-motion. Defaults to true.
   */
  respectReducedMotion?: boolean;
}

/**
 * ─── SmoothScroll ───
 *
 * Global smooth scroll provider powered by Lenis.
 *
 * Configured specifically to provide subtle momentum smoothing without
 * "hijacking" the user's scroll:
 *
 * - `lerp: 0.1` (or gentle duration): Smooths jagged mouse wheel notches without
 *   introducing heavy input latency or a floaty/dragging feeling.
 * - `wheelMultiplier: 1`: Preserves authentic 1:1 scroll distance.
 * - `syncTouch: false`: Strictly leaves mobile & trackpad touch gestures native.
 *   Touch hardware already has 120Hz momentum; intercepting touch creates the
 *   sluggish, artificial sensation users dislike.
 * - `anchors: true`: Enables graceful scrolling to in-page anchor targets.
 * - `autoToggle: true`: Automatically halts when overflow is locked (e.g.,
 *   during the preloader curtain or modal takeovers).
 */
export default function SmoothScroll({
  children,
  options,
  respectReducedMotion = true,
}: SmoothScrollProps) {
  const defaultOptions: LenisOptions = {
    lerp: 0.2,
    duration: 0.9,
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1,
    syncTouch: false,
    autoToggle: true,
    anchors: true,
    respectReducedMotion,
    ...options,
  };

  return (
    <ReactLenis root options={defaultOptions}>
      {children}
    </ReactLenis>
  );
}

export { useLenis };
