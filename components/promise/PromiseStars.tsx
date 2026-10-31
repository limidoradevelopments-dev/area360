import type { Ref } from "react";

/**
 * ─── PromiseStars ───
 *
 * Between the passages (2026-11-01, the user's frame): four stars, the
 * user's one four-pointed star (37 × 55, its long ray down) at four sizes —
 * a great one, a small one at its upper right, and two specks below and to
 * the left — each with its own LIGHT, built apart from the art (promise.css,
 * motion.ts STAR_LIGHT): what the eye makes of a bright point in the dark —
 *
 *   the VEIL (the great star only): the wide, faint glare round it;
 *   the HALO: the close glare round the point, its falloff a power law;
 *   the BLOOM: the star's own rays scattered (a blur of the art), under
 *   the art, and its crossing burnt out to white over it (the core);
 *   the GLINT (the great star and the small one): thin streaks of glare
 *   through the crossing, a long one across and a short one up, and a
 *   flash at its heart — the part that scintillates.
 *
 * The art itself stays as the user drew it, and still. Every shape here is
 * drawn once and never again (a still blur or gradient is rastered once
 * and kept); only opacity and transform move, on the compositor. Each star
 * comes out in turn as the cluster comes into view, then lives
 * (PromiseSection).
 *
 * Ornament: hidden from a reader of the page. Server component: markup and
 * data- hooks only.
 */
export interface PromiseStarsProps {
  /** The section watches the stars come into view by it. */
  ref?: Ref<HTMLDivElement>;
}

/* The user's star, in its own 37 × 55 drawing: the crossing at (18.5, 19). */
const STAR =
  "M18.5 0L19.4258 16.3546C19.4683 17.1052 20.0598 17.7084 20.8093 17.7655L37 19L20.8739 19.9215C20.0967 19.9659 19.4827 20.5975 19.4601 21.3756L18.5 54.5L17.2183 21.3603C17.1885 20.5886 16.5776 19.9657 15.8067 19.9208L0 19L15.8831 17.7654C16.621 17.708 17.2068 17.1209 17.2626 16.3829L18.5 0Z";

/* The bloom's id: one cluster on the page, its filter shared by the four.
   Its blur is in each star's own drawing, so it scales with the star. */
const BLOOM_ID = "promise-star-bloom";

/* The stars, the great one first (each placed and sized in promise.css),
   and which of the light's parts each carries: a speck is too small for a
   glint's streaks to read, and one veil is the cluster's. */
const STARS = [
  { name: "great", veil: true, glint: true },
  { name: "small", veil: false, glint: true },
  { name: "speck-low", veil: false, glint: false },
  { name: "speck-left", veil: false, glint: false },
] as const;

export default function PromiseStars({ ref }: PromiseStarsProps) {
  return (
    <div data-promise-stars aria-hidden="true">
      <svg data-promise-stars-defs width="0" height="0" focusable="false">
        <defs>
          {/* Two scales of scatter laid together, round the rays: the near
              hugging them, the far softening them off. Its region reaches
              past the art by the far blur's three sigma. */}
          <filter id={BLOOM_ID} x="-30%" y="-20%" width="160%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="near" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="far" />
            <feComponentTransfer in="near" result="near-weighed">
              <feFuncA type="linear" slope="0.7" />
            </feComponentTransfer>
            <feComponentTransfer in="far" result="far-weighed">
              <feFuncA type="linear" slope="0.45" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="far-weighed" />
              <feMergeNode in="near-weighed" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <div ref={ref} data-promise-stars-cluster>
        {STARS.map(({ name, veil, glint }) => (
          <span key={name} data-promise-star={name}>
            {veil ? (
              <span data-promise-star-veil>
                <span data-promise-star-veil-drift />
              </span>
            ) : null}
            <span data-promise-star-halo />
            <span data-promise-star-body>
              <svg data-promise-star-bloom viewBox="-11 -11 59 77" focusable="false">
                <path d={STAR} filter={`url(#${BLOOM_ID})`} />
              </svg>
              <svg data-promise-star-art viewBox="0 0 37 55" focusable="false">
                <path d={STAR} />
              </svg>
              <span data-promise-star-core />
              {glint ? (
                <span data-promise-star-glint>
                  <span data-promise-star-flare>
                    <span data-promise-star-ray="across" />
                    <span data-promise-star-ray="up" />
                    <span data-promise-star-spark />
                  </span>
                </span>
              ) : null}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
