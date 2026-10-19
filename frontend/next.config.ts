import type { NextConfig } from "next";
import path from "path";

// Detect Capacitor build: set CAPACITOR_BUILD=1 when running `npm run build:android`
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  // Always skip TS/ESLint errors during build — caught in dev/CI separately
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Static export required for Capacitor — the Android WebView loads files from disk
  ...(isCapacitorBuild && {
    output: "export",
  }),

  // Disable Next.js image optimisation in static export (no server to run it)
  images: {
    unoptimized: true,
  },

  turbopack: {
    root: path.resolve(__dirname),
  },

  // app.presserp.in is the PressERP product domain — its home page goes to
  // the ERP login, not RarePrint's storefront (app/page.tsx's default).
  // Every other host keeps the storefront redirect. Skipped in the static
  // Android export, which has no server to run redirects.
  ...(!isCapacitorBuild && {
    async redirects() {
      return [
        {
          source: "/",
          has: [{ type: "host" as const, value: "app.presserp.in" }],
          destination: "/login",
          permanent: false,
        },
      ];
    },
  }),

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
