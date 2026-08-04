"use client";

import { useState } from "react";
import { Check, Star } from "lucide-react";
import type { Plan } from "../lib/plans-data";
import { annualPriceInr } from "../lib/plans-data";
import { whatsappLink } from "../lib/site-config";

export function PricingToggle({ plans }: { plans: Plan[] }) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span
          className={`shrink-0 whitespace-nowrap text-sm font-medium ${
            cycle === "monthly" ? "text-slate-900" : "text-slate-400"
          }`}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cycle === "annual"}
          onClick={() => setCycle(cycle === "monthly" ? "annual" : "monthly")}
          className="shrink-0"
          style={{
            position: "relative",
            display: "block",
            width: "44px",
            height: "24px",
            minWidth: "44px",
            maxWidth: "44px",
            borderRadius: "9999px",
            backgroundColor: cycle === "annual" ? "#1d4ed8" : "#cbd5e1",
            border: "none",
            padding: 0,
            cursor: "pointer",
            transition: "background-color 0.2s ease",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "2px",
              left: cycle === "annual" ? "22px" : "2px",
              width: "20px",
              height: "20px",
              borderRadius: "9999px",
              backgroundColor: "#ffffff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
              transition: "left 0.2s ease",
            }}
          />
        </button>
        <span
          className={`shrink-0 whitespace-nowrap text-sm font-medium ${
            cycle === "annual" ? "text-slate-900" : "text-slate-400"
          }`}
        >
          Annual
        </span>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
          2 months free
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
              className={`relative rounded-2xl border bg-white p-7 ${
                plan.highlight ? "border-blue-700 shadow-xl" : "border-slate-200 shadow-sm"
              }`}
            >
              {plan.highlight && (
                <p className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-700 px-3 py-1 text-xs font-semibold text-white">
                  <Star size={12} className="fill-white" />
                  Most popular
                </p>
              )}
              <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{plan.tagline}</p>
              <p className="mt-5 text-4xl font-extrabold text-slate-900">
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
              <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-blue-700" />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={whatsappLink(`Hi! I'm interested in the ${plan.name} plan.`)}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-8 block rounded-full px-4 py-2.5 text-center text-sm font-semibold ${
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
