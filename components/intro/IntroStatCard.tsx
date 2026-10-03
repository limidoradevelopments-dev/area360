import { cx } from "@/components/ui/cx";

import type { IntroStat } from "./content";

/**
 * ─── IntroStatCard ───
 *
 * A glass card holding one number. The number is display voice; the label is
 * the technical-badge voice. `data-reveal-card` gives it its pre-entrance
 * state in CSS so the section's timeline can float it in.
 */
export default function IntroStatCard({ stat }: { stat: IntroStat }) {
  return (
    <article
      data-reveal-card
      className={cx(
        "glass flex flex-col justify-between gap-8",
        "p-[var(--size-intro-card-pad)] rounded-[var(--radius-intro-card)]",
      )}
    >
      <span
        className={cx(
          "font-cabinet font-medium leading-none tracking-tighter text-ink",
          "text-[length:var(--text-intro-stat)]",
        )}
      >
        {stat.value}
      </span>
      <span
        className={cx(
          "font-switzer uppercase text-muted",
          "text-[length:var(--text-label)] tracking-[var(--tracking-label)]",
        )}
      >
        {stat.label}
      </span>
    </article>
  );
}
