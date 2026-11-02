/**
 * ─── PromiseAir ───
 *
 * The air the letters fall through: a screen-sized layer held over the
 * screen for the whole section, and let go with the mark (promise.css),
 * its canvas drawing every letter that has left its line (assembly.ts).
 * Unseen until the first one has.
 *
 * Ornament: the passages are the words. Server component: markup and
 * data- hooks only.
 */
export default function PromiseAir() {
  return (
    <div data-promise-air aria-hidden="true">
      <canvas data-promise-canvas />
    </div>
  );
}
