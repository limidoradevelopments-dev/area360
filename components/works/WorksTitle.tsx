import type { Ref } from "react";

import RevealLine from "@/components/ui/RevealLine";

/**
 * ─── WorksTitle ───
 *
 * The section's heading, on the page's axis (column 7, as the hero's
 * words and the promise's copy stand): the site's title voice, one line
 * in its mask, dropping in from above as every heading after the hero's
 * does (works.css; WorksSection plays it).
 *
 * Server component: markup and data- hooks only.
 */
export interface WorksTitleProps {
  id: string;
  title: string;
  /** The section watches it come into view by it. */
  ref?: Ref<HTMLHeadingElement>;
}

export default function WorksTitle({ id, title, ref }: WorksTitleProps) {
  return (
    <h2 ref={ref} id={id} data-works-title data-reveal-drop>
      <RevealLine>{title}</RevealLine>
    </h2>
  );
}
