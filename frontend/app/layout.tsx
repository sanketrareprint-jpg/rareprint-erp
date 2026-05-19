import type { Metadata } from "next";
import { RegisterServiceWorker } from "./register-service-worker";
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
    icon: "/rareprint-app-icon.svg",
    apple: "/rareprint-app-icon.svg",
  },
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
        {children}
      </body>
    </html>
  );
}
