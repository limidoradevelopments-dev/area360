"use client";

import { Fragment, useEffect, useRef, type CSSProperties } from "react";

import { EYE_TAG, EYE_TAG_REDUCED, LINE_DROP, REVEAL_EASE_CSS, WIPE_EASE_CSS } from "./motion";
import { raiseLines, type LineCue } from "./raiseLines";
import RevealLine from "./RevealLine";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useRevealOnce } from "./useRevealOnce";
import { wipeIn } from "./wipeIn";

/**
 * ─── EyeTag ───
 *
 * The page's eye-catching tag (2026-11-11, the user's works frame: "add it
 * and make it a reusable component, we are gonna use this for some other
 * sections later"): a short lead in the supporting voice, and under it a
 * word SPELLED OUT ON A STRIP — one filled band as wide as the lead, each
 * letter cut out of it in the night, in the middle of its own share — so a
 * single word is set apart from every other on the page, as a stamp is.
 * A quiet aside beside a section's title, never a heading of its own.
 *
 * ONE STRIP, NO MASKS (2026-11-13, the user: on some phones the letters'
 * tops were cut and the strip showed lines between its letters, "need to
 * feel crisp every time"; and the strip at every size, "use this style for
 * desktop as well"). It was eight filled tiles, each letter dropping into
 * a mask trimmed to the font's cap height: eight boxes at fractional widths
 * left hairline seams where a browser blends their shared edges, and
 * Newsreader's small optical cuts stand taller than its cap-height metric,
 * so the mask cut their tops. Now the fill is one box (one pair of edges,
 * snapped to the screen's pixels) and the letters stand free over it: they
 * are the night on the night until the strip comes under them, so they
 * need no mask to wait in.
 *
 * ITS OWN ENTRANCE, so it can stand in any section (ui/motion.ts EYE_TAG):
 * once most of it is on the screen and `ready` (a section passes the
 * curtain's state; a page without one leaves it true), the lead drops into
 * its masks and the strip is drawn in from the left with the house's wipe
 * (ui/wipeIn), the letters appearing as it passes under them, a light
 * riding its front once. Web Animations on the compositor, let go once
 * landed: nothing runs after.
 *
 * READ AS ONE SENTENCE: the lead's lines are spaced for a reader, the
 * strip is hidden from one and the word is said whole.
 *
 * NARROW ON A PHONE, WHERE A SECTION ASKS (`narrow`; 2026-11-13, the
 * user's phone frame: the tag in the first of four columns beside a title,
 * "small while it can still be read"): the same lines and strip, the type
 * set very small (eye-tag.css).
 *
 * Sizes and colours: eye-tag.css. Place it from the section's stylesheet
 * (its root is data-eye-tag).
 */
export interface EyeTagProps {
  /** The lead, line by line as the design breaks it. */
  lines: readonly string[];
  /** Set narrow on a phone: a mark beside a title in one column, rather
   *  than an aside on three. Off: its size at every width. */
  narrow?: boolean;
  /** The word on the strip (shown in capitals: eye-tag.css). */
  word: string;
  /** False holds the entrance (a curtain still down). */
  ready?: boolean;
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines and the strip only fade in (no
   * travel, no wipe) and no light runs along the word.
   */
  respectReducedMotion?: boolean;
  className?: string;
}

export default function EyeTag({ lines, narrow = false, word, ready = true, respectReducedMotion = false, className }: EyeTagProps) {
  const [root, seen] = useRevealOnce<HTMLParagraphElement>(EYE_TAG.threshold);
  const letters = Array.from(word);

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

  /* How many shares the strip is cut into: the light is one of them. */
  const shares = { "--eye-tag-letters": letters.length } as CSSProperties;

  return (
    <p ref={root} data-eye-tag data-eye-tag-narrow={narrow ? "" : undefined} data-reveal-drop className={className}>
      <span data-eye-tag-lead>
        {lines.map((line, k) => (
          <Fragment key={k}>
            {k > 0 ? " " : null}
            <RevealLine>{line}</RevealLine>
          </Fragment>
        ))}
      </span>{" "}
      <span data-eye-tag-word aria-hidden="true" style={shares}>
        <span data-eye-tag-strip data-reveal-wipe>
          <span data-eye-tag-glint />
        </span>
        {letters.map((letter, k) => (
          <span key={k} data-eye-tag-letter>
            {letter}
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
  const strip = root.querySelector<HTMLElement>("[data-eye-tag-strip]");
  const glint = root.querySelector<HTMLElement>("[data-eye-tag-glint]");
  const shares = root.querySelectorAll("[data-eye-tag-letter]").length;
  const animations: Animation[] = [];

  const stopLead = raiseLines(lead, drop, fade);
  const stopStrip = strip ? wipeIn([{ el: strip, at: m.wordAt }], { seconds: m.wordSeconds, easing: WIPE_EASE_CSS }, fade) : () => {};

  if (glint && !fade && shares > 0) {
    /* THE LIGHT RIDES THE WIPE'S FRONT: one share wide, its right edge on
       the front all the way (from a share left of the strip to its last
       share, on the wipe's own curve and time); it flashes up as the wipe
       sets off and dies after it lands. Its rest state is the stylesheet's
       (unlit): cancelled once done, nothing is written. */
    const timing = { delay: m.wordAt * 1000, fill: "both" as const };
    const ride = glint.animate([{ transform: "translateX(-100%)" }, { transform: `translateX(${(shares - 1) * 100}%)` }], {
      ...timing,
      duration: m.wordSeconds * 1000,
      easing: WIPE_EASE_CSS,
    });
    const shine = glint.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: m.glintPeak, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
        { opacity: 0, offset: 1 },
      ],
      { ...timing, duration: m.glintSeconds * 1000 },
    );
    /* Let go together, when the later is done: the ride let go alone would
       throw the light back to the strip's start while it still shines. */
    const last = m.glintSeconds >= m.wordSeconds ? shine : ride;
    last.addEventListener(
      "finish",
      () => {
        ride.cancel();
        shine.cancel();
      },
      { once: true },
    );
    animations.push(ride, shine);
  }

  return () => {
    stopLead();
    stopStrip();
    for (const animation of animations) animation.cancel();
  };
}
