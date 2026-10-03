import { cx } from "@/components/ui/cx";

import { CAMERA } from "./stage/camera";
import still from "./still.json";

/**
 * ─── HeroStill ───
 *
 * The first paint: the scene's own first frame as a picture
 * (scripts/hero-plates/still.py, `npm run still`), there the moment the
 * page arrives, until the live scene fades in over it (HeroSection). Before
 * it the visitor looked at flat grey for as long as the engine took to
 * compile and fetch — ~1.8 s on a GTX 1050 Ti, longer on a phone. It is also
 * all a browser without WebGL2 ever shows.
 *
 * PLACED AS THE CAMERA FRAMES. The lens keeps the horizon at a fixed share
 * of the height (stage/camera.ts focalPx), so on any screen the frame is a
 * still of a nearby shape scaled and cropped about the horizon: `cover`,
 * anchored there. One still per band of screen shapes (still.json, in order
 * of preference: the first whose band holds the screen wins, the last is
 * the fallback), so the live frame lands on it to the pixel and the fade
 * between them shows only the fog beginning to move. The browser downloads
 * only the one for its screen, in the width it needs.
 *
 * Decorative: the section's h1 carries the page's heading.
 */

type Still = (typeof still.stills)[number];

const ratio = (aspect: number) => `${Math.round(aspect * 10000)}/10000`;

function media({ min, max }: Still): string | undefined {
  const parts = [min !== null && `(min-aspect-ratio: ${ratio(min)})`, max !== null && `(max-aspect-ratio: ${ratio(max)})`];
  const query = parts.filter(Boolean).join(" and ");
  return query || undefined;
}

function srcSet({ name, widths }: Still): string {
  return widths.map((w) => `/hero/still/${name}-${w}.webp?v=${still.version} ${w}w`).join(", ");
}

/** How wide it is drawn: a screen wider than the still fits its width;
 *  a narrower one, its height (as wide as the height × its shape). */
function sizes({ aspect }: Still): string {
  return `(min-aspect-ratio: ${ratio(aspect)}) 100vw, ${(aspect * 100).toFixed(2)}vh`;
}

const sources = still.stills.slice(0, -1);
const fallback = still.stills[still.stills.length - 1];

export default function HeroStill({ className }: { className?: string }) {
  return (
    <div data-hero-still aria-hidden className={cx("pointer-events-none absolute inset-0", className)}>
      <picture>
        {sources.map((s) => (
          <source key={s.name} media={media(s)} srcSet={srcSet(s)} sizes={sizes(s)} />
        ))}
        <img
          src={`/hero/still/${fallback.name}-${fallback.widths[1] ?? fallback.widths[0]}.webp?v=${still.version}`}
          srcSet={srcSet(fallback)}
          sizes={sizes(fallback)}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: `50% ${(CAMERA.horizon * 100).toFixed(2)}%` }}
        />
      </picture>
    </div>
  );
}
