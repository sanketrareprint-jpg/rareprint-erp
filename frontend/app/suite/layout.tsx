import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SiteNav } from "./components/site-nav";
import { SiteFooter } from "./components/site-footer";
import { BRAND_NAME } from "./lib/site-config";

// This is a nested layout under frontend/app/suite/ — it does NOT render
// <html>/<body> (the ERP's root layout at frontend/app/layout.tsx already
// does that for the whole app). Scoping the Plus Jakarta Sans font to a
// wrapper div here, rather than editing the shared globals.css theme,
// means the rest of the ERP keeps its existing Arial/Helvetica font and
// RarePrint red brand palette untouched — only /suite/* pages pick up the
// different typography.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const TITLE = `${BRAND_NAME}: ERP built for printing businesses`;
const DESCRIPTION =
  "Production tracking, accounts, CRM, WhatsApp automation and dispatch, one ERP built specifically for printing businesses.";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function SuiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${jakarta.className} flex min-h-screen flex-col bg-white text-slate-900`}>
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
