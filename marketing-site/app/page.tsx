import Link from "next/link";
import { Factory, Ban, CheckCircle2 } from "lucide-react";
import { leadFeatures } from "./lib/features-data";
import { faqs } from "./lib/faq-data";
import { whatsappLink, BRAND_NAME } from "./lib/site-config";
import { DashboardMockup } from "./components/dashboard-mockup";
import { FadeIn } from "./components/fade-in";

// NOTE on what's deliberately NOT here: no "120+ businesses / 10K+ users"
// style stat bar. Real competitors in this space (e.g. printerp.in) show
// numbers like that; we don't have paying customers yet, so making some up
// would be fabricated social proof. The "proof strip" below only states
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
    detail: "Production, accounts, CRM, WhatsApp automation, and dispatch — no separate tools.",
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
    detail: "Most business software starts with invoices. This starts with the job — production tracking is the core, not an afterthought.",
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
    detail: "Tell us a bit about your shop — flex, digital, offset, or a mix.",
  },
  {
    n: "02",
    title: "We set it up with your real jobs",
    detail: "No blank-slate onboarding. We load your actual products and workflow, not a demo dataset.",
  },
  {
    n: "03",
    title: "Run production day to day",
    detail: "Jobs, accounts, CRM, and dispatch — replacing the spreadsheets and WhatsApp chats.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-20 pb-20 lg:grid-cols-2">
          <FadeIn>
            <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Printing business management, simplified
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              The ERP built for printing businesses, not adapted for one.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-600">
              Production tracking, accounts, CRM, WhatsApp automation and dispatch —
              all in one place, built around how a print shop actually runs.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/start-free"
                className="rounded-full bg-blue-700 px-7 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-700/20 transition-transform hover:-translate-y-0.5 hover:bg-blue-800"
              >
                Start free trial
              </Link>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-slate-300 px-7 py-3.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400"
              >
                Book a demo
              </a>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <DashboardMockup />
          </FadeIn>
        </div>
      </section>

      <FadeIn>
        <section className="border-y border-slate-200 bg-slate-900 py-14 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 sm:grid-cols-3">
            {proofPoints.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.label} className="text-center">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/10 text-blue-300">
                    <Icon size={20} />
                  </span>
                  <p className="mt-4 text-4xl font-bold">{point.stat}</p>
                  <p className="mt-1 text-sm font-semibold text-blue-300">{point.label}</p>
                  <p className="mt-2 text-sm text-slate-400">{point.detail}</p>
                </div>
              );
            })}
          </div>
        </section>
      </FadeIn>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Core features
              </span>
              <h2 className="mt-4 text-3xl font-bold text-slate-900">
                Everything a print shop juggles across five different tools, in one.
              </h2>
            </div>
          </FadeIn>
          <div className="mt-14 grid gap-8 sm:grid-cols-2">
            {leadFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <FadeIn key={feature.slug} delay={i * 80}>
                  <div className="group rounded-xl border border-slate-200 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition-colors duration-300 group-hover:bg-blue-700 group-hover:text-white">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.title}</h3>
                    <p className="mt-1 text-sm font-medium text-blue-700">{feature.blurb}</p>
                    <p className="mt-3 text-sm text-slate-600">{feature.detail}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <Link href="/features" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
              See the full feature list &rarr;
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2">
          <FadeIn>
            <DashboardMockup />
          </FadeIn>
          <FadeIn delay={120}>
            <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Why {BRAND_NAME}
            </span>
            <h2 className="mt-4 text-3xl font-bold text-slate-900">
              Built specifically for printing businesses
            </h2>
            <div className="mt-8 space-y-6">
              {whyUs.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-blue-700" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                How it works
              </span>
              <h2 className="mt-4 text-3xl font-bold text-slate-900">
                From spreadsheets to a running system, in three steps
              </h2>
            </div>
          </FadeIn>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <FadeIn key={step.n} delay={i * 100}>
                <div className="relative rounded-xl border border-slate-200 bg-white p-7">
                  <span className="text-3xl font-extrabold text-blue-100">{step.n}</span>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{step.detail}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <FadeIn>
            {/*
              Draft founder note — a paraphrase of the real "built for
              RarePrint, opening it up to other printers" story, written for
              Sanket to personalize into his own words before this goes
              live. Not presented as a verbatim quote anywhere else on the
              site; flagged here so it doesn't get published unedited.
            */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-8 text-center sm:p-10">
              <p className="text-lg font-medium text-slate-800">
                &ldquo;I built this to run my own print shop — not as a side project, as the system we
                actually use every day. Opening it up because every printer I&apos;ve talked to is
                stuck in the same spreadsheets-and-WhatsApp mess I was.&rdquo;
              </p>
              <p className="mt-4 text-sm font-semibold text-slate-500">
                — Sanket, Founder, RarePrint (draft quote — edit to your own words before publishing)
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <FadeIn>
            <div className="text-center">
              <span className="inline-block rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                FAQ
              </span>
              <h2 className="mt-4 text-3xl font-bold text-slate-900">Frequently asked questions</h2>
            </div>
          </FadeIn>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {faqTeaser.map((faq, i) => (
              <FadeIn key={faq.question} delay={i * 60}>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-slate-900">{faq.question}</h3>
                  <p className="mt-2 text-sm text-slate-600">{faq.answer}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/faq" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
              See all FAQs &rarr;
            </Link>
          </div>
        </div>
      </section>

      <FadeIn>
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex flex-col items-center gap-6 rounded-2xl bg-slate-900 px-8 py-14 text-center text-white sm:px-16">
              <h2 className="text-2xl font-bold sm:text-3xl">
                Start growing your printing business with {BRAND_NAME}
              </h2>
              <p className="max-w-xl text-slate-300">
                We&apos;ll walk through a live demo using workflows that look like yours — production,
                accounts, and dispatch — not a generic sales script.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/start-free"
                  className="rounded-full bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-blue-500"
                >
                  Start free trial
                </Link>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-slate-600 px-7 py-3.5 text-sm font-semibold text-white hover:border-slate-400"
                >
                  Book a demo on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>
    </>
  );
}
