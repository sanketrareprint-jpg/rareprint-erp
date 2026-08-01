import type { Metadata } from "next";
import { getPlans } from "../lib/plans-data";
import { whatsappLink } from "../lib/site-config";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing for PrintERP.",
};

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Pricing</h1>
        <p className="mt-3 text-slate-600">
          Placeholder pricing — final numbers not locked yet.
        </p>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-lg border p-6 ${
              plan.highlight ? "border-blue-700 shadow-md" : "border-slate-200"
            }`}
          >
            {plan.highlight && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Most popular
              </p>
            )}
            <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{plan.tagline}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">
              {plan.priceMonthlyInr !== null ? (
                <>
                  &#8377;{plan.priceMonthlyInr.toLocaleString("en-IN")}
                  <span className="text-base font-medium text-slate-500">/mo</span>
                </>
              ) : (
                <span className="text-2xl">Contact us</span>
              )}
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-600">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="text-blue-700">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              href={whatsappLink(`Hi! I'm interested in the ${plan.name} plan for PrintERP.`)}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-8 block rounded-md px-4 py-2 text-center text-sm font-semibold ${
                plan.highlight
                  ? "bg-blue-700 text-white hover:bg-blue-800"
                  : "border border-slate-300 text-slate-700 hover:border-slate-400"
              }`}
            >
              Talk to us
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
