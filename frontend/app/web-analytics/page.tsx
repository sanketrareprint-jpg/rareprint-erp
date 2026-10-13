"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { fetchWithRetry, describeFetchError } from "@/lib/apiFetch";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Loader2, Lock, RefreshCw } from "lucide-react";
import type { GscDailyRow } from "./trend-charts";

// Owner-only Web Analytics — GA4 + Search Console data synced every 6 hours
// by backend/src/web-analytics (the backend returns 403 to anyone else).
// recharts is loaded only here, and only once the page has data to chart.
const TrendCharts = dynamic(() => import("./trend-charts"), {
  ssr: false,
  loading: () => <div className="flex h-40 items-center justify-center text-sm text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading charts…</div>,
});

type Range = 7 | 28 | 90;
type Ga4Totals = { startDate: string; endDate: string; users: number; sessions: number; pageViews: number; avgEngagementSeconds: number };
type Ecommerce = { available: true; purchases: number; revenue: number; addToCarts: number } | { available: false; reason: string } | null;
type ListRow = { key: string } & Record<string, number | string>;
type GscTotals = { startDate: string; endDate: string; clicks: number; impressions: number; ctr: number; position: number };
type Summary = {
  configured: boolean;
  rangeDays: Range;
  ga4: {
    current: Ga4Totals; previous: Ga4Totals | null;
    ecommerce: { current: Ecommerce; previous: Ecommerce };
    productPages: ListRow[]; channels: ListRow[]; sources: ListRow[]; devices: ListRow[]; cities: ListRow[]; regions: ListRow[];
    syncedAt: string | null;
  } | null;
  gsc: {
    current: GscTotals; previous: GscTotals | null; daily: GscDailyRow[];
    queries: GscDailyRow[]; pages: GscDailyRow[]; easyWins: GscDailyRow[];
    easyWinRule: { minPosition: number; maxPosition: number; minImpressions: number };
    dataUpTo: string; syncedAt: string | null;
  } | null;
  lastSync: { status: string; trigger: string; startedAt: string; finishedAt: string | null; error: string | null } | null;
  lastSuccessfulSync: { ga4: string | null; gsc: string | null };
  syncing: boolean;
};

const RANGES: Range[] = [7, 28, 90];
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const duration = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
const day = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

function Delta({ current, previous, lowerIsBetter }: { current: number; previous: number | undefined; lowerIsBetter?: boolean }) {
  if (previous === undefined || previous === 0) return <span className="text-xs text-gray-400">no previous data</span>;
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.0005) return <span className="text-xs text-gray-500">no change</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? "text-green-700" : "text-red-700"}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(change * 100).toFixed(1)}% {good ? "better" : "worse"}
    </span>
  );
}

function Tile({ label, value, current, previous, lowerIsBetter }: { label: string; value: string; current: number; previous?: number; lowerIsBetter?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      <Delta current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
    </div>
  );
}

type Column = { key: string; label: string; format?: (v: number) => string };

function DataTable({ title, rows, columns, note }: { title: string; rows: ListRow[] | GscDailyRow[]; columns: Column[]; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-3 py-2">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {note && <p className="text-xs text-gray-500">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-gray-500">No data for this period.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
              <tr>
                {columns.map((c, i) => (
                  <th key={c.key} className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows as Record<string, number | string>[]).map((row, r) => (
                <tr key={`${row.key}-${r}`} className="border-t border-gray-50">
                  {columns.map((c, i) => (
                    <td key={c.key} className={`px-3 py-1.5 ${i === 0 ? "max-w-xs break-all text-left text-gray-800" : "whitespace-nowrap text-right tabular-nums text-gray-700"}`}>
                      {i === 0 ? String(row[c.key] || "(not set)") : (c.format ?? num)(Number(row[c.key] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function WebAnalyticsPage() {
  const [range, setRange] = useState<Range>(28);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");

  const load = useCallback(async (rangeDays: Range) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/web-analytics/summary?range=${rangeDays}`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); window.location.href = "/login"; return; }
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(`Could not load analytics: ${describeFetchError(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(range); }, [load, range]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/web-analytics/refresh`, { method: "POST", headers: getAuthHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      const messages: Record<string, string> = {
        SUCCESS: "Synced from Google.",
        PARTIAL: "Partly synced — see the error below.",
        FAILED: "Sync failed — see the error below.",
        ALREADY_RUNNING: "A sync is already running. Try again in a minute.",
        NOT_CONFIGURED: "Google access is not configured on the server.",
      };
      setRefreshMessage(messages[body?.status] ?? "Done.");
      await load(range);
    } catch (err) {
      setRefreshMessage(`Refresh failed: ${describeFetchError(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  if (forbidden) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-24 text-center text-gray-600">
          <Lock className="mb-3 h-8 w-8 text-gray-400" />
          <p className="font-semibold">Web Analytics is only available to the owner.</p>
        </div>
      </DashboardShell>
    );
  }

  const ga4 = data?.ga4;
  const gsc = data?.gsc;
  const ecoCurrent = ga4?.ecommerce.current;
  const ecoPrevious = ga4?.ecommerce.previous;
  const ecoPrev = ecoPrevious && ecoPrevious.available ? ecoPrevious : null;
  const showSyncError = data?.lastSync?.error && (data.lastSync.status === "FAILED" || data.lastSync.status === "PARTIAL");

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-5 p-3 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Web Analytics</h1>
            <p className="text-xs text-gray-500">
              rareprint.in · Google Analytics last synced {when(data?.lastSuccessfulSync.ga4 ?? null)} · Search Console last synced {when(data?.lastSuccessfulSync.gsc ?? null)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-sm font-medium ${range === r ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {r} days
                </button>
              ))}
            </div>
            <button
              onClick={refresh}
              disabled={refreshing || !data?.configured}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh now"}
            </button>
          </div>
        </div>

        {refreshMessage && <p className="text-sm text-gray-600">{refreshMessage}</p>}
        {error && <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</p>}
        {showSyncError && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <p className="flex items-center gap-1.5 font-semibold"><AlertCircle className="h-4 w-4" />Last sync ({when(data!.lastSync!.startedAt)}) {data!.lastSync!.status === "PARTIAL" ? "partly failed" : "failed"}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs">{data!.lastSync!.error}</p>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
        ) : data && !data.configured ? (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
            Google access is not configured on the server. Set GOOGLE_SERVICE_ACCOUNT_JSON, GA4_PROPERTY_ID and GSC_SITE_URL (see backend/README.md).
          </div>
        ) : data && !ga4 && !gsc ? (
          <div className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-gray-600">
            No analytics stored yet. Click <b>Refresh now</b> to run the first sync (it runs automatically every 6 hours).
          </div>
        ) : (
          <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
            {ga4 && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Google Analytics</h2>
                  <p className="text-xs text-gray-500">
                    {day(ga4.current.startDate)} – {day(ga4.current.endDate)}
                    {ga4.previous && <> · compared with {day(ga4.previous.startDate)} – {day(ga4.previous.endDate)}</>}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Tile label="Users" value={num(ga4.current.users)} current={ga4.current.users} previous={ga4.previous?.users} />
                  <Tile label="Sessions" value={num(ga4.current.sessions)} current={ga4.current.sessions} previous={ga4.previous?.sessions} />
                  <Tile label="Page views" value={num(ga4.current.pageViews)} current={ga4.current.pageViews} previous={ga4.previous?.pageViews} />
                  <Tile label="Avg engagement time" value={duration(ga4.current.avgEngagementSeconds)} current={ga4.current.avgEngagementSeconds} previous={ga4.previous?.avgEngagementSeconds} />
                </div>
                {ecoCurrent && ecoCurrent.available ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Tile label="Purchases" value={num(ecoCurrent.purchases)} current={ecoCurrent.purchases} previous={ecoPrev?.purchases} />
                    <Tile label="Revenue" value={inr(ecoCurrent.revenue)} current={ecoCurrent.revenue} previous={ecoPrev?.revenue} />
                    <Tile label="Add-to-carts" value={num(ecoCurrent.addToCarts)} current={ecoCurrent.addToCarts} previous={ecoPrev?.addToCarts} />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">E-commerce data is not available from Google Analytics for this property.</p>
                )}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DataTable title="Top product pages" rows={ga4.productPages} columns={[{ key: "key", label: "Page" }, { key: "screenPageViews", label: "Views" }, { key: "activeUsers", label: "Users" }]} />
                  <DataTable title="Channels" rows={ga4.channels} columns={[{ key: "key", label: "Channel" }, { key: "sessions", label: "Sessions" }, { key: "activeUsers", label: "Users" }]} />
                  <DataTable title="Traffic sources" rows={ga4.sources} columns={[{ key: "key", label: "Source / medium" }, { key: "sessions", label: "Sessions" }, { key: "activeUsers", label: "Users" }]} />
                  <DataTable title="Devices" rows={ga4.devices} columns={[{ key: "key", label: "Device" }, { key: "activeUsers", label: "Users" }, { key: "sessions", label: "Sessions" }]} />
                  <DataTable title="Top cities" rows={ga4.cities} columns={[{ key: "key", label: "City" }, { key: "activeUsers", label: "Users" }, { key: "sessions", label: "Sessions" }]} />
                  <DataTable title="Top states" rows={ga4.regions} columns={[{ key: "key", label: "State" }, { key: "activeUsers", label: "Users" }, { key: "sessions", label: "Sessions" }]} />
                </div>
              </section>
            )}

            {gsc && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Google Search Console</h2>
                  <p className="text-xs text-gray-500">
                    Data up to <b>{day(gsc.dataUpTo)}</b> (Search Console lags 2–3 days) · {day(gsc.current.startDate)} – {day(gsc.current.endDate)}
                    {gsc.previous && <> · compared with {day(gsc.previous.startDate)} – {day(gsc.previous.endDate)}</>}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Tile label="Clicks" value={num(gsc.current.clicks)} current={gsc.current.clicks} previous={gsc.previous?.clicks} />
                  <Tile label="Impressions" value={num(gsc.current.impressions)} current={gsc.current.impressions} previous={gsc.previous?.impressions} />
                  <Tile label="CTR" value={pct(gsc.current.ctr)} current={gsc.current.ctr} previous={gsc.previous?.ctr} />
                  <Tile label="Avg position" value={gsc.current.position.toFixed(1)} current={gsc.current.position} previous={gsc.previous?.position} lowerIsBetter />
                </div>
                <TrendCharts daily={gsc.daily} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DataTable
                    title="Top search queries"
                    rows={gsc.queries}
                    columns={[{ key: "key", label: "Query" }, { key: "clicks", label: "Clicks" }, { key: "impressions", label: "Impr." }, { key: "ctr", label: "CTR", format: pct }, { key: "position", label: "Pos.", format: (n) => n.toFixed(1) }]}
                  />
                  <DataTable
                    title="Top pages"
                    rows={gsc.pages}
                    columns={[{ key: "key", label: "Page" }, { key: "clicks", label: "Clicks" }, { key: "impressions", label: "Impr." }, { key: "ctr", label: "CTR", format: pct }, { key: "position", label: "Pos.", format: (n) => n.toFixed(1) }]}
                  />
                </div>
                <DataTable
                  title="Easy wins"
                  note={`Queries at average position ${gsc.easyWinRule.minPosition}–${gsc.easyWinRule.maxPosition} with at least ${num(gsc.easyWinRule.minImpressions)} impressions — small ranking gains here bring the most extra clicks.`}
                  rows={gsc.easyWins}
                  columns={[{ key: "key", label: "Query" }, { key: "impressions", label: "Impr." }, { key: "clicks", label: "Clicks" }, { key: "ctr", label: "CTR", format: pct }, { key: "position", label: "Pos.", format: (n) => n.toFixed(1) }]}
                />
              </section>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
