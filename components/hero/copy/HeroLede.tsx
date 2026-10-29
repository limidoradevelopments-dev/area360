import RevealLine from "@/components/ui/RevealLine";

/**
 * ─── HeroLede ───
 *
 * The copy under the headline, on the axis: Newsreader, white at 80%, a
 * line to a mask, broken where the frame breaks it.
 *
 * Server component: markup and data- hooks only.
 */
export default function HeroLede({ lines }: { lines: readonly string[] }) {
  return (
    <p data-hero-lede>
      {lines.map((line, k) => (
        <RevealLine key={line}>
          {line}
          {k < lines.length - 1 ? " " : null}
        </RevealLine>
      ))}
    </p>
  );
}
