import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SiteNav } from "./components/site-nav";
import { SiteFooter } from "./components/site-footer";
import { BRAND_NAME } from "./lib/site-config";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

// TODO: swap in the real production domain once decided (see "Open
// questions" in docs/Marketing_Site_Roadmap.md — new domain vs. subdomain).
// Using a reserved documentation domain (rfc2606) as a placeholder —
// NOT printerp.in, which is a real competitor's live domain.
const SITE_URL = "https://rareprint-suite.example";

const TITLE = `${BRAND_NAME} — ERP built for printing businesses`;
const DESCRIPTION =
  "Production tracking, accounts, CRM, WhatsApp automation and dispatch — one ERP built specifically for printing businesses.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s — ${BRAND_NAME}`,
  },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: BRAND_NAME,
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${jakarta.variable}`}>
      <body className="min-h-full flex flex-col bg-white text-slate-900 font-sans">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
