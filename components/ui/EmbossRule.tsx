/**
 * ─── EmbossRule ───
 *
 * A row of embossed dots across its box (emboss.css: the user's dot,
 * tiled as one background — whole dots at any width, its first and last
 * on its edges). Ornament: hidden from a reader of the page.
 *
 * `reveal`: it waits undrawn (utilities.css data-reveal-wipe) for an
 * entrance to draw it in from its start (ui/wipeIn).
 *
 * Server component: markup only.
 */
export interface EmbossRuleProps {
  className?: string;
  reveal?: boolean;
}

export default function EmbossRule({ className, reveal = false }: EmbossRuleProps) {
  return <span aria-hidden="true" data-emboss-rule data-reveal-wipe={reveal ? "" : undefined} className={className} />;
}
