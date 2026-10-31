"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

import { cx } from "@/components/ui/cx";
import { renderQuality, useRenderQuality, type QualityChoice } from "@/components/ui/renderQuality";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";

import { SettingsGlyph } from "./DockMarks";
import QualityOptions from "./QualityOptions";
import SoundToggle from "./SoundToggle";
import { SETTINGS_BUTTON } from "./content";
import { DOCK_MOTION, DOCK_REDUCED, RELOAD } from "./motion";
import type { SettingsDockProps } from "./SettingsDock";

gsap.registerPlugin(useGSAP);

/**
 * ─── Dock ───
 *
 * The dock itself (SettingsDock is the light shell that decides when it
 * is there): mounted only while the scene is live, so every mount is the
 * dock's entrance and every unmount leaves nothing open behind it.
 *
 * ITS OWN CHUNK: GSAP and Framer Motion are this file's alone on the
 * first screen, and the dock is never seen before the scene's opening
 * shot — so neither is in the page's first script, which the engine's own
 * import waits behind (SettingsDock).
 *
 * A DISCLOSURE, not a modal: the button says whether its panel is open and
 * which it controls; Escape or a press anywhere else closes it, focus back
 * on the button; the panel is inert while closed.
 *
 * A CHOICE RELOADS THE PAGE (2026-10-29, the user: "so they notice
 * something happen"; motion.ts RELOAD): the cross travels to it, the page
 * goes to the night and reloads, and the scene comes up at its new
 * quality. Only when the choice is kept on this device — where storage is
 * refused the reload would lose it, so there the scene takes it live
 * instead, as it always can.
 */
export interface DockProps extends SettingsDockProps {
  /** When the scene went live (performance.now(), ms), or null if it is
   *  going live in this very render: the entrance is counted from then,
   *  not from whenever this chunk arrived. */
  liveSince: RefObject<number | null>;
}

export default function Dock({ className, respectReducedMotion = false, liveSince }: DockProps) {
  const { choice, level } = useRenderQuality();
  const prefersReduced = usePrefersReducedMotion();
  const reduced = respectReducedMotion && prefersReduced;

  const [open, setOpen] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const panelId = `${id}-panel`;

  /* The button's one entrance, with its wave, on its cue after the scene
     went live — less however long this chunk took to arrive, so a slow
     network makes it no later in the choreography. */
  useGSAP(
    () => {
      const m = DOCK_MOTION;
      const since = liveSince.current === null ? 0 : (performance.now() - liveSince.current) / 1000;
      gsap.fromTo(
        "[data-settings-launcher]",
        { opacity: 0, y: reduced ? 0 : `${m.enterLiftRem}rem` },
        {
          opacity: 1,
          y: 0,
          duration: reduced ? DOCK_REDUCED.seconds : m.enterSeconds,
          delay: reduced ? 0 : Math.max(0, m.enterDelay - since),
          ease: m.ease,
          overwrite: true,
        },
      );
    },
    { scope },
  );

  /* The panel, opened and closed. INTERRUPTED, IT TURNS ROUND: a close
     tweens from wherever the open got to, and an open from wherever a close
     did — only from fully shut does it start at its from-state. The blur
     behind it is switched on as it opens and off once it has closed. */
  useGSAP(
    () => {
      const panel = scope.current?.querySelector<HTMLElement>("[data-settings-panel]");
      if (!panel) return;
      const o = DOCK_MOTION.open;
      const c = DOCK_MOTION.close;
      if (open) {
        panel.setAttribute("data-open", "");
        const shut = Number(gsap.getProperty(panel, "opacity")) === 0;
        const from = reduced ? { autoAlpha: 0 } : { autoAlpha: 0, y: o.fromY, scale: o.fromScale, filter: `blur(${o.fromBlurPx}px)` };
        const to = {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: reduced ? DOCK_REDUCED.seconds : o.seconds,
          ease: DOCK_MOTION.ease,
          overwrite: true,
          clearProps: "filter",
        };
        if (shut) gsap.fromTo(panel, from, to);
        else gsap.to(panel, to);
        return;
      }
      gsap.to(panel, {
        autoAlpha: 0,
        y: reduced ? 0 : c.toY,
        scale: reduced ? 1 : c.toScale,
        duration: reduced ? DOCK_REDUCED.seconds : c.seconds,
        ease: c.ease,
        overwrite: true,
        onComplete: () => panel.removeAttribute("data-open"),
      });
    },
    { scope, dependencies: [open] },
  );

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !scope.current?.contains(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  /* A choice: kept, the page goes to the night and reloads (RELOAD); the
     reload's timer, so a second choice in the fade starts no second one
     and an unmount cancels it. */
  const veil = useRef<HTMLDivElement>(null);
  const leaving = useRef(0);
  const choose = (next: QualityChoice) => {
    const kept = renderQuality.choose(next);
    if (!kept || leaving.current) return;
    const fade = reduced ? DOCK_REDUCED.seconds : RELOAD.fade;
    /* Out of the visibility tree until now (settings.css): a full-screen
       layer at opacity 0 for the whole visit, for a fade most visits never
       play. */
    const night = veil.current;
    if (night) {
      night.style.visibility = "visible";
      night.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: fade * 1000,
        delay: RELOAD.after * 1000,
        easing: RELOAD.ease,
        fill: "forwards",
      });
    }
    /* A timer, not the fade's end: a tab put aside holds its animations,
       and the choice should still take. */
    leaving.current = window.setTimeout(() => window.location.reload(), (RELOAD.after + fade) * 1000);
  };
  useEffect(() => () => window.clearTimeout(leaving.current), []);

  return (
    <div ref={scope} data-settings-dock className={cx("fixed z-50 flex flex-col items-end", className)}>
      <div id={panelId} data-settings-panel inert={!open}>
        <QualityOptions name={`${id}-quality`} choice={choice} level={level} onChoose={choose} />
      </div>
      <div data-settings-launcher className="flex items-center">
        <SoundToggle reduced={reduced} />
        <button
          ref={button}
          type="button"
          data-settings-button
          aria-label={open ? SETTINGS_BUTTON.close : SETTINGS_BUTTON.open}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((was) => !was)}
          className="grid cursor-pointer place-items-center"
        >
          <SettingsGlyph />
        </button>
      </div>
      <div ref={veil} data-settings-veil aria-hidden />
    </div>
  );
}
