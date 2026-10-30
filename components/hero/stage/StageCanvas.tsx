"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ComponentType } from "react";

import { renderQuality, type QualityChoice, type QualityLevel } from "@/components/ui/renderQuality";

import { followDescent } from "../descent";
import { DESCENT_FADE } from "../motion";
import type { StageEngine, StageEngineOptions } from "./engine";

/**
 * ─── StageCanvas ───
 *
 * Mounts the engine and forwards the world to it: pointer events, scroll and
 * keys (for the stillness clock), size, visibility. It renders one canvas
 * and never re-renders for anything the scene does — per-frame work lives in
 * the engine, outside React.
 *
 * The engine is a dynamic import, so none of it (or its shaders) sits in
 * front of the first paint. Until its first frame exists the ground
 * underneath (or, with no scene, the still) IS the hero. In production it
 * starts the moment its code arrives, before this component mounts (`early`),
 * and the component takes it over.
 *
 * HELD FOR THE CURTAIN: a ready engine draws nothing and starts no arrival
 * until `started` (the page's curtain has begun to lift), so the opening
 * shot is never spent behind the preloader.
 *
 * Pointer events are read from the whole scene, not the canvas, so text
 * laid over it still lets the fog feel the hand beneath it.
 *
 * THE SCENE IS PINNED, THE SECTION SCROLLS (2026-10-30: the descent). The
 * engine measures, and maps the hand against, the scene (hero.css
 * [data-hero-scene]: fixed, a screen tall), which never moves; the scroll
 * through the section takes the camera down (stage/motion.ts DESCENT), and
 * once the scene has gone dark (hero/motion.ts DESCENT_FADE) — or the
 * section has left the screen, or the tab is hidden — the engine draws
 * nothing.
 */

export interface StageCanvasProps {
  reducedMotion: boolean;
  /** The page lets the scene come up: its arrival begins (at once, or as
   *  soon as the engine is ready). */
  started: boolean;
  /** The first frame is ready (drawn and measured in the dark); the canvas
   *  can be faded in once `started`. */
  onReady: () => void;
  /** How far the engine has got toward that first frame, 0–1. */
  onProgress?: (fraction: number) => void;
  /** No WebGL2, no half-float targets, or the context was lost. */
  onUnavailable: () => void;
}

type Tuner = { Panel: ComponentType<{ engine: StageEngine }>; engine: StageEngine };

/* Resize settles before the engine re-measures: a rebuild resets the air. */
const RESIZE_SETTLE_MS = 120;

/* The engine's code is asked for as soon as this module runs — while the
   page is still hydrating — not from the mount effect after it: the
   download overlaps hydration instead of following it. Only in the
   browser; the server never needs it. */
const engineModule = typeof window === "undefined" ? null : import("./engine");

type Handlers = Required<Pick<StageEngineOptions, "onFirstFrame" | "onProgress" | "onLost" | "onTier">>;

/* THE VISITOR'S QUALITY, as the engine's tiers (stage/optics.ts
   RENDER.tiers, best first): the settings control speaks in levels
   (ui/renderQuality), the engine in tiers, and this is the one place the
   two meet. */
const LEVELS: readonly QualityLevel[] = ["high", "medium", "low"];
const tierOf = (choice: QualityChoice): number | null => (choice === "auto" ? null : LEVELS.indexOf(choice));
const levelOf = (tier: number): QualityLevel => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, tier))];

/**
 * What an engine started before the page hydrated says before the
 * component is there to hear it: kept, and passed on once it connects.
 */
class Relay implements Handlers {
  private to: Handlers | null = null;
  private progressed = 0;
  private framed = false;
  private lost = false;
  private tier = -1;
  readonly onProgress = (fraction: number) => {
    this.progressed = fraction;
    this.to?.onProgress(fraction);
  };
  readonly onFirstFrame = () => {
    this.framed = true;
    this.to?.onFirstFrame();
  };
  readonly onLost = () => {
    this.lost = true;
    this.to?.onLost();
  };
  readonly onTier = (tier: number) => {
    this.tier = tier;
    this.to?.onTier(tier);
  };
  connect(to: Handlers): void {
    this.to = to;
    if (this.progressed > 0) to.onProgress(this.progressed);
    if (this.tier >= 0) to.onTier(this.tier);
    if (this.framed) to.onFirstFrame();
    if (this.lost) to.onLost();
  }
}

interface Boot {
  /* null: no stage here (no WebGL2, no half-float targets). */
  readonly engine: StageEngine | null;
  readonly canvas: HTMLCanvasElement;
  readonly relay: Relay;
  claimed: boolean;
}

/**
 * THE ENGINE STARTS AS SOON AS ITS CODE HAS ARRIVED, not once the page has
 * hydrated and this component's effect has run: the shaders start
 * compiling, and the shores decoding, on the canvas the server already
 * drew (2026-10-23). A first visit waits on that compile above all, and it
 * runs 2–4× slower once the curtain's animations are going (any animation
 * on the page does it: measured cold, Windows); started before them, the
 * longest programs get that head start uncontended. The engine sizes and
 * draws nothing until the component claims it (`attach`), so hydration
 * finds the canvas as the server left it.
 *
 * Production only: in development a hot reload runs this module again, and
 * a second engine would start on a canvas whose first still lives.
 */
const early: Promise<Boot | null> | null =
  engineModule && process.env.NODE_ENV === "production"
    ? engineModule
        .then(({ createStageEngine }) => {
          const canvas = document.querySelector<HTMLCanvasElement>("[data-hero-stage] canvas");
          const frame = canvas?.closest<HTMLElement>("[data-hero-scene]");
          if (!canvas || !frame) return null;
          const relay = new Relay();
          /* Reduced motion is the component's to say: told on attach. The
             quality is the visitor's stored choice, known already. */
          const quality = tierOf(renderQuality.current.choice);
          const engine = createStageEngine({ canvas, frame, reducedMotion: false, detached: true, quality, ...relayed(relay) });
          return { engine, canvas, relay, claimed: false };
        })
        .catch(() => null)
    : null;

function relayed(relay: Relay): Handlers {
  return { onFirstFrame: relay.onFirstFrame, onProgress: relay.onProgress, onLost: relay.onLost, onTier: relay.onTier };
}

export default function StageCanvas({ reducedMotion, started, onReady, onProgress, onUnavailable }: StageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StageEngine | null>(null);
  const [tuner, setTuner] = useState<Tuner | null>(null);

  const ready = useEffectEvent(() => onReady());
  const progress = useEffectEvent((fraction: number) => onProgress?.(fraction));
  /* No live scene: nothing for the settings control to set. */
  const unavailable = useEffectEvent(() => {
    renderQuality.settle(null);
    onUnavailable();
  });
  const startsReduced = useEffectEvent(() => reducedMotion);
  /* Read when the engine arrives: the curtain may have lifted first. */
  const startedNow = useEffectEvent(() => started);

  useEffect(() => {
    const canvas = canvasRef.current;
    /* The scene: pinned, a screen tall — what the engine sizes to and maps
       the hand against. The section: what scrolls by. */
    const frame = canvas?.closest<HTMLElement>("[data-hero-scene]");
    const section = canvas?.closest("section");
    if (!canvas || !frame || !section) return;

    let engine: StageEngine | null = null;
    let cancelled = false;
    let onScreen = true;
    /* The scroll's way through the section, and whether the scene has gone
       dark on it (DESCENT_FADE.to). */
    let descent = 0;
    let dark = false;

    const syncVisibility = () =>
      engine?.setVisible(onScreen && !dark && document.visibilityState === "visible");
    /* Under reduced motion the camera stays where it stands; only the light
       goes (HeroSection). */
    const sendDescent = () => engine?.setDescent(startsReduced() ? 0 : descent);

    const handlers: Handlers = {
      onFirstFrame: () => ready(),
      onProgress: (fraction) => progress(fraction),
      onLost: () => unavailable(),
      onTier: (tier) => renderQuality.settle(levelOf(tier)),
    };
    /* The engine started early, if it started on this canvas and nobody has
       it yet (React's development double mount, a remount: a new one). */
    const take = async (): Promise<StageEngine | null> => {
      const boot = await early;
      if (cancelled) return null;
      if (boot && !boot.claimed && boot.canvas === canvas) {
        boot.claimed = true;
        if (boot.engine) {
          boot.relay.connect(handlers);
          boot.engine.setReducedMotion(startsReduced());
          boot.engine.attach();
        }
        return boot.engine;
      }
      /* Started on a canvas the page no longer has (a hydration that
         rendered afresh): let go, not left drawing nowhere. */
      if (boot && !boot.claimed) {
        boot.claimed = true;
        boot.engine?.dispose();
      }
      const { createStageEngine } = await (engineModule ?? import("./engine"));
      if (cancelled) return null;
      const quality = tierOf(renderQuality.current.choice);
      return createStageEngine({ canvas, frame, reducedMotion: startsReduced(), quality, ...handlers });
    };
    /* The visitor's choice, as it changes: the engine takes it on its next
       frame (an engine started early was told the stored one at its start,
       and is told again here in case it changed before it was claimed). */
    let unsubscribe: (() => void) | null = null;
    const followQuality = (live: StageEngine) => {
      live.setQuality(tierOf(renderQuality.current.choice));
      unsubscribe = renderQuality.subscribe(() => live.setQuality(tierOf(renderQuality.current.choice)));
    };

    take().then((made) => {
      if (cancelled) {
        made?.dispose();
        return;
      }
      engine = made;
      if (!engine) {
        unavailable();
        return;
      }
      engineRef.current = engine;
      followQuality(engine);
      if (startedNow()) engine.start();
      sendDescent();
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
    }).catch((error: unknown) => {
      /* The engine's code never arrived: the still stays the hero. */
      console.warn(error);
      if (!cancelled) unavailable();
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

    /* The scene is pinned and always "on screen": whether it is seen is
       the section's (it scrolls) and the descent's (it goes dark first). */
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      syncVisibility();
    });
    intersection.observe(section);
    document.addEventListener("visibilitychange", syncVisibility);

    const stopDescent = followDescent(section, (progress) => {
      descent = progress;
      sendDescent();
      const gone = progress >= DESCENT_FADE.to;
      if (gone !== dark) {
        dark = gone;
        syncVisibility();
      }
    });

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
      stopDescent();
      resizeObserver.disconnect();
      intersection.disconnect();
      window.clearTimeout(resizeTimer);
      unsubscribe?.();
      engine?.dispose();
      engineRef.current = null;
      renderQuality.settle(null);
      /* The development handle let go too: holding the disposed engine, it
         kept its context, canvas and every array alive after unmount. */
      const handle = window as unknown as { __kaviStage?: StageEngine };
      if (engine && handle.__kaviStage === engine) delete handle.__kaviStage;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
    /* Calm: the camera back where it stands; the next scroll says the rest. */
    if (reducedMotion) engineRef.current?.setDescent(0);
  }, [reducedMotion]);

  useEffect(() => {
    if (started) engineRef.current?.start();
  }, [started]);

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
