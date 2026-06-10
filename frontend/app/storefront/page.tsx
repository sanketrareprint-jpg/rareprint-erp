"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import Link from "next/link";
import { ExternalLink, Globe2, MonitorSmartphone, Store } from "lucide-react";

export default function StorefrontModulePage() {
  return (
    <DashboardShell>
      <div className="h-full bg-slate-100">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-red-600 text-white">
              <Store size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black text-slate-900">RarePrint Storefront</h1>
              <p className="text-sm font-semibold text-slate-500">Customer web-to-print website launcher</p>
            </div>
          </div>
          <Link
            href="/web-to-print"
            target="_blank"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700"
          >
            Open Full Site
            <ExternalLink size={16} />
          </Link>
        </div>

        <div className="mx-auto grid max-w-5xl gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-600 text-white">
              <Globe2 size={28} />
            </div>
            <h2 className="mt-5 text-2xl font-black text-slate-950">Launch Storefront Separately</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              For best speed, open the customer storefront as a separate website instead of loading it inside the ERP.
              This keeps the ERP fast and gives customers a full-screen shopping experience.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/web-to-print"
                target="_blank"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700"
              >
                Open Storefront Website
                <ExternalLink size={16} />
              </Link>
              <Link
                href="/web-to-print/categories"
                target="_blank"
                className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:border-slate-500"
              >
                Open Product Categories
              </Link>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <MonitorSmartphone size={24} />
            </div>
            <h3 className="mt-4 text-lg font-black text-slate-950">Recommended Hosting</h3>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <p className="font-black text-slate-900">Frontend website</p>
                <p className="mt-1 font-semibold">Deploy on Vercel for fastest customer pages.</p>
              </div>
              <div>
                <p className="font-black text-slate-900">ERP and backend</p>
                <p className="mt-1 font-semibold">Keep on Railway with database, orders, payments, and APIs.</p>
              </div>
              <div>
                <p className="font-black text-slate-900">Domain setup</p>
                <p className="mt-1 font-semibold">Use a separate domain like store.rareprint.in or rareprint.in.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
