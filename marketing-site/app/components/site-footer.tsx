import Link from "next/link";
import { CONTACT_EMAIL } from "../lib/site-config";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} PrintERP. Built by RarePrint.</p>
        <div className="flex gap-6">
          <Link href="/features" className="hover:text-slate-700">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-slate-700">
            Pricing
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-slate-700">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
