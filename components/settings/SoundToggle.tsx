"use client";

import { useEffect, useRef, useState } from "react";

import { approach } from "@/components/ui/easing";

import { SOUND_BUTTON } from "./content";
import { SOUND } from "./motion";
import { WAVE_BOX, loudness, wavePath } from "./soundWave";

/**
 * ─── SoundToggle ───
 *
 * The page's sound, beside the settings button: a wave that plays while
 * the sound is on. NO AUDIO YET (2026-10-29, the user: "no sound attached,
 * I will do it later"): the toggle is real — a pressed or unpressed button
 * — and `on` below is where the audio will be started and stopped.
 *
 * PER-FRAME WORK OUTSIDE REACT (AGENTS.md): React renders the button once
 * with the wave at rest; while it plays a frame loop writes the path
 * straight to the SVG, and parks itself once the wave has settled, so a
 * silent page runs no loop at all. Under reduced motion (when asked to
 * respect it) the wave does not travel: on, it stands full and still.
 */
export interface SoundToggleProps {
  reduced: boolean;
}

const REST_PATH = wavePath(0, SOUND.rest);

export default function SoundToggle({ reduced }: SoundToggleProps) {
  const [on, setOn] = useState(false);
  const path = useRef<SVGPathElement>(null);
  /* The wave's state between frames: how far it is playing (0–1), how
     long it has played (s, for the swell), its phase, the loop. */
  const wave = useRef({ on: false, playing: 0, played: 0, phase: 0, last: 0, raf: 0 });

  useEffect(() => {
    const w = wave.current;
    w.on = on;
    const line = path.current;
    if (!line) return;
    if (reduced) {
      w.playing = on ? 1 : 0;
      line.setAttribute("d", wavePath(w.phase, on ? SOUND.full : SOUND.rest));
      return;
    }
    /* Silent and at rest: nothing to draw, no loop. */
    if (!on && w.playing === 0) return;
    const step = (now: number) => {
      /* A stalled frame (a tab put aside) is not played through. */
      const dt = w.last ? Math.min((now - w.last) / 1000, 0.1) : 0;
      w.last = now;
      w.playing = approach(w.playing, w.on ? 1 : 0, w.on ? SOUND.rise : SOUND.fall, dt);
      /* It travels as far as it plays: stopping, it slows to a stand. */
      w.phase += SOUND.speed * w.playing * dt;
      w.played += dt * w.playing;
      const height = SOUND.rest + (SOUND.full * loudness(w.played) - SOUND.rest) * w.playing;
      line.setAttribute("d", wavePath(w.phase, height));
      if (!w.on && w.playing < SOUND.restEpsilon) {
        w.playing = 0;
        line.setAttribute("d", wavePath(w.phase, SOUND.rest));
        w.raf = 0;
        w.last = 0;
        return;
      }
      w.raf = requestAnimationFrame(step);
    };
    w.raf = requestAnimationFrame(step);
    /* THE HANDLE IS LET GO WITH THE LOOP. Kept after a cancel, it read as
       a loop still running and none was ever started again: React's
       development double mount cancels the first effect's on every load,
       and the wave never moved. Its state lives on in the ref, so a loop
       started again (toggled mid-swell) carries on from where it was. */
    return () => {
      cancelAnimationFrame(w.raf);
      w.raf = 0;
      w.last = 0;
    };
  }, [on, reduced]);

  return (
    <button
      type="button"
      data-settings-sound
      aria-pressed={on}
      aria-label={SOUND_BUTTON.label}
      onClick={() => setOn((was) => !was)}
      className="grid cursor-pointer place-items-center"
    >
      <svg viewBox={`0 0 ${WAVE_BOX.width} ${WAVE_BOX.height}`} fill="none" aria-hidden focusable="false">
        <path ref={path} d={REST_PATH} stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
