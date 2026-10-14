import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "./register-service-worker";
import { DialerSetupCheck } from "@/components/dialer-setup-check";
import { WhatsAppFailureAlerts } from "@/components/whatsapp-failure-alerts";
import { DEFAULT_BRAND_NAME, IS_CUSTOM_BRAND } from "@/lib/brand-defaults";
import "./globals.css";

// Build-time brand (lib/brand-defaults.ts). RarePrint's own deployment gets
// exactly its original title, manifest and icons; a SaaS customer's gets its
// own name, its own manifest, and no RarePrint icon.
const APP_TITLE = `${DEFAULT_BRAND_NAME} ERP`;

export const metadata: Metadata = {
  title: APP_TITLE,
  description: `Printing company operations — ${APP_TITLE}`,
  applicationName: APP_TITLE,
  manifest: IS_CUSTOM_BRAND ? "/brand-manifest.webmanifest" : "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_TITLE,
    statusBarStyle: "default",
  },
  ...(IS_CUSTOM_BRAND
    ? {}
    : {
        icons: {
          icon: "/rareprint-app-icon.png",
          apple: "/rareprint-app-icon.png",
        },
      }),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        <DialerSetupCheck />
        <WhatsAppFailureAlerts />
        {children}
      </body>
    </html>
  );
}
