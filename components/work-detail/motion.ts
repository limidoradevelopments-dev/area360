/**
 * ─── Work detail · motion ───
 *
 * Every duration, distance and threshold a work's page moves by, with why.
 *
 * Tweens, not springs: each has a fixed job — to arrive once, or to fold
 * the details away and back — and none is chased mid-flight (a fold asked
 * for while one runs waits for it: fold.ts).
 *
 * ALL ON THE COMPOSITOR (Web Animations on transform and opacity, the
 * dots' clip excepted): the page's first load carries no GSAP (AGENTS.md,
 * Loading), and a phone's fold plays while its finger is still scrolling.
 */

import { LINE_DROP, PRESS_EASE_CSS, REVEAL_EASE_CSS, WIPE_EASE_CSS } from "@/components/ui/motion";

/**
 * THE ENTRANCE, ONCE, as the page opens (its fonts in: the paragraph is
 * split into the lines the browser drew, ui/splitLines). TOP TO BOTTOM, as
 * over the hero: every line of the panel drops into its mask from above
 * in reading order — the mark, the title, About and its lines, the facts —
 * while the dots draw in from the margin on the wipe; the foot's rule and
 * links last. The pictures float up as each comes into view (the house's
 * card entrance, ui/floatCards), a row at a time.
 */
export const WORK_ENTRANCE = {
  line: { ...LINE_DROP, easing: REVEAL_EASE_CSS },
  /** Line to line down the panel: quicker than a paragraph's 0.08, the
   *  panel is many short lines and should read as one fall. */
  lineStagger: 0.05,
  /** The dot rows draw in from the margin: the house's wipe, slow enough
   *  to be seen as a row being set, dot by dot. */
  rule: { seconds: 1.2, easing: WIPE_EASE_CSS },
  topRuleAt: 0.1,
  /** The foot (its dots, then its links' words and hairlines) as the
   *  panel's last lines land. */
  footAt: 0.55,
  linkAt: 0.75,
  linkLine: { seconds: 0.8, easing: WIPE_EASE_CSS },
  /** A picture floats up once a tenth of it is on the screen; those that
   *  come in together, top to bottom, 0.1 s apart. */
  cardThreshold: 0.1,
  cardStagger: 0.1,
  /** The first pictures wait for the panel's first lines. */
  firstCardAt: 0.2,
} as const;

/** Reduced motion (respectReducedMotion): lines, rules and pictures fade,
 *  no travel, no blur, no clip. */
export const WORK_REDUCED = { fadeSeconds: 0.2 } as const;

/**
 * THE PHONE'S FOLD (2026-11-11, the user: scrolling into the pictures, the
 * details "collapse and show the second one", and the "−" opens them
 * again). The panel stays at the top of the screen (sticky); its details
 * fold away into the title's line as the pictures RISE TO MEET IT, and
 * open the other way, the pictures making room as the lines drop back in.
 *
 * A FLIP, NOT A HEIGHT ANIMATION: the pictures are moved by a transform
 * the height of the details, on the compositor, and the layout is changed
 * once, in the frame they arrive — so nothing lays the page out per frame
 * and a finger scrolling meanwhile is never fought (fold.ts).
 *
 * WHEN: open as the page opens; FOLDED once the page has been scrolled
 * `scrollAway` px from where they were opened (a deliberate scroll, not a
 * thumb resting on the glass); OPEN AGAIN back at the very top of the
 * page (within `top` px), or by the toggle.
 */
export const WORK_FOLD = {
  scrollAway: 24,
  top: 4,
  close: {
    /** The pictures rise: the reveal's ease-out, so they answer at once
     *  and arrive softly under the title. */
    seconds: 0.75,
    easing: REVEAL_EASE_CSS,
    /** Each line lifts out of its mask, BOTTOM LINE FIRST — the pictures
     *  push them up into the title — accelerating away (an ease-in: an
     *  exit leaves, it does not arrive), quick enough to be gone before
     *  the pictures reach them. */
    lineSeconds: 0.42,
    lineStagger: 0.025,
    lineEasing: "cubic-bezier(0.55, 0, 0.8, 0.35)",
  },
  open: {
    /** The pictures make room: the press curve, a settle with no tail, so
     *  the room is there before the words fall into it. */
    seconds: 0.6,
    easing: PRESS_EASE_CSS,
    /** The lines drop into place top to bottom, as they did when the page
     *  opened, a beat after the room starts to open — quicker than the
     *  page's first fall (0.7 s, not 1): an answer to a press, not an
     *  entrance, and the fold is held until they land. */
    lineAt: 0.12,
    lineStagger: 0.04,
    line: { ...LINE_DROP, seconds: 0.7, easing: REVEAL_EASE_CSS },
  },
} as const;
