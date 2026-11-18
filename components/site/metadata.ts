import type { Metadata } from "next";

import { SITE } from "./content";

/**
 * The share card's Open Graph fields, once: the root layout sets them for
 * every page and the home page adds its own address to them. A page that
 * sets `openGraph` REPLACES its parent's whole (Next merges metadata one
 * key deep), so a page spreads this rather than restating it.
 */
export const OPEN_GRAPH: NonNullable<Metadata["openGraph"]> = {
  type: "website",
  siteName: SITE.name,
  locale: SITE.locale,
  title: SITE.share.title,
  description: SITE.share.description,
};
