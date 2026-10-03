// SUPERSEDED 2026-09-07: this div-built fake product screenshot was
// replaced by real (placeholder) photography in ./hero-photo.tsx — a
// hand-rolled fake dashboard UI is exactly the kind of "looks designed but
// isn't real" pattern the design-taste-frontend skill flags as the #1
// tell. Nothing imports this file anymore. Could not delete it directly
// (sandbox file-lock on this mounted folder, same as other stale-file
// cases) — safe to delete manually: components/dashboard-mockup.tsx.

const rows = [
  { label: "Order #4821 — Visiting cards", stage: "Printing", pct: 70 },
  { label: "Order #4822 — Flex banner 8x4", stage: "Design", pct: 30 },
  { label: "Order #4819 — Wedding cards", stage: "Dispatch", pct: 95 },
];

export function DashboardMockup() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs font-medium text-slate-400">Production board</span>
      </div>
      <div className="space-y-4 p-5">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                {row.stage}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${row.pct}%` }}
              />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Today</p>
            <p className="mt-1 text-lg font-bold text-slate-900">18 jobs</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Pending</p>
            <p className="mt-1 text-lg font-bold text-slate-900">6 jobs</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Cashflow</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">+2%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
