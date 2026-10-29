import type { Metadata } from "next";
import localFont from "next/font/local";
import "lenis/dist/lenis.css";
import "./globals.css";
import SmoothScroll from "@/components/ui/SmoothScroll";
import { cx } from "@/components/ui/cx";

/**
 * The titles' face: Cormorant Garamond, in its semibold and semibold
 * italic only (2026-10-23, the user: "use Cormorant Garamond semibold and
 * semibold italic … remove other unnecessary fonts"). Two static cuts of
 * the Latin set, ~23 KB each, from Google Fonts (SIL Open Font License);
 * nothing asks for another weight, so no variable file is carried.
 */
const cormorant = localFont({
  src: [
    {
      path: "../public/fonts/cormorant/CormorantGaramond-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/cormorant/CormorantGaramond-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-cormorant-garamond",
});

/**
 * The body's face (2026-10-29, the user: "newsreader for body text, keep
 * the existing one for titles"): Newsreader regular, the Latin set from
 * Google Fonts (SIL Open Font License), ~57 KB. ONE FILE WITH ITS OPTICAL
 * SIZE AXIS (6–72): the browser takes the cut drawn for the size it sets —
 * at the UI's 12 px a sturdier, more open letter than the text cut
 * shrunk. NOT PRELOADED: the first screen's words read it (the header, the
 * hero's copy), but under the curtain, which stands at least 3.2 s; asked
 * for by them at the first layout, it is in long before the curtain lifts,
 * where a preload would race the hero's shores for the first second.
 */
const newsreader = localFont({
  src: [
    {
      path: "../public/fonts/newsreader/Newsreader-Regular.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  display: "swap",
  preload: false,
  variable: "--font-newsreader-text",
});

export const metadata: Metadata = {
  title: "kavi",
  description: "Crafting emotions, not just designs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cx(cormorant.variable, newsreader.variable)}>
      <body className="min-h-dvh flex flex-col antialiased bg-background text-foreground">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
