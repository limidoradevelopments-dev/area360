import type { MetadataRoute } from "next";

import { SITE_URL } from "@/components/site/content";

/**
 * sitemap.xml: the pages to index — the home page alone in the first
 * published version (the works' pages are not ready: app/works/[slug]).
 * Its date is the build's, the day the page last changed. Written at the
 * build (a static export).
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
