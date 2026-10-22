import { PRELOADER_SLOTS, PRELOADER_WORDS } from "./content";

/**
 * ─── PreloaderWords ───
 *
 * The six places beside the axis, each holding its word from the user's
 * frame. A word is five copies of itself, stacked: the mist's double, its
 * three strata (cut at the x-height and the baseline), and the whole word,
 * which is what rests on screen and what sizes the place (preloader.css).
 * The section swaps the text of all five when a place turns over.
 *
 * Server component: markup and data- hooks only.
 */
export const PRELOADER_LAYERS = ["echo", "cap", "body", "foot", "whole"] as const;

export default function PreloaderWords() {
  return (
    <>
      {PRELOADER_SLOTS.map((slot) => (
        <span key={slot.id} data-preloader-slot={slot.id}>
          {PRELOADER_LAYERS.map((layer) => (
            <span key={layer} data-preloader-layer={layer}>
              {PRELOADER_WORDS[slot.word]}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
