import { Fragment } from "react";

/**
 * ─── WorksTitle ───
 *
 * The section's heading, on the page's axis (column 7, as the hero's
 * words and the promise's copy stand): the site's section-title voice, a
 * statement in two lines as the frame breaks it. NO ENTRANCE (2026-11-12,
 * the user: the title "doesn't need an appear animation", only the eye tag
 * beside it): it is simply there. The lines are spaced for a reader: one
 * sentence, said whole.
 *
 * Server component: markup and data- hooks only.
 */
export interface WorksTitleProps {
  id: string;
  lines: readonly string[];
}

export default function WorksTitle({ id, lines }: WorksTitleProps) {
  return (
    <h2 id={id} data-works-title>
      {lines.map((line, k) => (
        <Fragment key={k}>
          {k > 0 ? " " : null}
          <span data-works-title-line>{line}</span>
        </Fragment>
      ))}
    </h2>
  );
}
