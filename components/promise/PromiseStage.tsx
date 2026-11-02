/**
 * ─── PromiseStage ───
 *
 * Where the mark is written (the user's stage drawing, 2026-11-02): the
 * mark ENGRAVED in the page's black — its outlines drawn in the black
 * itself, seen only by the light and shade the user drew round them (four
 * shadows outside, two inside: pressed into the ground) — held at the
 * screen's middle while the passages' letters land along its lines
 * (assembly.ts), for the room after it (the pin, promise.css).
 *
 * THE DRAWING AS GIVEN, AS A FILE (public/promise/mark.svg): six shapes
 * and six filters of twenty steps each are markup the page's script would
 * otherwise carry to hydrate; as an image they cost no script, are asked
 * for only as the stage nears, and are drawn by the browser at whatever
 * size the stage is.
 *
 * Ornament: the passages are the words. Server component: markup and
 * data- hooks only.
 */
export default function PromiseStage() {
  return (
    <div data-promise-stage aria-hidden="true">
      <div data-promise-mark>
        {/* An SVG drawn as it is: a static export, nothing to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-promise-mark-art src="/promise/mark.svg" alt="" width={749} height={560} loading="lazy" decoding="async" />
      </div>
      {/* The room the mark is held for while its letters land. */}
      <div data-promise-pin />
    </div>
  );
}
