// Web-app manifest for a SaaS customer's deployment (app/layout.tsx points
// here only when NEXT_PUBLIC_BRAND_NAME is set). RarePrint's own deployment
// keeps using the static public/manifest.webmanifest. Built once at build
// time — force-static also keeps the Android static export working.
import { DEFAULT_BRAND_NAME } from "@/lib/brand-defaults";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: `${DEFAULT_BRAND_NAME} ERP`,
    short_name: DEFAULT_BRAND_NAME.slice(0, 12),
    description: `${DEFAULT_BRAND_NAME} ERP for orders, production, dispatch and accounts.`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#ffffff",
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
