import type { NextConfig } from "next";
import path from "path";

// Detect Capacitor build: set CAPACITOR_BUILD=1 when running `npm run build:android`
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  // Static export required for Capacitor — the Android WebView loads files from disk
  ...(isCapacitorBuild && {
    output: "export",
    // Skip TS/ESLint errors during Android builds (they run fine in dev)
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
  }),

  // Disable Next.js image optimisation in static export (no server to run it)
  images: {
    unoptimized: true,
  },

  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|ico|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
