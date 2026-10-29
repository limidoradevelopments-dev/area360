import { PRELOADER_SLOTS, PRELOADER_WORDS } from "./content";

/**
 * ─── PreloaderWords ───
 *
 * The six places beside the axis. A place is four stacks: the frame's own
 * word (the entrance's), then one stack for each word — written here, once,
 * and never again (surfacing.ts: a turn is a stack surfacing, not a word
 * written into a layer). A stack is its word several times over: a sizer
 * (never painted), the mist's double and the exit's, and three strata cut
 * at the x-height and the baseline, each a sharp copy and a soft one
 * (preloader.css).
 *
 * Server component: markup and data- hooks only.
 */
const BANDS = ["cap", "body", "foot"] as const;

function PreloaderStack({ word }: { word: number }) {
  const text = PRELOADER_WORDS[word];
  return (
    <span data-preloader-stack data-preloader-word={word}>
      <span data-preloader-sizer>{text}</span>
      <span data-preloader-out>{text}</span>
      <span data-preloader-echo>{text}</span>
      {BANDS.map((band) => (
        <span key={band} data-preloader-band={band}>
          <span data-preloader-shear>
            <span data-preloader-ink="soft">{text}</span>
            <span data-preloader-ink="sharp">{text}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

export default function PreloaderWords() {
  return (
    <>
      {PRELOADER_SLOTS.map((slot) => (
        <span key={slot.id} data-preloader-slot={slot.id}>
          <PreloaderStack word={slot.word} />
          {PRELOADER_WORDS.map((_, word) => (
            <PreloaderStack key={word} word={word} />
          ))}
        </span>
      ))}
    </>
  );
}
