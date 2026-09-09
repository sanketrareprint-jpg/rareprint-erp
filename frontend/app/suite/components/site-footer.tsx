import Link from "next/link";
import { MessageCircle, Mail, Printer } from "lucide-react";
import { CONTACT_EMAIL, BRAND_NAME, whatsappLink } from "../lib/site-config";

// Structure (promo block + contact cards + bottom bar) is a common SaaS
// footer pattern, not copied verbatim from any one site. Deliberately
// missing vs. some competitor footers in this category: a legal-entity /
// GSTIN block and a bank of SEO landing-page links — see README.md for why.

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <div>
            <h2 className="max-w-md text-2xl font-bold leading-snug text-white">
              Complete billing and job management, built for printing businesses.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
              {BRAND_NAME} covers billing, production, CRM, inventory, WhatsApp automation and
              dispatch, one cloud ERP instead of five disconnected tools.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/suite/start-free"
                className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500"
              >
                Start free
              </Link>
              <Link
                href="/suite/pricing"
                className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500"
              >
                See pricing
              </Link>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            <h3 className="text-sm font-semibold text-white">Talk to us directly</h3>
            <p className="mt-1 text-xs text-slate-500">No ticket queue, no chatbot.</p>
            <div className="mt-5 space-y-4">
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 group"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                  <MessageCircle size={16} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">WhatsApp</p>
                  <span className="text-sm font-semibold text-white group-hover:text-brand-300">
                    Message us
                  </span>
                </div>
              </a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 group">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-400">
                  <Mail size={16} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <span className="text-sm font-semibold text-white group-hover:text-brand-300">
                    {CONTACT_EMAIL}
                  </span>
                </div>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-slate-800 pt-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Printer size={14} />
            <span>
              &copy; {new Date().getFullYear()} {BRAND_NAME}. Built by RarePrint.
            </span>
          </div>
          <div className="flex gap-6">
            <Link href="/suite/features" className="hover:text-slate-300">
              Features
            </Link>
            <Link href="/suite/pricing" className="hover:text-slate-300">
              Pricing
            </Link>
            <Link href="/suite/faq" className="hover:text-slate-300">
              FAQ
            </Link>
            <Link href="/suite/about" className="hover:text-slate-300">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
