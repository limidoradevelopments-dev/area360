import { WORKS_HEADING } from "./content";

/**
 * ─── WorksSection ───
 *
 * The works (the nav's #works), after the reality promise. OPENED AS A
 * SPACE (2026-11-02, the user: "we haven't developed a works section, but
 * open a space for it"): the page's grid on the page's black, no content
 * yet.
 *
 * IT FOLLOWS THE PROMISE in the page's own flow (the user, 2026-11-02:
 * nothing laid over anything): as it comes up, the moth's letters have
 * bloomed off the mark (promise/assembly.ts) and fade out above its top
 * edge — the welcome.
 *
 * NO VISIBLE HEADING yet: labelled for a reader of the page only. A server
 * component; it becomes the section's client shell when its timeline
 * comes.
 */
export interface WorksSectionProps {
  className?: string;
}

/* The heading's id: the section is labelled by it. */
const HEADING_ID = "works-heading";

export default function WorksSection({ className }: WorksSectionProps) {
  return (
    <section id="works" aria-labelledby={HEADING_ID} data-works className={className}>
      <h2 id={HEADING_ID} className="sr-only">
        {WORKS_HEADING}
      </h2>
    </section>
  );
}
