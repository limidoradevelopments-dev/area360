import { cx } from "./cx";

/**
 * ─── OSDivider ───
 *
 * The structural rule. 1px, raw light grey, at every viewport — see
 * `--size-rule` in globals.css. Optional technical labels sit on it like an
 * OS status bar.
 */
export interface OSDividerProps {
  left?: string;
  right?: string;
  className?: string;
}

const LABEL = cx(
  "font-switzer uppercase text-muted",
  "text-[length:var(--text-label)] tracking-[var(--tracking-label)]",
);

export default function OSDivider({ left, right, className }: OSDividerProps) {
  const hasLabels = Boolean(left || right);

  return (
    <div
      role="separator"
      className={cx(
        "w-full border-t border-[color:var(--color-rule)]",
        hasLabels && "flex items-center justify-between pt-3",
        className,
      )}
    >
      {left && <span className={LABEL}>{left}</span>}
      {right && <span className={LABEL}>{right}</span>}
    </div>
  );
}
