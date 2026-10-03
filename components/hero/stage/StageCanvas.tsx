"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ComponentType } from "react";

import type { StageEngine } from "./engine";

/**
 * ─── StageCanvas ───
 *
 * Mounts the engine and forwards the world to it: pointer events, scroll and
 * keys (for the stillness clock), size, visibility. It renders one canvas
 * and never re-renders for anything the scene does — per-frame work lives in
 * the engine, outside React.
 *
 * The engine is a dynamic import started after mount, so none of it (or its
 * shaders) sits in front of the first paint. Until its first frame exists
 * the static paint underneath IS the hero.
 *
 * Pointer events are read from the whole section, not the canvas, so text
 * laid over the scene later still lets the fog feel the hand beneath it.
 */

export interface StageCanvasProps {
  reducedMotion: boolean;
  /** The first frame is painted; the canvas can be faded in. */
  onReady: () => void;
  /** No WebGL2, no half-float targets, or the context was lost. */
  onUnavailable: () => void;
}

type Tuner = { Panel: ComponentType<{ engine: StageEngine }>; engine: StageEngine };

/* Resize settles before the engine re-measures: a rebuild resets the air. */
const RESIZE_SETTLE_MS = 120;

export default function StageCanvas({ reducedMotion, onReady, onUnavailable }: StageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StageEngine | null>(null);
  const [tuner, setTuner] = useState<Tuner | null>(null);

  const ready = useEffectEvent(() => onReady());
  const unavailable = useEffectEvent(() => onUnavailable());
  const startsReduced = useEffectEvent(() => reducedMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = canvas?.closest("section");
    if (!canvas || !frame) return;

    let engine: StageEngine | null = null;
    let cancelled = false;
    let onScreen = true;

    const syncVisibility = () =>
      engine?.setVisible(onScreen && document.visibilityState === "visible");

    import("./engine").then(({ createStageEngine }) => {
      if (cancelled) return;
      engine = createStageEngine({
        canvas,
        frame,
        reducedMotion: startsReduced(),
        onFirstFrame: () => ready(),
        onLost: () => unavailable(),
      });
      if (!engine) {
        unavailable();
        return;
      }
      engineRef.current = engine;
      syncVisibility();

      if (process.env.NODE_ENV !== "production") {
        /* Development handle: the in-app browser freezes rAF, so motion is
           verified by driving `advance(seconds)` from the console, and the
           look by `measure()` against the reference's bands. */
        (window as unknown as { __kaviStage?: StageEngine }).__kaviStage = engine;
      }
      if (new URLSearchParams(window.location.search).has("tune")) {
        const live = engine;
        import("./StageTuner").then(({ default: Panel }) => {
          if (!cancelled) setTuner({ Panel, engine: live });
        });
      }
    });

    /* The tuning panel floats over the scene; touching it must not. */
    const onPanel = (event: PointerEvent) =>
      event.target instanceof Element && event.target.closest("[data-stage-tuner]") !== null;

    /* Primary button only: a right click is not a touch. */
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (onPanel(event)) return;
      engine?.pointerDown(event.clientX, event.clientY, event.pointerType);
    };
    const move = (event: PointerEvent) => {
      if (onPanel(event)) return;
      engine?.pointerMove(event.clientX, event.clientY, event.pointerType);
    };
    const up = () => engine?.pointerUp();
    const leave = () => engine?.pointerLeave();
    /* A long press on touch is warmth in the fog, not a request for a menu.
       A right click still gets its menu. */
    let lastType = "mouse";
    const track = (event: PointerEvent) => (lastType = event.pointerType);
    const menu = (event: Event) => {
      if (lastType === "touch") event.preventDefault();
    };
    /* Not being still: a native passive scroll listener covers wheel, touch,
       keys and restored positions in one path (and survives Lenis standing
       down); keys cover reading with the keyboard. */
    const activity = () => engine?.activity();

    frame.addEventListener("pointerdown", track);
    frame.addEventListener("pointerdown", down);
    frame.addEventListener("pointermove", move, { passive: true });
    frame.addEventListener("pointerup", up);
    frame.addEventListener("pointercancel", up);
    frame.addEventListener("pointerleave", leave);
    frame.addEventListener("contextmenu", menu);
    window.addEventListener("scroll", activity, { passive: true });
    window.addEventListener("keydown", activity);

    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => engine?.resize(), RESIZE_SETTLE_MS);
    });
    resizeObserver.observe(frame);

    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      syncVisibility();
    });
    intersection.observe(frame);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      cancelled = true;
      frame.removeEventListener("pointerdown", track);
      frame.removeEventListener("pointerdown", down);
      frame.removeEventListener("pointermove", move);
      frame.removeEventListener("pointerup", up);
      frame.removeEventListener("pointercancel", up);
      frame.removeEventListener("pointerleave", leave);
      frame.removeEventListener("contextmenu", menu);
      window.removeEventListener("scroll", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", syncVisibility);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.clearTimeout(resizeTimer);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return (
    <>
      <div data-hero-stage className="absolute inset-0 z-[1]">
        <canvas ref={canvasRef} className="block size-full" />
      </div>
      {tuner && (
        <div data-stage-tuner>
          <tuner.Panel engine={tuner.engine} />
        </div>
      )}
    </>
  );
}
