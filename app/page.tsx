import { SiteHeader } from "@/components/header";
import { HeroSection } from "@/components/hero";
import { Preloader } from "@/components/preloader";
import { SettingsDock } from "@/components/settings";
import StageRevealProvider from "@/components/ui/StageReveal";

/**
 * Page composition only. Sections are imported from their feature folders
 * and stacked; no layout or copy lives here.
 *
 * The preloader is the curtain over the whole page: it and the sections
 * share one StageReveal, so the hero's scene starts arriving as the curtain
 * begins to lift, not behind it. The site's header lies over the top of the
 * hero's frame; the settings dock floats over all of it, in the page's
 * corner, once the scene it sets is live.
 *
 * `main` clips horizontally with `overflow-x: clip`, NEVER `overflow-x: hidden`:
 * hidden computes overflow-y to auto, which makes main a scroll container and
 * silently breaks every position: sticky descendant.
 */
export default function Home() {
  return (
    <StageRevealProvider>
      <Preloader />
      <SiteHeader />
      <main className="relative flex-1 w-full overflow-x-clip">
        <HeroSection />
      </main>
      <SettingsDock />
    </StageRevealProvider>
  );
}
