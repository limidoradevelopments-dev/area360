import type { ReactNode } from "react";

/**
 * ─── RevealLine ───
 *
 * One line in its own mask (utilities.css: data-reveal-mask holds,
 * data-reveal-line moves), for an entrance to slide up out of it. The
 * pre-entrance state is the stylesheet's, so the server's markup never
 * flashes; whatever owns the entrance animates the line.
 *
 * Server component: markup and data- hooks only.
 */
export default function RevealLine({ children }: { children: ReactNode }) {
  return (
    <span data-reveal-mask>
      <span data-reveal-line>{children}</span>
    </span>
  );
}
