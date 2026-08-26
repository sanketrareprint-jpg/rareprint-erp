"use client";
import React, { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Plus, Edit2, Trash2, X, Save, FileText, ChevronDown, ChevronUp, EyeOff, AlertTriangle } from "lucide-react";

// Module tags a policy can be scoped to. Keep in sync with any new
// PoliciesWidget embeds added to other pages — an empty selection means
// "show everywhere".
const MODULE_OPTIONS = [
  "ORDERS", "PRODUCTION", "DISPATCH", "ACCOUNTS", "HR", "SALES", "DESIGN",
];

type Policy = {
  id: string;
  title: string;
  content: string;
  modules: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: { fullName: string } | null;
};

type PolicyForm = { title: string; content: string; modules: string[]; isActive: boolean };

const EMPTY_FORM: PolicyForm = { title: "", content: "", modules: [], isActive: true };

export default function PoliciesPage() {
  const [currentUser] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("rareprint_user") ?? "null"); } catch { return null; }
  });
  const isSuperAdmin = currentUser?.email?.toLowerCase?.() === "sanket.rareprint@gmail.com";

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = isSuperAdmin ? "/policies/admin" : "/policies";
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load policies");
      setPolicies(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Policy) {
    setEditingId(p.id);
    setForm({ title: p.title, content: p.content, modules: p.modules, isActive: p.isActive });
    setShowForm(true);
  }

  function toggleModule(m: string) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m],
    }));
  }

  async function submit() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `${API_BASE_URL}/policies/${editingId}` : `${API_BASE_URL}/policies`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to save policy");
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Policy) {
    try {
      await fetch(`${API_BASE_URL}/policies/${p.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      await load();
    } catch {
      setError("Failed to update policy");
    }
  }

  async function remove(p: Policy) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/policies/${p.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete policy");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete policy");
    }
  }

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <FileText size={20} /> Policies & SOPs
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Office policies, department rules, and standard operating procedures.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} /> New Policy
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
        ) : policies.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-300 rounded-lg">
            No policies yet.
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border ${p.isActive ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-70"}`}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === p.id ? null : p.id))}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <span className="font-medium text-gray-900 text-sm">{p.title}</span>
                    {!p.isActive && (
                      <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 flex items-center gap-1">
                        <EyeOff size={10} /> Inactive
                      </span>
                    )}
                    {p.modules.length > 0 && (
                      <span className="hidden sm:flex flex-wrap gap-1">
                        {p.modules.map((m) => (
                          <span key={m} className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">{m}</span>
                        ))}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 ml-2">
                    {isSuperAdmin && (
                      <>
                        <button onClick={() => toggleActive(p)} title={p.isActive ? "Deactivate" : "Activate"} className="text-gray-400 hover:text-gray-700">
                          <EyeOff size={15} />
                        </button>
                        <button onClick={() => openEdit(p)} title="Edit" className="text-gray-400 hover:text-blue-600">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => remove(p)} title="Delete" className="text-gray-400 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => setExpandedId((id) => (id === p.id ? null : p.id))} className="text-gray-400">
                      {expandedId === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
                {expandedId === p.id && (
                  <div className="px-4 pb-3 text-sm text-gray-700 whitespace-pre-wrap border-t border-gray-100 pt-2">
                    {p.content}
                    {p.createdBy?.fullName && (
                      <div className="mt-2 text-xs text-gray-400">
                        Added by {p.createdBy.fullName} · {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editingId ? "Edit Policy" : "New Policy"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Leave Application Process"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Write the policy, rule, or SOP here…"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Show in modules (leave blank to show everywhere)</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {MODULE_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleModule(m)}
                      className={`text-xs rounded-full px-3 py-1 border ${
                        form.modules.includes(m)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-600 px-3 py-2">Cancel</button>
              <button
                onClick={submit}
                disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={15} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
