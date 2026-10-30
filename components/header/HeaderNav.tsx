import RevealLine from "@/components/ui/RevealLine";

import { HEADER_NAV, HEADER_NAV_LABEL } from "./content";

/**
 * ─── HeaderNav ───
 *
 * The site's sections, right-aligned against a hairline that runs down the
 * list. Each word comes into its own mask, INSIDE its link: the mask clips
 * the word, never the link, so the link's widened press area (header.css)
 * stays whole.
 *
 * The hairline is also the page's SCROLL CUE: drawn down as the words
 * arrive, then a soft gap runs down it now and then (scrollCue.ts). Its
 * window and the strip that moves in it are decoration: hidden from
 * assistive technology.
 *
 * Server component: markup and data- hooks only.
 */
export default function HeaderNav() {
  return (
    <nav aria-label={HEADER_NAV_LABEL} data-header-nav>
      <ul>
        {HEADER_NAV.map((link) => (
          <li key={link.href}>
            <a href={link.href} data-header-link>
              <RevealLine>{link.label}</RevealLine>
            </a>
          </li>
        ))}
      </ul>
      <span data-header-rule aria-hidden="true">
        <span data-header-rule-ink />
      </span>
    </nav>
  );
}
