import Link from "next/link";
import { Printer } from "lucide-react";
import { BRAND_NAME } from "../lib/site-config";

const links = [
  { href: "/suite/features", label: "Features" },
  { href: "/suite/pricing", label: "Pricing" },
  { href: "/suite/faq", label: "FAQ" },
  { href: "/suite/about", label: "About" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/suite" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white">
            <Printer size={16} strokeWidth={2.5} />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">{BRAND_NAME}</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/suite/start-free"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}
