"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import { ENTRANCE, REDUCED } from "../motion";
import type { RuinScene } from "./engine";

/**
 * ─── RuinStage ───
 *
 * The canvas the ruin is drawn on, and its engine's life (scene/engine.ts).
 *
 * THE ENGINE'S CODE IS ASKED FOR AT ONCE, when this module runs, not when
 * the component mounts: its download overlaps the page's hydration.
 *
 * It comes up out of the page's black once its first frame exists (a Web
 * Animation on its opacity: the compositor's, whatever the page is doing),
 * and leans with the hand — a mouse's or a pen's: a finger on a phone is
 * reading, not steering.
 */
const engineModule = typeof window === "undefined" ? null : import("./engine");

export interface RuinStageProps {
  /** No water clock, no grain, no lean; a short fade. Read at mount. */
  reducedMotion: boolean;
  /** Its first frame is up and fading in. */
  onShown(): void;
  /** There will be no scene: the still stands in. */
  onUnavailable(): void;
}

export default function RuinStage({ reducedMotion, onShown, onUnavailable }: RuinStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shown = useEffectEvent(() => onShown());
  const unavailable = useEffectEvent(() => onUnavailable());
  const calmAtStart = useEffectEvent(() => reducedMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engineModule) return;
    let scene: RuinScene | null = null;
    let disposed = false;
    let fade: Animation | null = null;
    const calm = calmAtStart();

    engineModule
      .then(({ createRuinScene }) => {
        if (disposed) return;
        scene = createRuinScene(
          canvas,
          {
            onFirstFrame() {
              if (disposed) return;
              /* Lit by the stylesheet; the animation only brings it up. */
              canvas.dataset.lit = "";
              fade = canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: (calm ? REDUCED.fadeSeconds : ENTRANCE.scene.seconds) * 1000,
                easing: calm ? "linear" : ENTRANCE.scene.easing,
              });
              shown();
            },
            onLost() {
              if (disposed) return;
              delete canvas.dataset.lit;
              unavailable();
            },
          },
          { reducedMotion: calm },
        );
      })
      .catch(() => {
        if (!disposed) unavailable();
      });

    /* The hand over the frame, −1–1 each way (y up): the viewport is the
       frame, so no layout is read for it. */
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      scene?.lean((event.clientX / window.innerWidth) * 2 - 1, 1 - (event.clientY / window.innerHeight) * 2);
    };
    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) scene?.centre();
    };
    const onBlur = () => scene?.centre();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("blur", onBlur);

    return () => {
      disposed = true;
      fade?.cancel();
      scene?.dispose();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return <canvas ref={canvasRef} data-lost-canvas aria-hidden="true" />;
}
