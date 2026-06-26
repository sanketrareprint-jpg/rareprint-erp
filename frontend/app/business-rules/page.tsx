"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Shield, ShoppingCart, DollarSign, Truck, Factory, Settings,
  Plus, Pencil, Trash2, X, Save, FlaskConical, ChevronDown, Loader2,
  AlertTriangle, CheckCircle2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Severity = "CRITICAL" | "HIGH" | "MEDIUM";
type RuleModule = "ORDERS" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH" | "SYSTEM";

interface BusinessRule {
  id: string;
  ruleCode: string;
  module: RuleModule;
  title: string;
  description: string;
  example: string;
  severity: Severity;
  testedBy?: string;
  active: boolean;
  createdAt: string;
}

// ─── Module & severity meta ───────────────────────────────────────────────────
const MODULE_META: Record<RuleModule, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  ORDERS:     { label: "Orders",     icon: ShoppingCart, color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
  ACCOUNTS:   { label: "Accounts",   icon: DollarSign,   color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  PRODUCTION: { label: "Production", icon: Factory,      color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200" },
  DISPATCH:   { label: "Dispatch",   icon: Truck,        color: "text-purple-700",  bg: "bg-purple-50",  border: "border-purple-200" },
  SYSTEM:     { label: "System",     icon: Shield,       color: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200" },
};

const SEVERITY_META: Record<Severity, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-100",   text: "text-red-700",   dot: "bg-red-500" },
  HIGH:     { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  MEDIUM:   { bg: "bg-sky-100",   text: "text-sky-700",   dot: "bg-sky-500" },
};

const EMPTY_FORM = {
  ruleCode: "",
  module: "ORDERS" as RuleModule,
  title: "",
  description: "",
  example: "",
  severity: "HIGH" as Severity,
  testedBy: "",
  active: true,
};

// ─── Small components ─────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_META[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {severity}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white";
const textareaCls = `${inputCls} resize-none`;

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BusinessRulesPage() {
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BusinessRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expandedModule, setExpandedModule] = useState<RuleModule | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/business-rules`, { headers: getAuthHeaders() });
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load rules", false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(rule: BusinessRule) {
    setEditing(rule);
    setForm({
      ruleCode: rule.ruleCode,
      module: rule.module,
      title: rule.title,
      description: rule.description,
      example: rule.example,
      severity: rule.severity,
      testedBy: rule.testedBy ?? "",
      active: rule.active,
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.ruleCode || !form.title || !form.description || !form.example) {
      showToast("Fill in all required fields", false);
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `${API_BASE_URL}/business-rules/${editing.id}`
        : `${API_BASE_URL}/business-rules`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Save failed");
      }
      showToast(editing ? "Rule updated" : "Rule added");
      setShowForm(false);
      load();
    } catch (e: any) {
      showToast(e.message ?? "Error saving", false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: BusinessRule) {
    if (!confirm(`Delete rule "${rule.ruleCode} — ${rule.title}"?`)) return;
    setDeleting(rule.id);
    try {
      await fetch(`${API_BASE_URL}/business-rules/${rule.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      showToast("Rule deleted");
      load();
    } catch {
      showToast("Delete failed", false);
    } finally {
      setDeleting(null);
    }
  }

  async function seedRules() {
    setSeeding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/business-rules/seed`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      showToast(`Seeded ${data.created} rules (${data.skipped} already existed)`);
      load();
    } catch {
      showToast("Seed failed", false);
    } finally {
      setSeeding(false);
    }
  }

  // Group by module
  const grouped = rules.reduce<Record<string, BusinessRule[]>>((acc, r) => {
    (acc[r.module] = acc[r.module] || []).push(r);
    return acc;
  }, {});
  const modules = Object.keys(grouped) as RuleModule[];

  const stats = {
    total: rules.length,
    critical: rules.filter((r) => r.severity === "CRITICAL" && r.active).length,
    high: rules.filter((r) => r.severity === "HIGH" && r.active).length,
    medium: rules.filter((r) => r.severity === "MEDIUM" && r.active).length,
  };

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white transition-all ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
            {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl">
              <Shield size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Business Rules</h1>
              <p className="text-sm text-slate-500">All fixed process rules that protect your ERP</p>
            </div>
          </div>
          <div className="flex gap-2">
            {rules.length === 0 && !loading && (
              <button
                onClick={seedRules}
                disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {seeding ? <Loader2 size={15} className="animate-spin" /> : <Settings size={15} />}
                Load Default Rules
              </button>
            )}
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-700"
            >
              <Plus size={15} />
              Add Rule
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-slate-900">{stats.total}</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Total Rules</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-red-700">{stats.critical}</div>
            <div className="text-xs text-red-600 font-medium mt-0.5">Critical</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-amber-700">{stats.high}</div>
            <div className="text-xs text-amber-600 font-medium mt-0.5">High</div>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-sky-700">{stats.medium}</div>
            <div className="text-xs text-sky-600 font-medium mt-0.5">Medium</div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin text-slate-400" />
          </div>
        )}

        {/* Empty */}
        {!loading && rules.length === 0 && (
          <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Shield size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-600 mb-1">No rules yet</p>
            <p className="text-sm text-slate-500 mb-4">Click "Load Default Rules" to add the 14 built-in rules, or add your own.</p>
          </div>
        )}

        {/* Rules by module */}
        {!loading && modules.length > 0 && (
          <div className="space-y-4">
            {modules.map((module) => {
              const meta = MODULE_META[module as RuleModule] ?? MODULE_META.SYSTEM;
              const Icon = meta.icon;
              const moduleRules = grouped[module];
              const isOpen = expandedModule === module || expandedModule === null;

              return (
                <div key={module} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  {/* Module header */}
                  <button
                    onClick={() => setExpandedModule(isOpen && expandedModule === module ? null : module as RuleModule)}
                    className={`w-full flex items-center gap-3 px-5 py-4 ${meta.bg} hover:brightness-95 transition-all`}
                  >
                    <Icon size={18} className={meta.color} />
                    <span className={`font-black text-sm ${meta.color}`}>{meta.label} Module</span>
                    <span className={`ml-auto text-xs font-bold ${meta.color} opacity-60 mr-2`}>
                      {moduleRules.length} rule{moduleRules.length > 1 ? "s" : ""}
                    </span>
                    <ChevronDown size={16} className={`${meta.color} transition-transform ${expandedModule === module ? "rotate-180" : ""}`} />
                  </button>

                  {/* Rules */}
                  <div className="divide-y divide-slate-100">
                    {moduleRules.map((rule) => (
                      <div key={rule.id} className={`px-5 py-4 ${!rule.active ? "opacity-50" : ""}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              {rule.ruleCode}
                            </span>
                            <SeverityBadge severity={rule.severity as Severity} />
                            {!rule.active && (
                              <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold">INACTIVE</span>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => openEdit(rule)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                              title="Edit rule"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteRule(rule)}
                              disabled={deleting === rule.id}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 disabled:opacity-50"
                              title="Delete rule"
                            >
                              {deleting === rule.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>

                        <h3 className="font-bold text-slate-800 text-sm mb-1.5">{rule.title}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed mb-2">{rule.description}</p>

                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-800 leading-relaxed">
                          <span className="font-bold text-amber-700">Example: </span>{rule.example}
                        </div>

                        {rule.testedBy && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <FlaskConical size={11} className="text-slate-400" />
                            <span className="text-xs text-slate-400 font-mono">{rule.testedBy}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center text-xs text-slate-400">
          {stats.total} rules · All CRITICAL and HIGH rules are automatically tested on every git push
        </div>
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-black text-slate-900">{editing ? "Edit Rule" : "Add New Rule"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Rule Code *">
                  <input
                    className={inputCls}
                    placeholder="e.g. DISPATCH-006"
                    value={form.ruleCode}
                    onChange={(e) => setForm({ ...form, ruleCode: e.target.value.toUpperCase() })}
                    disabled={!!editing}
                  />
                </Field>
                <Field label="Module *">
                  <select
                    className={inputCls}
                    value={form.module}
                    onChange={(e) => setForm({ ...form, module: e.target.value as RuleModule })}
                  >
                    {Object.keys(MODULE_META).map((m) => (
                      <option key={m} value={m}>{MODULE_META[m as RuleModule].label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Severity *">
                <div className="flex gap-2">
                  {(["CRITICAL", "HIGH", "MEDIUM"] as Severity[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setForm({ ...form, severity: s })}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                        form.severity === s
                          ? s === "CRITICAL" ? "bg-red-500 text-white border-red-500"
                          : s === "HIGH" ? "bg-amber-500 text-white border-amber-500"
                          : "bg-sky-500 text-white border-sky-500"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Rule Title *">
                <input
                  className={inputCls}
                  placeholder="Short name of the rule"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>

              <Field label="Description * (plain English explanation)">
                <textarea
                  className={textareaCls}
                  rows={3}
                  placeholder="Explain the rule clearly in plain English..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <Field label="Example * (what happens if rule is broken)">
                <textarea
                  className={textareaCls}
                  rows={2}
                  placeholder="e.g. Agent tries to dispatch without approval → system blocks it"
                  value={form.example}
                  onChange={(e) => setForm({ ...form, example: e.target.value })}
                />
              </Field>

              <Field label="Tested By (test file name — optional)">
                <input
                  className={inputCls}
                  placeholder="e.g. dispatch.business-rules.spec.ts"
                  value={form.testedBy}
                  onChange={(e) => setForm({ ...form, testedBy: e.target.value })}
                />
              </Field>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm({ ...form, active: !form.active })}
                  className={`relative w-10 h-6 rounded-full transition-colors ${form.active ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? "translate-x-5" : "translate-x-1"}`} />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  {form.active ? "Rule is Active" : "Rule is Inactive"}
                </span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {editing ? "Save Changes" : "Add Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
