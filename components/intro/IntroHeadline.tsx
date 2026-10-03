import { cx } from "@/components/ui/cx";

/**
 * ─── IntroHeadline ───
 *
 * Display voice: Cabinet Grotesk, tight tracking, sub-1 leading. Each
 * authored line sits in its own mask so it can slide up out of an invisible
 * overflow boundary. Server component — the motion is driven by the section.
 */
export interface IntroHeadlineProps {
  id: string;
  lines: readonly string[];
  className?: string;
}

export default function IntroHeadline({ id, lines, className }: IntroHeadlineProps) {
  return (
    <h1
      id={id}
      className={cx(
        "font-cabinet font-medium text-ink",
        "text-[length:var(--text-intro-display)]",
        "[line-height:var(--leading-intro-display)]",
        "tracking-[var(--tracking-intro-display)]",
        className,
      )}
    >
      {lines.map((line) => (
        <span key={line} data-reveal-mask>
          <span data-reveal-line>{line}</span>
        </span>
      ))}
    </h1>
  );
}
