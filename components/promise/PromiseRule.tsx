/**
 * ─── PromiseRule ───
 *
 * A row of amber dots across the page's grid (promise.css): a pair on each
 * margin's line, a dot on each edge of the copy's block — or, round the
 * stage, the pairs alone (the user, 2026-11-02: the stage's four corners
 * marked as the passages' are, at the grid's outer edges). Ornament:
 * hidden from a reader of the page.
 *
 * Server component: markup and data- hooks only.
 */

export interface PromiseRuleProps {
  /** "page": the margins' pairs only, the stage's corners. */
  only?: "page";
}

/* Where the dots stand, left to right. */
const DOTS = ["margin-start", "block-start", "block-end", "margin-end"] as const;
const PAGE = ["margin-start", "margin-end"] as const;

export default function PromiseRule({ only }: PromiseRuleProps) {
  return (
    <div data-promise-rule aria-hidden="true">
      {(only === "page" ? PAGE : DOTS).map((place) => (
        <span key={place} data-promise-dot={place} />
      ))}
    </div>
  );
}
