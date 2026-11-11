import MarkGlyph from "@/components/ui/MarkGlyph";
import RevealLine from "@/components/ui/RevealLine";

import { HEADER_MARK } from "./content";

/**
 * ─── HeaderMark ───
 *
 * The user's mark (ui/MarkGlyph: one drawing for every place it stands),
 * in the whole white at the header's mark size, rising out of its own
 * mask. A link back to the top of the page; the drawing itself is
 * decorative.
 *
 * Server component: markup and data- hooks only.
 */
export default function HeaderMark() {
  return (
    <a href={HEADER_MARK.href} aria-label={HEADER_MARK.label} data-header-mark>
      <RevealLine>
        <MarkGlyph />
      </RevealLine>
    </a>
  );
}
