import ComplaintDetailClient from "./complaint-detail-client";

// Required for static export (Capacitor/Android build) — this page is fully
// client-rendered from the API at runtime, so there's no real ticket ID to
// know at build time. Next's static export requires at least one param set
// (an empty array triggers a misleading "missing generateStaticParams()"
// build error), so we pre-render one placeholder path. The real ID is read
// from the URL client-side via useParams() at runtime — navigation from the
// complaints list happens client-side, so this placeholder is never actually
// shown to a user.
// (Kept in this server-only file — Turbopack's static-export analyzer can't
// parse generateStaticParams when it lives in the same file as "use client".)
export async function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function ComplaintDetailPage() {
  return <ComplaintDetailClient />;
}
