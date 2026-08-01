import type { Metadata } from "next";
import { Check } from "lucide-react";
import { whatsappLink, BRAND_NAME } from "../lib/site-config";
import { TRIAL_LENGTH_DAYS } from "../lib/plans-data";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Start free",
  description: `Start a free trial of ${BRAND_NAME}.`,
};

const included = [
  "Full access to production tracking and accounts",
  "CRM + WhatsApp automation",
  `${TRIAL_LENGTH_DAYS} days, no card required`,
  "Personal setup help, not a self-serve maze",
];

export default function StartFreePage() {
  return (
    <div className="bg-slate-50 py-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Start free
            </span>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">
              Try {BRAND_NAME} for {TRIAL_LENGTH_DAYS} days, free
            </h1>
            <p className="mt-4 text-slate-600">
              {/*
                Honest framing: there's no self-serve signup wizard yet
                (Phase E of docs/Marketing_Site_Roadmap.md — needs the
                Tenant model + auth first). Trials are started manually via
                WhatsApp or this form until that exists. Don't change this
                copy to imply instant self-serve signup before Phase E ships.
              */}
              There&apos;s no instant self-serve signup yet — request a trial below or on WhatsApp
              and we&apos;ll set your account up personally, usually the same day.
            </p>
            <ul className="mt-8 space-y-3">
              {included.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-slate-700">
                  <Check size={18} className="mt-0.5 shrink-0 text-blue-700" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={whatsappLink(`Hi! I'd like to start the ${TRIAL_LENGTH_DAYS}-day free trial.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-block rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Or start it on WhatsApp instead
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Request your trial</h2>
            <p className="mt-1 text-sm text-slate-600">We&apos;ll follow up within one business day.</p>
            <div className="mt-6">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
