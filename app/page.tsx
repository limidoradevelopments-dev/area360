import type { Metadata } from "next";

import { SiteHeader } from "@/components/header";
import { HeroSection } from "@/components/hero";
import { Preloader } from "@/components/preloader";
import { OPEN_GRAPH, SiteJsonLd } from "@/components/site";
import FilmGrain from "@/components/ui/FilmGrain";
import StageRevealProvider from "@/components/ui/StageReveal";

/**
 * Page composition only. Sections are imported from their feature folders
 * and stacked; no layout or copy lives here.
 *
 * THE FIRST PUBLISHED VERSION (2026-11-18, the user): the hero alone, its
 * words as their frames lay them, under the curtain. The reality promise,
 * the works and the settings dock wait in their folders for the full site.
 *
 * The preloader is the curtain over the whole page, drawn over everything
 * and last in the source (its words are not the page's text): it and the
 * hero share one StageReveal, so the hero's scene starts arriving as the
 * curtain begins to lift, not behind it. The site's header lies over the
 * top of the hero's frame.
 *
 * `main` clips horizontally with `overflow-x: clip`, NEVER `overflow-x: hidden`:
 * hidden computes overflow-y to auto, which makes main a scroll container and
 * silently breaks every position: sticky descendant.
 *
 * FOUND BY ITS ONE ADDRESS: the home page names itself as the canonical
 * one (the www and pages.dev hosts are the same page), shares under it,
 * and carries the site's structured data (components/site), which Google
 * reads for the site's name only on the home page.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH, url: "/" },
};

export default function Home() {
  return (
    <StageRevealProvider>
      <SiteJsonLd />
      <SiteHeader />
      <main className="relative flex-1 w-full overflow-x-clip">
        <HeroSection />
      </main>
      <FilmGrain overScene />
      {/* The curtain over all of it (fixed, on top), LAST IN THE SOURCE: the
          document's first words are the page's own, not the curtain's. */}
      <Preloader />
    </StageRevealProvider>
  );
}
