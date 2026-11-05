import { LOST_TITLE } from "./content";
import LostLink from "./LostLink";
import LostShell from "./LostShell";
import LostStill from "./LostStill";
import LostStrip from "./LostStrip";
import LostTitle from "./LostTitle";

/**
 * ─── NotFoundSection ───
 *
 * THE 404 (2026-11-05, the user's 1920 desktop frame and 390 phone frame):
 * the hero's lake with its trees gone into the fog, its stone broken, its
 * two flowers dead on it; "404 Error" falling down the page in a strip;
 * the headline and the way home.
 *
 * ITS OWN ROUTE, ITS OWN SCENE: nothing of it loads with the home page, and
 * it loads nothing of the home page's (the hero's engine stays unfetched:
 * its camera and its stone's measures are borrowed, never StageCanvas).
 *
 * A SERVER COMPONENT, ON PURPOSE (measured 2026-11-05): Next lays the root
 * not-found page's client code into EVERY page, as the boundary any route
 * may fall to — a client section here put 4.5 KB gzipped on the home
 * page's first load. So everything here is markup, and the one client
 * part is a shell a few hundred bytes long (LostShell) that asks for the
 * live part — the scene, the entrance — only when this page is drawn.
 */
export interface NotFoundSectionProps {
  /**
   * Off by default: the motion plays for everyone. When on and the visitor
   * prefers reduced motion, the lines lose their drop and only fade in, the
   * strip stands still, and the scene's water and grain are held.
   */
  respectReducedMotion?: boolean;
}

const TITLE_ID = "lost-title";

export default function NotFoundSection({ respectReducedMotion = false }: NotFoundSectionProps) {
  return (
    <section aria-labelledby={TITLE_ID} data-lost>
      <div data-lost-stage>
        <LostStill />
        <LostShell respectReducedMotion={respectReducedMotion} />
      </div>
      <div data-lost-words data-reveal-drop>
        <LostStrip />
        <div data-lost-head>
          <LostTitle id={TITLE_ID} title={LOST_TITLE} />
          <LostLink />
        </div>
      </div>
    </section>
  );
}
