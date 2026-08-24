"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Cake, Gift, PartyPopper, History, Plus, Trash2, Send, TestTube2, RefreshCw, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type OccasionType = "BIRTHDAY" | "ANNIVERSARY" | "FESTIVAL";

type TextPlaceholder = {
  xPct: number; yPct: number; wPct: number; hPct: number;
  fontFamily: "DejaVu Sans" | "Segoe UI";
  fontSizePx: number; bold: boolean; color: string;
  align: "left" | "center" | "right";
  textTemplate?: string;
};

type PhotoPlaceholder = { xPct: number; yPct: number; wPct: number; hPct: number; shape: "circle" | "square" };

type Contact = {
  id: string; fullName: string; whatsappNumber: string; relation: string | null;
  photoDataUrl: string | null; dateOfBirth: string | null; anniversaryDate: string | null;
  notes: string | null; isActive: boolean; createdAt: string;
};

type Template = {
  id: string; name: string; occasionType: OccasionType; backgroundDataUrl: string;
  canvasWidthPx: number; canvasHeightPx: number;
  namePlaceholder: TextPlaceholder; subPlaceholder: TextPlaceholder | null; photoPlaceholder: PhotoPlaceholder | null;
  isActive: boolean;
};

type Festival = { id: string; name: string; month: number; day: number; templateId: string; isActive: boolean; template: { id: string; name: string } };

type EventMessage = {
  id: string; occasionType: OccasionType; eventYear: number; status: "SENT" | "FAILED";
  sentToContact: boolean; sentToOwner: boolean; failureReason: string | null; createdAt: string;
  contact: { fullName: string; whatsappNumber: string }; template: { name: string } | null; festival: { name: string } | null;
};

function noContentType() {
  const { "Content-Type": _ct, ...rest } = getAuthHeaders();
  return rest;
}

function toInputDate(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const DEFAULT_NAME_PLACEHOLDER: TextPlaceholder = { xPct: 10, yPct: 68, wPct: 80, hPct: 12, fontFamily: "DejaVu Sans", fontSizePx: 64, bold: true, color: "#7a3b12", align: "center" };
const DEFAULT_SUB_PLACEHOLDER: TextPlaceholder = { xPct: 10, yPct: 80, wPct: 80, hPct: 8, fontFamily: "DejaVu Sans", fontSizePx: 36, bold: false, color: "#7a3b12", align: "center", textTemplate: "Turns {{age}} today!" };
const DEFAULT_PHOTO_PLACEHOLDER: PhotoPlaceholder = { xPct: 35, yPct: 12, wPct: 30, hPct: 30, shape: "circle" };

// ── Main ───────────────────────────────────────────────────────────────────

function EventsContent() {
  const [tab, setTab] = useState<"contacts" | "templates" | "festivals" | "history">("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const loadContacts = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/events/contacts`, { headers: getAuthHeaders() });
    if (res.ok) setContacts(await res.json());
  }, []);
  const loadTemplates = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/events/templates`, { headers: getAuthHeaders() });
    if (res.ok) setTemplates(await res.json());
  }, []);
  const loadFestivals = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/events/festivals`, { headers: getAuthHeaders() });
    if (res.ok) setFestivals(await res.json());
  }, []);
  const loadMessages = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/events/messages`, { headers: getAuthHeaders() });
    if (res.ok) setMessages(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadContacts(), loadTemplates(), loadFestivals(), loadMessages()]).finally(() => setLoading(false));
  }, [loadContacts, loadTemplates, loadFestivals, loadMessages]);

  const runNow = async () => {
    setRunningNow(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/run-now`, { method: "POST", headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      showToast(res.ok ? `Daily check ran — ${data.processed ?? 0} greeting(s) processed` : "Failed to run daily check");
      await loadMessages();
    } finally {
      setRunningNow(false);
    }
  };

  const tabs = [
    { key: "contacts" as const, label: "Contacts", icon: Cake },
    { key: "templates" as const, label: "Templates", icon: Gift },
    { key: "festivals" as const, label: "Festivals", icon: PartyPopper },
    { key: "history" as const, label: "History", icon: History },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Events</h1>
          <p className="text-sm text-slate-500">Birthday, anniversary &amp; festival WhatsApp greetings — register people once, the rest is automatic.</p>
        </div>
        <button
          onClick={runNow}
          disabled={runningNow}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={runningNow ? "animate-spin" : ""} />
          {runningNow ? "Running..." : "Run today's check now"}
        </button>
      </div>

      {toast && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">{toast}</div>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-amber-600 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading...</div>
      ) : (
        <>
          {tab === "contacts" && (
            <ContactsTab contacts={contacts} templates={templates} festivals={festivals} reload={loadContacts} reloadMessages={loadMessages} showToast={showToast} />
          )}
          {tab === "templates" && <TemplatesTab templates={templates} reload={loadTemplates} showToast={showToast} />}
          {tab === "festivals" && <FestivalsTab festivals={festivals} templates={templates.filter((t) => t.occasionType === "FESTIVAL")} reload={loadFestivals} showToast={showToast} />}
          {tab === "history" && <HistoryTab messages={messages} reload={loadMessages} />}
        </>
      )}
    </div>
  );
}

// ── Contacts tab ───────────────────────────────────────────────────────────

function ContactsTab({ contacts, templates, festivals, reload, reloadMessages, showToast }: {
  contacts: Contact[]; templates: Template[]; festivals: Festival[]; reload: () => Promise<void>; reloadMessages: () => Promise<void>; showToast: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasBirthdayTemplate = templates.some((t) => t.occasionType === "BIRTHDAY" && t.isActive);
  const hasAnniversaryTemplate = templates.some((t) => t.occasionType === "ANNIVERSARY" && t.isActive);

  const saveContact = async (form: FormData, id?: string) => {
    const res = await fetch(`${API_BASE_URL}/events/contacts${id ? `/${id}` : ""}`, {
      method: id ? "PATCH" : "POST",
      headers: noContentType(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || "Failed to save contact");
      return false;
    }
    await reload();
    return true;
  };

  const deleteContact = async (id: string) => {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    await fetch(`${API_BASE_URL}/events/contacts/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    await reload();
  };

  const send = async (contact: Contact, mode: "send-now" | "send-test", occasionType: OccasionType, festivalId?: string) => {
    setBusyId(contact.id);
    try {
      const res = await fetch(`${API_BASE_URL}/events/contacts/${contact.id}/${mode}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ occasionType, festivalId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.skipped) showToast(`Skipped: ${data.reason}`);
      else if (data.sentToContact || data.sentToOwner) showToast(`Sent (${mode === "send-test" ? "test to owner" : "live"})`);
      else showToast(data.failureReason || "Send failed");
      await reloadMessages();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2 text-xs">
          {!hasBirthdayTemplate && <span className="rounded bg-red-50 px-2 py-1 text-red-700">No active Birthday template — set one up in Templates first</span>}
          {!hasAnniversaryTemplate && <span className="rounded bg-red-50 px-2 py-1 text-red-700">No active Anniversary template</span>}
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <Plus size={16} /> Add person
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Photo</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">WhatsApp</th>
              <th className="px-3 py-2">Relation</th>
              <th className="px-3 py-2">Birthday</th>
              <th className="px-3 py-2">Anniversary</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((c) => (
              <tr key={c.id} className={!c.isActive ? "opacity-50" : ""}>
                <td className="px-3 py-2">
                  {c.photoDataUrl ? <img src={c.photoDataUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-slate-200" />}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">{c.fullName}</td>
                <td className="px-3 py-2 text-slate-500">{c.whatsappNumber}</td>
                <td className="px-3 py-2 text-slate-500">{c.relation || "—"}</td>
                <td className="px-3 py-2 text-slate-500">{toInputDate(c.dateOfBirth) || "—"}</td>
                <td className="px-3 py-2 text-slate-500">{toInputDate(c.anniversaryDate) || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => { setEditing(c); setShowForm(true); }} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Edit</button>
                    {c.dateOfBirth && (
                      <>
                        <button disabled={busyId === c.id} onClick={() => send(c, "send-test", "BIRTHDAY")} title="Send birthday test to owner" className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"><TestTube2 size={12} />BDay</button>
                        <button disabled={busyId === c.id} onClick={() => { if (confirm(`Send a real birthday greeting to ${c.fullName} now?`)) send(c, "send-now", "BIRTHDAY"); }} title="Send birthday now" className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"><Send size={12} /></button>
                      </>
                    )}
                    {c.anniversaryDate && (
                      <>
                        <button disabled={busyId === c.id} onClick={() => send(c, "send-test", "ANNIVERSARY")} title="Send anniversary test to owner" className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"><TestTube2 size={12} />Anniv</button>
                        <button disabled={busyId === c.id} onClick={() => { if (confirm(`Send a real anniversary greeting to ${c.fullName} now?`)) send(c, "send-now", "ANNIVERSARY"); }} title="Send anniversary now" className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"><Send size={12} /></button>
                      </>
                    )}
                    <button onClick={() => deleteContact(c.id)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">No one registered yet — click "Add person" to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ContactFormModal
          contact={editing}
          onClose={() => setShowForm(false)}
          onSave={async (form) => {
            const ok = await saveContact(form, editing?.id);
            if (ok) setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function ContactFormModal({ contact, onClose, onSave }: { contact: Contact | null; onClose: () => void; onSave: (form: FormData) => Promise<void> }) {
  const [fullName, setFullName] = useState(contact?.fullName ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(contact?.whatsappNumber ?? "");
  const [relation, setRelation] = useState(contact?.relation ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(toInputDate(contact?.dateOfBirth ?? null));
  const [anniversaryDate, setAnniversaryDate] = useState(toInputDate(contact?.anniversaryDate ?? null));
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!fullName.trim()) return setError("Name is required");
    if (!whatsappNumber.trim()) return setError("WhatsApp number is required");
    if (!dateOfBirth && !anniversaryDate) return setError("Enter at least a birthday or an anniversary date");
    setError("");
    setSaving(true);
    const form = new FormData();
    form.append("fullName", fullName.trim());
    form.append("whatsappNumber", whatsappNumber.trim());
    if (relation) form.append("relation", relation);
    if (dateOfBirth) form.append("dateOfBirth", dateOfBirth);
    if (anniversaryDate) form.append("anniversaryDate", anniversaryDate);
    if (notes) form.append("notes", notes);
    if (photo) form.append("photo", photo);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{contact ? "Edit person" : "Add person"}</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="space-y-3">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="WhatsApp number (e.g. 98765 43210)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Relation (Customer, Friend, Family...)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">Birthday
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-500">Anniversary
              <input type="date" value={anniversaryDate} onChange={(e) => setAnniversaryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-xs text-slate-500">Photo (optional)
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm" />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Templates tab ────────────────────────────────────────────────────────

function TemplatesTab({ templates, reload, showToast }: { templates: Template[]; reload: () => Promise<void>; showToast: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const toggleActive = async (t: Template) => {
    await fetch(`${API_BASE_URL}/events/templates/${t.id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ isActive: !t.isActive }) });
    await reload();
  };
  const deleteTemplate = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const res = await fetch(`${API_BASE_URL}/events/templates/${t.id}`, { method: "DELETE", headers: getAuthHeaders() });
    if (!res.ok) { const err = await res.json().catch(() => ({})); showToast(err.message || "Failed to delete"); }
    await reload();
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <Plus size={16} /> Add template
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {templates.map((t) => (
          <div key={t.id} className={`overflow-hidden rounded-xl border ${t.isActive ? "border-amber-300" : "border-slate-200"} bg-white`}>
            <img src={t.backgroundDataUrl} alt={t.name} className="h-32 w-full object-cover" />
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{t.name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{t.occasionType}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <button onClick={() => { setEditing(t); setShowForm(true); }} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">Edit</button>
                <button onClick={() => toggleActive(t)} className={`rounded border px-2 py-1 ${t.isActive ? "border-green-300 text-green-700" : "border-slate-300 text-slate-500"}`}>{t.isActive ? "Active" : "Inactive"}</button>
                <button onClick={() => deleteTemplate(t)} className="rounded border border-red-200 px-2 py-1 text-red-600"><Trash2 size={12} /></button>
              </div>
            </div>
          </div>
        ))}
        {templates.length === 0 && <div className="col-span-full py-10 text-center text-sm text-slate-400">No templates yet — add a background image and position the name/photo boxes on it.</div>}
      </div>

      {showForm && (
        <TemplateFormModal
          template={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await reload(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function TemplateFormModal({ template, onClose, onSaved, showToast }: { template: Template | null; onClose: () => void; onSaved: () => Promise<void>; showToast: (m: string) => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [occasionType, setOccasionType] = useState<OccasionType>(template?.occasionType ?? "BIRTHDAY");
  const [canvasWidthPx, setCanvasWidthPx] = useState(template?.canvasWidthPx ?? 1080);
  const [canvasHeightPx, setCanvasHeightPx] = useState(template?.canvasHeightPx ?? 1080);
  const [background, setBackground] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(template?.backgroundDataUrl ?? null);
  const [namePh, setNamePh] = useState<TextPlaceholder>(template?.namePlaceholder ?? DEFAULT_NAME_PLACEHOLDER);
  const [useSub, setUseSub] = useState(Boolean(template?.subPlaceholder));
  const [subPh, setSubPh] = useState<TextPlaceholder>(template?.subPlaceholder ?? DEFAULT_SUB_PLACEHOLDER);
  const [usePhoto, setUsePhoto] = useState(Boolean(template?.photoPlaceholder));
  const [photoPh, setPhotoPh] = useState<PhotoPlaceholder>(template?.photoPlaceholder ?? DEFAULT_PHOTO_PLACEHOLDER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onBackgroundChange = (file: File | null) => {
    setBackground(file);
    if (file) setBackgroundPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!name.trim()) return setError("Name is required");
    if (!template && !background) return setError("A background image is required");
    setError("");
    setSaving(true);
    const form = new FormData();
    form.append("name", name.trim());
    form.append("occasionType", occasionType);
    form.append("canvasWidthPx", String(canvasWidthPx));
    form.append("canvasHeightPx", String(canvasHeightPx));
    form.append("namePlaceholder", JSON.stringify(namePh));
    form.append("subPlaceholder", useSub ? JSON.stringify(subPh) : "");
    form.append("photoPlaceholder", usePhoto ? JSON.stringify(photoPh) : "");
    if (background) form.append("background", background);
    try {
      const res = await fetch(`${API_BASE_URL}/events/templates${template ? `/${template.id}` : ""}`, {
        method: template ? "PATCH" : "POST",
        headers: noContentType(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "Failed to save template");
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{template ? "Edit template" : "Add template"}</h2>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={occasionType} onChange={(e) => setOccasionType(e.target.value as OccasionType)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="BIRTHDAY">Birthday</option>
              <option value="ANNIVERSARY">Anniversary</option>
              <option value="FESTIVAL">Festival</option>
            </select>
            <label className="block text-xs text-slate-500">Background image
              <input type="file" accept="image/*" onChange={(e) => onBackgroundChange(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">Canvas width (px)
                <input type="number" value={canvasWidthPx} onChange={(e) => setCanvasWidthPx(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-500">Canvas height (px)
                <input type="number" value={canvasHeightPx} onChange={(e) => setCanvasHeightPx(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <PlaceholderEditor label="Name text" ph={namePh} onChange={setNamePh} />

            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={useSub} onChange={(e) => setUseSub(e.target.checked)} /> Add a sub-text line (age / years / festival wish)
            </label>
            {useSub && (
              <>
                <input
                  value={subPh.textTemplate ?? ""}
                  onChange={(e) => setSubPh({ ...subPh, textTemplate: e.target.value })}
                  placeholder="e.g. Turns {{age}} today! or {{years}} Years Together! or Happy {{festival}}!"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-400">Plain text only — emoji won't render in the generated image, so leave them out.</p>
                <PlaceholderEditor label="Sub-text" ph={subPh} onChange={setSubPh} />
              </>
            )}

            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} /> Show the person's photo
            </label>
            {usePhoto && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">X %
                  <input type="number" value={photoPh.xPct} onChange={(e) => setPhotoPh({ ...photoPh, xPct: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-500">Y %
                  <input type="number" value={photoPh.yPct} onChange={(e) => setPhotoPh({ ...photoPh, yPct: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-500">Width %
                  <input type="number" value={photoPh.wPct} onChange={(e) => setPhotoPh({ ...photoPh, wPct: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-500">Height %
                  <input type="number" value={photoPh.hPct} onChange={(e) => setPhotoPh({ ...photoPh, hPct: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 text-xs text-slate-500">Shape
                  <select value={photoPh.shape} onChange={(e) => setPhotoPh({ ...photoPh, shape: e.target.value as "circle" | "square" })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="circle">Circle</option>
                    <option value="square">Square</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Live layout preview</p>
            <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style={{ aspectRatio: `${canvasWidthPx} / ${canvasHeightPx}` }}>
              {backgroundPreview && <img src={backgroundPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <BoxOverlay ph={namePh} label="Name" />
              {useSub && <BoxOverlay ph={subPh} label="Sub-text" />}
              {usePhoto && (
                <div
                  className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10"
                  style={{ left: `${photoPh.xPct}%`, top: `${photoPh.yPct}%`, width: `${photoPh.wPct}%`, height: `${photoPh.hPct}%`, borderRadius: photoPh.shape === "circle" ? "9999px" : "4px" }}
                >
                  <span className="absolute inset-x-0 top-1 text-center text-[10px] font-semibold text-blue-700">Photo</span>
                </div>
              )}
            </div>
            {template && (
              <TemplatePreviewButton templateId={template.id} />
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function BoxOverlay({ ph, label }: { ph: TextPlaceholder; label: string }) {
  return (
    <div
      className="absolute flex items-center justify-center border-2 border-dashed border-amber-500 bg-amber-500/10"
      style={{ left: `${ph.xPct}%`, top: `${ph.yPct}%`, width: `${ph.wPct}%`, height: `${ph.hPct}%` }}
    >
      <span className="text-[10px] font-semibold text-amber-700">{label}</span>
    </div>
  );
}

function PlaceholderEditor({ label, ph, onChange }: { label: string; ph: TextPlaceholder; onChange: (p: TextPlaceholder) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <p className="mb-2 text-xs font-medium text-slate-600">{label} position &amp; style</p>
      <div className="grid grid-cols-4 gap-2">
        <label className="text-[10px] text-slate-500">X %<input type="number" value={ph.xPct} onChange={(e) => onChange({ ...ph, xPct: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs" /></label>
        <label className="text-[10px] text-slate-500">Y %<input type="number" value={ph.yPct} onChange={(e) => onChange({ ...ph, yPct: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs" /></label>
        <label className="text-[10px] text-slate-500">W %<input type="number" value={ph.wPct} onChange={(e) => onChange({ ...ph, wPct: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs" /></label>
        <label className="text-[10px] text-slate-500">H %<input type="number" value={ph.hPct} onChange={(e) => onChange({ ...ph, hPct: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs" /></label>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <select value={ph.fontFamily} onChange={(e) => onChange({ ...ph, fontFamily: e.target.value as TextPlaceholder["fontFamily"] })} className="rounded border border-slate-300 px-2 py-1 text-xs">
          <option>DejaVu Sans</option>
          <option>Segoe UI</option>
        </select>
        <input type="number" value={ph.fontSizePx} onChange={(e) => onChange({ ...ph, fontSizePx: Number(e.target.value) })} placeholder="Size px" className="rounded border border-slate-300 px-2 py-1 text-xs" />
        <input type="color" value={ph.color} onChange={(e) => onChange({ ...ph, color: e.target.value })} className="h-7 w-full rounded border border-slate-300" />
        <select value={ph.align} onChange={(e) => onChange({ ...ph, align: e.target.value as TextPlaceholder["align"] })} className="rounded border border-slate-300 px-2 py-1 text-xs">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <label className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
        <input type="checkbox" checked={ph.bold} onChange={(e) => onChange({ ...ph, bold: e.target.checked })} /> Bold
      </label>
    </div>
  );
}

function TemplatePreviewButton({ templateId }: { templateId: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/templates/${templateId}/preview`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({}) });
      if (res.ok) {
        const blob = await res.blob();
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <button onClick={generate} disabled={loading} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
        {loading ? "Generating..." : "Preview with sample data"}
      </button>
      {previewUrl && <img src={previewUrl} alt="Preview" className="mt-2 w-full rounded-lg border border-slate-200" />}
    </div>
  );
}

// ── Festivals tab ───────────────────────────────────────────────────────

function FestivalsTab({ festivals, templates, reload, showToast }: { festivals: Festival[]; templates: Template[]; reload: () => Promise<void>; showToast: (m: string) => void }) {
  const [name, setName] = useState("");
  const [month, setMonth] = useState("1");
  const [day, setDay] = useState("1");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim() || !templateId) return showToast("Name and a FESTIVAL template are required");
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/festivals`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ name, month, day, templateId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showToast(err.message || "Failed to add festival"); return; }
      setName(""); setMonth("1"); setDay("1"); setTemplateId("");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (f: Festival) => {
    await fetch(`${API_BASE_URL}/events/festivals/${f.id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ isActive: !f.isActive }) });
    await reload();
  };
  const remove = async (f: Festival) => {
    if (!confirm(`Delete festival "${f.name}"?`)) return;
    await fetch(`${API_BASE_URL}/events/festivals/${f.id}`, { method: "DELETE", headers: getAuthHeaders() });
    await reload();
  };

  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" });

  return (
    <div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Add a custom festival</p>
        <p className="mb-3 text-xs text-slate-500">Sent to every active contact on this date each year. For festivals that move (Diwali, Eid...) update the date yourself before it comes around.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Festival name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
          <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
            <option value="">Select a FESTIVAL template...</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {templates.length === 0 && <p className="mt-2 text-xs text-amber-600">Create a template with occasion type "Festival" first, in the Templates tab.</p>}
        <button onClick={add} disabled={saving} className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={14} />Add festival</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {festivals.map((f) => (
              <tr key={f.id}>
                <td className="px-3 py-2 font-medium text-slate-800">{f.name}</td>
                <td className="px-3 py-2 text-slate-500">{monthName(f.month)} {f.day}</td>
                <td className="px-3 py-2 text-slate-500">{f.template?.name ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${f.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{f.isActive ? "Active" : "Inactive"}</span></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5">
                    <button onClick={() => toggleActive(f)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">{f.isActive ? "Disable" : "Enable"}</button>
                    <button onClick={() => remove(f)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {festivals.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-400">No festivals added yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── History tab ────────────────────────────────────────────────────────

function HistoryTab({ messages, reload }: { messages: EventMessage[]; reload: () => Promise<void> }) {
  useEffect(() => { reload(); }, [reload]);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Occasion</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Sent to</th><th className="px-3 py-2">Failure reason</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {messages.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 text-slate-500">{new Date(m.createdAt).toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{m.contact.fullName}</td>
              <td className="px-3 py-2 text-slate-500">{m.occasionType === "FESTIVAL" ? (m.festival?.name ?? "Festival") : m.occasionType}</td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${m.status === "SENT" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.status}</span></td>
              <td className="px-3 py-2 text-slate-500">{[m.sentToContact && "Contact", m.sentToOwner && "Owner"].filter(Boolean).join(", ") || "—"}</td>
              <td className="px-3 py-2 text-xs text-red-500">{m.failureReason || "—"}</td>
            </tr>
          ))}
          {messages.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">No greetings sent yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function EventsPage() {
  return (
    <DashboardShell>
      <EventsContent />
    </DashboardShell>
  );
}
