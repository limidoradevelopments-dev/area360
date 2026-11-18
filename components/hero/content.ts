/**
 * ─── Hero · content ───
 *
 * The words over the scene (the user's 1920 and 390 frames, 2026-11-18,
 * for the first published version). The big text's lines are authored,
 * not wrapped: every break is a frame's. The supporting words are written
 * as they are read; the stylesheet sets them in capitals (a screen reader
 * spells some words written in capitals letter by letter). Who the site is
 * (the person, their work, their profiles) is the site's (components/site),
 * which its metadata and structured data read too.
 */

import { PERSON, type Profile } from "@/components/site/content";

/**
 * A passage as phrases, WRITTEN ONCE, each in its own reveal mask, with
 * the frames' breaks between them: WIDE is the 1920 frame's (1280 and up,
 * where the statement shares the top row with the lists), NARROW the 390
 * frame's (a tablet and a phone, where the wide lines would run into the
 * lists). A phrase's `breakAfter` is the band that ends a line after it;
 * in the other band the next phrase follows on the same line. So a reader
 * of the text — a screen reader, a search engine, a share card's scraper —
 * reads each passage once, as one sentence (copy/HeroStatement).
 */
export interface HeroPhrase {
  readonly text: string;
  readonly breakAfter?: "wide" | "narrow";
}

/** The headline, the section's h1: one line wide, two narrow. */
export const HERO_TITLE: readonly HeroPhrase[] = [
  { text: "Designing the visceral,", breakAfter: "narrow" },
  { text: "not just the visible." },
];

/** The words under it, in the headline's own voice. Wide: "I create
 *  digital experiences that / leave a feeling long after the / screen goes
 *  dark." Narrow: "I create digital experiences / that leave a feeling long
 *  after / the screen goes dark." */
export const HERO_LEDE: readonly HeroPhrase[] = [
  { text: "I create digital experiences", breakAfter: "narrow" },
  { text: "that", breakAfter: "wide" },
  { text: "leave a feeling long after", breakAfter: "narrow" },
  { text: "the", breakAfter: "wide" },
  { text: "screen goes dark." },
];

export type HeroLink = Profile;

/** What the work is: a numbered list under its label. */
export const HERO_SPECIALIZED = {
  label: "Specialized",
  items: PERSON.skills,
} as const;

/** Where else to find the work: numbered as the list beside it. */
export const HERO_SOCIAL: { readonly label: string; readonly links: readonly HeroLink[] } = {
  label: "Social",
  links: PERSON.profiles,
};

/** Where the work is made, over the time there. In this order on every
 *  screen: the desktop frame's, so the clock stands under the place it
 *  tells the time of (the phone frame swaps the two lines; the source is
 *  one order for both). */
export const HERO_PLACE = ["Available worldwide", `Based in ${PERSON.country.name}`] as const;

/** The studio's own clock: the time where the work is made. */
export const HERO_CLOCK = {
  timeZone: "Asia/Colombo",
  /* Said before the time to a screen reader; not shown. */
  label: "Local time in Sri Lanka",
  /* What the box holds before the first tick: as wide as any time, the
     figures being tabular. */
  placeholder: "00:00:00",
} as const;

/** The mark at the foot: the signature, named for a reader. */
export const HERO_MARK_LABEL = "Kavi Klavis";

/** The byline at the foot. THE NAME IN THE © LINE (2026-11-18, the user):
 *  the page's one visible place for it, the strongest sign on the page of
 *  whose work this is. */
export const HERO_BYLINE = {
  role: PERSON.role,
  copyright: `© 2026 ${PERSON.name}`,
} as const;
