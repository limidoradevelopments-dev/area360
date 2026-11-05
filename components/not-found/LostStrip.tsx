import { LOST_STRIP } from "./content";

/**
 * ─── LostStrip ───
 *
 * "404 Error", line after line, in two columns, falling down the page (the
 * user's frame). One run of lines laid twice, one above the other: the
 * strip slides down by exactly one run and starts again on the same
 * picture (NotFoundSection, motion.ts STRIP) — the house's two-rows swap,
 * as a loop. Decoration: hidden from a reader, who hears the heading's
 * "Error 404" instead.
 *
 * Server component: markup and data- hooks only.
 */
const RUN = Array.from({ length: LOST_STRIP.lines }, () => LOST_STRIP.word).join("\n");

export default function LostStrip() {
  return (
    <div data-lost-strip aria-hidden="true">
      <div data-lost-strip-run>
        {[0, 1].map((column) => (
          <span key={column} data-lost-strip-column>
            {RUN}
            {"\n"}
            {RUN}
          </span>
        ))}
      </div>
    </div>
  );
}
