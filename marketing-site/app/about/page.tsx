import type { Metadata } from "next";
import { MessageCircle, Mail } from "lucide-react";
import { whatsappLink, CONTACT_EMAIL, BRAND_NAME } from "../lib/site-config";
import { ContactForm } from "./contact-form";
import { FadeIn } from "../components/fade-in";

export const metadata: Metadata = {
  title: "About & contact",
  description: `Why ${BRAND_NAME} exists, and how to get in touch.`,
};

export default function AboutPage() {
  return (
    <div>
      <div className="bg-slate-50 py-20">
        <FadeIn>
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              About
            </span>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">
              Built by a printing business, for printing businesses
            </h1>
            <p className="mt-6 text-slate-600">
              {BRAND_NAME} grew out of RarePrint&apos;s own operations — production tracking, accounts,
              CRM and dispatch software we built to run our own print shop, because nothing
              off-the-shelf fit how printing businesses actually work. We&apos;re now opening it up to
              other printers.
            </p>
            <p className="mt-4 text-slate-600">
              That means everything in here has been used to run a real shop, not designed in the
              abstract — and it keeps improving as we use it ourselves.
            </p>
          </div>
        </FadeIn>
      </div>

      {/*
        No lead-capture backend yet (Phase D in docs/Marketing_Site_Roadmap.md
        is "not hard-blocked" but hasn't been built). The form on the right
        builds a real mailto: link client-side (see contact-form.tsx) instead
        of faking a submission.

        Deliberately NOT shown here: a business address, GSTIN, or legal
        entity name. Competitors in this space (e.g. printerp.in) publish
        those, but that's a real business decision (are sales made under
        the RarePrint entity or a new one? is a separate GSTIN needed?)
        that hasn't been made yet — better to leave it off than guess.
      */}
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Get in touch</h2>
            <p className="mt-3 text-sm text-slate-600">
              Fastest way to reach us is WhatsApp. Prefer email? That works too — either way we
              respond directly, no ticket queue.
            </p>
            <div className="mt-8 space-y-5">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <MessageCircle size={20} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">WhatsApp</p>
                  <a
                    href={whatsappLink(`Hi! I'd like to know more about ${BRAND_NAME}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-slate-900 hover:text-blue-700"
                  >
                    Message us directly
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Mail size={20} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <ContactForm />
          </div>
        </div>
        </FadeIn>
      </div>
    </div>
  );
}
