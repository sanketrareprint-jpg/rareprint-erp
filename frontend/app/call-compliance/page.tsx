"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, CheckCircle, AlertCircle, FileText, Users, Tag, PhoneCall, Trash2,
} from "lucide-react";

type Tab = "call-logs" | "contacts" | "agents";

type Agent = { id: string; fullName: string; role: string; phone: string | null; aisensyTag: string | null };

type CallLogImport = {
  id: string;
  fileName: string;
  ownerNumber: string | null;
  agent: { id: string; fullName: string } | null;
  importedBy: { fullName: string };
  rowsFound: number;
  rowsImported: number;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  _count: { records: number };
};

type ContactImport = {
  id: string;
  fileName: string;
  importedBy: { fullName: string };
  rowsFound: number;
  rowsImported: number;
  rowsUpdated: number;
  createdAt: string;
  _count: { contacts: number };
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CallCompliancePage() {
  const router = useRouter();
  const [currentUser] = useState(() => getStoredUser());
  const [tab, setTab] = useState<Tab>("call-logs");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [callLogImports, setCallLogImports] = useState<CallLogImport[]>([]);
  const [contactImports, setContactImports] = useState<ContactImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingCallLog, setUploadingCallLog] = useState(false);
  const [uploadingContacts, setUploadingContacts] = useState(false);
  const [savingTagFor, setSavingTagFor] = useState<string | null>(null);
  const callLogInputRef = useRef<HTMLInputElement>(null);
  const contactsInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const h = getAuthHeaders();
      const [agentsRes, callLogsRes, contactsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/call-compliance/agents`, { headers: h }),
        fetch(`${API_BASE_URL}/call-compliance/call-logs/imports`, { headers: h }),
        fetch(`${API_BASE_URL}/call-compliance/contacts/imports`, { headers: h }),
      ]);
      if (agentsRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (agentsRes.status === 403) { setError("Admin access required for call-compliance management."); return; }
      if (!agentsRes.ok || !callLogsRes.ok || !contactsRes.ok) { setError("Could not load call-compliance data"); return; }
      setAgents(await agentsRes.json());
      setCallLogImports(await callLogsRes.json());
      setContactImports(await contactsRes.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function uploadCallLog(file: File) {
    setUploadingCallLog(true); setNotice(null); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { "Content-Type": _ct, ...uploadHeaders } = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/call-compliance/call-logs/import`, {
        method: "POST", headers: uploadHeaders, body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Import failed");
      if (data.needsAgentAssignment) {
        setNotice(`Imported ${data.rowsFound} calls from "${data.fileName}" — number ${data.ownerNumber ?? "unknown"} didn't match any agent's phone. Assign it manually below.`);
      } else {
        setNotice(`Imported ${data.rowsFound} calls from "${data.fileName}" — matched to ${data.agent?.fullName}.`);
      }
      await load();
    } catch (e: any) { setError(e.message || "Import failed"); }
    finally { setUploadingCallLog(false); if (callLogInputRef.current) callLogInputRef.current.value = ""; }
  }

  async function uploadContacts(file: File) {
    setUploadingContacts(true); setNotice(null); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { "Content-Type": _ct, ...uploadHeaders } = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/call-compliance/contacts/import`, {
        method: "POST", headers: uploadHeaders, body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Import failed");
      let msg = `Imported ${data.rowsFound} contacts (${data.created} new, ${data.updated} updated).`;
      if (data.unmatchedTags?.length) msg += ` Tags with no matching agent: ${data.unmatchedTags.join(", ")}.`;
      setNotice(msg);
      await load();
    } catch (e: any) { setError(e.message || "Import failed"); }
    finally { setUploadingContacts(false); if (contactsInputRef.current) contactsInputRef.current.value = ""; }
  }

  async function assignImport(importId: string, agentId: string) {
    if (!agentId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/call-compliance/call-logs/imports/${importId}/assign`, {
        method: "PUT", headers: getAuthHeaders(), body: JSON.stringify({ agentId }),
      });
      if (!res.ok) throw new Error("Assign failed");
      await load();
    } catch { setError("Could not assign agent to this import"); }
  }

  async function deleteImport(importId: string) {
    if (!confirm("Delete this call-log import and its parsed calls?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/call-compliance/call-logs/imports/${importId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Delete failed");
      await load();
    } catch { setError("Could not delete import"); }
  }

  async function saveTag(agentId: string, value: string) {
    setSavingTagFor(agentId);
    try {
      const res = await fetch(`${API_BASE_URL}/call-compliance/agents/${agentId}/tag`, {
        method: "PUT", headers: getAuthHeaders(), body: JSON.stringify({ aisensyTag: value }),
      });
      if (!res.ok) throw new Error("Save failed");
      await load();
    } catch { setError("Could not save tag mapping"); }
    finally { setSavingTagFor(null); }
  }

  if (loading) return (
    <DashboardShell><div className="flex items-center justify-center py-40"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div></DashboardShell>
  );

  if (error && agents.length === 0) return (
    <DashboardShell><div className="p-6 text-red-500">{error}</div></DashboardShell>
  );

  return (
    <DashboardShell>
      <div className="p-2.5 space-y-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-bold text-slate-900">Call Compliance</h1>
          <p className="text-xs text-slate-400">Monthly call-log + AiSensy tag cross-check</p>
        </div>

        {notice && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="flex gap-1 border-b border-slate-200">
          {([
            { key: "call-logs", label: "Call Log Imports", icon: PhoneCall },
            { key: "contacts", label: "AiSensy Contacts", icon: Users },
            { key: "agents", label: "Agent Tag Mapping", icon: Tag },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
                tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {tab === "call-logs" && (
          <div className="space-y-2">
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm flex items-center gap-2">
              <input ref={callLogInputRef} type="file" accept=".pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCallLog(f); }} />
              <button
                onClick={() => callLogInputRef.current?.click()}
                disabled={uploadingCallLog}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {uploadingCallLog ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload monthly statement PDF
              </button>
              <p className="text-xs text-slate-400">One PDF per agent's phone statement. We auto-match it to the agent whose phone number is on the bill.</p>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">File</th>
                    <th className="text-left px-3 py-1.5 font-medium">Statement Number</th>
                    <th className="text-left px-3 py-1.5 font-medium">Agent</th>
                    <th className="text-left px-3 py-1.5 font-medium">Period</th>
                    <th className="text-right px-3 py-1.5 font-medium">Calls</th>
                    <th className="text-left px-3 py-1.5 font-medium">Imported By</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {callLogImports.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-slate-400 py-6">No call-log statements uploaded yet</td></tr>
                  )}
                  {callLogImports.map((imp) => (
                    <tr key={imp.id}>
                      <td className="px-3 py-1.5 flex items-center gap-1.5 truncate max-w-[200px]"><FileText className="h-3 w-3 text-slate-400 flex-shrink-0" />{imp.fileName}</td>
                      <td className="px-3 py-1.5 font-mono">{imp.ownerNumber ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        {imp.agent ? (
                          <span className="font-medium text-slate-800">{imp.agent.fullName}</span>
                        ) : (
                          <select
                            defaultValue=""
                            onChange={(e) => void assignImport(imp.id, e.target.value)}
                            className="border border-amber-300 bg-amber-50 rounded px-1.5 py-0.5 text-xs"
                          >
                            <option value="" disabled>Assign agent…</option>
                            {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{fmtDate(imp.periodStart)} – {fmtDate(imp.periodEnd)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{imp._count.records || imp.rowsImported}</td>
                      <td className="px-3 py-1.5 text-slate-500">{imp.importedBy.fullName}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => void deleteImport(imp.id)} className="text-slate-300 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "contacts" && (
          <div className="space-y-2">
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm flex items-center gap-2">
              <input ref={contactsInputRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadContacts(f); }} />
              <button
                onClick={() => contactsInputRef.current?.click()}
                disabled={uploadingContacts}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {uploadingContacts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload AiSensy contacts CSV
              </button>
              <p className="text-xs text-slate-400">The "Export Contacts" CSV from AiSensy. Tags are matched to agents via their AiSensy tag mapping below.</p>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">File</th>
                    <th className="text-right px-3 py-1.5 font-medium">Rows Found</th>
                    <th className="text-right px-3 py-1.5 font-medium">New</th>
                    <th className="text-right px-3 py-1.5 font-medium">Updated</th>
                    <th className="text-left px-3 py-1.5 font-medium">Imported By</th>
                    <th className="text-left px-3 py-1.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contactImports.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-slate-400 py-6">No AiSensy contact exports uploaded yet</td></tr>
                  )}
                  {contactImports.map((imp) => (
                    <tr key={imp.id}>
                      <td className="px-3 py-1.5 flex items-center gap-1.5 truncate max-w-[220px]"><FileText className="h-3 w-3 text-slate-400 flex-shrink-0" />{imp.fileName}</td>
                      <td className="px-3 py-1.5 text-right">{imp.rowsFound}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600 font-semibold">{imp.rowsImported}</td>
                      <td className="px-3 py-1.5 text-right text-blue-600 font-semibold">{imp.rowsUpdated}</td>
                      <td className="px-3 py-1.5 text-slate-500">{imp.importedBy.fullName}</td>
                      <td className="px-3 py-1.5 text-slate-500">{fmtDate(imp.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "agents" && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs text-slate-500">Map each agent to the tag name their contacts carry in AiSensy (e.g. "Vaishali"). Defaults to their first name if left blank.</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Agent</th>
                  <th className="text-left px-3 py-1.5 font-medium">Role</th>
                  <th className="text-left px-3 py-1.5 font-medium">Phone</th>
                  <th className="text-left px-3 py-1.5 font-medium">AiSensy Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((a) => (
                  <AgentTagRow key={a.id} agent={a} saving={savingTagFor === a.id} onSave={saveTag} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function AgentTagRow({ agent, saving, onSave }: { agent: Agent; saving: boolean; onSave: (id: string, value: string) => void }) {
  const [value, setValue] = useState(agent.aisensyTag ?? "");
  return (
    <tr>
      <td className="px-3 py-1.5 font-medium text-slate-800">{agent.fullName}</td>
      <td className="px-3 py-1.5 text-slate-500">{agent.role}</td>
      <td className="px-3 py-1.5 font-mono text-slate-500">{agent.phone ?? "—"}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={agent.fullName.split(" ")[0]}
            className="border border-slate-200 rounded px-1.5 py-0.5 text-xs w-32"
          />
          <button
            onClick={() => onSave(agent.id, value)}
            disabled={saving}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}
