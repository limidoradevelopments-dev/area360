import type { MetadataRoute } from "next";

import { SITE_URL } from "@/components/site/content";

/**
 * robots.txt: every crawler may read every page (a page that is not ready
 * says so itself, with a noindex: a crawler must be let in to read it),
 * and where the sitemap is. Written at the build (a static export).
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
