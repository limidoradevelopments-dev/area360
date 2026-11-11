"use client";

import { Fragment, useEffect, useRef } from "react";

import { EYE_TAG, EYE_TAG_REDUCED, LINE_DROP, REVEAL_EASE_CSS } from "./motion";
import { raiseLines, type LineCue } from "./raiseLines";
import RevealLine from "./RevealLine";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useRevealOnce } from "./useRevealOnce";

/**
 * ─── EyeTag ───
 *
 * The page's eye-catching tag (2026-11-11, the user's works frame: "add it
 * and make it a reusable component, we are gonna use this for some other
 * sections later"): a short lead in the supporting voice, and under it a
 * word SPELLED ONE LETTER A TILE — each in its own hairline square — so a
 * single word is set apart from every other on the page, as a stamp is.
 * A quiet aside beside a section's title, never a heading of its own.
 *
 * ITS OWN ENTRANCE, so it can stand in any section (ui/motion.ts EYE_TAG):
 * once most of it is on the screen and `ready` (a section passes the
 * curtain's state; a page without one leaves it true), the lead drops into
 * its masks and the word is struck letter by letter, a light running over
 * the tiles' edges once. Web Animations on the compositor, let go once
 * landed (ui/raiseLines): nothing runs after.
 *
 * READ AS ONE SENTENCE: the lead's lines are spaced for a reader, the
 * tiles are hidden from one and the word is said whole.
 *
 * Sizes and colours: eye-tag.css. Place it from the section's stylesheet
 * (its root is data-eye-tag).
 */
export interface EyeTagProps {
  /** The lead, line by line as the design breaks it. */
  lines: readonly string[];
  /** The word set in tiles (shown in capitals: eye-tag.css). */
  word: string;
  /** False holds the entrance (a curtain still down). */
  ready?: boolean;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines and letters only fade in (no travel)
   * and no light runs over the tiles.
   */
  respectReducedMotion?: boolean;
  className?: string;
}

export default function EyeTag({ lines, word, ready = true, respectReducedMotion = false, className }: EyeTagProps) {
  const [root, seen] = useRevealOnce<HTMLParagraphElement>(EYE_TAG.threshold);

  /* Read once, when the entrance plays: a preference that flips later must
     not replay it. */
  const prefersReduced = usePrefersReducedMotion();
  const calm = respectReducedMotion && prefersReduced;
  const calmAtEntrance = useRef(calm);
  useEffect(() => {
    calmAtEntrance.current = calm;
  }, [calm]);

  useEffect(() => {
    const el = root.current;
    if (!ready || !seen || !el) return;
    return playEyeTag(el, calmAtEntrance.current);
  }, [ready, seen, root]);

  return (
    <p ref={root} data-eye-tag data-reveal-drop className={className}>
      <span data-eye-tag-lead>
        {lines.map((line, k) => (
          <Fragment key={k}>
            {k > 0 ? " " : null}
            <RevealLine>{line}</RevealLine>
          </Fragment>
        ))}
      </span>{" "}
      <span data-eye-tag-word aria-hidden="true">
        {Array.from(word).map((letter, k) => (
          <span key={k} data-eye-tag-tile>
            <span data-eye-tag-frame data-reveal-fade />
            <span data-eye-tag-glint />
            <RevealLine>{letter}</RevealLine>
          </span>
        ))}
      </span>
      <span className="sr-only">{word}</span>
    </p>
  );
}

/** Lays the whole entrance in one task; returns what stops it. */
function playEyeTag(root: HTMLElement, calm: boolean): () => void {
  const m = EYE_TAG;
  const fade = calm ? EYE_TAG_REDUCED : null;
  const drop = { ...LINE_DROP, easing: REVEAL_EASE_CSS };

  const lead: LineCue[] = Array.from(root.querySelectorAll<HTMLElement>("[data-eye-tag-lead] [data-reveal-line]"), (el, k) => ({
    el,
    at: k * m.lineStagger,
  }));
  const tiles = Array.from(root.querySelectorAll<HTMLElement>("[data-eye-tag-tile]"));
  const letters: LineCue[] = [];
  const animations: Animation[] = [];

  tiles.forEach((tile, k) => {
    const at = m.wordAt + k * m.tileStagger;
    const letter = tile.querySelector<HTMLElement>("[data-reveal-line]");
    const frame = tile.querySelector<HTMLElement>("[data-eye-tag-frame]");
    const glint = tile.querySelector<HTMLElement>("[data-eye-tag-glint]");
    if (letter) letters.push({ el: letter, at });
    if (frame) {
      const up = frame.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: (fade ? fade.fadeSeconds : m.frameSeconds) * 1000,
        delay: (fade ? at : at + m.frameDelay) * 1000,
        easing: fade ? "linear" : REVEAL_EASE_CSS,
        fill: "both",
      });
      up.addEventListener(
        "finish",
        () => {
          frame.style.opacity = "1";
          up.cancel();
        },
        { once: true },
      );
      animations.push(up);
    }
    if (glint && !fade) {
      /* Its rest state is the stylesheet's (unlit): cancelled once done,
         nothing is written. */
      const flash = glint.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: m.glintPeak, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
          { opacity: 0, offset: 1 },
        ],
        { duration: m.glintSeconds * 1000, delay: at * 1000, fill: "both" },
      );
      flash.addEventListener("finish", () => flash.cancel(), { once: true });
      animations.push(flash);
    }
  });

  const stopLead = raiseLines(lead, drop, fade);
  const stopLetters = raiseLines(letters, drop, fade);
  return () => {
    stopLead();
    stopLetters();
    for (const animation of animations) animation.cancel();
  };
}
