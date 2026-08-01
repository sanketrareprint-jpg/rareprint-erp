import Link from "next/link";
import { whatsappLink } from "../lib/site-config";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export function SiteNav() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          Print<span className="text-blue-700">ERP</span>
        </Link>
        <nav className="hidden gap-8 text-sm font-medium text-slate-600 sm:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
        <a
          href={whatsappLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Book a demo
        </a>
      </div>
    </header>
  );
}
