"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getStoredUser } from "@/lib/auth";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import {
  Briefcase, Plus, Save, ArrowLeft, Trash2, Loader2, Target,
  CalendarDays, ShieldAlert,
} from "lucide-react";

type EmployeeListItem = {
  id: string; employeeCode: string; fullName: string; designation: string;
  department: string | null; status: string; baseSalary: string | number;
  mobileNumber: string | null; dateOfJoining: string | null;
  _count?: { kras: number; leaveEntries: number };
};

type EmployeeDetail = EmployeeListItem & {
  biometricId: string | null; workingHoursPerDay: string | number; paidLeavePerMonth: string | number;
  annualPaidLeaveQuota: string | number | null; dateOfBirth: string | null; gender: string | null;
  address: string | null; alternateMobile: string | null; emergencyContactName: string | null;
  emergencyContactPhone: string | null; idProofType: string | null; idProofNumber: string | null;
  bankAccountNumber: string | null; bankIfsc: string | null; notes: string | null;
  kras: Kra[]; leaveEntries: LeaveEntry[];
};

type Kra = { id: string; type: "KRA" | "RESPONSIBILITY"; title: string; description: string | null; targetMetric: string | null };
type LeaveEntry = { id: string; date: string; days: string | number; type: string; reason: string | null; recordedBy?: { fullName: string } | null };

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"];
const LEAVE_TYPES = ["PAID", "UNPAID", "SICK", "CASUAL", "HALF_DAY", "OTHER"];

const emptyForm = {
  employeeCode: "", biometricId: "", fullName: "", designation: "", department: "",
  status: "ACTIVE", baseSalary: "", workingHoursPerDay: "8", paidLeavePerMonth: "2",
  annualPaidLeaveQuota: "", dateOfJoining: "", dateOfBirth: "", gender: "", address: "",
  mobileNumber: "", alternateMobile: "", emergencyContactName: "", emergencyContactPhone: "",
  idProofType: "", idProofNumber: "", bankAccountNumber: "", bankIfsc: "", notes: "",
};

function fmtMoney(n: string | number | null | undefined) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function HrPage() {
  const me = getStoredUser();
  const canAccess = me?.role === "ADMIN" || me?.role === "ACCOUNTS";

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [kraForm, setKraForm] = useState({ type: "KRA", title: "", description: "" });
  const [leaveForm, setLeaveForm] = useState({ date: "", type: "PAID", days: "1", reason: "" });
  const [leaveBalance, setLeaveBalance] = useState<{ quota: number; takenTotal: number; balance: number } | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const data = await apiFetch<EmployeeListItem[]>(`/hr/employees?status=${statusFilter}`, {}, setError);
    if (data) setEmployees(data);
    setLoadingList(false);
  }, [statusFilter]);

  useEffect(() => { if (canAccess) void loadList(); }, [canAccess, loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setError(null);
    const data = await apiFetch<EmployeeDetail>(`/hr/employees/${id}`, {}, setError);
    if (data) {
      setDetail(data);
      setForm({
        employeeCode: data.employeeCode, biometricId: data.biometricId ?? "", fullName: data.fullName,
        designation: data.designation, department: data.department ?? "", status: data.status,
        baseSalary: String(data.baseSalary ?? ""), workingHoursPerDay: String(data.workingHoursPerDay ?? "8"),
        paidLeavePerMonth: String(data.paidLeavePerMonth ?? "2"),
        annualPaidLeaveQuota: data.annualPaidLeaveQuota != null ? String(data.annualPaidLeaveQuota) : "",
        dateOfJoining: data.dateOfJoining ? data.dateOfJoining.slice(0, 10) : "",
        dateOfBirth: data.dateOfBirth ? data.dateOfBirth.slice(0, 10) : "",
        gender: data.gender ?? "", address: data.address ?? "", mobileNumber: data.mobileNumber ?? "",
        alternateMobile: data.alternateMobile ?? "", emergencyContactName: data.emergencyContactName ?? "",
        emergencyContactPhone: data.emergencyContactPhone ?? "", idProofType: data.idProofType ?? "",
        idProofNumber: data.idProofNumber ?? "", bankAccountNumber: data.bankAccountNumber ?? "",
        bankIfsc: data.bankIfsc ?? "", notes: data.notes ?? "",
      });
    }
    const bal = await apiFetch<{ quota: number; takenTotal: number; balance: number }>(
      `/hr/employees/${id}/leave-balance`, {}, undefined,
    );
    setLeaveBalance(bal);
  }, []);

  const openCreate = async () => {
    setForm(emptyForm);
    const suggestion = await apiFetch<{ code: string }>("/hr/employees/next-code", {}, undefined);
    if (suggestion) setForm((f) => ({ ...f, employeeCode: suggestion.code }));
    setDetail(null);
    setSelectedId(null);
    setMode("create");
  };

  const openEdit = (id: string) => {
    setSelectedId(id);
    setMode("edit");
    void loadDetail(id);
  };

  const backToList = () => {
    setMode("list");
    setSelectedId(null);
    setDetail(null);
    void loadList();
  };

  const handleSave = async () => {
    if (!form.employeeCode.trim() || !form.fullName.trim() || !form.designation.trim() || !form.baseSalary) {
      setError("Employee code, name, designation and base salary are required.");
      return;
    }
    setSaving(true);
    const payload: any = {
      ...form,
      baseSalary: Number(form.baseSalary),
      workingHoursPerDay: Number(form.workingHoursPerDay || 8),
      paidLeavePerMonth: Number(form.paidLeavePerMonth || 2),
      annualPaidLeaveQuota: form.annualPaidLeaveQuota ? Number(form.annualPaidLeaveQuota) : null,
      biometricId: form.biometricId || null,
      dateOfJoining: form.dateOfJoining || null,
      dateOfBirth: form.dateOfBirth || null,
    };
    if (mode === "create") {
      const created = await apiMutate<EmployeeDetail>("/hr/employees", "POST", payload, setError);
      setSaving(false);
      if (created) {
        setMode("edit");
        setSelectedId(created.id);
        void loadDetail(created.id);
      }
    } else if (selectedId) {
      const updated = await apiMutate<EmployeeDetail>(`/hr/employees/${selectedId}`, "PUT", payload, setError);
      setSaving(false);
      if (updated) void loadDetail(selectedId);
    }
  };

  const handleAddKra = async () => {
    if (!selectedId || !kraForm.title.trim()) return;
    const res = await apiMutate(`/hr/employees/${selectedId}/kras`, "POST", kraForm, setError);
    if (res) {
      setKraForm({ type: "KRA", title: "", description: "" });
      void loadDetail(selectedId);
    }
  };

  const handleDeleteKra = async (kraId: string) => {
    if (!selectedId) return;
    const res = await apiMutate(`/hr/kras/${kraId}`, "DELETE", undefined, setError);
    if (res !== null) void loadDetail(selectedId);
  };

  const handleAddLeave = async () => {
    if (!selectedId || !leaveForm.date) return;
    const res = await apiMutate(`/hr/employees/${selectedId}/leaves`, "POST", {
      ...leaveForm, days: Number(leaveForm.days || 1),
    }, setError);
    if (res) {
      setLeaveForm({ date: "", type: "PAID", days: "1", reason: "" });
      void loadDetail(selectedId);
    }
  };

  const handleDeleteLeave = async (entryId: string) => {
    if (!selectedId) return;
    const res = await apiMutate(`/hr/leaves/${entryId}`, "DELETE", undefined, setError);
    if (res !== null) void loadDetail(selectedId);
  };

  if (!canAccess) {
    return (
      <DashboardShell>
        <div className="p-6 max-w-2xl mx-auto text-center text-slate-500">
          <ShieldAlert className="mx-auto mb-2" />
          HR is restricted to admin/accounts.
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Briefcase size={22} /> HR — Employee Master
            </h1>
            <p className="text-sm text-slate-500">Registration, KRA/responsibilities, leave ledger — the source Salary & Attendance read from.</p>
          </div>
          {mode === "list" ? (
            <button onClick={openCreate} className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700">
              <Plus size={14} /> New Employee
            </button>
          ) : (
            <button onClick={backToList} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg px-3 py-2 hover:bg-slate-200">
              <ArrowLeft size={14} /> Back to list
            </button>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

        {mode === "list" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="">All</option>
              </select>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
              {loadingList ? (
                <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-200 bg-slate-50">
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Designation</th>
                      <th className="py-2 px-3">Department</th>
                      <th className="py-2 px-3 text-right">Salary</th>
                      <th className="py-2 px-3">Mobile</th>
                      <th className="py-2 px-3">Joined</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.id} onClick={() => openEdit(e.id)} className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer">
                        <td className="py-2 px-3 font-semibold">{e.employeeCode}</td>
                        <td className="py-2 px-3">{e.fullName}</td>
                        <td className="py-2 px-3">{e.designation}</td>
                        <td className="py-2 px-3">{e.department ?? "—"}</td>
                        <td className="py-2 px-3 text-right">{fmtMoney(e.baseSalary)}</td>
                        <td className="py-2 px-3">{e.mobileNumber ?? "—"}</td>
                        <td className="py-2 px-3">{e.dateOfJoining ? new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs font-semibold bg-slate-100 rounded-full px-2 py-0.5">{e.status}</span>
                        </td>
                      </tr>
                    ))}
                    {employees.length === 0 && (
                      <tr><td colSpan={8} className="p-6 text-center text-slate-400">No employees yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {(mode === "create" || mode === "edit") && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Master record</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Employee Code *"><input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Biometric / Machine ID"><input value={form.biometricId} onChange={(e) => setForm({ ...form, biometricId: e.target.value })} placeholder="e.g. 1, 2..." className={INPUT_CLS} /></Field>
                <Field label="Full Name *"><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Designation *"><input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="SELLER, DESIGNER..." className={INPUT_CLS} /></Field>
                <Field label="Department"><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT_CLS}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Base Salary (monthly) *"><input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Working Hours / Day"><input type="number" value={form.workingHoursPerDay} onChange={(e) => setForm({ ...form, workingHoursPerDay: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Paid Leave / Month"><input type="number" value={form.paidLeavePerMonth} onChange={(e) => setForm({ ...form, paidLeavePerMonth: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Annual Leave Quota"><input type="number" value={form.annualPaidLeaveQuota} onChange={(e) => setForm({ ...form, annualPaidLeaveQuota: e.target.value })} placeholder={`${Number(form.paidLeavePerMonth || 2) * 12} (default)`} className={INPUT_CLS} /></Field>
                <Field label="Date of Joining"><input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Date of Birth"><input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Gender"><input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Mobile"><input value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Alternate Mobile"><input value={form.alternateMobile} onChange={(e) => setForm({ ...form, alternateMobile: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Emergency Contact Name"><input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Emergency Contact Phone"><input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="ID Proof Type"><input value={form.idProofType} onChange={(e) => setForm({ ...form, idProofType: e.target.value })} placeholder="Aadhaar, PAN..." className={INPUT_CLS} /></Field>
                <Field label="ID Proof Number"><input value={form.idProofNumber} onChange={(e) => setForm({ ...form, idProofNumber: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Bank Account Number"><input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Bank IFSC"><input value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} className={INPUT_CLS} /></Field>
              </div>
              <Field label="Address" full><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className={INPUT_CLS} /></Field>
              <Field label="Notes" full><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={INPUT_CLS} /></Field>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>

            {mode === "edit" && detail && (
              <>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Target size={16} /> KRA & Responsibilities</h2>
                  <div className="space-y-2">
                    {detail.kras.map((k) => (
                      <div key={k.id} className="flex items-start justify-between gap-2 border border-slate-100 rounded-lg p-2">
                        <div>
                          <span className="text-xs font-semibold bg-slate-100 rounded-full px-2 py-0.5 mr-2">{k.type}</span>
                          <span className="font-semibold text-sm">{k.title}</span>
                          {k.description && <div className="text-xs text-slate-500 mt-0.5">{k.description}</div>}
                        </div>
                        <button onClick={() => handleDeleteKra(k.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {detail.kras.length === 0 && <div className="text-xs text-slate-400">None recorded yet.</div>}
                  </div>
                  <div className="flex flex-wrap gap-2 items-end pt-2 border-t border-slate-100">
                    <select value={kraForm.type} onChange={(e) => setKraForm({ ...kraForm, type: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
                      <option value="KRA">KRA</option>
                      <option value="RESPONSIBILITY">Responsibility</option>
                    </select>
                    <input value={kraForm.title} onChange={(e) => setKraForm({ ...kraForm, title: e.target.value })} placeholder="Title" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[140px]" />
                    <input value={kraForm.description} onChange={(e) => setKraForm({ ...kraForm, description: e.target.value })} placeholder="Description (optional)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[160px]" />
                    <button onClick={handleAddKra} className="text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5">Add</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><CalendarDays size={16} /> Leave Ledger</h2>
                  {leaveBalance && (
                    <div className="text-xs text-slate-600 flex gap-4">
                      <span>Annual quota: <b>{leaveBalance.quota}</b></span>
                      <span>Taken this year: <b>{leaveBalance.takenTotal}</b></span>
                      <span>Balance: <b className={leaveBalance.balance <= 0 ? "text-red-600" : "text-green-700"}>{leaveBalance.balance}</b></span>
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="text-left py-1.5 pr-2">Date</th>
                        <th className="text-left py-1.5 pr-2">Type</th>
                        <th className="text-right py-1.5 pr-2">Days</th>
                        <th className="text-left py-1.5 pr-2">Reason</th>
                        <th className="text-left py-1.5 pr-2">Recorded by</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.leaveEntries.map((l) => (
                        <tr key={l.id} className="border-b border-slate-50">
                          <td className="py-1.5 pr-2">{new Date(l.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                          <td className="py-1.5 pr-2">{l.type}</td>
                          <td className="py-1.5 pr-2 text-right">{l.days}</td>
                          <td className="py-1.5 pr-2">{l.reason ?? "—"}</td>
                          <td className="py-1.5 pr-2">{l.recordedBy?.fullName ?? "—"}</td>
                          <td className="py-1.5"><button onClick={() => handleDeleteLeave(l.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={12} /></button></td>
                        </tr>
                      ))}
                      {detail.leaveEntries.length === 0 && (
                        <tr><td colSpan={6} className="py-3 text-center text-slate-400">No leave recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-2 items-end pt-2 border-t border-slate-100">
                    <input type="date" value={leaveForm.date} onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <select value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
                      {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="number" step="0.5" value={leaveForm.days} onChange={(e) => setLeaveForm({ ...leaveForm, days: e.target.value })} className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Reason (optional)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[140px]" />
                    <button onClick={handleAddLeave} className="text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5">Add</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

const INPUT_CLS = "w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
