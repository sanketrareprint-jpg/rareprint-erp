// PLACEHOLDER pricing (Phase B). Shaped to match what the future
// `GET /public/plans` endpoint (Phase C, depends on the `Plan` model
// existing — see docs/Marketing_Site_Roadmap.md) is expected to return, so
// swapping the data source later is a one-function change in
// getPlans() below, not a page rewrite.
//
// Numbers, names, and limits below are NOT final — placeholders only,
// flagged in open question #3 of the roadmap doc. Annual price is set to
// 10x the monthly price ("pay for 10 months, get 12") as a common,
// reasonable-default SaaS discount pattern — not a locked business decision.

export type Plan = {
  id: string;
  name: string;
  priceMonthlyInr: number | null; // null = "Contact us"
  tagline: string;
  features: string[];
  highlight?: boolean;
};

const PLACEHOLDER_PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthlyInr: 1999,
    tagline: "For a single shop getting off spreadsheets and WhatsApp.",
    features: [
      "Production tracking",
      "Accounts & invoicing",
      "Up to 3 team seats",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthlyInr: 4999,
    tagline: "For a shop actively growing sales and repeat business.",
    features: [
      "Everything in Starter",
      "CRM + WhatsApp automation",
      "Dispatch & courier integration",
      "Loyalty & rewards",
      "Up to 10 team seats",
      "Priority support",
    ],
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    priceMonthlyInr: null,
    tagline: "For multi-location or high-volume operations.",
    features: [
      "Everything in Growth",
      "Sales team learning + virtual-CEO insights",
      "Call compliance",
      "Unlimited seats",
      "Dedicated onboarding",
    ],
  },
];

export function annualPriceInr(monthly: number): number {
  return monthly * 10;
}

// TODO (Phase C): once the `Plan` model + `GET /public/plans` endpoint
// exist, replace this with a fetch() call. Keep the return shape stable so
// the pricing page doesn't need to change.
export async function getPlans(): Promise<Plan[]> {
  return PLACEHOLDER_PLANS;
}

export const TRIAL_LENGTH_DAYS = 14;
