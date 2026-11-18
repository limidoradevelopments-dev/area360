/**
 * ─── Site · who and where ───
 *
 * The site's identity, written once (2026-11-18, the user: the first
 * published version, made to be found): its address and name, the person
 * behind it, their work and profiles, and the words search engines and
 * share cards show. The page's metadata (app/layout.tsx, app/page.tsx),
 * its structured data (SiteJsonLd), the robots file and the sitemap read
 * it, and so do the hero's lists and the header's contact: what a visitor
 * reads and what a search engine is told can never drift apart (Google
 * asks structured data to match the visible text).
 */

/** The one address the site answers at (Cloudflare Pages; the www and
 *  pages.dev hosts send to it or stay out of the index: public/_headers). */
export const SITE_URL = "https://kaviklavis.com";

export interface Profile {
  readonly label: string;
  readonly href: string;
}

/** The person behind the site. */
export const PERSON = {
  name: "Kavin Thilakarathna",
  role: "Creative Developer & Designer",
  email: "kaveenthilakarathna582@gmail.com",
  country: { name: "Sri Lanka", code: "LK" },
  /** What the work is, in the order the hero lists it. */
  skills: ["UI/UX Design", "Web Design", "Web Development", "Brand Identity", "WebGL"],
  /** Elsewhere: the hero's "Social" list and the structured data's sameAs. */
  profiles: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/kavin-thilakarathna/" },
    { label: "X", href: "https://x.com/kaveen00" },
  ] as readonly Profile[],
  /** On X, for the share card's creator. */
  handle: "@kaveen00",
} as const;

/**
 * The site, as search engines and share cards show it.
 *
 * NAME: "Kavi Klavis", the site's own (its domain); Google takes a site's
 * name first from the home page's WebSite structured data, with these
 * alternates if it will not use the first.
 *
 * TITLE: the person's name first — the search a portfolio must win — then
 * what they do; the site's name last, where Google drops it when the
 * result already shows it. Under ~60 characters before the name.
 *
 * DESCRIPTION: the most important first (Google cuts a snippet to the
 * device's width): who, what, where, every discipline in plain words, no
 * keyword list.
 *
 * SHARE: a share card is read by people, not ranked: the hero's own words.
 */
export const SITE = {
  name: "Kavi Klavis",
  alternateNames: ["kavi", "kaviklavis.com"],
  language: "en",
  locale: "en_US",
  title: `${PERSON.name} — ${PERSON.role} | Kavi Klavis`,
  description: `${PERSON.name} is a creative developer and designer in Sri Lanka: UI/UX, web design and development, brand identity and WebGL. Available worldwide.`,
  share: {
    title: `${PERSON.name} — ${PERSON.role}`,
    description:
      "Designing the visceral, not just the visible. Digital experiences that leave a feeling long after the screen goes dark.",
  },
  /** The page's black (tokens.css --color-night): the browser's bars, the
   *  app icon's ground. */
  night: "#111111",
} as const;
