import type { Metadata } from "next";
import localFont from "next/font/local";
import "lenis/dist/lenis.css";
import "./globals.css";
import SmoothScroll from "@/components/ui/SmoothScroll";

/**
 * The display voice. Headlines and big numbers — nothing else.
 *
 * THE WEIGHT RANGE IS NOT OPTIONAL. Cabinet Grotesk's variable file defaults
 * to its 900 (Black) instance. Loaded without a range it is treated as a
 * single face at that default, so every headline would set in Black and look
 * deliberate while doing it. `100 900` is what lets CSS font-weight reach the
 * axis at all.
 *
 * No italic cut exists. Do not italicise display type; the browser would
 * synthesise an oblique.
 */
const cabinetGrotesk = localFont({
  src: [
    {
      path: "../public/fonts/cabinetGrotesk/CabinetGrotesk-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-cabinet-grotesk",
});

/**
 * The interface voice: UI, body, technical data.
 *
 * Both cuts are the VARIABLE file and the range is declared, because the
 * design asks for in-between weights (450, 550). Without the range Safari
 * and Firefox clamp to a single 400 face and synthesise bold above ~600.
 */
const switzer = localFont({
  src: [
    {
      path: "../public/fonts/switzer/Switzer-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../public/fonts/switzer/Switzer-VariableItalic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-switzer-variable",
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
    <html lang="en" className={`${cabinetGrotesk.variable} ${switzer.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased bg-background text-foreground">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
