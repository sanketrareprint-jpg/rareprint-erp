import Link from "next/link";
import { MessageCircle, Mail, Printer } from "lucide-react";
import { CONTACT_EMAIL, BRAND_NAME, whatsappLink } from "../lib/site-config";

// Structure (promo block + contact cards + bottom bar) is a common SaaS
// footer pattern, not copied verbatim from any one site. Deliberately
// missing vs. some competitor footers in this category: a legal-entity /
// GSTIN block and a bank of SEO landing-page links — see README.md for why.

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <span className="inline-block rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-400">
              Print business ERP
            </span>
            <h2 className="mt-4 text-2xl font-bold text-white">
              Complete printing billing &amp; job management software
            </h2>
            <p className="mt-3 max-w-md text-sm text-slate-400">
              {BRAND_NAME} covers billing, production, CRM, inventory, WhatsApp automation and
              dispatch for printing businesses — one cloud ERP instead of five disconnected tools.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/start-free"
                className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Start free
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500"
              >
                See pricing
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-white">Contact</h3>
            <p className="mt-1 text-xs text-slate-400">Talk to us directly, no ticket queue.</p>
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <MessageCircle size={16} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">WhatsApp</p>
                  <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white hover:text-blue-300">
                    Message us
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <Mail size={16} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm font-semibold text-white hover:text-blue-300">
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-slate-800 pt-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Printer size={14} />
            <span>&copy; {new Date().getFullYear()} {BRAND_NAME}. Built by RarePrint.</span>
          </div>
          <div className="flex gap-6">
            <Link href="/features" className="hover:text-slate-300">
              Features
            </Link>
            <Link href="/pricing" className="hover:text-slate-300">
              Pricing
            </Link>
            <Link href="/faq" className="hover:text-slate-300">
              FAQ
            </Link>
            <Link href="/about" className="hover:text-slate-300">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
