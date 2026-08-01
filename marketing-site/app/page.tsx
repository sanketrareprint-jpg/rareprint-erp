import Link from "next/link";
import { leadFeatures } from "./lib/features-data";
import { faqs } from "./lib/faq-data";
import { whatsappLink, BRAND_NAME } from "./lib/site-config";

// NOTE on what's deliberately NOT here: no "120+ businesses / 10K+ users"
// style stat bar. Real competitors in this space (e.g. printerp.in) show
// numbers like that; we don't have paying customers yet, so making some up
// would be fabricated social proof. The "proof strip" below only states
// things that are actually true right now.
const proofPoints = [
  {
    stat: "1",
    label: "Real printing business run on it daily",
    detail: "Built inside RarePrint's own operations, not designed in the abstract.",
  },
  {
    stat: "5+",
    label: "Core workflows in one place",
    detail: "Production, accounts, CRM, WhatsApp automation, and dispatch — no separate tools.",
  },
  {
    stat: "0",
    label: "Spreadsheets required",
    detail: "Everything that used to live in Excel or a notebook lives in one system instead.",
  },
];

const whyUs = [
  {
    title: "Built for printing, not adapted for it",
    detail: "Every workflow was shaped by running an actual print shop, not a generic ERP template with printing labels stuck on.",
  },
  {
    title: "Production-first, not billing-first",
    detail: "Most business software starts with invoices. This starts with the job — production tracking is the core, not an afterthought.",
  },
  {
    title: "WhatsApp-native follow-ups",
    detail: "Reminders and updates go where your customers actually are, instead of an email they won't open.",
  },
  {
    title: "One system, not five logins",
    detail: "Production, accounts, CRM, dispatch, and rewards in one place instead of stitching together separate tools.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          The ERP built for printing businesses, not adapted for one.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Production tracking, accounts, CRM, WhatsApp automation and dispatch —
          all in one place, built around how a print shop actually runs.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Book a demo
          </a>
          <Link
            href="/pricing"
            className="rounded-md border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            See pricing
          </Link>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-900 py-12 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 sm:grid-cols-3">
          {proofPoints.map((point) => (
            <div key={point.label} className="text-center">
              <p className="text-4xl font-bold">{point.stat}</p>
              <p className="mt-1 text-sm font-semibold text-blue-300">{point.label}</p>
              <p className="mt-2 text-sm text-slate-300">{point.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-semibold text-slate-900">
            Everything a print shop juggles across five different tools, in one.
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {leadFeatures.map((feature) => (
              <div
                key={feature.slug}
                className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-1 text-sm font-medium text-blue-700">{feature.blurb}</p>
                <p className="mt-3 text-sm text-slate-600">{feature.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/features" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
              See the full feature list &rarr;
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-semibold text-slate-900">
            Why {BRAND_NAME}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {whyUs.map((item) => (
              <div key={item.title}>
                <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-2xl font-semibold text-slate-900">
            Frequently asked questions
          </h2>
          <div className="mt-10 divide-y divide-slate-200">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-900">
                  {faq.question}
                  <span className="ml-4 text-slate-400 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-2 text-sm text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">Ready to see it on your own jobs?</h2>
          <p className="mt-3 text-slate-600">
            We&apos;ll walk through a live demo using workflows that look like yours — production, accounts,
            and dispatch — not a generic sales script.
          </p>
          <div className="mt-8">
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Book a demo on WhatsApp
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
