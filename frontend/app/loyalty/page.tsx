"use client";
import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Gift, Search, Loader2, AlertCircle, CheckCircle, XCircle,
  ArrowUpCircle, ArrowDownCircle, RotateCcw, Settings2, Save, FlaskConical, Trash2,
  Send, Award,
} from "lucide-react";
import BonusPointsTab from "./BonusPointsTab";

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

interface LoyaltyCustomerRow {
  customerId: string;
  customerName: string | null;
  phone: string | null;
  points: number;
  lastActivityAt: string | null;
  lastOrderNumber: string | null;
  lastOrderValue: number | null;
  salesAgentName: string | null;
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
  const [activeTab, setActiveTab] = useState<"customer" | "bonus">("customer");
  const [phoneInput, setPhoneInput] = useState("");
  const [wallet, setWallet] = useState<LoyaltyWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // ── All customers with a wallet — list view like Accounts > Customer Outstanding ──
  const [allCustomers, setAllCustomers] = useState<LoyaltyCustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerListSearch, setCustomerListSearch] = useState("");
  const [customerListPage, setCustomerListPage] = useState(1);
  const CUSTOMER_LIST_PAGE_SIZE = 50;

  const [configDraft, setConfigDraft] = useState<LoyaltyConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // ── Test mode — simulate earn/redeem/reverse against a throwaway phone
  // number. Never touches a real Order/Customer/Invoice.
  const [showTestMode, setShowTestMode] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testSubtotal, setTestSubtotal] = useState("10000");
  const [testDiscount, setTestDiscount] = useState("0");
  const [testGrossProfit, setTestGrossProfit] = useState("3000");
  const [testMissingCost, setTestMissingCost] = useState(false);
  const [testBillValue, setTestBillValue] = useState("10000");
  const [testRedeemPoints, setTestRedeemPoints] = useState("");
  const [testBusy, setTestBusy] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ action: string; data: any } | null>(null);

  // ── Bulk WhatsApp reminder to every customer who has ever earned points ──
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    total: number; sent: number; optedOut: number; noPhone: number; failed: number;
  } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const handleBulkSend = async () => {
    if (!window.confirm(
      "This sends a real WhatsApp message (via AiSensy) to every customer who has ever earned loyalty points. This cannot be undone. Continue?",
    )) return;
    setBulkSending(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/loyalty/bulk-send-reminder`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Bulk send failed (${res.status})`);
      setBulkResult(data);
    } catch (err: any) {
      setBulkError(err?.message ?? "Bulk send failed");
    } finally {
      setBulkSending(false);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/loyalty/config`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LoyaltyConfig | null) => {
        if (data) setConfigDraft(data);
      })
      .catch(() => {/* keep defaults hidden if it fails to load */})
      .finally(() => setConfigLoading(false));
  }, []);

  const loadAllCustomers = async () => {
    setCustomersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/loyalty/customers`, { headers: getAuthHeaders() });
      if (res.ok) setAllCustomers(await res.json());
    } catch {
      /* leave list empty — the phone lookup below still works */
    } finally {
      setCustomersLoading(false);
    }
  };

  useEffect(() => { void loadAllCustomers(); }, []);

  const filteredCustomers = allCustomers.filter((row) => {
    const q = customerListSearch.trim().toLowerCase();
    if (!q) return true;
    return (row.customerName ?? "").toLowerCase().includes(q) || (row.phone ?? "").includes(q);
  });

  useEffect(() => { setCustomerListPage(1); }, [customerListSearch]);

  const customerListTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMER_LIST_PAGE_SIZE));
  const pagedCustomers = filteredCustomers.slice(
    (customerListPage - 1) * CUSTOMER_LIST_PAGE_SIZE,
    customerListPage * CUSTOMER_LIST_PAGE_SIZE,
  );

  const fetchWallet = async (phone: string) => {
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

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    void fetchWallet(phoneInput.trim());
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

  const runTest = async (action: "earn" | "redeem" | "reverse" | "clear") => {
    const phone = testPhone.trim();
    if (!phone) { setTestError("Enter a test phone number first"); return; }
    setTestBusy(action);
    setTestError(null);
    try {
      let url = "";
      let body: Record<string, unknown> = { phone };
      if (action === "earn") {
        url = "/loyalty/test/earn";
        body = {
          ...body,
          subtotal: Number(testSubtotal),
          discount: Number(testDiscount),
          hasMissingCost: testMissingCost,
          ...(testMissingCost ? {} : { grossProfit: Number(testGrossProfit) }),
        };
      } else if (action === "redeem") {
        url = "/loyalty/test/redeem";
        body = {
          ...body,
          billValue: Number(testBillValue),
          ...(testRedeemPoints.trim() ? { requestedPoints: Number(testRedeemPoints) } : {}),
        };
      } else if (action === "reverse") {
        url = "/loyalty/test/reverse";
      } else {
        url = "/loyalty/test/clear";
      }

      const res = await fetch(`${API_BASE_URL}${url}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Test action failed (${res.status})`);
      setTestResult({ action, data });
      // Reflect the test phone in the search box below and refresh its ledger
      setPhoneInput(phone);
      void fetchWallet(phone);
    } catch (err: any) {
      setTestError(err?.message ?? "Test action failed");
    } finally {
      setTestBusy(null);
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkSend}
              disabled={bulkSending}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {bulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Bulk send reminder
            </button>
            <button
              onClick={() => setShowTestMode((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <FlaskConical className="w-4 h-4" />
              {showTestMode ? "Hide test mode" : "Test mode"}
            </button>
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Settings2 className="w-4 h-4" />
              {showConfig ? "Hide settings" : "Settings"}
            </button>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("customer")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "customer" ? "border-pink-600 text-pink-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Gift className="w-4 h-4" /> Customer Loyalty
          </button>
          <button
            onClick={() => setActiveTab("bonus")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "bonus" ? "border-amber-600 text-amber-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Award className="w-4 h-4" /> Bonus Points
          </button>
        </div>

        {activeTab === "bonus" && <BonusPointsTab />}

        {activeTab === "customer" && (
        <>
        {/* ── Bulk send result ── */}
        {bulkError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{bulkError}</p>
            <button onClick={() => setBulkError(null)} className="ml-auto text-red-600 hover:text-red-800">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
        {bulkResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
            <p className="font-semibold flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-4 h-4" /> Bulk reminder finished
            </p>
            <p className="text-xs text-green-700">
              {bulkResult.total} customers found · {bulkResult.sent} sent · {bulkResult.optedOut} opted-out (skipped) · {bulkResult.noPhone} no valid phone · {bulkResult.failed} failed
            </p>
          </div>
        )}

        {/* ── Test mode panel ── */}
        {showTestMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-amber-600" /> Test Mode
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Simulates earn/redeem/reverse against a throwaway phone number — never touches a real order, customer, or invoice.
                Use a number only you control, then hit &quot;Clear test data&quot; when done.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Test phone number</label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="e.g. your own number, 9999999999"
                className="w-full max-w-xs rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
              />
            </div>

            {/* Simulate earn */}
            <div className="bg-white rounded-lg border border-amber-100 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Simulate an order being invoiced</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Subtotal (₹)</label>
                  <input type="number" value={testSubtotal} onChange={(e) => setTestSubtotal(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Discount (₹)</label>
                  <input type="number" value={testDiscount} onChange={(e) => setTestDiscount(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gross profit (₹)</label>
                  <input type="number" value={testGrossProfit} onChange={(e) => setTestGrossProfit(e.target.value)}
                    disabled={testMissingCost}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={testMissingCost} onChange={(e) => setTestMissingCost(e.target.checked)} />
                    Missing cost slab
                  </label>
                </div>
              </div>
              <button
                onClick={() => runTest("earn")}
                disabled={testBusy !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {testBusy === "earn" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                Simulate Earn
              </button>
            </div>

            {/* Simulate redeem */}
            <div className="bg-white rounded-lg border border-amber-100 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Simulate redeeming points against a bill</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bill value (₹)</label>
                  <input type="number" value={testBillValue} onChange={(e) => setTestBillValue(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points to redeem (optional)</label>
                  <input type="number" value={testRedeemPoints} onChange={(e) => setTestRedeemPoints(e.target.value)}
                    placeholder="max allowed"
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>
              <button
                onClick={() => runTest("redeem")}
                disabled={testBusy !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {testBusy === "redeem" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                Simulate Redeem
              </button>
            </div>

            {/* Reverse + clear */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => runTest("reverse")}
                disabled={testBusy !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-200 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-50 disabled:opacity-50"
              >
                {testBusy === "reverse" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Simulate Reverse (last earn)
              </button>
              <button
                onClick={() => runTest("clear")}
                disabled={testBusy !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 ml-auto"
              >
                {testBusy === "clear" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Clear test data for this number
              </button>
            </div>

            {testError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{testError}</p>
              </div>
            )}
            {testResult && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600 mb-1">Result — {testResult.action}</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">{JSON.stringify(testResult.data, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

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

        {/* ── All customers ── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-800">All Customers</h2>
            <input
              type="text"
              value={customerListSearch}
              onChange={(e) => setCustomerListSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-pink-400"
            />
          </div>
          {customersLoading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading customers…
            </div>
          ) : filteredCustomers.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-8 text-center">
              {allCustomers.length === 0 ? "No customers found." : "No customers match that search."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed min-w-[900px]">
                  <colgroup>
                    <col className="w-[180px]" />
                    <col className="w-[120px]" />
                    <col className="w-[110px]" />
                    <col className="w-[150px]" />
                    <col className="w-[120px]" />
                    <col className="w-[110px]" />
                    <col className="w-[130px]" />
                    <col className="w-8" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Customer</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Phone</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Points Balance</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Sales Agent</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Order Number</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Order Value</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Last Activity</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pagedCustomers.map((row) => (
                      <tr
                        key={row.customerId}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          if (!row.phone) return;
                          setPhoneInput(row.phone);
                          void fetchWallet(row.phone);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <td className="px-4 py-2.5 text-gray-800 truncate" title={row.customerName ?? ""}>
                          {row.customerName ?? <span className="text-gray-400">— unknown —</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.phone ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-pink-700 whitespace-nowrap">{row.points.toLocaleString("en-IN")} pts</td>
                        <td className="px-4 py-2.5 text-gray-600 truncate" title={row.salesAgentName ?? ""}>{row.salesAgentName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600 truncate" title={row.lastOrderNumber ?? ""}>{row.lastOrderNumber ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap">
                          {row.lastOrderValue != null ? `₹${row.lastOrderValue.toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.lastActivityAt ? fmtDate(row.lastActivityAt) : "—"}</td>
                        <td className="px-4 py-2.5 text-gray-300"><Search className="w-3.5 h-3.5" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 text-xs text-gray-500">
                <span>
                  Showing {(customerListPage - 1) * CUSTOMER_LIST_PAGE_SIZE + 1}–
                  {Math.min(customerListPage * CUSTOMER_LIST_PAGE_SIZE, filteredCustomers.length)} of {filteredCustomers.length}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={customerListPage <= 1}
                    onClick={() => setCustomerListPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={customerListPage >= customerListTotalPages}
                    onClick={() => setCustomerListPage((p) => Math.min(customerListTotalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

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
        </>
        )}
      </div>
    </DashboardShell>
  );
}
