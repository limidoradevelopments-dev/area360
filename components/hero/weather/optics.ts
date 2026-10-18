/**
 * ─── Weather · optics ───
 *
 * How the rain LOOKS. How it falls is in ./motion.ts (RAIN_MOTION).
 *
 * THE REFERENCE'S RAIN (2026-10-19, the user's assets/sources/grade/
 * reference-3.webp, measured where the fog behind it is smooth): faint
 * pale dashes, about 2 px wide and 4–6 long in a 2000 px frame, 5–15 levels
 * over the fog behind them; thickest in the band of fog just over the
 * horizon (~2000 a megapixel), thinning fast up the sky (~370 a quarter of
 * the frame up, ~30 near the top) and fewer over the water (~720). That is
 * how rain reads through fog: the nearer drops few and quick, the far ones
 * crowding the horizon, small and faint, their light the air's.
 *
 * Three layers of drops, each at its own distance. On the PRINT, as the
 * reference shows it — a lift of `lift` (print value, 0–1) at a drop's
 * core over whatever lies behind, so a drop reads alike over fog, water
 * and trees — drawn as drops over the finished print (weather/rain.ts).
 *   distance  metres: how fast and how long its dashes are (motion.ts)
 *   cell      the frame's height per drop slot (one drop at most each)
 *   cover     the share of slots holding a drop, at the horizon
 *   width     a dash's width, share of the frame's height (never under a
 *             pixel: narrower, its light is spread over one)
 *   lift      print value a drop's core adds, at its brightest
 *   rise      how far over the horizon the layer reaches, share of the
 *             frame's height (its drops thin by e every `rise` up)
 *   under     the share of its drops left under the horizon, over the
 *             water
 * Fitted first by count to the reference (~2000 a megapixel in the fog
 * band over the horizon, ~300 a quarter of the frame up), then thinned
 * and dimmed at the user's word ("very subtle": 2026-10-20) — and each drop
 * now only seen for a few seconds of its fall (motion.ts RAIN_MOTION.life),
 * so at any moment about a fifth of the reference's specks show, fainter.
 */
export interface RainLayer {
  readonly distance: number;
  readonly cell: number;
  readonly cover: number;
  readonly width: number;
  readonly lift: number;
  readonly rise: number;
  readonly under: number;
}

export const RAIN = {
  layers: [
    { distance: 70, cell: 0.016, cover: 0.42, width: 0.0028, lift: 0.045, rise: 0.09, under: 0.04 },
    { distance: 40, cell: 0.03, cover: 0.32, width: 0.0035, lift: 0.055, rise: 0.15, under: 0.06 },
    { distance: 28, cell: 0.07, cover: 0.16, width: 0.0045, lift: 0.065, rise: 0.22, under: 0.15 },
  ] as readonly RainLayer[],
} as const;
