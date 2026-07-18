"use client";
import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Gift, Search, Loader2, AlertCircle, CheckCircle, XCircle,
  ArrowUpCircle, ArrowDownCircle, RotateCcw, Settings2, Save,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type LoyaltyTxnType = "EARN" | "REDEEM" | "REVERSE" | "ADJUST";

interface LoyaltyTransaction {
  id: string;
  orderId?: string | null;
  type: LoyaltyTxnType;
  points: number;
  baseAmount?: string | null;
  grossProfit?: string | null;
  discountPct?: string | null;
  reason?: string | null;
  createdAt: string;
}

interface LoyaltyWallet {
  phone: string;
  points: number;
  transactions: LoyaltyTransaction[];
}

interface LoyaltyConfig {
  earnRatePct: number;
  gpRatePct: number;
  pointCap: number;
  redemptionCapPct: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const TYPE_META: Record<LoyaltyTxnType, { label: string; color: string; icon: React.ElementType }> = {
  EARN:    { label: "Earned",   color: "bg-green-100 text-green-800", icon: ArrowUpCircle },
  REDEEM:  { label: "Redeemed", color: "bg-blue-100 text-blue-800",   icon: ArrowDownCircle },
  REVERSE: { label: "Reversed", color: "bg-red-50 text-red-500",      icon: RotateCcw },
  ADJUST:  { label: "Adjusted", color: "bg-gray-100 text-gray-600",   icon: Settings2 },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const [phoneInput, setPhoneInput] = useState("");
  const [wallet, setWallet] = useState<LoyaltyWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [configDraft, setConfigDraft] = useState<LoyaltyConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/loyalty/config`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LoyaltyConfig | null) => {
        if (data) setConfigDraft(data);
      })
      .catch(() => {/* keep defaults hidden if it fails to load */})
      .finally(() => setConfigLoading(false));
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const phone = phoneInput.trim();
    if (!phone) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`${API_BASE_URL}/loyalty/wallet/${encodeURIComponent(phone)}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const data: LoyaltyWallet = await res.json();
      setWallet(data);
    } catch (err: any) {
      setWallet(null);
      setError(err?.message ?? "Could not look up this phone number");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!configDraft) return;
    setConfigSaving(true);
    setConfigSaved(false);
    try {
      const res = await fetch(`${API_BASE_URL}/loyalty/config`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(configDraft),
      });
      if (!res.ok) throw new Error("Save failed");
      const data: LoyaltyConfig = await res.json();
      setConfigDraft(data);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch {
      setError("Could not save loyalty settings");
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Gift className="w-7 h-7 text-pink-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Loyalty Reward Points</h1>
              <p className="text-xs text-gray-500">Look up a customer&apos;s wallet by phone, or tune earn/redeem settings</p>
            </div>
          </div>
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Settings2 className="w-4 h-4" />
            {showConfig ? "Hide settings" : "Settings"}
          </button>
        </div>

        {/* ── Config panel ── */}
        {showConfig && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Earn &amp; Redemption Settings</h2>
              {configSaved && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </div>
            {configLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading current settings…
              </div>
            ) : configDraft ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Earn rate (%)</label>
                    <input
                      type="number" step="0.1" value={configDraft.earnRatePct}
                      onChange={(e) => setConfigDraft({ ...configDraft, earnRatePct: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-pink-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Gross-profit rate (%)</label>
                    <input
                      type="number" step="0.1" value={configDraft.gpRatePct}
                      onChange={(e) => setConfigDraft({ ...configDraft, gpRatePct: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-pink-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Point cap / order</label>
                    <input
                      type="number" step="1" value={configDraft.pointCap}
                      onChange={(e) => setConfigDraft({ ...configDraft, pointCap: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-pink-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Redemption cap (%)</label>
                    <input
                      type="number" step="1" value={configDraft.redemptionCapPct}
                      onChange={(e) => setConfigDraft({ ...configDraft, redemptionCapPct: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-pink-400"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Discount ≤ 5% earns the flat rate on baseAmount; above that, earns the smaller of gross-profit rate or the flat rate.
                  Changes apply immediately — no deploy needed.
                </p>
                <button
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50"
                >
                  {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save settings
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500">Could not load settings — showing spec defaults (5% / 10% / 2000 / 50%).</p>
            )}
          </div>
        )}

        {/* ── Search ── */}
        <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-xl p-5">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer phone number</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="e.g. 9876543210"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-pink-400"
            />
            <button
              type="submit"
              disabled={loading || !phoneInput.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Look up
            </button>
          </div>
        </form>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Wallet result ── */}
        {searched && !loading && wallet && (
          <>
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Wallet balance</p>
                <p className="text-2xl font-bold text-gray-900">{wallet.points.toLocaleString("en-IN")} pts</p>
                <p className="text-xs text-gray-400 mt-0.5">≈ ₹{wallet.points.toLocaleString("en-IN")} redemption value · {wallet.phone}</p>
              </div>
              <Gift className="w-10 h-10 text-pink-200" />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">Transaction ledger</h2>
              </div>
              {wallet.transactions.length === 0 ? (
                <p className="text-sm text-gray-400 px-5 py-8 text-center">No transactions yet for this number.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Type</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Points</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Order</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {wallet.transactions.map((txn) => {
                        const meta = TYPE_META[txn.type];
                        const Icon = meta.icon;
                        return (
                          <tr key={txn.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(txn.createdAt)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                                <Icon className="w-3 h-3" /> {meta.label}
                              </span>
                            </td>
                            <td className={`px-4 py-2.5 text-right font-medium whitespace-nowrap ${txn.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {txn.points >= 0 ? "+" : ""}{txn.points}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">{txn.orderId ?? "—"}</td>
                            <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{txn.reason ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {searched && !loading && !wallet && !error && (
          <p className="text-sm text-gray-400 text-center py-8">No wallet found for this number yet.</p>
        )}
      </div>
    </DashboardShell>
  );
}
