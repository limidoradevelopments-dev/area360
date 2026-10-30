/**
 * ─── Header · the scroll cue ───
 *
 * The nav's hairline: drawn down as the nav's words arrive, then, on the
 * curtain's own pulse, a soft gap runs down it — the page's "go down"
 * (motion.ts SCROLL_CUE, header.css).
 *
 * COSTS NOTHING WHILE IT WAITS: no frame loop. Each cue is one Web
 * Animation on one 1px strip's transform, on the compositor, let go when
 * it ends; between cues a single timer. It parks — no timer at all — while
 * the rule is off the screen or the tab is put aside, and takes up the
 * pulse again when it is back.
 */

import { SCROLL_CUE } from "./motion";

/* The golden ratio's fraction: a sequence of its multiples never repeats
   and never bunches. */
const GOLDEN = 0.6180339887498949;

export interface ScrollCueParts {
  /** The rule's window (data-header-rule): drawn in by its scale. */
  rule: HTMLElement;
  /** The strip inside it (data-header-rule-ink): moved for each cue. */
  ink: HTMLElement;
}

export interface ScrollCueTiming {
  /** Seconds from now: when the draw starts, and how long it takes. */
  drawAt: number;
  drawSeconds: number;
  /** Reduced motion: the rule fades in, and no cue runs. */
  calm: { fadeSeconds: number } | null;
}

/** Lays the rule's draw and starts its cue; returns what stops both. */
export function startScrollCue({ rule, ink }: ScrollCueParts, { drawAt, drawSeconds, calm }: ScrollCueTiming): () => void {
  const m = SCROLL_CUE;

  /* ── The draw ── from the CSS pre-state, stated, never read. */
  const draw = rule.animate(
    calm
      ? [
          { transform: "none", opacity: 0 },
          { transform: "none", opacity: 1 },
        ]
      : [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
    {
      duration: (calm ? calm.fadeSeconds : drawSeconds) * 1000,
      delay: drawAt * 1000,
      easing: calm ? "linear" : m.draw.ease,
      fill: "both",
    },
  );
  draw.addEventListener(
    "finish",
    () => {
      rule.style.transform = "none";
      draw.cancel();
    },
    { once: true },
  );
  if (calm) return () => draw.cancel();

  /* ── The cue ── */
  let beat = 0;
  let timer = 0;
  let run: Animation | null = null;
  let onScreen = true;

  const seen = () => onScreen && document.visibilityState === "visible";

  /* The wait before the next cue: the curtain's two intervals in turn,
     each swung a few per cent by the golden sequence. */
  const nextWait = () => {
    const base = m.beats[beat % m.beats.length];
    const swing = 1 + m.swing * (2 * ((beat * GOLDEN) % 1) - 1);
    beat += 1;
    return base * swing;
  };

  const schedule = (seconds: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(cue, seconds * 1000);
  };

  function cue() {
    timer = 0;
    if (!seen()) return; /* parked: `wake` takes the pulse up again */
    /* A line and a gap: the strip's height less the window's, read now (to
       the fraction of a pixel: a whole-pixel read left the gap's edge a
       sliver short), so a resize between cues is simply right at the next
       one. */
    const travel = ink.getBoundingClientRect().height - rule.getBoundingClientRect().height;
    /* Never two at once: a throttled timer catching up must not stack runs
       on the one transform. */
    run?.cancel();
    run = ink.animate([{ transform: "translateY(0)" }, { transform: `translateY(${travel}px)` }], {
      duration: m.run.seconds * 1000,
      easing: m.run.ease,
    });
    schedule(nextWait());
  }

  /* Back on the screen or in view: the next cue after a short wait, not at
     once — a line that moves the moment it is seen reads as a glitch. */
  const wake = () => {
    if (seen() && !timer) schedule(m.lead);
  };

  const sight = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    wake();
  });
  sight.observe(rule);
  document.addEventListener("visibilitychange", wake);

  schedule(drawAt + drawSeconds + m.lead);

  return () => {
    window.clearTimeout(timer);
    draw.cancel();
    run?.cancel();
    sight.disconnect();
    document.removeEventListener("visibilitychange", wake);
  };
}
