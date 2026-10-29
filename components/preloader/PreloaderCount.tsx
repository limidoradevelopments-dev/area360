import { PRELOADER_LABEL, formatCount } from "./content";

/**
 * ─── PreloaderCount ───
 *
 * The count at the top: what has loaded, in percent. A progressbar for
 * assistive technology (its value written in tens by the section); the
 * figure itself sits in a mask it rises out of and lifts out of.
 *
 * Server component: markup and data- hooks only.
 */
export default function PreloaderCount() {
  return (
    <div
      data-preloader-count
      role="progressbar"
      aria-label={PRELOADER_LABEL}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <span data-preloader-count-line aria-hidden="true">
        {formatCount(0)}
      </span>
    </div>
  );
}
