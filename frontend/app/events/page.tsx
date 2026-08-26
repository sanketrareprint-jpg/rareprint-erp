"use client";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  PartyPopper, Upload, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Send, Pencil, X, Image as ImageIcon,
} from "lucide-react";

// ─────────────────────────── Types ───────────────────────────

const FONT_FAMILIES = ["DejaVu Sans", "Segoe UI", "Poppins", "Montserrat", "Playfair Display", "Dancing Script"] as const;
type FontFamily = (typeof FONT_FAMILIES)[number];
type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";
type FieldType = "TEXT" | "PHOTO";
type OccasionType = "BIRTHDAY" | "ANNIVERSARY" | "FESTIVAL";

// x/y/w/h are FRACTIONS (0..1) of the template image's own width/height —
// not inches or pixels, since a flyer is only ever a raster image, never
// printed at a physical size (contrast with Certificate Generator's
// inch-based fields).
type FlyerField = {
  key: string;
  label: string;
  type: FieldType;
  x: number; y: number; w: number; h: number;
  fontFamily?: FontFamily;
  fontSizePt?: number;
  bold?: boolean;
  color?: string;
  align?: Align;
  verticalAlign?: VAlign;
  circle?: boolean;
};

type Template = {
  id: string;
  name: string;
  occasionType: OccasionType;
  fields: FlyerField[];
  isActive: boolean;
  imageDataUrl?: string;
};

type Person = {
  id: string;
  name: string;
  whatsappNumber: string;
  relation: string;
  dob: string | null;
  anniversaryDate: string | null;
  photoDataUrl: string | null;
  notes: string | null;
  isActive: boolean;
};

type Festival = {
  id: string;
  name: string;
  month: number; // 1-12, recurring every year
  day: number;
  templateId: string | null;
  isActive: boolean;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonthDay(month: number, day: number): string {
  return `${day} ${MONTH_NAMES[month - 1] ?? month}`;
}

type SendLog = {
  id: string;
  occasionType: OccasionType;
  occasionYear: number;
  recipientPhone: string;
  sentToOwner: boolean;
  status: "SUCCESS" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  person: { name: string } | null;
  festival: { name: string } | null;
};

const OCCASION_LABEL: Record<OccasionType, string> = { BIRTHDAY: "Birthday", ANNIVERSARY: "Anniversary", FESTIVAL: "Festival" };

function uploadHeaders(): Record<string, string> {
  const { "Content-Type": _ct, ...rest } = getAuthHeaders();
  return rest;
}

function slugKey(label: string, existing: string[]): string {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
  let key = base;
  let n = 2;
  while (existing.includes(key)) key = `${base}_${n++}`;
  return key;
}

async function readErr(res: Response, fallback: string): Promise<string> {
  return (await res.json().catch(() => ({}))).message || fallback;
}

// ─────────────────────────── Page ───────────────────────────

export default function EventsPage() {
  const [tab, setTab] = useState<"people" | "templates" | "festivals" | "history">("people");
  const [error, setError] = useState<string | null>(null);

  const TABS: Array<[typeof tab, string]> = [
    ["people", "People"],
    ["templates", "Flyer Templates"],
    ["festivals", "Festivals"],
    ["history", "History"],
  ];

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <PartyPopper className="text-amber-600" size={24} />
          <h1 className="text-xl font-bold text-slate-800">Events — Birthday, Anniversary &amp; Festival Wishes</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
          </div>
        )}

        <div className="flex gap-1 mb-5 border-b">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === key ? "border-amber-600 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "people" && <PeopleTab setError={setError} />}
        {tab === "templates" && <TemplatesTab setError={setError} />}
        {tab === "festivals" && <FestivalsTab setError={setError} />}
        {tab === "history" && <HistoryTab setError={setError} />}
      </div>
    </DashboardShell>
  );
}

// ─────────────────────────── People tab ───────────────────────────

function PeopleTab({ setError }: { setError: (s: string | null) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Person | null | "new">(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/people`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not load people"));
      setPeople(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const sendTest = async (personId: string, occasionType: OccasionType) => {
    setSendingFor(personId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/events/people/${personId}/send-test`, {
        method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ occasionType }),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not send"));
      const result = await res.json();
      if (!result.sent) setError(result.errorMessage || "Send did not reach this person — check the AiSensy template/campaign setup");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingFor(null);
    }
  };

  if (editing) {
    return (
      <PersonForm
        person={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
        setError={setError}
      />
    );
  }

  return (
    <div>
      <button onClick={() => setEditing("new")} className="mb-3 flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
        <Plus size={14} /> Register a person
      </button>

      {loading ? (
        <Loader2 className="animate-spin text-slate-400" size={20} />
      ) : !people.length ? (
        <p className="text-sm text-slate-500">No one registered yet — add a customer, friend, or anyone else you want to send birthday/anniversary wishes to.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">WhatsApp</th>
                <th className="text-left px-3 py-2">Relation</th>
                <th className="text-left px-3 py-2">DOB</th>
                <th className="text-left px-3 py-2">Anniversary</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-medium text-slate-800 flex items-center gap-2">
                    {p.photoDataUrl ? <img src={p.photoDataUrl} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-slate-200" />}
                    {p.name}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{p.whatsappNumber}</td>
                  <td className="px-3 py-2 text-slate-600">{p.relation}</td>
                  <td className="px-3 py-2 text-slate-600">{p.dob ? p.dob.slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.anniversaryDate ? p.anniversaryDate.slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2">{p.isActive ? <span className="text-green-700 text-xs">Active</span> : <span className="text-slate-400 text-xs">Paused</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2 items-center">
                      {p.dob && (
                        <button disabled={sendingFor === p.id} onClick={() => sendTest(p.id, "BIRTHDAY")} title="Send test birthday wish now" className="text-xs px-2 py-1 rounded border text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50 flex items-center gap-1">
                          {sendingFor === p.id ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />} Bday
                        </button>
                      )}
                      {p.anniversaryDate && (
                        <button disabled={sendingFor === p.id} onClick={() => sendTest(p.id, "ANNIVERSARY")} title="Send test anniversary wish now" className="text-xs px-2 py-1 rounded border text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50 flex items-center gap-1">
                          {sendingFor === p.id ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />} Anniv
                        </button>
                      )}
                      <button onClick={() => setEditing(p)} className="text-slate-400 hover:text-amber-600"><Pencil size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PersonForm({ person, onCancel, onSaved, setError }: { person: Person | null; onCancel: () => void; onSaved: () => void; setError: (s: string | null) => void }) {
  const [name, setName] = useState(person?.name ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(person?.whatsappNumber ?? "");
  const [relation, setRelation] = useState(person?.relation ?? "CUSTOMER");
  const [dob, setDob] = useState(person?.dob?.slice(0, 10) ?? "");
  const [anniversaryDate, setAnniversaryDate] = useState(person?.anniversaryDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [isActive, setIsActive] = useState(person?.isActive ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(person?.photoDataUrl ?? null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return setError("Name is required");
    if (!whatsappNumber.trim()) return setError("WhatsApp number is required");
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("whatsappNumber", whatsappNumber);
      formData.append("relation", relation);
      formData.append("dob", dob);
      formData.append("anniversaryDate", anniversaryDate);
      formData.append("notes", notes);
      if (person) formData.append("isActive", String(isActive));
      if (file) formData.append("file", file);
      const url = person ? `${API_BASE_URL}/events/people/${person.id}` : `${API_BASE_URL}/events/people`;
      const res = await fetch(url, { method: person ? "PATCH" : "POST", headers: uploadHeaders(), body: formData });
      if (!res.ok) throw new Error(await readErr(res, "Could not save"));
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!person) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/events/people/${person.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not delete — try pausing this person instead"));
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-lg border rounded-lg p-4 bg-white">
      <h2 className="font-semibold text-slate-800 mb-3">{person ? "Edit person" : "Register a person"}</h2>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {preview ? <img src={preview} className="w-14 h-14 rounded-full object-cover border" /> : <div className="w-14 h-14 rounded-full bg-slate-100 border flex items-center justify-center"><ImageIcon size={18} className="text-slate-300" /></div>}
          <label className="text-xs px-3 py-1.5 rounded border text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer">
            Upload photo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) setPreview(URL.createObjectURL(f));
            }} />
          </label>
        </div>
        <div>
          <label className="text-xs text-slate-500">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">WhatsApp number</label>
            <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="9XXXXXXXXX" className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Relation</label>
            <select value={relation} onChange={(e) => setRelation(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="CUSTOMER">Customer</option>
              <option value="FRIEND">Friend</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Anniversary date</label>
            <input type="date" value={anniversaryDate} onChange={(e) => setAnniversaryDate(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        {person && (
          <label className="text-xs text-slate-600 flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (paused people don't receive automatic wishes)
          </label>
        )}
      </div>
      <div className="flex gap-2 mt-4 pt-3 border-t">
        {person && (
          <button onClick={remove} disabled={deleting} className="px-3 py-2 rounded border text-sm font-semibold text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
            {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Delete
          </button>
        )}
        <button onClick={onCancel} className="flex-1 px-3 py-2 rounded border text-sm font-semibold text-slate-600">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 px-3 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1">
          {saving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Save
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Templates tab ───────────────────────────

const EDITOR_MAX_WIDTH_PX = 480;

function TemplatesTab({ setError }: { setError: (s: string | null) => void }) {
  const [occasionFilter, setOccasionFilter] = useState<OccasionType>("BIRTHDAY");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null | "new">(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/templates?occasionType=${occasionFilter}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not load templates"));
      setTemplates(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [occasionFilter]);

  const openForEditing = async (t: Template) => {
    try {
      const res = await fetch(`${API_BASE_URL}/events/templates/${t.id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not load template"));
      setEditing(await res.json());
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (editing) {
    return (
      <TemplateEditor
        template={editing === "new" ? null : editing}
        defaultOccasionType={occasionFilter}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
        setError={setError}
      />
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(["BIRTHDAY", "ANNIVERSARY", "FESTIVAL"] as OccasionType[]).map((o) => (
          <button key={o} onClick={() => setOccasionFilter(o)} className={`text-xs px-3 py-1.5 rounded-full border ${occasionFilter === o ? "bg-amber-600 text-white border-amber-600" : "text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
            {OCCASION_LABEL[o]}
          </button>
        ))}
      </div>

      <button onClick={() => setEditing("new")} className="mb-3 flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
        <Plus size={14} /> New {OCCASION_LABEL[occasionFilter]} template
      </button>

      {loading ? (
        <Loader2 className="animate-spin text-slate-400" size={20} />
      ) : !templates.length ? (
        <p className="text-sm text-slate-500">No {OCCASION_LABEL[occasionFilter].toLowerCase()} flyer templates yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {templates.map((t) => (
            <button key={t.id} onClick={() => void openForEditing(t)} className="border rounded-lg p-3 text-left hover:border-amber-400">
              <div className="text-sm font-semibold text-slate-800">{t.name}</div>
              <div className="text-xs text-slate-400 mt-1">{t.fields.length} field(s){!t.isActive && " · inactive"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template, defaultOccasionType, onCancel, onSaved, setError }: {
  template: Template | null; defaultOccasionType: OccasionType; onCancel: () => void; onSaved: () => void; setError: (s: string | null) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [occasionType] = useState<OccasionType>(template?.occasionType ?? defaultOccasionType);
  const [fields, setFields] = useState<FlyerField[]>(template?.fields ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(template?.imageDataUrl ?? null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 800, h: 1000 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imagePreview) return;
    const img = new window.Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth || 800, h: img.naturalHeight || 1000 });
    img.src = imagePreview;
  }, [imagePreview]);

  const aspect = naturalSize.h / naturalSize.w;
  const canvasWpx = EDITOR_MAX_WIDTH_PX;
  const canvasHpx = Math.round(EDITOR_MAX_WIDTH_PX * aspect);
  const selected = fields.find((f) => f.key === selectedKey) ?? null;

  const addField = (type: FieldType) => {
    const label = `${type === "PHOTO" ? "Photo" : "Field"} ${fields.length + 1}`;
    const key = slugKey(type === "PHOTO" ? "photo" : label, fields.map((f) => f.key));
    const f: FlyerField = type === "PHOTO"
      ? { key, label, type, x: 0.3, y: 0.1, w: 0.4, h: 0.3, circle: true }
      : { key, label, type, x: 0.1, y: 0.6, w: 0.8, h: 0.12, fontFamily: "DejaVu Sans", fontSizePt: 36, bold: true, color: "#111111", align: "center", verticalAlign: "middle" };
    setFields([...fields, f]);
    setSelectedKey(key);
  };

  const updateSelected = (patch: Partial<FlyerField>) => {
    if (!selectedKey) return;
    setFields(fields.map((f) => (f.key === selectedKey ? { ...f, ...patch } : f)));
  };

  // Same drag/resize gesture pattern as the Certificate Generator's field
  // editor, adapted to fractions (0..1 of canvas px) instead of inches.
  const onPointerDown = (e: React.MouseEvent, f: FlyerField, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelectedKey(f.key);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = f;
    const move = (ev: MouseEvent) => {
      const dxFrac = (ev.clientX - startX) / canvasWpx;
      const dyFrac = (ev.clientY - startY) / canvasHpx;
      if (mode === "move") {
        const x = Math.max(0, Math.min(1 - orig.w, orig.x + dxFrac));
        const y = Math.max(0, Math.min(1 - orig.h, orig.y + dyFrac));
        setFields((prev) => prev.map((field) => (field.key === orig.key ? { ...field, x, y } : field)));
      } else {
        const w = Math.max(0.03, Math.min(1 - orig.x, orig.w + dxFrac));
        const h = Math.max(0.02, Math.min(1 - orig.y, orig.h + dyFrac));
        setFields((prev) => prev.map((field) => (field.key === orig.key ? { ...field, w, h } : field)));
      }
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const save = async () => {
    if (!name.trim()) return setError("Please name this template");
    if (!fields.length) return setError("Add at least one field");
    if (!template && !file) return setError("Please upload a template image");
    setSaving(true);
    setError(null);
    try {
      if (!template) {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("occasionType", occasionType);
        formData.append("fields", JSON.stringify(fields));
        formData.append("file", file as File);
        const res = await fetch(`${API_BASE_URL}/events/templates`, { method: "POST", headers: uploadHeaders(), body: formData });
        if (!res.ok) throw new Error(await readErr(res, "Could not save template"));
      } else {
        const res = await fetch(`${API_BASE_URL}/events/templates/${template.id}`, {
          method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ name, fields }),
        });
        if (!res.ok) throw new Error(await readErr(res, "Could not save template"));
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. 'Birthday — Balloons')" className="w-full border rounded px-2 py-1.5 text-sm mb-3" />

        {!template && (
          <div className="mb-3 flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) setImagePreview(URL.createObjectURL(f));
            }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
              <Upload size={14} /> Choose flyer background image
            </button>
            {file && <span className="text-xs text-slate-500">{file.name}</span>}
          </div>
        )}

        <div
          onClick={() => { if (!template && !imagePreview) fileInputRef.current?.click(); else setSelectedKey(null); }}
          style={{ width: canvasWpx, height: canvasHpx, position: "relative", backgroundImage: imagePreview ? `url(${imagePreview})` : undefined, backgroundSize: "cover", backgroundColor: "#f8fafc" }}
          className={`border-2 border-slate-300 rounded overflow-hidden select-none ${!template && !imagePreview ? "cursor-pointer hover:border-amber-400" : ""}`}
        >
          {!imagePreview && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm gap-2">
              <Upload size={16} /> Click to upload the flyer background
            </div>
          )}
          {fields.map((f) => (
            <div
              key={f.key}
              onMouseDown={(e) => onPointerDown(e, f, "move")}
              style={{
                position: "absolute",
                left: f.x * canvasWpx, top: f.y * canvasHpx, width: f.w * canvasWpx, height: f.h * canvasHpx,
                border: f.key === selectedKey ? "2px solid #d97706" : "1px dashed #64748b",
                background: f.type === "PHOTO" ? "rgba(37,99,235,0.12)" : f.key === selectedKey ? "rgba(217,119,6,0.12)" : "rgba(100,116,139,0.08)",
                borderRadius: f.type === "PHOTO" && f.circle ? "50%" : 0,
                cursor: "move",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#475569", overflow: "hidden", padding: 2,
              }}
            >
              {f.type === "PHOTO" ? "📷 photo" : `{{${f.key}}}`}
              <div onMouseDown={(e) => onPointerDown(e, f, "resize")} style={{ position: "absolute", right: -4, bottom: -4, width: 10, height: 10, background: "#d97706", borderRadius: 2, cursor: "nwse-resize" }} />
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={() => addField("TEXT")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
            <Plus size={14} /> Add text field
          </button>
          <button onClick={() => addField("PHOTO")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-blue-700 border-blue-300 hover:bg-blue-50">
            <Plus size={14} /> Add photo field
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Use field key <code className="bg-slate-100 px-1 rounded">name</code> for the person's name, <code className="bg-slate-100 px-1 rounded">date</code> for their birthday/anniversary/festival date, and <code className="bg-slate-100 px-1 rounded">years</code> for years old/married (blank if unknown). Any photo field uses that person's stored photo.
        </p>
      </div>

      <div className="border rounded-lg p-3 bg-white h-fit sticky top-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">Fields</div>
        <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
          {fields.map((f) => (
            <button key={f.key} onClick={() => setSelectedKey(f.key)} className={`w-full text-left px-2 py-1 rounded text-xs flex justify-between items-center ${f.key === selectedKey ? "bg-amber-100 text-amber-800" : "hover:bg-slate-50"}`}>
              <span>{f.label} <span className="text-slate-400">{f.type === "PHOTO" ? "(photo)" : `{{${f.key}}}`}</span></span>
              <Trash2 size={12} className="text-slate-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); setFields(fields.filter((x) => x.key !== f.key)); if (selectedKey === f.key) setSelectedKey(null); }} />
            </button>
          ))}
        </div>

        {selected && selected.type === "TEXT" && (
          <div className="space-y-2 border-t pt-2">
            <div>
              <label className="text-xs text-slate-500">Key (used as {`{{key}}`})</label>
              <input value={selected.key} onChange={(e) => {
                // `selected` is looked up by matching selectedKey against
                // fields[].key (see `const selected = ...find(...)` above).
                // Renaming the key here without also updating selectedKey
                // left selectedKey pointing at a key that no longer existed
                // in `fields` after the very next render, so `selected`
                // became null and this whole panel disappeared — which is
                // why every keystroke looked like it "lost" the field and
                // had to be reselected before you could type the next
                // character. Updating both together keeps the lookup valid.
                const newKey = slugKey(e.target.value, fields.filter((f) => f.key !== selected.key).map((f) => f.key));
                updateSelected({ key: newKey });
                setSelectedKey(newKey);
              }} className="w-full border rounded px-2 py-1 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Font</label>
                <select value={selected.fontFamily} onChange={(e) => updateSelected({ fontFamily: e.target.value as FontFamily })} className="w-full border rounded px-2 py-1 text-sm">
                  {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Size (px)</label>
                <input type="number" value={selected.fontSizePt} onChange={(e) => updateSelected({ fontSizePt: Number(e.target.value) || 12 })} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Color</label>
                <input type="color" value={selected.color} onChange={(e) => updateSelected({ color: e.target.value })} className="w-full h-8 border rounded" />
              </div>
              <label className="text-xs text-slate-500 flex items-center gap-1 mt-4">
                <input type="checkbox" checked={selected.bold} onChange={(e) => updateSelected({ bold: e.target.checked })} /> Bold
              </label>
              <div>
                <label className="text-xs text-slate-500">Align</label>
                <select value={selected.align} onChange={(e) => updateSelected({ align: e.target.value as Align })} className="w-full border rounded px-2 py-1 text-sm">
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Vertical</label>
                <select value={selected.verticalAlign} onChange={(e) => updateSelected({ verticalAlign: e.target.value as VAlign })} className="w-full border rounded px-2 py-1 text-sm">
                  <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {selected && selected.type === "PHOTO" && (
          <div className="space-y-2 border-t pt-2">
            <label className="text-xs text-slate-500 flex items-center gap-1">
              <input type="checkbox" checked={selected.circle} onChange={(e) => updateSelected({ circle: e.target.checked })} /> Circular crop
            </label>
          </div>
        )}

        <div className="flex gap-2 mt-4 pt-3 border-t">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded border text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 px-3 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Festivals tab ───────────────────────────

function FestivalsTab({ setError }: { setError: (s: string | null) => void }) {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(""); // yyyy-mm-dd from the picker — only month/day are kept, the year is discarded (festivals recur every year)
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [fRes, tRes] = await Promise.all([
        fetch(`${API_BASE_URL}/events/festivals`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/events/templates?occasionType=FESTIVAL`, { headers: getAuthHeaders() }),
      ]);
      if (!fRes.ok) throw new Error(await readErr(fRes, "Could not load festivals"));
      if (!tRes.ok) throw new Error(await readErr(tRes, "Could not load festival templates"));
      setFestivals(await fRes.json());
      setTemplates(await tRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!name.trim() || !date) return setError("Festival name and date are required");
    const [, monthStr, dayStr] = date.split("-"); // yyyy-mm-dd — year is discarded, this festival recurs every year from here on
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/events/festivals`, {
        method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ name, month: Number(monthStr), day: Number(dayStr), templateId: templateId || undefined }),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not add festival"));
      setName(""); setDate(""); setTemplateId(""); setAdding(false);
      void load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setTemplateFor = async (id: string, newTemplateId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/events/festivals/${id}`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ templateId: newTemplateId || null }),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not update"));
      void load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleActive = async (f: Festival) => {
    try {
      const res = await fetch(`${API_BASE_URL}/events/festivals/${f.id}`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ isActive: !f.isActive }),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not update"));
      void load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/events/festivals/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not delete"));
      void load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        Add each festival once with its month and day — it recurs automatically every year, same as birthdays. (Pick any year in the date field below; only the month and day are kept.) Every active, registered person gets wished on that date, using the flyer template you assign here.
      </p>

      {!adding ? (
        <button onClick={() => setAdding(true)} className="mb-3 flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
          <Plus size={14} /> Add festival
        </button>
      ) : (
        <div className="mb-4 border rounded-lg p-3 max-w-lg flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Festival name (e.g. Diwali)" className="border rounded px-2 py-1.5 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              <option value="">No template yet</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 px-3 py-1.5 rounded border text-sm">Cancel</button>
            <button onClick={add} disabled={saving} className="flex-1 px-3 py-1.5 rounded bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Add"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <Loader2 className="animate-spin text-slate-400" size={20} />
      ) : !festivals.length ? (
        <p className="text-sm text-slate-500">No festivals added yet.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Festival</th>
                <th className="text-left px-3 py-2">Recurs on</th>
                <th className="text-left px-3 py-2">Template</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {festivals.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-3 py-2 font-medium text-slate-800">{f.name}</td>
                  <td className="px-3 py-2 text-slate-600">{formatMonthDay(f.month, f.day)} (every year)</td>
                  <td className="px-3 py-2">
                    <select value={f.templateId ?? ""} onChange={(e) => void setTemplateFor(f.id, e.target.value)} className="border rounded px-2 py-1 text-xs">
                      <option value="">No template yet</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.isActive ? <span className="text-green-700">Active</span> : <span className="text-slate-400">Paused</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => void toggleActive(f)} className="text-xs px-2 py-1 rounded border text-slate-600 hover:bg-slate-50">{f.isActive ? "Pause" : "Activate"}</button>
                      <button onClick={() => void remove(f.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── History tab ───────────────────────────

function HistoryTab({ setError }: { setError: (s: string | null) => void }) {
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/events/logs`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(await readErr(res, "Could not load history"));
        setLogs(await res.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loader2 className="animate-spin text-slate-400" size={20} />;
  if (!logs.length) return <p className="text-sm text-slate-500">No wishes sent yet.</p>;

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2">When</th>
            <th className="text-left px-3 py-2">Person</th>
            <th className="text-left px-3 py-2">Occasion</th>
            <th className="text-left px-3 py-2">Sent to</th>
            <th className="text-left px-3 py-2">Owner copy</th>
            <th className="text-left px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="px-3 py-2 text-slate-500 text-xs">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-slate-800">{l.person?.name ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{OCCASION_LABEL[l.occasionType]}{l.festival ? ` — ${l.festival.name}` : ""}</td>
              <td className="px-3 py-2 text-slate-600">{l.recipientPhone}</td>
              <td className="px-3 py-2 text-slate-600">{l.sentToOwner ? "Yes" : "No"}</td>
              <td className="px-3 py-2">
                {l.status === "SUCCESS" ? (
                  <span className="text-green-700 text-xs flex items-center gap-1"><CheckCircle2 size={12} /> Sent</span>
                ) : (
                  <span className="text-red-600 text-xs" title={l.errorMessage ?? ""}>Failed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
