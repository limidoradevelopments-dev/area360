/**
 * ─── PromiseRule ───
 *
 * A row of amber dots across the page's grid (promise.css): a pair on each
 * margin's line, a dot on each edge of the copy's block. Ornament: hidden
 * from a reader of the page.
 *
 * Server component: markup and data- hooks only.
 */

/* Where the dots stand, left to right. */
const DOTS = ["margin-start", "block-start", "block-end", "margin-end"] as const;

export default function PromiseRule() {
  return (
    <div data-promise-rule aria-hidden="true">
      {DOTS.map((place) => (
        <span key={place} data-promise-dot={place} />
      ))}
    </div>
  );
}
