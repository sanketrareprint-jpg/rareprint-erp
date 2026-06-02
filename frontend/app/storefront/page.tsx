"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import Link from "next/link";
import { ExternalLink, Store } from "lucide-react";

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
              <p className="text-sm font-semibold text-slate-500">Customer web-to-print website inside ERP</p>
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

        <div className="h-[calc(100vh-80px)] p-3">
          <iframe
            src="/web-to-print"
            title="RarePrint web-to-print storefront"
            className="h-full w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
          />
        </div>
      </div>
    </DashboardShell>
  );
}
