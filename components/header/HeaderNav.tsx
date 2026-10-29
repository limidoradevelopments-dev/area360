import RevealLine from "@/components/ui/RevealLine";

import { HEADER_NAV, HEADER_NAV_LABEL } from "./content";

/**
 * ─── HeaderNav ───
 *
 * The site's sections, right-aligned against a hairline that runs down the
 * list. Each word rises out of its own mask, INSIDE its link: the mask
 * clips the word, never the link, so the link's widened press area
 * (header.css) stays whole.
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
    </nav>
  );
}
