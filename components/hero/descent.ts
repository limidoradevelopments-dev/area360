/**
 * ─── Hero · the descent's clock ───
 *
 * How far the page has scrolled through the hero: 0 at rest, 1 once its
 * whole height has gone by (stage/motion.ts DESCENT, motion.ts
 * DESCENT_FADE). The scroll is the clock: read on every scroll (a native
 * passive listener covers wheel through Lenis, touch, keys and a restored
 * position in one path), from `scrollY` alone, which costs no layout; the
 * section's place and height are measured once and again only when it
 * resizes.
 *
 * Calls `onProgress` at once with where the page stands (a page restored
 * part-way down opens as it was left, never animated there), then on
 * every change. Returns what stops it.
 */
export function followDescent(section: HTMLElement, onProgress: (progress: number) => void): () => void {
  let top = 0;
  let height = 1;
  let last = Number.NaN;

  const measure = () => {
    top = section.getBoundingClientRect().top + window.scrollY;
    height = Math.max(1, section.offsetHeight);
  };
  const update = () => {
    const progress = Math.min(1, Math.max(0, (window.scrollY - top) / height));
    if (progress === last) return;
    last = progress;
    onProgress(progress);
  };

  measure();
  update();
  const resize = new ResizeObserver(() => {
    measure();
    update();
  });
  resize.observe(section);
  window.addEventListener("scroll", update, { passive: true });
  return () => {
    resize.disconnect();
    window.removeEventListener("scroll", update);
  };
}
