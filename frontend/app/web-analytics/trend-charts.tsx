"use client";
// Search Console daily trends. Loaded with next/dynamic from page.tsx so
// recharts is only downloaded on this owner-only page.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type GscDailyRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };

const LINE_COLOR = "#2563eb";
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// One chart per metric — they have different scales, so they never share an axis.
const METRICS: { key: keyof Omit<GscDailyRow, "key">; title: string; format: (n: number) => string; lowerIsBetter?: boolean }[] = [
  { key: "clicks", title: "Clicks", format: num },
  { key: "impressions", title: "Impressions", format: num },
  { key: "ctr", title: "CTR", format: (n) => `${(n * 100).toFixed(2)}%` },
  { key: "position", title: "Average position (lower is better)", format: (n) => n.toFixed(1), lowerIsBetter: true },
];

export default function TrendCharts({ daily }: { daily: GscDailyRow[] }) {
  if (!daily.length) return <p className="text-sm text-gray-500">No daily data for this period.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {METRICS.map((m) => (
        <div key={m.key} className="rounded-xl border border-gray-100 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">{m.title}</p>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="key" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} minTickGap={24} />
                <YAxis
                  tickFormatter={m.format}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  reversed={m.lowerIsBetter}
                  domain={m.lowerIsBetter ? ["dataMin", "dataMax"] : [0, "auto"]}
                />
                <Tooltip
                  formatter={(value) => [m.format(Number(value)), m.title]}
                  labelFormatter={(label) => dayLabel(String(label))}
                  cursor={{ stroke: "#9ca3af", strokeDasharray: "3 3" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line type="linear"dataKey={m.key} stroke={LINE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
