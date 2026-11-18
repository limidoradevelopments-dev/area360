/**
 * ─── Header · content ───
 *
 * The one way to reach the studio (the user's frames, 2026-11-18): a
 * contact link at the top right, writing a mail. The address is the
 * site's (components/site).
 */

import { PERSON } from "@/components/site/content";

export const HEADER_CONTACT = {
  label: "Contact",
  href: `mailto:${PERSON.email}`,
  /* Said after the label to a screen reader: where the link goes. */
  note: "by email",
} as const;
