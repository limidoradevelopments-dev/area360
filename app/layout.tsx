import type { Metadata } from "next";
import localFont from "next/font/local";
import "lenis/dist/lenis.css";
import "./globals.css";
import SmoothScroll from "@/components/ui/SmoothScroll";

/**
 * The site's one face: Cormorant Garamond, in its semibold and semibold
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
    <html lang="en" className={cormorant.variable}>
      <body className="min-h-dvh flex flex-col antialiased bg-background text-foreground">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
