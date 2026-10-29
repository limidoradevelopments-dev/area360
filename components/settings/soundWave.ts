/**
 * ─── Settings · the sound wave's shape ───
 *
 * The line beside the settings button is the page's sound (2026-10-29, the
 * user: "this line next to settings is the sound — use a proper sound
 * wave"; no audio is attached yet). A pure function of the wave's phase
 * and its height, so the button's loop only writes the result, and the
 * shape can be checked without a frame.
 *
 * A SOUND, NOT A SINE: two tones a golden ratio apart in both their length
 * and their speed (motion.ts SOUND), so the line never comes back to the
 * same shape — a voice's wave, not a test tone's — under an envelope that
 * holds it to the baseline at both ends, as a pulse of sound is drawn.
 */

import { SOUND } from "./motion";

/** The drawing's box, its own units: a CSS px each at the 16px origin. */
export const WAVE_BOX = { width: 24, height: 8 } as const;

const PHI = (1 + Math.sqrt(5)) / 2;
const SAMPLES = 48;

/**
 * The wave as an SVG path: `phase` (radians of the first tone) and
 * `height` (0–1 of the box's half-height, less the stroke).
 */
export function wavePath(phase: number, height: number): string {
  const { width, height: h } = WAVE_BOX;
  const mid = h / 2;
  /* Half the stroke kept clear of the box's edge. */
  const reach = (mid - 0.5) * height;
  const k = (2 * Math.PI) / SOUND.wavelength;
  let d = "";
  for (let i = 0; i <= SAMPLES; i += 1) {
    const x = 0.5 + (i / SAMPLES) * (width - 1);
    /* Held to the line at both ends, fullest in the middle. */
    const envelope = Math.sin((Math.PI * i) / SAMPLES) ** SOUND.envelope;
    const tone = SOUND.mix * Math.sin(k * x - phase) + (1 - SOUND.mix) * Math.sin(k * PHI * x - PHI * phase + SOUND.offset);
    const y = mid - reach * envelope * tone;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

/**
 * How loud the wave plays at `seconds` of playing, 0–1: a swell that comes
 * and goes as speech does, two slow terms a golden ratio apart (never the
 * same twice: AGENTS.md, ambient loops).
 */
export function loudness(seconds: number): number {
  const f = SOUND.swell.rate * 2 * Math.PI;
  const s = 0.6 * Math.sin(f * seconds) + 0.4 * Math.sin(f * PHI * seconds + 2.1);
  return SOUND.swell.floor + (1 - SOUND.swell.floor) * (0.5 + 0.5 * s);
}
