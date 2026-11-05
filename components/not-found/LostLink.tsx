import RevealLine from "@/components/ui/RevealLine";

import { LOST_LINK } from "./content";

/**
 * ─── LostLink ───
 *
 * The way home: a hairline arrow and its words, one line in one mask.
 *
 * A PLAIN LINK, A WHOLE PAGE LOAD — not the router's: the home page's
 * first screen is built for a fresh document (its curtain, its scene's
 * engine starting before the page hydrates: hero/stage/StageCanvas.tsx),
 * and leaving this page lets its own scene go with it. The shared scripts
 * are cached, so it costs nothing a soft navigation would save.
 *
 * THE ARROW IS LUCIDE'S MoveLeft, DRAWN INLINE (2026-11-05, measured):
 * Lucide's components are client code, and this page's client code rides
 * on every page of the site (NotFoundSection) — the icon put its runtime,
 * ~1 KB gzipped, on the home page's first load. Its two strokes as markup
 * cost nothing; a 1px hairline at any size (non-scaling stroke).
 *
 * Server component: markup and data- hooks only.
 */
export default function LostLink() {
  return (
    <a href={LOST_LINK.href} data-lost-link>
      <RevealLine>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-lost-arrow>
          <path d="M6 8L2 12L6 16" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d="M2 12H22" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <span data-lost-link-label>{LOST_LINK.label}</span>
      </RevealLine>
    </a>
  );
}
