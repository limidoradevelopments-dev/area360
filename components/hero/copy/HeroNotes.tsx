import RevealLine from "@/components/ui/RevealLine";

import { HERO_AVAILABILITY, HERO_BYLINE } from "../content";

/**
 * ─── HeroNotes ───
 *
 * The frame's two notes, on the copy's row: the availability at the left
 * margin, the byline at the right. On a phone the byline goes down to the
 * frame's foot and the availability is not shown (copy.css), as the
 * user's phone frame has it.
 *
 * Server component: markup and data- hooks only.
 */
export default function HeroNotes() {
  return (
    <>
      <p data-hero-note="availability">
        <RevealLine>{HERO_AVAILABILITY}</RevealLine>
      </p>
      <p data-hero-note="byline">
        <RevealLine>{HERO_BYLINE.role} </RevealLine>
        <RevealLine>
          <small>{HERO_BYLINE.copyright}</small>
        </RevealLine>
      </p>
    </>
  );
}
