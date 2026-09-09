import Link from "next/link";
import { Factory, Ban, CheckCircle2, ArrowRight } from "lucide-react";
import { leadFeatures } from "./lib/features-data";
import { faqs } from "./lib/faq-data";
import { whatsappLink, BRAND_NAME } from "./lib/site-config";
import { HeroPhoto } from "./components/hero-photo";
import { FadeIn } from "./components/fade-in";

// NOTE on what's deliberately NOT here: no "120+ businesses / 10K+ users"
// style stat bar. Real competitors in this space (e.g. printerp.in) show
// numbers like that; we don't have paying customers yet, so making some up
// would be fabricated social proof. The proof strip below only states
// things that are actually true right now.
const proofPoints = [
  {
    stat: "1",
    icon: Factory,
    label: "Real printing business run on it daily",
    detail: "Built inside RarePrint's own operations, not designed in the abstract.",
  },
  {
    stat: "5+",
    icon: CheckCircle2,
    label: "Core workflows in one place",
    detail: "Production, accounts, CRM, WhatsApp automation, and dispatch, no separate tools.",
  },
  {
    stat: "0",
    icon: Ban,
    label: "Spreadsheets required",
    detail: "Everything that used to live in Excel or a notebook lives in one system instead.",
  },
];

const whyUs = [
  {
    title: "Built for printing, not adapted for it",
    detail: "Every workflow was shaped by running an actual print shop, not a generic ERP template with printing labels stuck on.",
  },
  {
    title: "Production-first, not billing-first",
    detail: "Most business software starts with invoices. This starts with the job: production tracking is the core, not an afterthought.",
  },
  {
    title: "WhatsApp-native follow-ups",
    detail: "Reminders and updates go where your customers actually are, instead of an email they won't open.",
  },
  {
    title: "One system, not five logins",
    detail: "Production, accounts, CRM, dispatch, and rewards in one place instead of stitching together separate tools.",
  },
];

// Homepage shows a short teaser of the FAQ (first 4); the full list lives
// on its own /faq page.
const faqTeaser = faqs.slice(0, 4);

const steps = [
  {
    n: "01",
    title: "Book a demo or request a trial",
    detail: "Tell us a bit about your shop: flex, digital, offset, or a mix.",
  },
  {
    n: "02",
    title: "We set it up with your real jobs",
    detail: "No blank-slate onboarding. We load your actual products and workflow, not a demo dataset.",
  },
  {
    n: "03",
    title: "Run production day to day",
    detail: "Jobs, accounts, CRM, and dispatch, replacing the spreadsheets and WhatsApp chats.",
  },
];

export default function HomePage() {
  const [featured, ...restFeatures] = leadFeatures;
  const FeaturedIcon = featured.icon;

  return (
    <>
      {/* Hero — asymmetric split, no eyebrow (the headline carries the page) */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-20">
          <FadeIn>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">
              The ERP built for printing businesses,{" "}
              <span className="text-brand-700">not adapted for one.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600">
              Production tracking, accounts, CRM, WhatsApp automation and dispatch, all in one
              place, built around how a print shop actually runs.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/suite/start-free"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-700 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-700/20 transition-transform hover:-translate-y-0.5 hover:bg-brand-800"
              >
                Start free trial
                <ArrowRight size={16} />
              </Link>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-7 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400"
              >
                Book a demo
              </a>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <HeroPhoto variant="press" caption="A print shop running on RarePrint, not a demo dataset." />
          </FadeIn>
        </div>
      </section>

      {/* Proof strip — asymmetric row with dividers, not three equal boxed cards */}
      <FadeIn>
        <section className="border-y border-slate-800 bg-slate-950 py-12 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-8 sm:grid-cols-[1.3fr_1fr_1fr] sm:divide-x sm:divide-slate-800">
              {proofPoints.map((point, i) => {
                const Icon = point.icon;
                return (
                  <div key={point.label} className={i > 0 ? "sm:pl-8" : ""}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-500/10 text-brand-300">
                      <Icon size={18} />
                    </span>
                    <p className={`mt-4 font-bold ${i === 0 ? "text-5xl" : "text-3xl"}`}>
                      {point.stat}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-100">{point.label}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{point.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </FadeIn>

      {/* Core features — asymmetric bento: one featured tile + three supporting tiles */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="max-w-2xl">
              <span className="inline-block text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Core features
              </span>
              <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
                Everything a print shop juggles across five tools, in one.
              </h2>
            </div>
          </FadeIn>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <FadeIn className="lg:col-span-3">
              <div className="group grid gap-6 rounded-2xl border border-brand-100 bg-brand-50/50 p-8 sm:grid-cols-[auto_1fr] sm:items-center lg:p-10">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-700 text-white">
                  <FeaturedIcon size={26} />
                </span>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">{featured.title}</h3>
                  <p className="mt-1 text-sm font-medium text-brand-700">{featured.blurb}</p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    {featured.detail}
                  </p>
                </div>
              </div>
            </FadeIn>
            {restFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <FadeIn key={feature.slug} delay={i * 80}>
                  <div className="group h-full rounded-2xl border border-slate-200 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors duration-300 group-hover:bg-brand-700 group-hover:text-white">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.title}</h3>
                    <p className="mt-1 text-sm font-medium text-brand-700">{feature.blurb}</p>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{feature.detail}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
          <div className="mt-10">
            <Link
              href="/suite/features"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              See the full feature list
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Why us — image + text split */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
          <FadeIn>
            <HeroPhoto variant="team" caption="Built by running a real shop, not designed in the abstract." />
          </FadeIn>
          <FadeIn delay={120}>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Built specifically for printing businesses
            </h2>
            <div className="mt-8 space-y-6">
              {whyUs.map((item) => (
                <div key={item.title} className="flex gap-3.5">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand-700" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* How it works — oversized ghost numerals instead of small centered circles */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <h2 className="max-w-xl text-3xl font-bold text-slate-900 sm:text-4xl">
              From spreadsheets to a running system, in three steps
            </h2>
          </FadeIn>
          <div className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
            {steps.map((step, i) => (
              <FadeIn key={step.n} delay={i * 100}>
                <div className="border-t-2 border-slate-900 pt-5">
                  <span className="text-sm font-bold tabular-nums text-brand-700">{step.n}</span>
                  <h3 className="mt-3 text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.detail}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Founder note */}
      <FadeIn>
        <section className="py-24">
          <div className="mx-auto max-w-3xl px-6">
            {/*
              Draft founder note: a paraphrase of the real "built for
              RarePrint, opening it up to other printers" story, written for
              Sanket to personalize into his own words before this goes
              live. Not presented as a verbatim quote anywhere else on the
              site. This code comment is the only place the "draft, edit
              before publishing" flag should live, not the rendered page
              copy itself.
            */}
            <div className="rounded-2xl border-l-4 border-brand-700 bg-slate-50 p-8 sm:p-10">
              <p className="text-lg font-medium leading-relaxed text-slate-800">
                &ldquo;I built this to run my own print shop, not as a side project. Opening it up
                because every printer I&apos;ve talked to is stuck in the same spreadsheets-and-WhatsApp
                mess I was.&rdquo;
              </p>
              <p className="mt-4 text-sm font-semibold text-slate-500">Sanket, Founder, RarePrint</p>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* FAQ teaser */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Questions printers usually ask first
            </h2>
          </FadeIn>
          <div className="mt-10 divide-y divide-slate-200 border-t border-slate-200">
            {faqTeaser.map((faq, i) => (
              <FadeIn key={faq.question} delay={i * 60}>
                <div className="grid gap-2 py-6 sm:grid-cols-[1fr_1.4fr] sm:gap-8">
                  <h3 className="text-sm font-semibold text-slate-900">{faq.question}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{faq.answer}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/suite/faq"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              See all FAQs
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <FadeIn>
        <section className="py-24">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex flex-col items-start gap-6 rounded-2xl bg-slate-950 px-8 py-14 sm:px-14">
              <h2 className="max-w-xl text-2xl font-bold text-white sm:text-3xl">
                Start growing your printing business with {BRAND_NAME}
              </h2>
              <p className="max-w-xl text-slate-400">
                We&apos;ll walk through a live demo using workflows that look like yours: production,
                accounts, and dispatch, not a generic sales script.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/suite/start-free"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-brand-500"
                >
                  Start free trial
                  <ArrowRight size={16} />
                </Link>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 px-7 py-3.5 text-sm font-semibold text-white hover:border-slate-500"
                >
                  Book a demo
                </a>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>
    </>
  );
}
