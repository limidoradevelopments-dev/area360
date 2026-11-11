/**
 * ─── Work detail · the entrance ───
 *
 * The page opening (motion.ts WORK_ENTRANCE): the panel's lines drop into
 * their masks top to bottom in reading order — the mark, the name, About
 * and its paragraph's lines, the facts — and its row of dots draws in from
 * the margin; the foot plays as it comes into view (at once on a wide
 * screen, where it stands at the foot of the screen; at the page's end on
 * a phone). Web Animations, each let go once landed (ui/raiseLines,
 * ui/wipeIn); the paragraphs given their own text back once their lines
 * have landed, wrapping with their box again.
 */

import { raiseLines, type LineCue } from "@/components/ui/raiseLines";
import { splitLines, type SplitLines } from "@/components/ui/splitLines";
import { wipeIn } from "@/components/ui/wipeIn";

import { WORK_ENTRANCE, WORK_REDUCED } from "./motion";

export interface Entrance {
  /** Seconds from now until every line of the panel has landed and its
   *  paragraphs are whole again. */
  readonly seconds: number;
  readonly stop: () => void;
}

/** The panel's entrance, laid in this one task. */
export function playPanel(panel: HTMLElement, calm: boolean): Entrance {
  const m = WORK_ENTRANCE;
  const fade = calm ? WORK_REDUCED : null;
  const splits: SplitLines[] = [];
  const cues: LineCue[] = [];
  for (const el of panel.querySelectorAll<HTMLElement>("[data-reveal-mask] > [data-reveal-line], [data-reveal-lines]")) {
    if (el.hasAttribute("data-reveal-lines")) {
      const split = splitLines(el);
      splits.push(split);
      for (const line of split.lines) cues.push({ el: line, at: cues.length * m.lineStagger });
    } else cues.push({ el, at: cues.length * m.lineStagger });
  }
  const stops = [
    raiseLines(cues, m.line, fade),
    wipeIn(
      Array.from(panel.querySelectorAll<HTMLElement>("[data-reveal-wipe]"), (el) => ({ el, at: m.topRuleAt })),
      m.rule,
      fade,
    ),
  ];
  const seconds = fade ? fade.fadeSeconds : Math.max(0, cues.length - 1) * m.lineStagger + m.line.seconds;
  const timer = window.setTimeout(() => {
    for (const split of splits) split.revert();
  }, seconds * 1000);
  return {
    seconds,
    stop: () => {
      window.clearTimeout(timer);
      for (const stop of stops) stop();
      for (const split of splits) split.revert();
    },
  };
}

/** The foot's entrance: its dots, then its words and their hairlines,
 *  `at` seconds from now. */
export function playFoot(foot: HTMLElement, at: number, calm: boolean): () => void {
  const m = WORK_ENTRANCE;
  const fade = calm ? WORK_REDUCED : null;
  const rule = foot.querySelector<HTMLElement>("[data-emboss-rule]");
  const words = Array.from(foot.querySelectorAll<HTMLElement>("[data-reveal-line]"), (el, k) => ({
    el,
    at: at + (m.linkAt - m.footAt) + k * m.lineStagger,
  }));
  const lines = Array.from(foot.querySelectorAll<HTMLElement>("[data-wp-link-line]"), (el) => ({
    el,
    at: at + (m.linkAt - m.footAt) + m.lineStagger,
  }));
  const stops = [
    rule ? wipeIn([{ el: rule, at }], m.rule, fade) : () => {},
    raiseLines(words, m.line, fade),
    wipeIn(lines, m.linkLine, fade),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
