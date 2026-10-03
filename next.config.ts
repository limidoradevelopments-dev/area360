import type { NextConfig } from "next";

/**
 * Add `images.remotePatterns` alongside the first next/image that loads a
 * remote URL, not before.
 */
const nextConfig: NextConfig = {
  /**
   * THE HERO'S IMAGES, CACHED FOR A YEAR. Files in public/ are served with
   * `max-age=0` by default: every visit asks the server again before using
   * its copy. The hero's are addressed by their content (a version in the
   * URL, written by the scripts that make them), so a copy can never be
   * stale: a changed image is a new address.
   */
  async headers() {
    return [
      {
        source: "/hero/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
