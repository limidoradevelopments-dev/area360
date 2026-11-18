import RevealLine from "@/components/ui/RevealLine";

import { HERO_PLACE } from "../content";
import HeroClock from "./HeroClock";

/**
 * ─── HeroPlace ───
 *
 * Where the work is made, in the supporting voice: two lines, and under
 * them the time there in a hairline box (HeroClock).
 *
 * Server component: markup and data- hooks only.
 */
export default function HeroPlace() {
  return (
    <div data-hero-place>
      <p>
        {HERO_PLACE.map((line, k) => (
          <RevealLine key={line}>
            {line}
            {k < HERO_PLACE.length - 1 ? " " : null}
          </RevealLine>
        ))}
      </p>
      <HeroClock />
    </div>
  );
}
