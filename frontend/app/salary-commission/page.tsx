"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getStoredUser } from "@/lib/auth";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Wallet, Save } from "lucide-react";

type EmployeeLite = { id: string; fullName: string; email: string; role: string };
type SalaryInfo = { id: string; fullName: string; role: string; salesAgentCategory: string | null; baseSalary: number };

type CommissionSheetRow = {
  orderId: string; date: string; invoiceNo: string; partyName: string; itemName: string;
  category: string; quantity: number; amount: number; ratePerUnit: number | null;
  discountPct: number; cost: number | null; grossProfit: number | null; marginPct: number | null;
  commissionPct: number; commissionAmt: number; calcMethod: string; hasCost: boolean; balanceDue: number;
  orderStatus: string; courierName: string | null;
};
type CommissionSheet = {
  userId: string; year: number; month: number; agentName: string | null; agentCategory: string | null;
  saleTotal: number; commissionTotal: number; commissionPct: number; bonus: number; baseSalary: number;
  totalPayable: number; grandTotal: number; rows: CommissionSheetRow[];
  verification: { verifiedAt: string; verifiedBy: string } | null;
};

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function SalaryCommissionPage() {
  const me = getStoredUser();
  const isAdmin = me?.role === "ADMIN";

  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [selectedId, setSelectedId] = useState<string>(me?.id ?? "");
  const [salaryInfo, setSalaryInfo] = useState<SalaryInfo | null>(null);
  const [salaryDraft, setSalaryDraft] = useState<string>("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [sheets, setSheets] = useState<CommissionSheet[] | null>(null);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    void apiFetch<EmployeeLite[]>("/tasks/users", {}, setError).then((data) => {
      if (data) setEmployees(data);
    });
  }, [isAdmin]);

  const loadSalary = useCallback(async (userId: string) => {
    const data = await apiFetch<SalaryInfo>(`/cost-table/sales-agents/${userId}/salary`, {}, setError);
    if (data) {
      setSalaryInfo(data);
      setSalaryDraft(data.baseSalary ? String(data.baseSalary) : "");
    }
  }, []);

  const loadSheets = useCallback(async (userId: string) => {
    setLoadingSheets(true);
    setSheets(null);
    const data = await apiFetch<CommissionSheet[]>(`/cost-table/sales-agents/${userId}/verified-sheets`, {}, setError);
    setSheets(data ?? []);
    setLoadingSheets(false);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setError(null);
    void loadSalary(selectedId);
    void loadSheets(selectedId);
  }, [selectedId, loadSalary, loadSheets]);

  const handleSaveSalary = async () => {
    if (!selectedId) return;
    setSavingSalary(true);
    const value = salaryDraft.trim() === "" ? null : Number(salaryDraft);
    const res = await apiMutate(`/cost-table/sales-agents/${selectedId}/salary`, "PUT", { baseSalary: value }, setError);
    setSavingSalary(false);
    if (res) void loadSalary(selectedId);
  };

  const selectedEmployee = employees.find((e) => e.id === selectedId);
  const fmt = (n: number) => `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <DashboardShell>
      <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet size={22} /> Salary & Commission
          </h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "View and manage every employee's base salary and verified commission history."
              : "Your verified monthly commission sheets and base salary."}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        {isAdmin && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 block w-full sm:w-80 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={me?.id ?? ""}>{me?.fullName ?? "Me"} (you)</option>
              {employees.filter((e) => e.id !== me?.id).map((e) => (
                <option key={e.id} value={e.id}>{e.fullName} — {e.role}</option>
              ))}
            </select>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</div>
            <div className="text-base font-bold text-slate-800">
              {salaryInfo?.fullName ?? selectedEmployee?.fullName ?? me?.fullName}
            </div>
            <div className="text-xs text-slate-500">
              {salaryInfo?.role ?? selectedEmployee?.role ?? me?.role}
              {salaryInfo?.salesAgentCategory ? ` · Category ${salaryInfo.salesAgentCategory}` : ""}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Base Salary (monthly)</div>
            {isAdmin ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={salaryDraft}
                  onChange={(e) => setSalaryDraft(e.target.value)}
                  placeholder="0"
                  className="w-32 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <button
                  onClick={handleSaveSalary}
                  disabled={savingSalary}
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingSalary ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            ) : (
              <div className="text-base font-bold text-slate-800">{fmt(salaryInfo?.baseSalary ?? 0)}</div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Verified Commission Sheets</h2>
          {loadingSheets ? (
            <div className="text-sm text-slate-500 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading...
            </div>
          ) : !sheets || sheets.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
              No verified commission sheets yet. Once admin verifies a month's commission, it will appear here.
            </div>
          ) : (
            sheets.map((sheet) => {
              const key = `${sheet.year}-${sheet.month}`;
              const isOpen = !!expanded[key];
              return (
                <div key={key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-bold text-slate-800">{monthLabel(sheet.year, sheet.month)}</div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    </div>
                    <div className="flex items-center gap-5 text-xs text-slate-600">
                      <div><span className="text-slate-400">Sales</span> <span className="font-semibold text-slate-700">{fmt(sheet.saleTotal)}</span></div>
                      <div><span className="text-slate-400">Commission</span> <span className="font-semibold text-blue-700">{fmt(sheet.commissionTotal)}</span></div>
                      <div><span className="text-slate-400">Incentive</span> <span className="font-semibold text-green-700">{fmt(sheet.bonus)}</span></div>
                      {sheet.baseSalary > 0 && (
                        <div><span className="text-slate-400">Salary</span> <span className="font-semibold text-slate-700">{fmt(sheet.baseSalary)}</span></div>
                      )}
                      <div><span className="text-slate-400">Total</span> <span className="font-bold text-green-800">{fmt(sheet.grandTotal)}</span></div>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-4 overflow-x-auto">
                      <div className="text-xs text-slate-500 mb-2">
                        Verified by {sheet.verification?.verifiedBy ?? "—"} on{" "}
                        {sheet.verification?.verifiedAt
                          ? new Date(sheet.verification.verifiedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-200">
                            <th className="text-left py-1.5 pr-2">Date</th>
                            <th className="text-left py-1.5 pr-2">Invoice</th>
                            <th className="text-left py-1.5 pr-2">Party</th>
                            <th className="text-left py-1.5 pr-2">Item</th>
                            <th className="text-right py-1.5 pr-2">Amount</th>
                            <th className="text-right py-1.5 pr-2">Commission %</th>
                            <th className="text-right py-1.5">Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sheet.rows.map((row, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1.5 pr-2">{new Date(row.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                              <td className="py-1.5 pr-2">{row.invoiceNo}</td>
                              <td className="py-1.5 pr-2">{row.partyName}</td>
                              <td className="py-1.5 pr-2">{row.itemName}</td>
                              <td className="py-1.5 pr-2 text-right">{fmt(row.amount)}</td>
                              <td className="py-1.5 pr-2 text-right">{row.commissionPct}%</td>
                              <td className="py-1.5 text-right font-semibold">{fmt(row.commissionAmt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
