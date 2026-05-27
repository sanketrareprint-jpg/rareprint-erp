import type { Metadata } from "next";
import { StorefrontClient } from "./storefront-client";

export const metadata: Metadata = {
  title: "RarePrint Online Printing | Web to Print Storefront",
  description:
    "Order custom printing online with live rates, design upload, AI-ready design studio, payments, shipping tracking, and ERP-connected production.",
  keywords: [
    "online printing India",
    "web to print",
    "medicine pouch printing",
    "custom stationery printing",
    "RarePrint",
    "business card printing",
    "sticker printing",
  ],
  alternates: { canonical: "/web-to-print" },
  openGraph: {
    title: "RarePrint Online Printing",
    description: "A fast, ERP-connected web-to-print storefront for custom print orders.",
    images: ["/web-to-print-hero.png"],
  },
};

export default function WebToPrintPage() {
  return <StorefrontClient />;
}
