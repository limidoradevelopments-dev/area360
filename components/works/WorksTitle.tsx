import { Fragment, type Ref } from "react";

import RevealLine from "@/components/ui/RevealLine";

/**
 * ─── WorksTitle ───
 *
 * The section's heading, on the page's axis (column 7, as the hero's
 * words and the promise's copy stand): the site's section-title voice, a
 * statement in two lines, each in its own mask, dropping in from above
 * as every heading after the hero's does (works.css; WorksSection plays
 * it). The lines are spaced for a reader: one sentence, said whole.
 *
 * Server component: markup and data- hooks only.
 */
export interface WorksTitleProps {
  id: string;
  lines: readonly string[];
  /** The section watches it come into view by it. */
  ref?: Ref<HTMLHeadingElement>;
}

export default function WorksTitle({ id, lines, ref }: WorksTitleProps) {
  return (
    <h2 ref={ref} id={id} data-works-title data-reveal-drop>
      {lines.map((line, k) => (
        <Fragment key={k}>
          {k > 0 ? " " : null}
          <RevealLine>{line}</RevealLine>
        </Fragment>
      ))}
    </h2>
  );
}
