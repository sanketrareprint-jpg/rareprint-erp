"use client";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  PartyPopper, Upload, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Send, Pencil, X, Image as ImageIcon, Building2,
} from "lucide-react";

// ─────────────────────────── Types ───────────────────────────

const FONT_FAMILIES = ["DejaVu Sans", "Segoe UI", "Noto Sans Devanagari"] as const;
type FontFamily = (typeof FONT_FAMILIES)[number];
type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";
type FieldType = "TEXT" | "PHOTO" | "BRAND_LOGO" | "BRAND_TEXT" | "CLIENT_LOGO" | "CLIENT_TEXT";
type OccasionType = "BIRTHDAY" | "ANNIVERSARY" | "FESTIVAL";
// A template's occasionType additionally allows CLIENT_FESTIVAL (added
// 2026-08-28) — see TemplateOccasionType below. Kept separate from
// OccasionType (which stays person-flow-only: birthday/anniversary/send-test
// dropdowns never offer CLIENT_FESTIVAL) exactly like the backend's
// OCCASION_TYPES vs TEMPLATE_OCCASION_TYPES split in events.service.ts.
type TemplateOccasionType = OccasionType | "CLIENT_FESTIVAL";
type BrandKey = "firmName" | "address" | "phone" | "email" | "website" | "products";
// CLIENT_TEXT-only (added 2026-08-28) — mirrors BrandKey, but sources from
// one EventClientBusiness row instead of RarePrint's own singleton identity.
type ClientKey = "businessName" | "phone" | "address" | "tagline";

const BRAND_KEY_LABEL: Record<BrandKey, string> = {
  firmName: "Firm name", address: "Address", phone: "Phone", email: "Email", website: "Website", products: "Products",
};
const CLIENT_KEY_LABEL: Record<ClientKey, string> = {
  businessName: "Business name", phone: "Phone", address: "Address", tagline: "Tagline",
};

// x/y/w/h are FRACTIONS (0..1) of the template image's own width/height —
// not inches or pixels, since a flyer is only ever a raster image, never
// printed at a physical size (contrast with Certificate Generator's
// inch-based fields). BRAND_LOGO/BRAND_TEXT (added 2026-08-27) are the same
// as PHOTO/TEXT except their value comes from the Brand tab's saved firm
// identity (set once, reused across every template) instead of per-person —
// see brandKey below and the Brand tab further down this file.
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
  brandKey?: BrandKey; // BRAND_TEXT only
  clientKey?: ClientKey; // CLIENT_TEXT only
};

type Template = {
  id: string;
  name: string;
  occasionType: TemplateOccasionType;
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
  isRecurring: boolean; // true (default): month/day, recurs every year. false: one-time custom date, fires once.
  month: number | null; // set when isRecurring=true
  day: number | null;
  oneTimeDate: string | null; // yyyy-mm-dd, set when isRecurring=false
  templateId: string | null;
  // Second, independent template link (added 2026-08-28) — for the client
  // wish cards feature; can be set/unset independently of templateId. See
  // docs/Events_Module_Client_Wish_Cards_Build_Prompt.md.
  clientTemplateId: string | null;
  isActive: boolean;
};

type BrandProfile = {
  id: string;
  logoDataUrl: string | null;
  firmName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  products: string | null;
};

// RarePrint's own B2B customers (added 2026-08-28) — NOT the Brand tab above
// (that's RarePrint's own singleton identity) and NOT People (that's
// RarePrint's own birthday/anniversary/festival contacts). Each business
// listed here gets an auto-generated, self-branded festival wish card
// delivered to its own WhatsApp for it to forward to its own customers.
type ClientBusiness = {
  id: string;
  businessName: string;
  logoDataUrl: string | null;
  phone: string | null;
  address: string | null;
  tagline: string | null;
  whatsappNumber: string;
  isActive: boolean;
};

type ClientWishLog = {
  id: string;
  clientBusinessId: string;
  templateId: string | null;
  festivalId: string;
  occasionYear: number;
  recipientPhone: string;
  status: "SUCCESS" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  clientBusiness: { businessName: string } | null;
  festival: { name: string } | null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonthDay(month: number, day: number): string {
  return `${day} ${MONTH_NAMES[month - 1] ?? month}`;
}
function formatOneTimeDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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

const OCCASION_LABEL: Record<TemplateOccasionType, string> = { BIRTHDAY: "Birthday", ANNIVERSARY: "Anniversary", FESTIVAL: "Festival", CLIENT_FESTIVAL: "Client Wish Card" };

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
  const [tab, setTab] = useState<"people" | "templates" | "brand" | "clients" | "festivals" | "history">("people");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-dismiss the success banner after a few seconds -- unlike the error
  // banner, which stays until the user reads it and closes it, a "sent!"
  // confirmation shouldn't linger and get mistaken for a still-current state.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const TABS: Array<[typeof tab, string]> = [
    ["people", "People"],
    ["templates", "Flyer Templates"],
    ["brand", "Brand"],
    ["clients", "Client Businesses"],
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

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
            <CheckCircle2 size={16} /> {success}
            <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-600"><X size={14} /></button>
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

        {tab === "people" && <PeopleTab setError={setError} setSuccess={setSuccess} />}
        {tab === "templates" && <TemplatesTab setError={setError} />}
        {tab === "brand" && <BrandTab setError={setError} />}
        {tab === "clients" && <ClientBusinessesTab setError={setError} setSuccess={setSuccess} />}
        {tab === "festivals" && <FestivalsTab setError={setError} />}
        {tab === "history" && <HistoryTab setError={setError} />}
      </div>
    </DashboardShell>
  );
}

// ─────────────────────────── People tab ───────────────────────────

function PeopleTab({ setError, setSuccess }: { setError: (s: string | null) => void; setSuccess: (s: string | null) => void }) {
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
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/events/people/${personId}/send-test`, {
        method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ occasionType }),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not send"));
      const result = await res.json();
      if (!result.sent) {
        setError(result.errorMessage || "Send did not reach this person — check the AiSensy template/campaign setup");
      } else {
        const name = people.find((p) => p.id === personId)?.name ?? "this person";
        setSuccess(`Sent — check WhatsApp for ${name}'s test wish.`);
      }
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
  const [occasionFilter, setOccasionFilter] = useState<TemplateOccasionType>("BIRTHDAY");
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
        {(["BIRTHDAY", "ANNIVERSARY", "FESTIVAL", "CLIENT_FESTIVAL"] as TemplateOccasionType[]).map((o) => (
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
  template: Template | null; defaultOccasionType: TemplateOccasionType; onCancel: () => void; onSaved: () => void; setError: (s: string | null) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [occasionType] = useState<TemplateOccasionType>(template?.occasionType ?? defaultOccasionType);
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
    const labelBase =
      type === "PHOTO" ? "Photo"
      : type === "BRAND_LOGO" ? "Logo"
      : type === "BRAND_TEXT" ? "Brand text"
      : type === "CLIENT_LOGO" ? "Client logo"
      : type === "CLIENT_TEXT" ? "Client text"
      : "Field";
    const label = `${labelBase} ${fields.length + 1}`;
    const key = slugKey(type === "PHOTO" ? "photo" : type === "BRAND_LOGO" ? "brand_logo" : type === "CLIENT_LOGO" ? "client_logo" : label, fields.map((f) => f.key));
    const f: FlyerField =
      type === "PHOTO" || type === "BRAND_LOGO" || type === "CLIENT_LOGO"
        ? { key, label, type, x: 0.3, y: 0.1, w: 0.4, h: 0.3, circle: type === "PHOTO" }
        : type === "BRAND_TEXT"
          ? { key, label, type, x: 0.1, y: 0.85, w: 0.8, h: 0.08, fontFamily: "DejaVu Sans", fontSizePt: 20, bold: false, color: "#111111", align: "center", verticalAlign: "middle", brandKey: "firmName" }
          : type === "CLIENT_TEXT"
            ? { key, label, type, x: 0.1, y: 0.85, w: 0.8, h: 0.08, fontFamily: "DejaVu Sans", fontSizePt: 20, bold: false, color: "#111111", align: "center", verticalAlign: "middle", clientKey: "businessName" }
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
                background:
                  f.type === "PHOTO" || f.type === "BRAND_LOGO" || f.type === "CLIENT_LOGO" ? "rgba(37,99,235,0.12)"
                  : f.type === "BRAND_TEXT" ? "rgba(21,128,61,0.12)"
                  : f.type === "CLIENT_TEXT" ? "rgba(147,51,234,0.12)"
                  : f.key === selectedKey ? "rgba(217,119,6,0.12)" : "rgba(100,116,139,0.08)",
                borderRadius: (f.type === "PHOTO" || f.type === "BRAND_LOGO" || f.type === "CLIENT_LOGO") && f.circle ? "50%" : 0,
                cursor: "move",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "#475569", overflow: "hidden", padding: 2,
              }}
            >
              {f.type === "PHOTO" ? "📷 photo"
                : f.type === "BRAND_LOGO" ? "🏢 logo"
                : f.type === "CLIENT_LOGO" ? "🏬 client logo"
                : f.type === "BRAND_TEXT" ? `{{brand:${f.brandKey}}}`
                : f.type === "CLIENT_TEXT" ? `{{client:${f.clientKey}}}`
                : `{{${f.key}}}`}
              <div onMouseDown={(e) => onPointerDown(e, f, "resize")} style={{ position: "absolute", right: -4, bottom: -4, width: 10, height: 10, background: "#d97706", borderRadius: 2, cursor: "nwse-resize" }} />
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => addField("TEXT")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
            <Plus size={14} /> Add text field
          </button>
          <button onClick={() => addField("PHOTO")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-blue-700 border-blue-300 hover:bg-blue-50">
            <Plus size={14} /> Add photo field
          </button>
          <button onClick={() => addField("BRAND_LOGO")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-blue-700 border-blue-300 hover:bg-blue-50">
            <Building2 size={14} /> Add brand logo field
          </button>
          <button onClick={() => addField("BRAND_TEXT")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-green-700 border-green-300 hover:bg-green-50">
            <Building2 size={14} /> Add brand text field
          </button>
          {occasionType === "CLIENT_FESTIVAL" && (
            <>
              <button onClick={() => addField("CLIENT_LOGO")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-purple-700 border-purple-300 hover:bg-purple-50">
                <Building2 size={14} /> Add client logo field
              </button>
              <button onClick={() => addField("CLIENT_TEXT")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-purple-700 border-purple-300 hover:bg-purple-50">
                <Building2 size={14} /> Add client text field
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {occasionType === "CLIENT_FESTIVAL" ? (
            <>
              This is a <span className="font-semibold">Client Wish Card</span> template — it gets rendered once per active client business (from the <span className="font-semibold">Client Businesses</span> tab) rather than per person. Use client logo/text fields to place that business's own logo, name, phone, address, and tagline — never a person's name or photo. Brand fields (RarePrint's own identity) can still be added too, e.g. to add a small "Wish card by RarePrint" credit.
            </>
          ) : (
            <>
              Use field key <code className="bg-slate-100 px-1 rounded">name</code> for the person's name, <code className="bg-slate-100 px-1 rounded">date</code> for their birthday/anniversary/festival date, and <code className="bg-slate-100 px-1 rounded">years</code> for years old/married (blank if unknown). Any photo field uses that person's stored photo. Brand logo/text fields pull automatically from the values you set on the <span className="font-semibold">Brand</span> tab (logo, firm name, address, phone, email, website, products) — the same firm identity is reused across every template.
            </>
          )}
        </p>
      </div>

      <div className="border rounded-lg p-3 bg-white h-fit sticky top-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">Fields</div>
        <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
          {fields.map((f) => (
            <button key={f.key} onClick={() => setSelectedKey(f.key)} className={`w-full text-left px-2 py-1 rounded text-xs flex justify-between items-center ${f.key === selectedKey ? "bg-amber-100 text-amber-800" : "hover:bg-slate-50"}`}>
              <span>{f.label} <span className="text-slate-400">
                {f.type === "PHOTO" ? "(photo)"
                  : f.type === "BRAND_LOGO" ? "(brand logo)"
                  : f.type === "CLIENT_LOGO" ? "(client logo)"
                  : f.type === "BRAND_TEXT" ? `(brand: ${BRAND_KEY_LABEL[f.brandKey ?? "firmName"]})`
                  : f.type === "CLIENT_TEXT" ? `(client: ${CLIENT_KEY_LABEL[f.clientKey ?? "businessName"]})`
                  : `{{${f.key}}}`}
              </span></span>
              <Trash2 size={12} className="text-slate-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); setFields(fields.filter((x) => x.key !== f.key)); if (selectedKey === f.key) setSelectedKey(null); }} />
            </button>
          ))}
        </div>

        {selected && (selected.type === "TEXT" || selected.type === "BRAND_TEXT" || selected.type === "CLIENT_TEXT") && (
          <div className="space-y-2 border-t pt-2">
            {selected.type === "BRAND_TEXT" ? (
              <div>
                <label className="text-xs text-slate-500">Brand field</label>
                <select value={selected.brandKey ?? "firmName"} onChange={(e) => updateSelected({ brandKey: e.target.value as BrandKey })} className="w-full border rounded px-2 py-1 text-sm">
                  {(Object.keys(BRAND_KEY_LABEL) as BrandKey[]).map((k) => <option key={k} value={k}>{BRAND_KEY_LABEL[k]}</option>)}
                </select>
              </div>
            ) : selected.type === "CLIENT_TEXT" ? (
              <div>
                <label className="text-xs text-slate-500">Client field</label>
                <select value={selected.clientKey ?? "businessName"} onChange={(e) => updateSelected({ clientKey: e.target.value as ClientKey })} className="w-full border rounded px-2 py-1 text-sm">
                  {(Object.keys(CLIENT_KEY_LABEL) as ClientKey[]).map((k) => <option key={k} value={k}>{CLIENT_KEY_LABEL[k]}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs text-slate-500">Key (used as {`{{key}}`})</label>
                <input value={selected.key} onChange={(e) => updateSelected({ key: slugKey(e.target.value, fields.filter((f) => f.key !== selected.key).map((f) => f.key)) })} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
            )}
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

        {selected && (selected.type === "PHOTO" || selected.type === "BRAND_LOGO" || selected.type === "CLIENT_LOGO") && (
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

// ─────────────────────────── Brand tab ───────────────────────────
//
// Firm identity — logo, name, address, phone, email, website, products — set
// once here and reused by every template's BRAND_LOGO/BRAND_TEXT fields, so
// designers don't have to bake branding into each uploaded background image.
// Backed by the singleton EventBrandProfile row (GET/PATCH events/brand-profile).

function BrandTab({ setError }: { setError: (s: string | null) => void }) {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [firmName, setFirmName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [products, setProducts] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/events/brand-profile`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not load brand profile"));
      const p: BrandProfile = await res.json();
      setProfile(p);
      setFirmName(p.firmName ?? "");
      setAddress(p.address ?? "");
      setPhone(p.phone ?? "");
      setEmail(p.email ?? "");
      setWebsite(p.website ?? "");
      setProducts(p.products ?? "");
      setPreview(p.logoDataUrl ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("firmName", firmName);
      formData.append("address", address);
      formData.append("phone", phone);
      formData.append("email", email);
      formData.append("website", website);
      formData.append("products", products);
      if (file) formData.append("logo", file);
      const res = await fetch(`${API_BASE_URL}/events/brand-profile`, { method: "PATCH", headers: uploadHeaders(), body: formData });
      if (!res.ok) throw new Error(await readErr(res, "Could not save brand profile"));
      const p: BrandProfile = await res.json();
      setProfile(p);
      setFile(null);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader2 className="animate-spin text-slate-400" size={20} />;

  return (
    <div className="max-w-lg">
      <p className="text-sm text-slate-500 mb-3">
        Set your firm's identity once here — logo, name, address, phone, email, website, products. Every flyer template can place "Brand" fields (via the template editor's brand-field buttons) that pull from these values automatically, so you don't need to redraw your branding into every uploaded background image.
      </p>
      <div className="border rounded-lg p-4 bg-white space-y-3">
        <div className="flex items-center gap-3">
          {preview ? <img src={preview} className="w-16 h-16 rounded object-contain border bg-slate-50" /> : <div className="w-16 h-16 rounded bg-slate-100 border flex items-center justify-center"><Building2 size={20} className="text-slate-300" /></div>}
          <label className="text-xs px-3 py-1.5 rounded border text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer">
            Upload logo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) setPreview(URL.createObjectURL(f));
            }} />
          </label>
        </div>
        <div>
          <label className="text-xs text-slate-500">Firm name</label>
          <input value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="RAREPRINT" className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Address</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Available products (optional)</label>
          <textarea value={products} onChange={(e) => setProducts(e.target.value)} rows={2} placeholder="e.g. Visiting cards, Banners, Flex printing" className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-center gap-2 pt-2 border-t">
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Save
          </button>
          {saved && <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Client Businesses tab ───────────────────────────
//
// RarePrint's own B2B customers (added 2026-08-28) — NOT the Brand tab above.
// Each business listed here automatically receives a ready-to-share festival
// wish card, self-branded with its own logo/name/phone/address/tagline, on
// every festival date that has a Client Wish Card template assigned (see the
// Festivals tab's second dropdown). What the business does with the image —
// post it to their own WhatsApp Status, forward it to their own customers —
// is entirely up to them; RarePrint's job stops at creating and delivering
// the image. See docs/Events_Module_Client_Wish_Cards_Build_Prompt.md.

function ClientBusinessesTab({ setError, setSuccess }: { setError: (s: string | null) => void; setSuccess: (s: string | null) => void }) {
  const [businesses, setBusinesses] = useState<ClientBusiness[]>([]);
  const [clientFestivals, setClientFestivals] = useState<Festival[]>([]); // only festivals with a clientTemplateId assigned — usable for test-sends
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClientBusiness | null | "new">(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [testFestivalId, setTestFestivalId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, fRes] = await Promise.all([
        fetch(`${API_BASE_URL}/events/client-businesses`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/events/festivals`, { headers: getAuthHeaders() }),
      ]);
      if (!bRes.ok) throw new Error(await readErr(bRes, "Could not load client businesses"));
      if (!fRes.ok) throw new Error(await readErr(fRes, "Could not load festivals"));
      setBusinesses(await bRes.json());
      const allFestivals: Festival[] = await fRes.json();
      setClientFestivals(allFestivals.filter((f) => f.clientTemplateId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!testFestivalId && clientFestivals.length) setTestFestivalId(clientFestivals[0].id);
  }, [clientFestivals, testFestivalId]);

  const sendTest = async (businessId: string) => {
    if (!testFestivalId) return setError("No festival has a Client Wish Card template assigned yet — set one on the Festivals tab first");
    setSendingFor(businessId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/events/client-businesses/${businessId}/send-test`, {
        method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ festivalId: testFestivalId }),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not send"));
      const result = await res.json();
      if (!result.sent) {
        setError(result.errorMessage || "Send did not reach this business — check the AiSensy client-wish-card template/campaign setup");
      } else {
        const name = businesses.find((b) => b.id === businessId)?.businessName ?? "this business";
        setSuccess(`Sent — check WhatsApp for ${name}'s test wish card.`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingFor(null);
    }
  };

  if (editing) {
    return (
      <ClientBusinessForm
        business={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
        setError={setError}
      />
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        RarePrint's own client businesses — shops, clinics, firms, and so on. Each one listed here automatically gets a ready-to-share festival wish card, self-branded with its own logo and details, delivered on every festival date that has a Client Wish Card template assigned (Festivals tab). What they do with it from there — post it to their own WhatsApp Status, forward it to their customers — is entirely up to them.
      </p>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={() => setEditing("new")} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
          <Plus size={14} /> Add client business
        </button>
        {clientFestivals.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            Test-send using:
            <select value={testFestivalId} onChange={(e) => setTestFestivalId(e.target.value)} className="border rounded px-2 py-1 text-xs">
              {clientFestivals.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <Loader2 className="animate-spin text-slate-400" size={20} />
      ) : !businesses.length ? (
        <p className="text-sm text-slate-500">No client businesses added yet.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Business</th>
                <th className="text-left px-3 py-2">WhatsApp</th>
                <th className="text-left px-3 py-2">Phone</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2 font-medium text-slate-800 flex items-center gap-2">
                    {b.logoDataUrl ? <img src={b.logoDataUrl} className="w-6 h-6 rounded object-contain bg-slate-50 border" /> : <div className="w-6 h-6 rounded bg-slate-200" />}
                    {b.businessName}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{b.whatsappNumber}</td>
                  <td className="px-3 py-2 text-slate-600">{b.phone ?? "—"}</td>
                  <td className="px-3 py-2">{b.isActive ? <span className="text-green-700 text-xs">Active</span> : <span className="text-slate-400 text-xs">Paused</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2 items-center">
                      <button disabled={sendingFor === b.id || !testFestivalId} onClick={() => void sendTest(b.id)} title="Send a test wish card now" className="text-xs px-2 py-1 rounded border text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50 flex items-center gap-1">
                        {sendingFor === b.id ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />} Test
                      </button>
                      <button onClick={() => setEditing(b)} className="text-slate-400 hover:text-amber-600"><Pencil size={14} /></button>
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

function ClientBusinessForm({ business, onCancel, onSaved, setError }: { business: ClientBusiness | null; onCancel: () => void; onSaved: () => void; setError: (s: string | null) => void }) {
  const [businessName, setBusinessName] = useState(business?.businessName ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(business?.whatsappNumber ?? "");
  const [phone, setPhone] = useState(business?.phone ?? "");
  const [address, setAddress] = useState(business?.address ?? "");
  const [tagline, setTagline] = useState(business?.tagline ?? "");
  const [isActive, setIsActive] = useState(business?.isActive ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(business?.logoDataUrl ?? null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!businessName.trim()) return setError("Business name is required");
    if (!whatsappNumber.trim()) return setError("WhatsApp number is required");
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("businessName", businessName);
      formData.append("whatsappNumber", whatsappNumber);
      formData.append("phone", phone);
      formData.append("address", address);
      formData.append("tagline", tagline);
      if (business) formData.append("isActive", String(isActive));
      if (file) formData.append("file", file);
      const url = business ? `${API_BASE_URL}/events/client-businesses/${business.id}` : `${API_BASE_URL}/events/client-businesses`;
      const res = await fetch(url, { method: business ? "PATCH" : "POST", headers: uploadHeaders(), body: formData });
      if (!res.ok) throw new Error(await readErr(res, "Could not save"));
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!business) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/events/client-businesses/${business.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await readErr(res, "Could not delete — try pausing this business instead"));
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-lg border rounded-lg p-4 bg-white">
      <h2 className="font-semibold text-slate-800 mb-3">{business ? "Edit client business" : "Add a client business"}</h2>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {preview ? <img src={preview} className="w-14 h-14 rounded object-contain border bg-slate-50" /> : <div className="w-14 h-14 rounded bg-slate-100 border flex items-center justify-center"><Building2 size={18} className="text-slate-300" /></div>}
          <label className="text-xs px-3 py-1.5 rounded border text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer">
            Upload logo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) setPreview(URL.createObjectURL(f));
            }} />
          </label>
        </div>
        <div>
          <label className="text-xs text-slate-500">Business name</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">WhatsApp number (wish card delivered here)</label>
            <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="9XXXXXXXXX" className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Phone (shown on the card, optional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Address (optional)</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Tagline (optional)</label>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        {business && (
          <label className="text-xs text-slate-600 flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (paused businesses don't receive automatic wish cards)
          </label>
        )}
      </div>
      <div className="flex gap-2 mt-4 pt-3 border-t">
        {business && (
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

// ─────────────────────────── Festivals tab ───────────────────────────

function FestivalsTab({ setError }: { setError: (s: string | null) => void }) {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clientTemplates, setClientTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [isRecurring, setIsRecurring] = useState(true);
  const [date, setDate] = useState(""); // yyyy-mm-dd from the picker — for recurring festivals only month/day are kept (year discarded); for one-time festivals the full date is kept
  const [templateId, setTemplateId] = useState("");
  const [clientTemplateId, setClientTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [fRes, tRes, ctRes] = await Promise.all([
        fetch(`${API_BASE_URL}/events/festivals`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/events/templates?occasionType=FESTIVAL`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/events/templates?occasionType=CLIENT_FESTIVAL`, { headers: getAuthHeaders() }),
      ]);
      if (!fRes.ok) throw new Error(await readErr(fRes, "Could not load festivals"));
      if (!tRes.ok) throw new Error(await readErr(tRes, "Could not load festival templates"));
      if (!ctRes.ok) throw new Error(await readErr(ctRes, "Could not load client wish card templates"));
      setFestivals(await fRes.json());
      setTemplates(await tRes.json());
      setClientTemplates(await ctRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!name.trim() || !date) return setError("Festival name and date are required");
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, isRecurring, templateId: templateId || undefined, clientTemplateId: clientTemplateId || undefined };
      if (isRecurring) {
        const [, monthStr, dayStr] = date.split("-"); // yyyy-mm-dd — year is discarded, this festival recurs every year from here on
        body.month = Number(monthStr);
        body.day = Number(dayStr);
      } else {
        body.oneTimeDate = date; // exact calendar date — this festival fires once and never again
      }
      const res = await fetch(`${API_BASE_URL}/events/festivals`, {
        method: "POST", headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readErr(res, "Could not add festival"));
      setName(""); setDate(""); setTemplateId(""); setClientTemplateId(""); setIsRecurring(true); setAdding(false);
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

  const setClientTemplateFor = async (id: string, newClientTemplateId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/events/festivals/${id}`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ clientTemplateId: newClientTemplateId || null }),
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
        Add a festival either as recurring (its month and day repeat automatically every year, same as birthdays — pick any year in the date field, only the month and day are kept) or as a one-time custom date (fires once on that exact date and never again — useful for a special event that isn't a yearly festival). Every active, registered person gets wished on that date, using the flyer template you assign here.
      </p>

      {!adding ? (
        <button onClick={() => setAdding(true)} className="mb-3 flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
          <Plus size={14} /> Add festival
        </button>
      ) : (
        <div className="mb-4 border rounded-lg p-3 max-w-lg flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Festival name (e.g. Diwali)" className="border rounded px-2 py-1.5 text-sm" />
          <div className="flex gap-1">
            <button type="button" onClick={() => { setIsRecurring(true); setDate(""); }} className={`flex-1 text-xs px-2 py-1.5 rounded border ${isRecurring ? "bg-amber-600 text-white border-amber-600" : "text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
              Recurring every year
            </button>
            <button type="button" onClick={() => { setIsRecurring(false); setDate(""); }} className={`flex-1 text-xs px-2 py-1.5 rounded border ${!isRecurring ? "bg-amber-600 text-white border-amber-600" : "text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
              One-time custom date
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              <option value="">No own-customer template yet</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Client Wish Card template (optional — for RarePrint's own client businesses, see the Client Businesses tab)</label>
            <select value={clientTemplateId} onChange={(e) => setClientTemplateId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">No client wish card template</option>
              {clientTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {!isRecurring && <p className="text-xs text-slate-400">This will send once, on this exact date, then never fire again.</p>}
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
                <th className="text-left px-3 py-2">Own-customer template</th>
                <th className="text-left px-3 py-2">Client Wish Card template</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {festivals.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-3 py-2 font-medium text-slate-800">{f.name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {f.isRecurring && f.month && f.day ? `${formatMonthDay(f.month, f.day)} (every year)` : f.oneTimeDate ? `${formatOneTimeDate(f.oneTimeDate)} (once)` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select value={f.templateId ?? ""} onChange={(e) => void setTemplateFor(f.id, e.target.value)} className="border rounded px-2 py-1 text-xs">
                      <option value="">No template yet</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select value={f.clientTemplateId ?? ""} onChange={(e) => void setClientTemplateFor(f.id, e.target.value)} className="border rounded px-2 py-1 text-xs">
                      <option value="">None</option>
                      {clientTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
  const [clientLogs, setClientLogs] = useState<ClientWishLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [res, clientRes] = await Promise.all([
          fetch(`${API_BASE_URL}/events/logs`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE_URL}/events/client-wish-logs`, { headers: getAuthHeaders() }),
        ]);
        if (!res.ok) throw new Error(await readErr(res, "Could not load history"));
        if (!clientRes.ok) throw new Error(await readErr(clientRes, "Could not load client wish card history"));
        setLogs(await res.json());
        setClientLogs(await clientRes.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loader2 className="animate-spin text-slate-400" size={20} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Birthday / Anniversary / Festival wishes</h2>
        {!logs.length ? (
          <p className="text-sm text-slate-500">No wishes sent yet.</p>
        ) : (
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
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Client Wish Cards (RarePrint's client businesses)</h2>
        {!clientLogs.length ? (
          <p className="text-sm text-slate-500">No client wish cards sent yet.</p>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Client business</th>
                  <th className="text-left px-3 py-2">Festival</th>
                  <th className="text-left px-3 py-2">Sent to</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {clientLogs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2 text-slate-500 text-xs">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-slate-800">{l.clientBusiness?.businessName ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{l.festival?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{l.recipientPhone}</td>
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
        )}
      </div>
    </div>
  );
}
