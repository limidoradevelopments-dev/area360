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
  title: "Page not found — kavi",
  description: "This page does not exist. Go back to home.",
};

export default function NotFound() {
  return (
    <main className="relative w-full flex-1 overflow-x-clip">
      <NotFoundSection />
    </main>
  );
}
