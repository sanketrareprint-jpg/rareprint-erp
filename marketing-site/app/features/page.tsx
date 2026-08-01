import type { Metadata } from "next";
import { leadFeatures, moreFeatures } from "../lib/features-data";
import { BRAND_NAME } from "../lib/site-config";

export const metadata: Metadata = {
  title: "Features",
  description: `Everything included in ${BRAND_NAME}, from production tracking to virtual-CEO insights.`,
};

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">Everything included</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        {BRAND_NAME} covers the full run of a printing business — the core workflows most shops feel
        the pain of daily, plus the operational depth that shows up once you&apos;re scaling.
      </p>

      <h2 className="mt-14 text-xl font-semibold text-slate-900">Core</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {leadFeatures.map((feature) => (
          <div key={feature.slug} className="rounded-lg border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-1 text-sm font-medium text-blue-700">{feature.blurb}</p>
            <p className="mt-3 text-sm text-slate-600">{feature.detail}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-14 text-xl font-semibold text-slate-900">Also included</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {moreFeatures.map((feature) => (
          <div key={feature.slug} className="rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{feature.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
