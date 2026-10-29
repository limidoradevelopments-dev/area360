/**
 * ─── Header · content ───
 *
 * The mark's name, the clock's place and the nav. The nav's sections are
 * still to come: each link names the id its section will carry, and Lenis
 * (anchors) scrolls to it once it is there.
 */

/** The mark: back to the top of the page (Lenis takes "#top" to 0). */
export const HEADER_MARK = {
  href: "#top",
  label: "kavi, back to the top",
} as const;

/** The studio's own clock: the time where the work is made. */
export const HEADER_CLOCK = {
  timeZone: "Asia/Colombo",
  /* The frame's "GTM 5.30+ LK", its letters put in order. */
  zone: "GMT +5:30 LK",
  /* Said before the time to a screen reader; not shown. */
  label: "Local time",
  /* What the box holds before the first tick: as wide as any time, the
     figures being tabular. */
  placeholder: "00:00:00",
} as const;

export interface HeaderLink {
  readonly label: string;
  readonly href: string;
}

export const HEADER_NAV_LABEL = "Primary";

export const HEADER_NAV: readonly HeaderLink[] = [
  { label: "About", href: "#about" },
  { label: "Works", href: "#works" },
  { label: "Process", href: "#process" },
  { label: "Contact", href: "#contact" },
];
