import ResetPasswordClient from "./reset-password-client";

// Required for static export (Capacitor/Android build) — this page is fully
// client-rendered from the API at runtime, so there's no real token to know
// at build time. Next's static export requires at least one param set (an
// empty array triggers a misleading "missing generateStaticParams()" build
// error), so we pre-render one placeholder path. The real token is read from
// the URL client-side via useParams() at runtime, so this placeholder is
// never actually shown to a user.
// (Kept in this server-only file — Turbopack's static-export analyzer can't
// parse generateStaticParams when it lives in the same file as "use client".)
export async function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
