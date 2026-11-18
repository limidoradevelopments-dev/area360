import RevealLine from "@/components/ui/RevealLine";

import { HEADER_CONTACT } from "./content";

/**
 * ─── HeaderContact ───
 *
 * "Contact ↗" over an amber hairline, at the right margin: the word in the
 * supporting voice, the arrow and the rule in the accent (the user's
 * frames). The word and the arrow come into one mask INSIDE the link (the
 * mask clips them, never the link, so its widened press area stays whole);
 * the rule waits undrawn (data-reveal-wipe) and is drawn in after them.
 *
 * The arrow is drawn here, not taken from an icon library: the header is a
 * client component, and a library's runtime would ride on the first load
 * for one stroke.
 *
 * Server component: markup and data- hooks only.
 */
export default function HeaderContact() {
  return (
    <a href={HEADER_CONTACT.href} data-header-contact>
      <RevealLine>
        {HEADER_CONTACT.label}
        <span className="sr-only"> {HEADER_CONTACT.note}</span>
        <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false" data-header-arrow>
          {/* Up and to the right, its head a right angle: Lucide's
              arrow-up-right, cropped to its own strokes. */}
          <path d="M0.5 9.5 9.5 0.5M2 0.5h7.5V8" />
        </svg>
      </RevealLine>
      <span data-header-rule data-reveal-wipe aria-hidden="true" />
    </a>
  );
}
