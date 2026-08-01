import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteNav } from "./components/site-nav";
import { SiteFooter } from "./components/site-footer";

// TODO: swap in the real production domain once decided (see "Open
// questions" in docs/Marketing_Site_Roadmap.md — new domain vs. subdomain).
const SITE_URL = "https://printerp.in";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PrintERP — ERP built for printing businesses",
    template: "%s — PrintERP",
  },
  description:
    "Production tracking, accounts, CRM, WhatsApp automation and dispatch — one ERP built specifically for printing businesses.",
  openGraph: {
    title: "PrintERP — ERP built for printing businesses",
    description:
      "Production tracking, accounts, CRM, WhatsApp automation and dispatch — one ERP built specifically for printing businesses.",
    url: SITE_URL,
    siteName: "PrintERP",
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
