/**
 * ─── Work detail · the arrows ───
 *
 * Two hairline drawings in one 10-unit box, stroked in currentColor at a
 * true pixel whatever their size (non-scaling strokes):
 *
 *   WorkPointer  ↘ after the work's name on a wide screen: the pictures
 *                are below and to the right. Decorative.
 *   WorkFoldMark the phone's toggle: ↙ while the details are open (they
 *                are below), and, as they fold, the arrow TURNS INTO A
 *                DASH — its shaft swings level and its head draws back
 *                into the shaft's end — the details folded into one line
 *                (work-detail.css, keyed on the page's data-wp-fold).
 *
 * Server components: markup only.
 */

export function WorkPointer() {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true" focusable="false" data-wp-pointer>
      <path d="M1 1 9 9" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d="M9 3v6H3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function WorkFoldMark() {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true" focusable="false" data-wp-fold-mark>
      <g data-wp-fold-arrow>
        <path d="M9 1 1 9" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d="M1 3v6h6" strokeWidth={1} vectorEffect="non-scaling-stroke" data-wp-fold-head />
      </g>
    </svg>
  );
}
