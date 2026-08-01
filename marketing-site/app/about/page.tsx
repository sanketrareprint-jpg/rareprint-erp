import type { Metadata } from "next";
import { whatsappLink, waitlistMailtoLink } from "../lib/site-config";

export const metadata: Metadata = {
  title: "About & contact",
  description: "Why PrintERP exists, and how to get in touch.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">Built by a printing business, for printing businesses</h1>
      <p className="mt-6 text-slate-600">
        PrintERP grew out of RarePrint&apos;s own operations — production tracking, accounts, CRM
        and dispatch software we built to run our own print shop, because nothing off-the-shelf
        fit how printing businesses actually work. We&apos;re now opening it up to other printers.
      </p>
      <p className="mt-4 text-slate-600">
        That means everything in here has been used to run a real shop, not designed in the
        abstract — and it keeps improving as we use it ourselves.
      </p>

      <div className="mt-12 rounded-lg border border-slate-200 p-8">
        <h2 className="text-xl font-semibold text-slate-900">Get in touch</h2>
        <p className="mt-2 text-sm text-slate-600">
          Fastest way to reach us is WhatsApp. Prefer email? That works too — either way we
          respond directly, no ticket queue.
        </p>
        {/*
          No lead-capture backend yet (Phase D in docs/Marketing_Site_Roadmap.md
          is "not hard-blocked" but hasn't been built). These are direct
          WhatsApp/email links for now — swap for a form posting to a real
          endpoint once that lands.
        */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={whatsappLink("Hi! I'd like to know more about PrintERP.")}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-blue-700 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-800"
          >
            Message us on WhatsApp
          </a>
          <a
            href={waitlistMailtoLink()}
            className="rounded-md border border-slate-300 px-5 py-2.5 text-center text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            Email us
          </a>
        </div>
      </div>
    </div>
  );
}
