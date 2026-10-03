import { HeroSection } from "@/components/hero";

/**
 * Page composition only. Sections are imported from their feature folders
 * and stacked; no layout or copy lives here.
 *
 * `main` clips horizontally with `overflow-x: clip`, NEVER `overflow-x: hidden`:
 * hidden computes overflow-y to auto, which makes main a scroll container and
 * silently breaks every position: sticky descendant.
 */
export default function Home() {
  return (
    <main className="relative flex-1 w-full overflow-x-clip">
      <HeroSection />
    </main>
  );
}
