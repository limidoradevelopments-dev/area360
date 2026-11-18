import MarkGlyph from "@/components/ui/MarkGlyph";
import RevealLine from "@/components/ui/RevealLine";

import { HERO_BYLINE, HERO_MARK_LABEL } from "../content";

/**
 * ─── HeroFoot ───
 *
 * The frame's foot: the user's mark at the left margin (ui/MarkGlyph, the
 * one drawing for every place it stands), the byline right-aligned at the
 * right one. On a phone the frame shows no mark and sets the byline at the
 * left margin (copy.css).
 *
 * Server component: markup and data- hooks only.
 */
export default function HeroFoot() {
  return (
    <>
      <span role="img" aria-label={HERO_MARK_LABEL} data-hero-mark>
        <RevealLine>
          <MarkGlyph />
        </RevealLine>
      </span>
      <p data-hero-byline>
        <RevealLine>{HERO_BYLINE.role} </RevealLine>
        <RevealLine>{HERO_BYLINE.copyright}</RevealLine>
      </p>
    </>
  );
}
