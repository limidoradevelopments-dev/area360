import EmbossRule from "@/components/ui/EmbossRule";
import RevealLine from "@/components/ui/RevealLine";
import { workHref, type Work } from "@/components/works/content";

import { WORK_BACK, WORK_NAV_LABEL, WORK_NEXT } from "./content";

/**
 * ─── WorkFoot ───
 *
 * The page's foot (the user's frame, 2026-11-11): a row of embossed dots,
 * and under it the two ways out — "Back home" at the margin, a hairline
 * before it, and "Next Project" at the panel's end, a hairline after it:
 * each line points the way it goes. On a wide screen it stands at the
 * foot of the screen under the panel the whole way down; on a phone it
 * ends the page, after the pictures.
 *
 * PLAIN LINKS, WHOLE PAGE LOADS: the home page's first screen is built for
 * a fresh document, and each work's page plays its own entrance.
 *
 * Server component: markup and data- hooks only.
 */
export interface WorkFootProps {
  next: Work;
}

export default function WorkFoot({ next }: WorkFootProps) {
  return (
    <footer data-wp-foot data-reveal-drop>
      <EmbossRule reveal />
      <nav aria-label={WORK_NAV_LABEL} data-wp-links>
        <a href={WORK_BACK.href} data-wp-link="back">
          {/* Drawn from the word outward (data-reveal-wipe="end"). */}
          <span aria-hidden="true" data-wp-link-line data-reveal-wipe="end" />
          <RevealLine>{WORK_BACK.label}</RevealLine>
        </a>
        <a href={workHref(next)} aria-label={WORK_NEXT.said(next.title)} data-wp-link="next">
          <RevealLine>{WORK_NEXT.label}</RevealLine>
          <span aria-hidden="true" data-wp-link-line data-reveal-wipe />
        </a>
      </nav>
    </footer>
  );
}
