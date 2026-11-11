/**
 * ─── Work detail · the phone's fold ───
 *
 * On a phone the panel stays at the top of the screen (sticky), and its
 * details FOLD AWAY as the visitor scrolls into the pictures, and open
 * again from the toggle or back at the top of the page (motion.ts
 * WORK_FOLD: when, how fast, on what curves).
 *
 * FOLDING: the details' lines lift out of their masks, the bottom line
 * first, as the pictures rise to meet the title — the pictures pushing the
 * words up into it — and the toggle's arrow turns into a dash (the details
 * folded into one line: work-detail.css). OPENING, the other way: the
 * pictures make room and the lines drop back into place, top to bottom,
 * as they did when the page opened.
 *
 * A FLIP, NOT A HEIGHT ANIMATION. What follows the details down the page
 * (the pictures, the foot) is moved by a transform the details' height, on
 * the compositor; the layout changes ONCE, in the task the move lands in
 * (folding: the details taken out of the flow and the move let go; opening:
 * the details put back and the move started from where the pictures
 * stood), so the picture never jumps and nothing is laid out per frame. A
 * finger still scrolling is never fought: the page's scroll is its own.
 * The page's scroll anchoring is off (work-detail.css), or the browser
 * would "keep" the pictures in place as the details leave the flow, and
 * throw them down by their height.
 *
 * ONE AT A TIME: a fold asked for while another plays waits for it, and
 * the page's state is looked at again once it is done.
 */

import { LINE_DROP } from "@/components/ui/motion";
import { raiseLines } from "@/components/ui/raiseLines";
import { splitLines, type SplitLines } from "@/components/ui/splitLines";

import { WORK_FOLD } from "./motion";

export interface FoldParts {
  /** The page: carries data-wp-fold ("open" | "closed"). */
  readonly root: HTMLElement;
  readonly details: HTMLElement;
  readonly toggle: HTMLButtonElement;
  /** What follows the details down the page and moves with the fold. */
  readonly movers: readonly HTMLElement[];
}

export interface FoldOptions {
  /** Reduced motion: the details go and come at once, the lines fade in. */
  readonly calm: boolean;
  /** The toggle as said to a reader of the page, open and folded. */
  readonly labels: { readonly open: string; readonly close: string };
}

type FoldState = "open" | "closed";

/** Starts the fold; returns what stops it and leaves the details open. */
export function startFold(parts: FoldParts, options: FoldOptions): () => void {
  const { root, details, toggle, movers } = parts;
  const m = WORK_FOLD;
  let state: FoldState = "open";
  let busy = false;
  let openedAt = 0;
  let running: Animation[] = [];
  let splits: SplitLines[] = [];
  let stopLines: (() => void) | null = null;
  let timer = 0;

  const write = (next: FoldState) => {
    state = next;
    root.setAttribute("data-wp-fold", next);
    details.inert = next === "closed";
    toggle.setAttribute("aria-expanded", String(next === "open"));
    toggle.setAttribute("aria-label", next === "open" ? options.labels.close : options.labels.open);
  };

  /* The details' lines in reading order, each paragraph split into the
     lines it is drawn in at this width (ui/splitLines). */
  const lines = (): HTMLElement[] => {
    const found = details.querySelectorAll<HTMLElement>("[data-reveal-mask] > [data-reveal-line], [data-reveal-lines]");
    const out: HTMLElement[] = [];
    for (const el of found) {
      if (el.hasAttribute("data-reveal-lines")) {
        const split = splitLines(el);
        splits.push(split);
        out.push(...split.lines);
      } else out.push(el);
    }
    return out;
  };

  const revertSplits = () => {
    for (const split of splits) split.revert();
    splits = [];
  };

  /* Folded: the details out of the flow, every line back in its CSS
     pre-state (waiting above its mask, a paragraph unseen until split)
     for the next opening, and the move let go in the same task — the
     pictures are now where the move took them. */
  const commitClosed = () => {
    write("closed");
    for (const animation of running) animation.cancel();
    running = [];
    revertSplits();
    for (const el of details.querySelectorAll<HTMLElement>("[data-reveal-line]")) el.style.transform = "";
    for (const el of details.querySelectorAll("[data-reveal-lines]")) el.setAttribute("data-reveal-lines", "");
  };

  const close = () => {
    if (state !== "open" || busy) return;
    if (options.calm) {
      commitClosed();
      return;
    }
    busy = true;
    const height = details.getBoundingClientRect().height;
    const found = lines();
    const ratio = window.devicePixelRatio || 1;
    /* Whole pixels of travel (ui/raiseLines: a layer moved a fraction of
       a pixel lands soft); every line read before any is moved. */
    const travel = found.map((el) => Math.ceil(((el.getBoundingClientRect().height * LINE_DROP.fromYPercent) / -100) * ratio) / ratio);
    found.forEach((el, k) => {
      const fromBottom = found.length - 1 - k;
      running.push(
        el.animate([{ transform: "none" }, { transform: `translateY(${-travel[k]}px)` }], {
          duration: m.close.lineSeconds * 1000,
          delay: fromBottom * m.close.lineStagger * 1000,
          easing: m.close.lineEasing,
          fill: "both",
        }),
      );
    });
    for (const el of movers) {
      running.push(
        el.animate([{ transform: "none" }, { transform: `translateY(${-height}px)` }], {
          duration: m.close.seconds * 1000,
          easing: m.close.easing,
          fill: "both",
        }),
      );
    }
    const laid = running;
    Promise.all(laid.map((animation) => animation.finished)).then(
      () => {
        commitClosed();
        busy = false;
        reconcile();
      },
      () => {
        /* Cancelled: stopped from outside, which tidies up itself. */
      },
    );
  };

  const open = () => {
    if (state !== "closed" || busy) return;
    write("open");
    openedAt = window.scrollY;
    const found = lines();
    if (options.calm) {
      stopLines = raiseLines(
        found.map((el) => ({ el, at: 0 })),
        { ...LINE_DROP, easing: "linear" },
        { fadeSeconds: 0.2 },
      );
      timer = window.setTimeout(revertSplits, 250);
      return;
    }
    busy = true;
    /* The room the details take, now that they are back in the flow: the
       pictures start the move from where they stood, in this same task. */
    const height = details.getBoundingClientRect().height;
    running = movers.map((el) =>
      el.animate([{ transform: `translateY(${-height}px)` }, { transform: "none" }], {
        duration: m.open.seconds * 1000,
        easing: m.open.easing,
        fill: "both",
      }),
    );
    const room = running;
    room.forEach((animation) =>
      animation.addEventListener(
        "finish",
        () => {
          animation.cancel();
        },
        { once: true },
      ),
    );
    stopLines = raiseLines(
      found.map((el, k) => ({ el, at: m.open.lineAt + k * m.open.lineStagger })),
      m.open.line,
      null,
    );
    const landed = m.open.lineAt + Math.max(0, found.length - 1) * m.open.lineStagger + m.open.line.seconds;
    timer = window.setTimeout(() => {
      running = [];
      revertSplits();
      busy = false;
      reconcile();
    }, landed * 1000);
  };

  /* Where the page stands says what the details should be. */
  function reconcile() {
    if (busy) return;
    const y = window.scrollY;
    if (state === "open" && y > m.top && Math.abs(y - openedAt) > m.scrollAway) close();
    else if (state === "closed" && y <= m.top) open();
  }

  const onToggle = () => {
    if (busy) return;
    if (state === "open") close();
    else open();
  };

  write("open");
  openedAt = Math.min(window.scrollY, m.top);
  toggle.addEventListener("click", onToggle);
  window.addEventListener("scroll", reconcile, { passive: true });
  reconcile();

  return () => {
    toggle.removeEventListener("click", onToggle);
    window.removeEventListener("scroll", reconcile);
    window.clearTimeout(timer);
    stopLines?.();
    for (const animation of running) animation.cancel();
    running = [];
    revertSplits();
    /* Left open and whole: every line where it lands. */
    root.removeAttribute("data-wp-fold");
    details.inert = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", options.labels.close);
    for (const el of details.querySelectorAll<HTMLElement>("[data-reveal-line]")) el.style.transform = "none";
    for (const el of details.querySelectorAll("[data-reveal-lines]")) el.setAttribute("data-reveal-lines", "done");
  };
}
