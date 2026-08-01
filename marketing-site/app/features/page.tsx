import type { Metadata } from "next";
import { leadFeatures, moreFeatures } from "../lib/features-data";
import { BRAND_NAME } from "../lib/site-config";

export const metadata: Metadata = {
  title: "Features",
  description: `Everything included in ${BRAND_NAME}, from production tracking to virtual-CEO insights.`,
};

export default function FeaturesPage() {
  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Everything included
          </span>
          <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">
            Built for the full run of a printing business
          </h1>
          <p className="mt-4 text-slate-600">
            {BRAND_NAME} covers the core workflows most shops feel the pain of daily, plus the
            operational depth that shows up once you&apos;re scaling.
          </p>
        </div>

        <h2 className="mt-16 text-xl font-semibold text-slate-900">Core</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {leadFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.slug} className="rounded-xl border border-slate-200 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-1 text-sm font-medium text-blue-700">{feature.blurb}</p>
                <p className="mt-3 text-sm text-slate-600">{feature.detail}</p>
              </div>
            );
          })}
        </div>

        <h2 className="mt-16 text-xl font-semibold text-slate-900">Also included</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {moreFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.slug} className="rounded-xl border border-slate-200 bg-white p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon size={16} />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{feature.blurb}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
