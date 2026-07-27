"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getStoredUser, getAuthHeaders } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import {
  Briefcase, Plus, Save, ArrowLeft, Trash2, Loader2, Target,
  CalendarDays, ShieldAlert, CheckCircle2, AlertTriangle, Camera,
  FileSignature, ChevronDown, ChevronUp, Send,
} from "lucide-react";

// Only Sanket can approve a master record for payroll — checked by email,
// mirrors backend SUPERADMIN_EMAIL in hr.service.ts.
const SUPERADMIN_EMAIL = "sanket.rareprint@gmail.com";

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
  bankAccountNumber: string | null; bankIfsc: string | null; idProofDocUrl: string | null; notes: string | null;
  email: string | null; photoUrl: string | null; overtimeAllowed: boolean;
  masterDataApproved: boolean; approvedAt: string | null;
  agreementSentAt: string | null; agreementAcceptedAt: string | null; agreementSignatureName: string | null;
  kras: Kra[]; leaveEntries: LeaveEntry[];
};

type Kra = { id: string; type: "KRA" | "RESPONSIBILITY"; title: string; description: string | null; targetMetric: string | null };
type LeaveEntry = { id: string; date: string; days: string | number; type: string; reason: string | null; recordedBy?: { fullName: string } | null };
type CompanyTerm = { id: string; version: number; title: string; content: string; isActive: boolean; createdAt: string };

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"];
const LEAVE_TYPES = ["PAID", "UNPAID", "SICK", "CASUAL", "HALF_DAY", "OTHER"];
const DEPARTMENTS = ["SALES", "PRODUCTION", "DESIGN", "OFFICE/ADMIN", "DISPATCH", "ACCOUNTS"];
const DESIGNATIONS = ["SALES MANAGER", "PRODUCTION MANAGER", "DESIGNER", "SELLER", "HELPER", "OFFICE BOY", "TECHNOLOGY"];
const GENDERS = ["MALE", "FEMALE", "OTHER"];
const ID_PROOF_TYPES = ["AADHAR", "PAN", "VOTER ID", "DRIVING LICENSE", "PASSPORT"];
const RESPONSIBILITY_TITLES = ["SALES TARGET", "CUSTOMER HANDLING", "MACHINE OPERATION", "DESIGN QUALITY", "DISPATCH ACCURACY", "OFFICE ADMIN", "TEAM MANAGEMENT"];

const emptyForm = {
  employeeCode: "", biometricId: "", fullName: "", designation: "", department: "",
  status: "ACTIVE", baseSalary: "", workingHoursPerDay: "8", paidLeavePerMonth: "2",
  annualPaidLeaveQuota: "", dateOfJoining: "", dateOfBirth: "", gender: "", address: "",
  mobileNumber: "", alternateMobile: "", emergencyContactName: "", emergencyContactPhone: "",
  idProofType: "", idProofNumber: "", bankAccountNumber: "", bankIfsc: "", notes: "",
  email: "", overtimeAllowed: false,
};

function fmtMoney(n: string | number | null | undefined) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function fmtDateTime(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function HrPage() {
  const me = getStoredUser();
  const canAccess = me?.role === "ADMIN" || me?.role === "ACCOUNTS";
  const isSuperAdmin = me?.email === SUPERADMIN_EMAIL;

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
  const [respOtherMode, setRespOtherMode] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ date: "", type: "PAID", days: "1", reason: "" });
  const [leaveBalance, setLeaveBalance] = useState<{ quota: number; takenTotal: number; balance: number } | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingAgreement, setSendingAgreement] = useState(false);

  const [termsList, setTermsList] = useState<CompanyTerm[]>([]);
  const [showTermsPanel, setShowTermsPanel] = useState(false);
  const [showTermsEditor, setShowTermsEditor] = useState(false);
  const [termsForm, setTermsForm] = useState({ title: "", content: "" });
  const [savingTerms, setSavingTerms] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const data = await apiFetch<EmployeeListItem[]>(`/hr/employees?status=${statusFilter}`, {}, setError);
    if (data) setEmployees(data);
    setLoadingList(false);
  }, [statusFilter]);

  useEffect(() => { if (canAccess) void loadList(); }, [canAccess, loadList]);

  const loadTerms = useCallback(async () => {
    const data = await apiFetch<CompanyTerm[]>("/hr/terms", {}, undefined);
    if (data) setTermsList(data);
  }, []);

  useEffect(() => { if (canAccess) void loadTerms(); }, [canAccess, loadTerms]);

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
        email: data.email ?? "", overtimeAllowed: !!data.overtimeAllowed,
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
      email: form.email || null,
      overtimeAllowed: !!form.overtimeAllowed,
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

  const handlePhotoUpload = async () => {
    if (!photoFile || !selectedId) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      const { "Content-Type": _ct, ...uploadHeaders } = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/hr/employees/${selectedId}/photo`, { method: "POST", headers: uploadHeaders, body: formData });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || res.statusText);
      }
      setPhotoFile(null);
      void loadDetail(selectedId);
    } catch (err: any) {
      setError(err.message || "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleApproval = async (approve: boolean) => {
    if (!selectedId) return;
    setApproving(true);
    const res = await apiMutate(`/hr/employees/${selectedId}/${approve ? "approve" : "unapprove"}`, "PUT", undefined, setError);
    setApproving(false);
    if (res) void loadDetail(selectedId);
  };

  const handleSendAgreement = async () => {
    if (!selectedId) return;
    setSendingAgreement(true);
    const res = await apiMutate<{ sent: boolean }>(`/hr/employees/${selectedId}/send-agreement`, "POST", undefined, setError);
    setSendingAgreement(false);
    if (res) void loadDetail(selectedId);
  };

  const handleSaveTerms = async () => {
    if (!termsForm.title.trim() || !termsForm.content.trim()) return;
    setSavingTerms(true);
    const res = await apiMutate<CompanyTerm>("/hr/terms", "POST", termsForm, setError);
    setSavingTerms(false);
    if (res) {
      setTermsForm({ title: "", content: "" });
      setShowTermsEditor(false);
      void loadTerms();
    }
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

  const activeTerm = termsList.find((t) => t.isActive) ?? null;

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
            <button onClick={openCreate} className="inline-flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-3 py-2 hover:bg-brand-700">
              <Plus size={14} /> New Employee
            </button>
          ) : (
            <button onClick={backToList} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg px-3 py-2 hover:bg-slate-200">
              <ArrowLeft size={14} /> Back to list
            </button>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

        {/* Company Terms & Conditions — used by the digital HR agreement link */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowTermsPanel((v) => !v)} className="w-full flex items-center justify-between p-4 text-left">
            <span className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <FileSignature size={16} /> Terms & Conditions {activeTerm && <span className="text-xs font-normal normal-case text-slate-400">— current: v{activeTerm.version} "{activeTerm.title}"</span>}
            </span>
            {showTermsPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showTermsPanel && (
            <div className="p-4 pt-0 space-y-3 border-t border-slate-100">
              {!activeTerm && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">No Terms & Conditions set up yet — add one below before sending any agreement links.</div>}
              {activeTerm && (
                <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">{activeTerm.content}</div>
              )}
              {termsList.length > 1 && (
                <div className="text-xs text-slate-400">Previous versions: {termsList.filter((t) => !t.isActive).map((t) => `v${t.version}`).join(", ")}</div>
              )}
              {!showTermsEditor ? (
                <button onClick={() => { setTermsForm({ title: activeTerm?.title ?? "", content: activeTerm?.content ?? "" }); setShowTermsEditor(true); }} className="text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5">
                  {activeTerm ? "Save New Version" : "Add Terms & Conditions"}
                </button>
              ) : (
                <div className="space-y-2 border-t border-slate-100 pt-2">
                  <input value={termsForm.title} onChange={(e) => setTermsForm({ ...termsForm, title: e.target.value })} placeholder="Title, e.g. RarePrint Employee Agreement" className={INPUT_CLS} />
                  <textarea value={termsForm.content} onChange={(e) => setTermsForm({ ...termsForm, content: e.target.value })} rows={6} placeholder="Full terms & conditions text shown to the employee..." className={INPUT_CLS} />
                  <div className="flex gap-2">
                    <button onClick={handleSaveTerms} disabled={savingTerms} className="inline-flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50">
                      {savingTerms ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Publish as new version
                    </button>
                    <button onClick={() => setShowTermsEditor(false)} className="text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg px-3 py-1.5">Cancel</button>
                  </div>
                  <p className="text-[11px] text-slate-400">Publishing creates a new version and becomes the one sent on future agreement links; past acceptances stay tied to the version the employee actually saw.</p>
                </div>
              )}
            </div>
          )}
        </div>

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
                        <td className="py-2 px-3">{fmtDate(e.dateOfJoining)}</td>
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
          <div className="space-y-4" key={mode === "edit" ? selectedId ?? "edit" : "create"}>
            {mode === "edit" && detail && (
              <div className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${detail.masterDataApproved ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="text-sm">
                  {detail.masterDataApproved ? (
                    <span className="text-green-800 font-semibold flex items-center gap-1.5"><CheckCircle2 size={16} /> Approved for payroll{detail.approvedAt ? ` on ${fmtDate(detail.approvedAt)}` : ""}</span>
                  ) : (
                    <span className="text-amber-800 font-semibold flex items-center gap-1.5"><AlertTriangle size={16} /> Pending Sanket's approval — salary can't be generated until approved</span>
                  )}
                </div>
                {isSuperAdmin ? (
                  <button onClick={() => handleApproval(!detail.masterDataApproved)} disabled={approving}
                    className={`inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50 ${detail.masterDataApproved ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-green-600 text-white hover:bg-green-700"}`}>
                    {approving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    {detail.masterDataApproved ? "Revoke Approval" : "Approve for Payroll"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Only Sanket can approve/revoke.</span>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Master record</h2>

              {selectedId && (
                <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                  <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                    {detail?.photoUrl ? <img src={detail.photoUrl} alt="Employee" className="w-full h-full object-cover" /> : <Camera size={20} className="text-slate-300" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="text-xs" />
                    <button onClick={handlePhotoUpload} disabled={!photoFile || uploadingPhoto} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-800 text-white rounded-lg px-2.5 py-1.5 disabled:opacity-50">
                      {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Upload photo
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Employee Code *"><input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Biometric / Machine ID"><input value={form.biometricId} onChange={(e) => setForm({ ...form, biometricId: e.target.value })} placeholder="e.g. 1, 2..." className={INPUT_CLS} /></Field>
                <Field label="Full Name *"><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT_CLS} /></Field>
                <DropdownField label="Designation" required value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} options={DESIGNATIONS} otherPlaceholder="Type designation" />
                <DropdownField label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} options={DEPARTMENTS} otherPlaceholder="Type department" />
                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT_CLS}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Base Salary (monthly) *"><input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Working Hours / Day"><input type="number" value={form.workingHoursPerDay} onChange={(e) => setForm({ ...form, workingHoursPerDay: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Paid Leave / Month"><input type="number" value={form.paidLeavePerMonth} onChange={(e) => setForm({ ...form, paidLeavePerMonth: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Annual Leave Quota"><input type="number" value={form.annualPaidLeaveQuota} onChange={(e) => setForm({ ...form, annualPaidLeaveQuota: e.target.value })} placeholder={`${Number(form.paidLeavePerMonth || 2) * 12} (default)`} className={INPUT_CLS} /></Field>
                <Field label="Overtime Allowed">
                  <label className="flex items-center gap-2 h-[34px] text-sm">
                    <input type="checkbox" checked={form.overtimeAllowed} onChange={(e) => setForm({ ...form, overtimeAllowed: e.target.checked })} className="w-4 h-4" />
                    Paid for hours beyond required, same hourly rate
                  </label>
                </Field>
                <Field label="Date of Joining"><input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Date of Birth"><input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className={INPUT_CLS} /></Field>
                <DropdownField label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} options={GENDERS} otherPlaceholder="Type gender" />
                <Field label="Mobile"><input value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Alternate Mobile"><input value={form.alternateMobile} onChange={(e) => setForm({ ...form, alternateMobile: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Email (for HR agreement link)"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="employee@example.com" className={INPUT_CLS} /></Field>
                <Field label="Emergency Contact Name"><input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Emergency Contact Phone"><input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className={INPUT_CLS} /></Field>
                <DropdownField label="ID Proof Type" value={form.idProofType} onChange={(v) => setForm({ ...form, idProofType: v })} options={ID_PROOF_TYPES} otherPlaceholder="Type ID proof type" />
                <Field label="ID Proof Number"><input value={form.idProofNumber} onChange={(e) => setForm({ ...form, idProofNumber: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Bank Account Number"><input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} className={INPUT_CLS} /></Field>
                <Field label="Bank IFSC"><input value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} className={INPUT_CLS} /></Field>
              </div>
              <Field label="Address" full><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className={INPUT_CLS} /></Field>
              <Field label="Notes" full><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={INPUT_CLS} /></Field>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-3 py-2 hover:bg-brand-700 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
              {mode === "edit" && detail && !detail.masterDataApproved && (
                <p className="text-[11px] text-amber-600">Saving changes to pay-related fields will re-lock this record until Sanket approves it again.</p>
              )}
            </div>

            {mode === "edit" && detail && (
              <>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><FileSignature size={16} /> Digital HR Agreement</h2>
                  <div className="text-xs text-slate-600">
                    {detail.agreementAcceptedAt ? (
                      <div className="space-y-1">
                        <span className="text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 size={14} /> Accepted {fmtDateTime(detail.agreementAcceptedAt)} — signed "{detail.agreementSignatureName}"</span>
                        {detail.idProofDocUrl && (
                          <a href={detail.idProofDocUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline text-xs font-semibold inline-block">View uploaded ID proof</a>
                        )}
                      </div>
                    ) : detail.agreementSentAt ? (
                      <span className="text-amber-700 font-semibold flex items-center gap-1"><AlertTriangle size={14} /> Sent {fmtDateTime(detail.agreementSentAt)} — awaiting acceptance</span>
                    ) : (
                      <span className="text-slate-400">Not sent yet.</span>
                    )}
                  </div>
                  <button onClick={handleSendAgreement} disabled={sendingAgreement || !detail.email || !activeTerm}
                    className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">
                    {sendingAgreement ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {detail.agreementSentAt ? "Re-send Agreement" : "Send Agreement"}
                  </button>
                  {!detail.email && <p className="text-[11px] text-red-600">Add an email above first — the agreement link is emailed, no login needed on the employee's end.</p>}
                  {!activeTerm && <p className="text-[11px] text-red-600">Set up Terms & Conditions above first.</p>}
                </div>

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
                    <select value={kraForm.type} onChange={(e) => { setKraForm({ ...kraForm, type: e.target.value, title: "" }); setRespOtherMode(false); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
                      <option value="KRA">KRA</option>
                      <option value="RESPONSIBILITY">Responsibility</option>
                    </select>
                    {kraForm.type === "RESPONSIBILITY" ? (
                      respOtherMode ? (
                        <input value={kraForm.title} onChange={(e) => setKraForm({ ...kraForm, title: e.target.value })} placeholder="Type responsibility" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[140px]" />
                      ) : (
                        <select value={kraForm.title}
                          onChange={(e) => { if (e.target.value === "__OTHER__") { setRespOtherMode(true); setKraForm({ ...kraForm, title: "" }); } else setKraForm({ ...kraForm, title: e.target.value }); }}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[140px]">
                          <option value="">— Select responsibility —</option>
                          {RESPONSIBILITY_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                          <option value="__OTHER__">Other (type manually)</option>
                        </select>
                      )
                    ) : (
                      <input value={kraForm.title} onChange={(e) => setKraForm({ ...kraForm, title: e.target.value })} placeholder="Title" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[140px]" />
                    )}
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
                          <td className="py-1.5 pr-2">{fmtDate(l.date)}</td>
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
                    <input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder='Reason (e.g. "Marriage", "Family function")' className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[160px]" />
                    <button onClick={handleAddLeave} className="text-xs font-semibold bg-slate-800 text-white rounded-lg px-3 py-1.5">Add</button>
                  </div>
                  <p className="text-[11px] text-slate-400">Use type "OTHER" for one-off, non-predefined leave (marriage, a family function, etc.) — it's included in the salary calculation the same as any other leave.</p>
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

/** Dropdown backed by a fixed option list, with an "Other" escape hatch that
 *  reveals a free-text input — keeps existing free-text data (or anything
 *  not in the list) editable instead of forcing it into the closest option. */
function DropdownField({
  label, value, onChange, options, required, otherPlaceholder,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
  required?: boolean; otherPlaceholder?: string;
}) {
  const isKnown = value === "" || options.includes(value);
  const [customMode, setCustomMode] = useState(!isKnown);
  return (
    <Field label={label + (required ? " *" : "")}>
      {customMode ? (
        <div className="flex gap-1">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={otherPlaceholder} className={INPUT_CLS} />
          <button type="button" onClick={() => { setCustomMode(false); onChange(""); }} title="Pick from list instead" className="text-xs text-blue-600 whitespace-nowrap px-1">list</button>
        </div>
      ) : (
        <select
          value={options.includes(value) ? value : ""}
          onChange={(e) => {
            if (e.target.value === "__OTHER__") { setCustomMode(true); onChange(""); }
            else onChange(e.target.value);
          }}
          className={INPUT_CLS}
        >
          <option value="">— Select —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__OTHER__">Other (type manually)</option>
        </select>
      )}
    </Field>
  );
}
