import { Fragment } from "react";
import type { Ref } from "react";

import PromiseRule from "./PromiseRule";

/**
 * ─── PromisePassage ───
 *
 * Paragraphs between rows of dots: a row, a paragraph, a row, a paragraph,
 * a row — one row shared between two paragraphs, each a beat clear of the
 * copy (promise.css). Each paragraph waits unseen until the section splits
 * it into its lines and drops them in (data-reveal-lines: ui/splitLines.ts).
 *
 * Markup and data- hooks only.
 */
export interface PromisePassageProps {
  /** Which side of the mark: the scroll will treat them differently. */
  place: "above" | "below";
  paragraphs: readonly string[];
  /** The section watches the passage come into view by it. */
  ref?: Ref<HTMLDivElement>;
}

export default function PromisePassage({ place, paragraphs, ref }: PromisePassageProps) {
  return (
    <div ref={ref} data-promise-passage={place}>
      <PromiseRule />
      {paragraphs.map((text) => (
        <Fragment key={text}>
          <p data-promise-text data-reveal-lines="">
            {text}
          </p>
          <PromiseRule />
        </Fragment>
      ))}
    </div>
  );
}
