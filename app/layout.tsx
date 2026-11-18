import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "lenis/dist/lenis.css";
import "./globals.css";
import SmoothScroll from "@/components/ui/SmoothScroll";
import { cx } from "@/components/ui/cx";

/**
 * The curtain's face: Cormorant Garamond, in its semibold and semibold
 * italic (2026-10-23, the user: "use Cormorant Garamond semibold and
 * semibold italic … remove other unnecessary fonts"). Two static cuts of
 * the Latin set, ~23 KB each, from Google Fonts (SIL Open Font License).
 * PRELOADED: the preloader's words are the first thing drawn. Since
 * 2026-11-14 the titles are the medium italic (below).
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
 * The titles' face (2026-11-14, the user: the h1 and the h2 "font
 * medium", then the h2 "a bit more" lighter): Cormorant Garamond italic in
 * two static cuts of the Latin set, ~23 KB each, from Google Fonts (SIL
 * Open Font License; the same source as the semibold cuts, byte for
 * byte) — medium for the title (h1), regular for the section title (h2).
 * A FAMILY OF ITS OWN SO IT IS NOT PRELOADED (next/font preloads a family
 * whole): the hero's headline comes 1.2 s after the curtain lifts and the
 * works' title is a scroll away; asked for by them at the first layout,
 * the cuts are in long before, where a preload would race the hero's
 * shores for the first second, as Newsreader would (below). Read through
 * tokens.css --font-title and each voice's weight.
 */
const cormorantTitle = localFont({
  src: [
    {
      path: "../public/fonts/cormorant/CormorantGaramond-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/cormorant/CormorantGaramond-Italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  display: "swap",
  preload: false,
  variable: "--font-cormorant-title",
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

/**
 * THE PHONE'S OWN EDGES. `cover` lays the page under a notch and the home
 * indicator, so the scene runs to the glass and env(safe-area-inset-*) is
 * real: without it every one of those reads 0, and the margin (theme.css)
 * and the header, byline and dock that keep clear of them do nothing. The
 * browser's own bars take the page's black (tokens.css --color-night).
 */
export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cx(cormorant.variable, cormorantTitle.variable, newsreader.variable)}>
      <body className="min-h-dvh flex flex-col antialiased bg-night text-foreground">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
