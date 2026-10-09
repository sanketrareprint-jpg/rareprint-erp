import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "./register-service-worker";
import { DialerSetupCheck } from "@/components/dialer-setup-check";
import { WhatsAppFailureAlerts } from "@/components/whatsapp-failure-alerts";
import "./globals.css";

export const metadata: Metadata = {
  title: "RarePrint ERP",
  description: "Printing company operations — RarePrint ERP",
  applicationName: "RarePrint ERP",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RarePrint ERP",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/rareprint-app-icon.png",
    apple: "/rareprint-app-icon.png",
  },
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
