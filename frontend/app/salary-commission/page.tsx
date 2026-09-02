"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { getStoredUser } from "@/lib/auth";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Wallet, Save, Clock, AlertTriangle } from "lucide-react";

type EmployeeLite = { id: string; fullName: string; email: string; role: string };
type SalaryInfo = { id: string; fullName: string; role: string; salesAgentCategory: string | null; baseSalary: number };
type HrLink = { id: string; employeeCode: string; fullName: string } | null;
type AttendanceSalary = {
  employeeCode: string; year: number; month: number; workingDays: number; leaveDays: number;
  netDays: number; requiredHours: number; hoursWorked: number; absentHours: number;
  baseSalary: number; salary: number; daysMissingPunch: number;
  overtimeAllowed?: boolean; overtimeHours?: number; overtimePay?: number; approvalRequired?: boolean;
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

  const now = new Date();
  const [hrLink, setHrLink] = useState<HrLink>(null);
  const [attYear, setAttYear] = useState(now.getFullYear());
  const [attMonth, setAttMonth] = useState(now.getMonth() + 1);
  const [attSalary, setAttSalary] = useState<AttendanceSalary | null>(null);
  const [loadingAtt, setLoadingAtt] = useState(false);

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
    setHrLink(null);
    setAttSalary(null);
    void apiFetch<HrLink>(`/hr/employees/by-user/${selectedId}`, {}, undefined).then((link) => {
      if (link) setHrLink(link);
    });
  }, [selectedId, loadSalary, loadSheets]);

  useEffect(() => {
    if (!hrLink) return;
    setLoadingAtt(true);
    void apiFetch<AttendanceSalary>(`/hr/employees/${hrLink.id}/salary?year=${attYear}&month=${attMonth}`, {}, undefined)
      .then((data) => setAttSalary(data))
      .finally(() => setLoadingAtt(false));
  }, [hrLink, attYear, attMonth]);

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
            <MobileSelect
              value={selectedId}
              onChange={setSelectedId}
              className="mt-1 block w-full sm:w-80 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              options={[
                { value: me?.id ?? "", label: `${me?.fullName ?? "Me"} (you)` },
                ...employees.filter((e) => e.id !== me?.id).map((e) => ({ value: e.id, label: `${e.fullName} — ${e.role}` })),
              ]}
            />
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
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
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

        {hrLink && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <Clock size={16} /> Attendance-based Salary
              </h2>
              <div className="flex items-center gap-2">
                <MobileSelect value={String(attMonth)} onChange={(v) => setAttMonth(Number(v))} className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                  options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))} />
                <input type="number" value={attYear} onChange={(e) => setAttYear(Number(e.target.value))} className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs" />
              </div>
            </div>
            {loadingAtt ? (
              <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading...</div>
            ) : attSalary ? (
              <>
                {attSalary.approvalRequired && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} /> This month's salary is pending Sanket's approval on the HR master record — it will show as payable once approved.
                  </div>
                )}
                <div className="flex flex-wrap gap-5 text-xs">
                  <div><span className="text-slate-400 block uppercase">Required hrs</span><span className="font-bold text-slate-700">{attSalary.requiredHours}</span></div>
                  <div><span className="text-slate-400 block uppercase">Worked hrs</span><span className="font-bold text-slate-700">{attSalary.hoursWorked}</span></div>
                  <div><span className="text-slate-400 block uppercase">Shortfall/Excess</span><span className={`font-bold ${attSalary.absentHours < 0 ? "text-red-600" : "text-green-700"}`}>{attSalary.absentHours}</span></div>
                  <div><span className="text-slate-400 block uppercase">Leave days</span><span className="font-bold text-slate-700">{attSalary.leaveDays}</span></div>
                  {attSalary.daysMissingPunch > 0 && (
                    <div><span className="text-slate-400 block uppercase">Missing punches</span><span className="font-bold text-amber-600">{attSalary.daysMissingPunch} day(s)</span></div>
                  )}
                  {!!attSalary.overtimeAllowed && (
                    <>
                      <div><span className="text-slate-400 block uppercase">Overtime hrs</span><span className="font-bold text-slate-700">{attSalary.overtimeHours ?? 0}</span></div>
                      <div><span className="text-slate-400 block uppercase">Overtime pay</span><span className="font-bold text-slate-700">{fmt(attSalary.overtimePay ?? 0)}</span></div>
                    </>
                  )}
                  <div><span className="text-slate-400 block uppercase">{attSalary.approvalRequired ? "Payable (blocked)" : "Calculated salary"}</span><span className={`font-bold ${attSalary.approvalRequired ? "text-amber-600" : "text-blue-700"}`}>{fmt(attSalary.salary)}</span></div>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400">No attendance recorded for this month yet.</div>
            )}
          </div>
        )}

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
