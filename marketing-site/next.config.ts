import type { NextConfig } from "next";

// Public marketing site — deliberately minimal config. No auth, no API
// proxying to the ERP backend beyond the small public endpoints described
// in docs/Marketing_Site_Roadmap.md (Phase C: GET /public/plans, Phase D:
// lead-capture endpoint). Keep this app static/lightweight; it should never
// need the ERP's Prisma client, auth stack, or Capacitor/Android tooling.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
