
import type { NextConfig } from "next";

/**
 * Add `images.remotePatterns` alongside the first next/image that loads a
 * remote URL, not before.
 */
const nextConfig: NextConfig = {
  // Generate static HTML and assets in the `out` directory.
  output: "export",

  /**
   * THE SHADERS SHIPPED WITHOUT THEIR COMMENTS (scripts/glsl-loader.cjs):
   * about a fifth of the hero engine's script. Production builds only —
   * in development a shader's compile log should point at the source as
   * written.
   */
  turbopack:
    process.env.NODE_ENV === "production"
      ? {
          rules: {
            "*.ts": {
              condition: { path: /components\/hero\/.*shaders\// },
              loaders: ["./scripts/glsl-loader.cjs"],
              as: "*.ts",
            },
          },
        }
      : undefined,

  // Disable the Next.js image optimization server for static hosting.
  images: {
    unoptimized: true,
  },

  /**
   * NO `headers()` HERE. A static export is served by the host, not by
   * Next, so headers set here never reach a visitor (the build says so,
   * every time). The hero's images and Next's hashed files are cached for a
   * year by `public/_headers` (Netlify, Cloudflare Pages), copied into
   * `out/`; another host needs those rules in its own config.
   */
};

export default nextConfig;
