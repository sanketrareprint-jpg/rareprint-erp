"use client";

import { useState } from "react";
import type { Plan } from "../lib/plans-data";
import { annualPriceInr } from "../lib/plans-data";
import { whatsappLink } from "../lib/site-config";

export function PricingToggle({ plans }: { plans: Plan[] }) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  return (
    <div>
      <div className="mt-8 flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${cycle === "monthly" ? "text-slate-900" : "text-slate-400"}`}>
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cycle === "annual"}
          onClick={() => setCycle(cycle === "monthly" ? "annual" : "monthly")}
          className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors data-[on=true]:bg-blue-700"
          data-on={cycle === "annual"}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              cycle === "annual" ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${cycle === "annual" ? "text-slate-900" : "text-slate-400"}`}>
          Annual <span className="text-emerald-600">(2 months free)</span>
        </span>
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        {plans.map((plan) => {
          const price =
            plan.priceMonthlyInr === null
              ? null
              : cycle === "monthly"
                ? plan.priceMonthlyInr
                : Math.round(annualPriceInr(plan.priceMonthlyInr) / 12);

          return (
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
                {price !== null ? (
                  <>
                    &#8377;{price.toLocaleString("en-IN")}
                    <span className="text-base font-medium text-slate-500">/mo</span>
                  </>
                ) : (
                  <span className="text-2xl">Contact us</span>
                )}
              </p>
              {price !== null && cycle === "annual" && (
                <p className="mt-1 text-xs text-slate-500">
                  Billed &#8377;{(price * 12).toLocaleString("en-IN")}/year
                </p>
              )}
              <ul className="mt-6 space-y-2 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-blue-700">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={whatsappLink(`Hi! I'm interested in the ${plan.name} plan.`)}
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
          );
        })}
      </div>
    </div>
  );
}
