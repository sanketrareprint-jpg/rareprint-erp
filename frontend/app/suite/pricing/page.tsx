import type { Metadata } from "next";
import Link from "next/link";
import { getPlans, TRIAL_LENGTH_DAYS } from "../lib/plans-data";
import { PricingToggle } from "./pricing-toggle";
import { FadeIn } from "../components/fade-in";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing.",
};

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <div className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <div className="mx-auto max-w-xl text-center">
            <span className="inline-block rounded-full bg-brand-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
              Pricing
            </span>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">Choose your plan</h1>
            <p className="mt-3 text-slate-600">Simple, transparent pricing. Final numbers not locked yet.</p>
            <Link
              href="/suite/start-free"
              className="mt-6 inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700"
            >
              Start with a {TRIAL_LENGTH_DAYS}-day free trial, no card required
            </Link>
          </div>
        </FadeIn>

        <PricingToggle plans={plans} />

        <p className="mt-12 text-center text-xs text-slate-400">
          Prices shown above are indicative while we finalize plans. Talk to us on WhatsApp for
          current numbers for your shop.
        </p>
      </div>
    </div>
  );
}
