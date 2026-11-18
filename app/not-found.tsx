import type { Metadata } from "next";

import { NotFoundSection } from "@/components/not-found";

/**
 * The 404: every URL the site does not have (the static export writes it as
 * out/404.html, which the host serves with a 404 status). Composition only.
 *
 * ITS OWN ROUTE: its scene's engine and its words load only here, never
 * with the home page (components/not-found).
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "This page does not exist. Go back to home.",
  /* Not a page to find: stated here so the site's own "index" (the root
     layout) does not stand beside Next's noindex for it. */
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="relative w-full flex-1 overflow-x-clip">
      <NotFoundSection />
    </main>
  );
}
