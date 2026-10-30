/**
 * ─── PromiseStage ───
 *
 * The space between the passages, where the mark will stand: its box is
 * held at the size the frame draws it (promise.css), empty for now. The
 * mark comes with the scroll, assembled from the letters above it.
 *
 * Server component: markup and data- hooks only.
 */
export default function PromiseStage() {
  return (
    <div data-promise-stage aria-hidden="true">
      <div data-promise-mark />
    </div>
  );
}
