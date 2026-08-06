"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import DateInput from "@/components/DateInput";
import { getStoredUser } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import {
  CalendarClock, Upload, Loader2, Save, ShieldAlert, AlertTriangle, CheckCircle2, Plus, History, ChevronDown, ChevronUp,
} from "lucide-react";

type EmployeeListItem = { id: string; employeeCode: string; fullName: string; designation: string; status: string };

type DayRow = {
  date: string; day: number; dow: number; timeIn: string | null; timeOut: string | null;
  hoursWorked: number; isAbsent: boolean; isPaidLeave: boolean; source: string | null;
  note: string | null; needsReview: boolean;
};
type MonthGrid = { employeeId: string; employeeCode: string; fullName: string; workingHoursPerDay: number; year: number; month: number; days: DayRow[]; finalSessionId?: string | null };

type ImportSession = {
  id: string; fileName: string; periodStart: string; periodEnd: string;
  rowsFound: number; rowsImported: number; rowsSkipped: number; createdAt: string;
  importedBy?: { fullName: string } | null; isFinal?: boolean;
};

type SalaryCalc = {
  workingDays: number; leaveDays: number; netDays: number; requiredHours: number;
  hoursWorked: number; absentHours: number; baseSalary: number; salary: number;
  overtimeAllowed?: boolean; overtimeHours?: number; overtimePay?: number;
  calculatedSalary?: number; approvalRequired?: boolean;
  incentivePlanLabel?: string | null; incentivePct?: number | null; monthlyTarget?: number | null;
  monthSales?: number; targetAchieved?: boolean | null; incentiveAmount?: number;
  petrolAllowance?: number; simAllowance?: number; calculatedTotal?: number;
  automaticPaidLeaveHours?: number;
};

const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function AttendancePage() {
  const me = getStoredUser();
  const canAccess = me?.role === "ADMIN" || me?.role === "ACCOUNTS";

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [salary, setSalary] = useState<SalaryCalc | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [showAdHocLeave, setShowAdHocLeave] = useState(false);
  const [adHocLeave, setAdHocLeave] = useState({ date: "", days: "1", reason: "" });
  const [savingLeave, setSavingLeave] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  const loadImportSessions = useCallback(async () => {
    const data = await apiFetch<ImportSession[]>("/attendance/import-sessions", {}, undefined);
    if (data) setImportSessions(data);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void apiFetch<EmployeeListItem[]>("/hr/employees?status=ACTIVE", {}, setError).then((data) => {
      if (data) {
        setEmployees(data);
        if (!employeeId && data.length) setEmployeeId(data[0].id);
      }
    });
    void loadImportSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  // Does any import session's period overlap the currently selected month? (Imports cover
  // a date range for ALL employees at once, so this is a company-wide check, not per-employee.)
  const monthStartSel = new Date(year, month - 1, 1);
  const monthEndSel = new Date(year, month, 0);
  const sessionsForMonth = importSessions.filter((s) => {
    const ps = new Date(s.periodStart);
    const pe = new Date(s.periodEnd);
    return ps <= monthEndSel && pe >= monthStartSel;
  });
  const monthImported = sessionsForMonth.length > 0;

  const loadGrid = useCallback(async () => {
    if (!employeeId) return;
    setLoadingGrid(true);
    setError(null);
    const [g, s] = await Promise.all([
      apiFetch<MonthGrid>(`/attendance/employees/${employeeId}/month?year=${year}&month=${month}`, {}, setError),
      apiFetch<SalaryCalc>(`/hr/employees/${employeeId}/salary?year=${year}&month=${month}`, {}, undefined),
    ]);
    if (g) { setGrid(g); setRows(g.days); }
    setSalary(s);
    setLoadingGrid(false);
  }, [employeeId, year, month]);

  useEffect(() => { void loadGrid(); }, [loadGrid]);

  const updateRow = (date: string, patch: Partial<DayRow>) => {
    setRows((prev) => prev.map((r) => (r.date === date ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: DayRow) => {
    if (!employeeId) return;
    setSavingDate(row.date);
    const res = await apiMutate(`/attendance/employees/${employeeId}/day/${row.date}`, "PUT", {
      timeIn: row.timeIn || null,
      timeOut: row.timeOut || null,
      hoursWorked: row.hoursWorked,
      isAbsent: row.isAbsent,
      isPaidLeave: row.isPaidLeave,
      note: row.note || null,
    }, setError);
    setSavingDate(null);
    if (res) void loadGrid();
  };

  const handleAddAdHocLeave = async () => {
    if (!employeeId || !adHocLeave.date) return;
    setSavingLeave(true);
    const res = await apiMutate(`/hr/employees/${employeeId}/leaves`, "POST", {
      date: adHocLeave.date, days: Number(adHocLeave.days || 1), type: "OTHER", reason: adHocLeave.reason || null,
    }, setError);
    setSavingLeave(false);
    if (res) {
      setAdHocLeave({ date: "", days: "1", reason: "" });
      setShowAdHocLeave(false);
      void loadGrid();
    }
  };

  const handleToggleFinal = async (session: ImportSession) => {
    setFinalizingId(session.id);
    const path = session.isFinal ? `/attendance/import-sessions/${session.id}/unfinalize` : `/attendance/import-sessions/${session.id}/finalize`;
    const res = await apiMutate(path, "PUT", {}, setError);
    setFinalizingId(null);
    if (res) {
      await loadImportSessions();
      void loadGrid();
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { "Content-Type": _ct, ...uploadHeaders } = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/attendance/import`, { method: "POST", headers: uploadHeaders, body: formData });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || res.statusText);
      }
      const data = await res.json();
      setImportResult(data);
      void loadGrid();
      void loadImportSessions();
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  if (!canAccess) {
    return (
      <DashboardShell>
        <div className="p-6 max-w-2xl mx-auto text-center text-slate-500">
          <ShieldAlert className="mx-auto mb-2" />
          Attendance management is restricted to admin/accounts.
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarClock size={22} /> Attendance
          </h1>
          <p className="text-sm text-slate-500">Import the in/out machine's monthly report, then fill in any blanks the thumb reader missed.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Import machine report</h2>
          <p className="text-xs text-slate-500">Upload the "Exception Statistic Report" .xls exported from the attendance machine software (the sheet named "Exception Stat.").</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <button onClick={handleUpload} disabled={!file || uploading} className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 disabled:opacity-50">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import
            </button>
          </div>
          {importResult && (
            <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1 text-green-700 font-semibold"><CheckCircle2 size={14} /> Imported {importResult.rowsImported} of {importResult.rowsFound} rows ({importResult.rowsSkipped} skipped)</div>
              {importResult.unmatchedIds?.length > 0 && (
                <div className="flex items-start gap-1 text-amber-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Unmatched machine IDs (no Employee has this Biometric ID yet — set it on the HR page and re-import):{" "}
                    {importResult.unmatchedIds.map((u: any) => `${u.name || "?"} (#${u.id})`).join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}

          <button onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800">
            <History size={13} /> Import history ({importSessions.length}) {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showHistory && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <p className="text-[11px] text-slate-400 px-2 pt-2">Mark a sheet Final to make it the one everyone sees for that month — any other upload covering the same month is then ignored (your hand-corrected days on the grid still always apply).</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 uppercase border-b border-slate-200 bg-slate-50">
                    <th className="py-2 px-2">Period covered</th>
                    <th className="py-2 px-2">File</th>
                    <th className="py-2 px-2">Rows</th>
                    <th className="py-2 px-2">Imported by</th>
                    <th className="py-2 px-2">When</th>
                    <th className="py-2 px-2">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {importSessions.length === 0 ? (
                    <tr><td colSpan={6} className="py-3 px-2 text-slate-400 text-center">No imports yet.</td></tr>
                  ) : importSessions.map((s) => (
                    <tr key={s.id} className={`border-b border-slate-50 ${s.isFinal ? "bg-green-50" : ""}`}>
                      <td className="py-1.5 px-2 whitespace-nowrap">{new Date(s.periodStart).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} – {new Date(s.periodEnd).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="py-1.5 px-2 text-slate-500">{s.fileName}</td>
                      <td className="py-1.5 px-2">{s.rowsImported}/{s.rowsFound} <span className="text-slate-400">({s.rowsSkipped} skipped)</span></td>
                      <td className="py-1.5 px-2 text-slate-500">{s.importedBy?.fullName ?? "—"}</td>
                      <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="py-1.5 px-2">
                        {s.isFinal ? (
                          <button onClick={() => handleToggleFinal(s)} disabled={finalizingId === s.id} className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 border border-green-300 rounded-lg px-2 py-1 disabled:opacity-50">
                            {finalizingId === s.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Final
                          </button>
                        ) : (
                          <button onClick={() => handleToggleFinal(s)} disabled={finalizingId === s.id} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 border border-slate-300 rounded-lg px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
                            {finalizingId === s.id ? <Loader2 size={11} className="animate-spin" /> : null} Mark Final
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 block w-64 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {employees.map((e) => <option key={e.id} value={e.id}>{e.employeeCode} — {e.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-1 block border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1 block w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            {monthImported ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1.5">
                <CheckCircle2 size={13} /> Report imported for {MONTH_NAMES[month - 1]} {year}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                <AlertTriangle size={13} /> No report imported yet for {MONTH_NAMES[month - 1]} {year}
              </span>
            )}
          </div>
          {grid?.finalSessionId ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1.5">
              <CheckCircle2 size={13} /> Showing the Final sheet for this month
            </span>
          ) : monthImported ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              No sheet marked Final yet — showing everything imported/edited so far
            </span>
          ) : null}
        </div>

        {salary && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            {salary.approvalRequired && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={14} /> Pending Sanket's approval on the HR master record — salary shown below is what it would be, but ₹0 is payable until approved.
              </div>
            )}
            <div className="flex flex-wrap gap-5 text-xs">
              <div><span className="text-slate-400 block uppercase">Required hrs</span><span className="font-bold text-slate-700">{salary.requiredHours}</span></div>
              <div><span className="text-slate-400 block uppercase">Worked hrs</span><span className="font-bold text-slate-700">{salary.hoursWorked}</span></div>
              <div><span className="text-slate-400 block uppercase">Shortfall/Excess</span><span className={`font-bold ${salary.absentHours < 0 ? "text-red-600" : "text-green-700"}`}>{salary.absentHours}</span></div>
              <div><span className="text-slate-400 block uppercase">Leave days</span><span className="font-bold text-slate-700">{salary.leaveDays}</span></div>
              {!!salary.automaticPaidLeaveHours && (
                <div><span className="text-slate-400 block uppercase">Auto paid leave</span><span className="font-bold text-slate-700">{salary.automaticPaidLeaveHours} hrs <span className="text-[10px] text-slate-400">(already in required hrs)</span></span></div>
              )}
              {!!salary.overtimeAllowed && (
                <>
                  <div><span className="text-slate-400 block uppercase">Overtime hrs</span><span className="font-bold text-slate-700">{salary.overtimeHours ?? 0}</span></div>
                  <div><span className="text-slate-400 block uppercase">Overtime pay</span><span className="font-bold text-slate-700">₹{(salary.overtimePay ?? 0).toLocaleString("en-IN")}</span></div>
                </>
              )}
              <div><span className="text-slate-400 block uppercase">Base salary</span><span className="font-bold text-slate-700">₹{salary.baseSalary.toLocaleString("en-IN")}</span></div>
              {!!salary.incentivePlanLabel && (
                <>
                  <div><span className="text-slate-400 block uppercase">{salary.incentivePlanLabel} sales</span><span className="font-bold text-slate-700">₹{(salary.monthSales ?? 0).toLocaleString("en-IN")} <span className={`text-[10px] font-semibold ${salary.targetAchieved ? "text-green-700" : "text-amber-600"}`}>({salary.targetAchieved ? "target hit" : `target ₹${(salary.monthlyTarget ?? 0).toLocaleString("en-IN")}`})</span></span></div>
                  <div><span className="text-slate-400 block uppercase">Sales incentive ({salary.incentivePct}%)</span><span className="font-bold text-purple-700">₹{(salary.incentiveAmount ?? 0).toLocaleString("en-IN")}</span></div>
                </>
              )}
              {(!!salary.petrolAllowance || !!salary.simAllowance) && (
                <div><span className="text-slate-400 block uppercase">Allowances</span><span className="font-bold text-slate-700">₹{((salary.petrolAllowance ?? 0) + (salary.simAllowance ?? 0)).toLocaleString("en-IN")} <span className="text-[10px] text-slate-400">(petrol + SIM)</span></span></div>
              )}
              <div><span className="text-slate-400 block uppercase">{salary.approvalRequired ? "Payable (blocked)" : "Payable salary"}</span><span className={`font-bold ${salary.approvalRequired ? "text-amber-600" : "text-blue-700"}`}>₹{salary.salary.toLocaleString("en-IN")}</span></div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              {!showAdHocLeave ? (
                <button onClick={() => setShowAdHocLeave(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">
                  <Plus size={13} /> Add ad-hoc leave (marriage, family function, etc.)
                </button>
              ) : (
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block">Date</label>
                    <DateInput value={adHocLeave.date} onChange={(e) => setAdHocLeave({ ...adHocLeave, date: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block">Days</label>
                    <input type="number" step="0.5" value={adHocLeave.days} onChange={(e) => setAdHocLeave({ ...adHocLeave, days: e.target.value })} className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block">Reason</label>
                    <input value={adHocLeave.reason} onChange={(e) => setAdHocLeave({ ...adHocLeave, reason: e.target.value })} placeholder='e.g. "Marriage", "Family function"' className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  <button onClick={handleAddAdHocLeave} disabled={savingLeave || !adHocLeave.date} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">
                    {savingLeave ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                  </button>
                  <button onClick={() => setShowAdHocLeave(false)} className="text-xs text-slate-400">Cancel</button>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1">Recorded as leave type OTHER — reduces required hours the same way any other leave does, then the salary above recalculates.</p>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          {loadingGrid ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 uppercase border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Time In</th>
                  <th className="py-2 px-2">Time Out</th>
                  <th className="py-2 px-2">Hours</th>
                  <th className="py-2 px-2">Absent</th>
                  <th className="py-2 px-2">Paid Leave</th>
                  <th className="py-2 px-2">Note</th>
                  <th className="py-2 px-2">Source</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const highlight = r.needsReview || (!r.timeIn && !r.timeOut && !r.isAbsent && !r.isPaidLeave && r.source == null);
                  return (
                    <tr key={r.date} className={`border-b border-slate-50 ${highlight ? "bg-amber-50" : ""}`}>
                      <td className="py-1.5 px-2 whitespace-nowrap">{r.day} {DOW_LABEL[r.dow]}</td>
                      <td className="py-1.5 px-2">
                        <input value={r.timeIn ?? ""} onChange={(e) => updateRow(r.date, { timeIn: e.target.value })} placeholder="HH:MM" className="w-16 border border-slate-200 rounded px-1 py-0.5" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input value={r.timeOut ?? ""} onChange={(e) => updateRow(r.date, { timeOut: e.target.value })} placeholder="HH:MM" className="w-16 border border-slate-200 rounded px-1 py-0.5" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input type="number" step="0.25" value={r.hoursWorked} onChange={(e) => updateRow(r.date, { hoursWorked: Number(e.target.value) })} className="w-16 border border-slate-200 rounded px-1 py-0.5" />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input type="checkbox" checked={r.isAbsent} onChange={(e) => updateRow(r.date, { isAbsent: e.target.checked })} />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input type="checkbox" checked={r.isPaidLeave} onChange={(e) => updateRow(r.date, { isPaidLeave: e.target.checked })} />
                      </td>
                      <td className="py-1.5 px-2">
                        <input value={r.note ?? ""} onChange={(e) => updateRow(r.date, { note: e.target.value })} className="w-32 border border-slate-200 rounded px-1 py-0.5" />
                      </td>
                      <td className="py-1.5 px-2 text-slate-400">{r.source ?? "—"}</td>
                      <td className="py-1.5 px-2">
                        <button onClick={() => saveRow(r)} disabled={savingDate === r.date} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-800 text-white rounded px-2 py-1 disabled:opacity-50">
                          {savingDate === r.date ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-slate-400">Rows highlighted in amber have no punch recorded at all — fill in a time or tick Absent/Paid Leave, then save.</p>
      </div>
    </DashboardShell>
  );
}
