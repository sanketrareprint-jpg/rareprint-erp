"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getStoredUser } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import {
  CalendarClock, Upload, Loader2, Save, ShieldAlert, AlertTriangle, CheckCircle2,
} from "lucide-react";

type EmployeeListItem = { id: string; employeeCode: string; fullName: string; designation: string; status: string };

type DayRow = {
  date: string; day: number; dow: number; timeIn: string | null; timeOut: string | null;
  hoursWorked: number; isAbsent: boolean; isPaidLeave: boolean; source: string | null;
  note: string | null; needsReview: boolean;
};
type MonthGrid = { employeeId: string; employeeCode: string; fullName: string; workingHoursPerDay: number; year: number; month: number; days: DayRow[] };

type SalaryCalc = {
  workingDays: number; leaveDays: number; netDays: number; requiredHours: number;
  hoursWorked: number; absentHours: number; baseSalary: number; salary: number;
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

  useEffect(() => {
    if (!canAccess) return;
    void apiFetch<EmployeeListItem[]>("/hr/employees?status=ACTIVE", {}, setError).then((data) => {
      if (data) {
        setEmployees(data);
        if (!employeeId && data.length) setEmployeeId(data[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

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
        </div>

        {salary && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-5 text-xs">
            <div><span className="text-slate-400 block uppercase">Required hrs</span><span className="font-bold text-slate-700">{salary.requiredHours}</span></div>
            <div><span className="text-slate-400 block uppercase">Worked hrs</span><span className="font-bold text-slate-700">{salary.hoursWorked}</span></div>
            <div><span className="text-slate-400 block uppercase">Shortfall/Excess</span><span className={`font-bold ${salary.absentHours < 0 ? "text-red-600" : "text-green-700"}`}>{salary.absentHours}</span></div>
            <div><span className="text-slate-400 block uppercase">Leave days</span><span className="font-bold text-slate-700">{salary.leaveDays}</span></div>
            <div><span className="text-slate-400 block uppercase">Base salary</span><span className="font-bold text-slate-700">₹{salary.baseSalary.toLocaleString("en-IN")}</span></div>
            <div><span className="text-slate-400 block uppercase">Calculated salary</span><span className="font-bold text-blue-700">₹{salary.salary.toLocaleString("en-IN")}</span></div>
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
