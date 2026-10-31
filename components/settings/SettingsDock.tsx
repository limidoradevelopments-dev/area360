"use client";

import { lazy, Suspense, useEffect, useRef } from "react";

import { useRenderQuality } from "@/components/ui/renderQuality";
import { useStageReveal } from "@/components/ui/StageReveal";

/**
 * ─── SettingsDock ───
 *
 * The page's settings, in its bottom-right corner: for now the scene's
 * quality — Auto (the device measured: the default), High, Medium, Low —
 * kept on this device (ui/renderQuality). The hero's engine takes a choice
 * on its next frame and compiles nothing for it. The dock itself is
 * Dock.tsx; this is the shell that decides when it is there.
 *
 * ONLY WHERE THERE IS A SCENE TO SET: mounted once the curtain has lifted
 * and the scene is live, gone if it is lost (no WebGL2, a lost context: the
 * still stands in, and nothing here would change it). So it is never in
 * the server's markup, and no pre-entrance state can flash.
 *
 * NOT IN THE PAGE'S FIRST SCRIPT (2026-10-31, the load audit). The dock
 * brings GSAP and Framer Motion, ~60 KB gzipped, and no one sees it before
 * the scene's opening shot. In the page's first chunk they sat on the
 * first screen's critical path: the engine's code is asked for only once
 * that chunk has arrived and run (StageCanvas), and the shaders compile
 * only once the engine's code is here. So the dock is its own chunk, asked
 * for once the scene has been measured in the dark (its level known) —
 * after everything the first screen waits on, and seconds before the
 * dock's cue — and never on a visit with no scene.
 */
export interface SettingsDockProps {
  className?: string;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the button and panel lose their travel, scale
   * and blur and only fade, briefly.
   */
  respectReducedMotion?: boolean;
}

const loadDock = () => import("./Dock");
const Dock = lazy(loadDock);

export default function SettingsDock(props: SettingsDockProps) {
  const { revealed } = useStageReveal();
  const { level } = useRenderQuality();
  const live = revealed && level !== null;

  /* Asked for once the scene has been measured, which is before the
     curtain lifts; never where there is no scene (the still stands in). */
  const measured = level !== null;
  useEffect(() => {
    if (measured) void loadDock();
  }, [measured]);

  /* When the scene went live: the dock's entrance is counted from then
     (Dock), however long its chunk takes. */
  const liveSince = useRef<number | null>(null);
  useEffect(() => {
    if (live) liveSince.current ??= performance.now();
  }, [live]);

  if (!live) return null;

  return (
    <Suspense fallback={null}>
      <Dock {...props} liveSince={liveSince} />
    </Suspense>
  );
}
