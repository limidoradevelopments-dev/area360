/**
 * ─── Promise · the stars' light ───
 *
 * Brings each star out in turn — from a point to its size, its light with
 * it — then keeps the cluster alive: the glints on the great star and the
 * small one scintillating, their streaks wavering, the great star's veil
 * breathing, the specks flickering; the drawn stars still (motion.ts
 * STAR_LIGHT, promise.css).
 *
 * COSTS NOTHING ON THE MAIN THREAD: every motion is a Web Animation on
 * opacity or transform, on the compositor, over shapes drawn once. Each
 * star's coming out is let go once it is out. The loops run on, and PARK —
 * paused — while the cluster is off the screen, and take up where they
 * were when it is back.
 */

import { STAR_LIGHT } from "./motion";

export interface StarLightTiming {
  /** Reduced motion: each star fades in, and nothing moves after. */
  calm: { fadeSeconds: number } | null;
}

type StarName = keyof typeof STAR_LIGHT.distance;

/* A keyframe's own curve to the next, where the table gives one. */
const easingOf = (frame: object): { easing?: string } =>
  "easing" in frame && typeof frame.easing === "string" ? { easing: frame.easing } : {};

/** Lays the stars' light; returns what stops it (an unmount). */
export function lightStars(cluster: HTMLElement, { calm }: StarLightTiming): () => void {
  const m = STAR_LIGHT;
  const stars = Array.from(cluster.querySelectorAll<HTMLElement>("[data-promise-star]"));
  const startOf = (name: StarName) => m.rise.lead + m.distance[name] * m.rise.perPx;

  /* ── They come out ── from the CSS pre-state, stated, never read. */
  const rises = stars.map((star) => {
    const name = star.dataset.promiseStar as StarName;
    const animation = star.animate(
      calm
        ? [
            { opacity: 0, transform: "none" },
            { opacity: 1, transform: "none" },
          ]
        : [
            { opacity: 0, transform: `scale(${m.rise.fromScale})` },
            { opacity: 1, transform: "scale(1)" },
          ],
      {
        duration: (calm ? calm.fadeSeconds : m.rise.seconds) * 1000,
        delay: (calm ? 0 : startOf(name)) * 1000,
        easing: calm ? "linear" : m.rise.ease,
        fill: "both",
      },
    );
    animation.addEventListener(
      "finish",
      () => {
        star.style.opacity = "1";
        star.style.transform = "none";
        animation.cancel();
      },
      { once: true },
    );
    return animation;
  });
  if (calm) return () => rises.forEach((animation) => animation.cancel());

  /* ── They live ── each loop from its star's coming out (later where its
     first flash is set later); until then (fill) on its first frame. */
  const loops: Animation[] = [];
  const loop = (
    el: HTMLElement | null,
    frames: Keyframe[],
    seconds: number,
    delay: number,
    alternate = false,
  ) => {
    if (!el) return;
    loops.push(
      el.animate(frames, {
        duration: seconds * 1000,
        delay: delay * 1000,
        easing: alternate ? m.ease : "linear",
        direction: alternate ? "alternate" : "normal",
        iterations: Infinity,
        fill: "backwards",
      }),
    );
  };
  const swing = (from: Keyframe, to: Keyframe) => [from, to];

  const flareFrames: Keyframe[] = m.flare.map((frame) => ({
    ...easingOf(frame),
    offset: frame.offset,
    opacity: frame.opacity,
    transform: `scale(${frame.scale})`,
  }));
  const flickerFrames: Keyframe[] = m.flicker.map((frame) => ({
    ...easingOf(frame),
    offset: frame.offset,
    opacity: frame.opacity,
  }));
  const { hippus } = m;

  for (const star of stars) {
    const name = star.dataset.promiseStar as StarName;
    const out = startOf(name);
    const part = (selector: string) => star.querySelector<HTMLElement>(selector);

    if (name === "great" || name === "small") {
      /* The glint: its strength wandering over the flashes, the flashes,
         and its streaks' unrest. */
      const glint = m.glints[name];
      loop(part("[data-promise-star-glint]"), swing({ opacity: 1 }, { opacity: glint.low }), glint.envelope, out, true);
      loop(part("[data-promise-star-flare]"), flareFrames, glint.seconds, out + glint.firstAt);
      loop(
        part('[data-promise-star-ray="across"]'),
        swing({ transform: `scaleX(${1 - hippus.across})` }, { transform: `scaleX(${1 + hippus.across})` }),
        hippus.acrossSeconds,
        out,
        true,
      );
      if (name === "great") {
        loop(
          part('[data-promise-star-ray="up"]'),
          swing({ transform: `scaleY(${1 + hippus.up})` }, { transform: `scaleY(${1 - hippus.up})` }),
          hippus.upSeconds,
          out,
          true,
        );
        loop(
          part("[data-promise-star-veil-drift]"),
          swing(
            { opacity: 1, transform: `scale(${1 + m.veil.scale})` },
            { opacity: m.veil.low, transform: `scale(${1 - m.veil.scale})` },
          ),
          m.veil.seconds,
          out,
          true,
        );
      }
    } else {
      /* A speck flickers as a whole. A negative start runs its loop
         part-way in, so its first flash falls at its own seconds. */
      const { seconds, firstAt } = m.flickers[name];
      loop(part("[data-promise-star-body]"), flickerFrames, seconds, out + firstAt - m.flickerAt * seconds);
    }
  }

  /* ── They park ── off the screen, every loop paused where it is. */
  const sight = new IntersectionObserver(
    ([entry]) => {
      const seen = entry?.isIntersecting ?? true;
      for (const animation of loops) {
        if (seen) animation.play();
        else animation.pause();
      }
    },
    { rootMargin: m.wakeMargin },
  );
  sight.observe(cluster);

  return () => {
    sight.disconnect();
    for (const animation of rises) animation.cancel();
    for (const animation of loops) animation.cancel();
  };
}
