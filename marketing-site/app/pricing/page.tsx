import type { Metadata } from "next";
import { getPlans, TRIAL_LENGTH_DAYS } from "../lib/plans-data";
import { whatsappLink } from "../lib/site-config";
import { PricingToggle } from "./pricing-toggle";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing.",
};

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <div className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Pricing
          </span>
          <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">Choose your plan</h1>
          <p className="mt-3 text-slate-600">Placeholder pricing — final numbers not locked yet.</p>
          <a
            href={whatsappLink(`Hi! I'd like to start the ${TRIAL_LENGTH_DAYS}-day free trial.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700"
          >
            Start with a {TRIAL_LENGTH_DAYS}-day free trial — no card required
          </a>
        </div>

        <PricingToggle plans={plans} />

        <p className="mt-12 text-center text-xs text-slate-400">
          Prices shown are placeholders pending a final pricing decision — see open question #3 in
          docs/Marketing_Site_Roadmap.md.
        </p>
      </div>
    </div>
  );
}
