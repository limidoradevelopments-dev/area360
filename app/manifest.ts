import type { MetadataRoute } from "next";

import { PERSON, SITE } from "@/components/site/content";

/**
 * The web app manifest: the site's name, colours and icons where a phone
 * saves it to its home screen. A site to visit, not an app: shown in the
 * browser. Its icons are scripts/site-images.mjs's (the 192 is
 * app/icon.png, which Next serves at /icon.png). Written at the build (a
 * static export).
 */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${PERSON.name}`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "browser",
    background_color: SITE.night,
    theme_color: SITE.night,
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
