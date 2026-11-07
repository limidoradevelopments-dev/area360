/**
 * ─── FilmGrain ───
 *
 * THE HERO'S GRAIN OVER THE WHOLE PAGE (2026-11-07, the user: "add the hero
 * used noise all across this webpage"): one fixed layer over everything,
 * its tile the hero's own grain (scripts/grain.mjs → public/grain.png),
 * re-seeded at the film's 24 a second by jumping to a new place, laid by
 * soft-light so it weighs itself by the page's light as the hero's does
 * (utilities.css, data-film-grain).
 *
 * `overScene`: on the home page the hero's scene already carries its own
 * grain, in its film. There the layer starts unseen, unfetched and still,
 * and the hero brings it in as its scene's light goes (HeroSection: the
 * descent), so the page is never grained twice.
 *
 * Ornament: hidden from a reader of the page; never takes the pointer.
 * Server component: markup and data- hooks only.
 */
export interface FilmGrainProps {
  /** Brought in by the hero's descent, over its scene. */
  overScene?: boolean;
}

export default function FilmGrain({ overScene = false }: FilmGrainProps) {
  return <div data-film-grain={overScene ? "over-scene" : ""} aria-hidden="true" />;
}
