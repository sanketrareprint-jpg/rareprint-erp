import Link from "next/link";
import { Printer } from "lucide-react";
import { BRAND_NAME } from "../lib/site-config";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white">
            <Printer size={18} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">{BRAND_NAME}</span>
        </Link>
        <nav className="hidden gap-8 text-sm font-medium text-slate-600 sm:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/start-free"
          className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}
