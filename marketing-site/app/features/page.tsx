import type { Metadata } from "next";
import { leadFeatures, moreFeatures } from "../lib/features-data";
import { BRAND_NAME } from "../lib/site-config";
import { FadeIn } from "../components/fade-in";

export const metadata: Metadata = {
  title: "Features",
  description: `Everything included in ${BRAND_NAME}, from production tracking to virtual-CEO insights.`,
};

export default function FeaturesPage() {
  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <FadeIn>
          <div className="max-w-xl">
            <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Built for the full run of a printing business
            </h1>
            <p className="mt-4 text-slate-600 leading-relaxed">
              {BRAND_NAME} covers the core workflows most shops feel the pain of daily, plus the
              operational depth that shows up once you&apos;re scaling.
            </p>
          </div>
        </FadeIn>

        <h2 className="mt-16 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Core
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {leadFeatures.map((feature, i) => {
            const Icon = feature.icon;
            const tinted = i % 3 === 0;
            return (
              <FadeIn key={feature.slug} delay={i * 70}>
                <div
                  className={`group h-full rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    tinted
                      ? "border-brand-100 bg-brand-50/50 hover:border-brand-200"
                      : "border-slate-200 bg-white hover:border-brand-200"
                  }`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-700 text-white transition-transform duration-300 group-hover:scale-105">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-1 text-sm font-medium text-brand-700">{feature.blurb}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{feature.detail}</p>
                </div>
              </FadeIn>
            );
          })}
        </div>

        <h2 className="mt-16 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Also included
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {moreFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <FadeIn key={feature.slug} delay={i * 60}>
                <div className="group h-full rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors duration-300 group-hover:bg-brand-700 group-hover:text-white">
                    <Icon size={16} />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{feature.blurb}</p>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </div>
  );
}
