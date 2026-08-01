import type { Metadata } from "next";
import Link from "next/link";
import { faqs } from "../lib/faq-data";
import { whatsappLink, BRAND_NAME } from "../lib/site-config";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Frequently asked questions about ${BRAND_NAME}.`,
};

export default function FaqPage() {
  return (
    <div className="bg-slate-50 py-20">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            FAQ
          </span>
          <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">
            Frequently asked questions
          </h1>
          <p className="mt-4 text-slate-600">
            Everything you need to know about {BRAND_NAME} — printing billing, production
            tracking, and cloud ERP for print businesses.
          </p>
        </div>

        <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-900">
                {faq.question}
                <span className="ml-4 shrink-0 text-lg text-slate-400 transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Still have questions?</h2>
          <p className="mt-2 text-sm text-slate-600">We respond directly — no ticket queue.</p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={whatsappLink(`Hi! I have a question about ${BRAND_NAME}.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Ask on WhatsApp
            </a>
            <Link
              href="/about"
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
