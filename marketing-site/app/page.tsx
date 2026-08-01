import Link from "next/link";
import { leadFeatures } from "./lib/features-data";
import { whatsappLink } from "./lib/site-config";

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
