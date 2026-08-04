import type { Metadata } from "next";

// Page metadata lives here instead of in page.tsx because page.tsx had to
// become a client component ("use client") to read the "q" query string via
// useSearchParams() for static-export (Capacitor/Android) compatibility.
// Layouts can stay server components and export metadata regardless of
// whether the page itself is a client component, so this preserves the
// search page's <title>/description for the live website.
export const metadata: Metadata = {
  title: "Search Print Products | RarePrint",
  description: "Search RarePrint products, rates, categories, and web-to-print ordering options.",
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
