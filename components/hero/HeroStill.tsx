import { cx } from "@/components/ui/cx";

/**
 * ─── HeroStill ───
 *
 * The static paint's own layer, over the section's background (the
 * measured bands of the frame's light, hero.css). Empty for now: the design
 * has no lens vignette to paint (stage/optics.ts FILM.vignette). Phase 5
 * puts a graded still of the scene here — what the first frame shows before
 * any script runs, and all a browser without WebGL2 ever shows.
 *
 * Decorative: the section's h1 carries the page's heading.
 */
export default function HeroStill({ className }: { className?: string }) {
  return <div data-hero-still aria-hidden className={cx("pointer-events-none absolute inset-0", className)} />;
}
