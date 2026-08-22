"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Award, Upload, Plus, Trash2, Loader2, Download, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, RotateCw } from "lucide-react";

// ─────────────────────────── Types ───────────────────────────

const FONT_FAMILIES = ["DejaVu Sans", "Segoe UI"] as const;
type FontFamily = (typeof FONT_FAMILIES)[number];
type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";

type FieldConfig = {
  key: string;
  label: string;
  x: number; y: number; w: number; h: number; // inches
  fontFamily: FontFamily;
  fontSizePt: number;
  bold: boolean;
  color: string;
  align: Align;
  verticalAlign: VAlign;
};

type Template = {
  id: string;
  name: string;
  widthIn: number;
  heightIn: number;
  dpi: number;
  fields: FieldConfig[];
  imageDataUrl?: string;
};

type SheetSettings = {
  sheetWidthIn: number;
  sheetHeightIn: number;
  marginIn: number;
  gapIn: number;
  allowRotation: boolean;
};

type JobUploadResult = {
  jobId: string;
  columns: string[];
  suggestedMapping: Record<string, string>;
  rowCount: number;
  sampleRows: Record<string, string>[];
  validation: { validCount: number; invalidCount: number; invalid: { rowIndex: number; reason: string }[] };
};

type JobStatus = {
  id: string;
  status: "DRAFT" | "PROCESSING" | "COMPLETED" | "FAILED";
  rowsTotal: number;
  rowsGenerated: number;
  rowsFailed: number;
  errorMessage: string | null;
};

const DEFAULT_SHEET: SheetSettings = { sheetWidthIn: 12, sheetHeightIn: 18, marginIn: 0.25, gapIn: 0.1, allowRotation: true };
const EDITOR_MAX_WIDTH_PX = 640;

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

// ─────────────────────────── Page ───────────────────────────

export default function CertificateGeneratorPage() {
  const [step, setStep] = useState<"templates" | "editor" | "upload" | "mapping" | "sheet" | "generate">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [job, setJob] = useState<JobUploadResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [invalidRowMode, setInvalidRowMode] = useState<"SKIP" | "BLANK">("SKIP");
  const [sheetSettings, setSheetSettings] = useState<SheetSettings>(DEFAULT_SHEET);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE_URL}/certificate-generator/templates`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Could not load templates");
      setTemplates(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  // Poll job status while generating
  useEffect(() => {
    if (!job || step !== "generate" || !jobStatus || jobStatus.status !== "PROCESSING") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/certificate-generator/jobs/${job.jobId}`, { headers: getAuthHeaders() });
        if (res.ok) setJobStatus(await res.json());
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [job, step, jobStatus?.status]);

  // The templates list endpoint omits imageDataUrl (it can be large — no
  // point downloading every template's image just to render a gallery), so
  // fetch the full record before opening the editor/generate flow.
  const openTemplateForEditing = async (t: Template) => {
    try {
      const res = await fetch(`${API_BASE_URL}/certificate-generator/templates/${t.id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Could not load this template");
      const full = await res.json();
      const loaded: Template = { ...full, widthIn: Number(full.widthIn), heightIn: Number(full.heightIn), fields: fromApiFields(full.fields) };
      setTemplate(loaded);
      setFields(loaded.fields ?? []);
      setImagePreview(loaded.imageDataUrl ?? null);
      setStep("editor");
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Award className="text-amber-600" size={24} />
          <h1 className="text-xl font-bold text-slate-800">Certificate Generator</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <StepBar step={step} />

        {step === "templates" && (
          <TemplatesStep
            templates={templates}
            loading={loadingTemplates}
            onCreateNew={() => {
              setTemplate(null);
              setFields([]);
              setImagePreview(null);
              setStep("editor");
            }}
            onEdit={openTemplateForEditing}
            onUse={(t) => {
              openTemplateForEditing(t);
            }}
            onDelete={async (id) => {
              try {
                const res = await fetch(`${API_BASE_URL}/certificate-generator/templates/${id}`, { method: "DELETE", headers: getAuthHeaders() });
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not delete template");
                void loadTemplates();
              } catch (e: any) {
                setError(e.message);
              }
            }}
          />
        )}

        {step === "editor" && (
          <EditorStep
            template={template}
            fields={fields}
            setFields={setFields}
            imagePreview={imagePreview}
            setImagePreview={setImagePreview}
            onSaved={(t) => {
              setTemplate(t);
              setFields(t.fields);
              void loadTemplates();
              setStep("upload");
            }}
            onCancel={() => setStep("templates")}
            setError={setError}
          />
        )}

        {step === "upload" && template && (
          <UploadStep
            templateId={template.id}
            onUploaded={(result) => {
              setJob(result);
              setColumnMapping(result.suggestedMapping);
              setStep("mapping");
            }}
            onBack={() => setStep("templates")}
            setError={setError}
          />
        )}

        {step === "mapping" && job && template && (
          <MappingStep
            job={job}
            templateId={template.id}
            fields={fields}
            columnMapping={columnMapping}
            setColumnMapping={setColumnMapping}
            invalidRowMode={invalidRowMode}
            setInvalidRowMode={setInvalidRowMode}
            onNext={() => setStep("sheet")}
            onBack={() => setStep("upload")}
          />
        )}

        {step === "sheet" && template && (
          <SheetStep
            certWidthIn={template.widthIn}
            certHeightIn={template.heightIn}
            sheetSettings={sheetSettings}
            setSheetSettings={setSheetSettings}
            onBack={() => setStep("mapping")}
            onGenerate={async () => {
              if (!job) return;
              setError(null);
              try {
                const res = await fetch(`${API_BASE_URL}/certificate-generator/jobs/${job.jobId}/generate`, {
                  method: "POST",
                  headers: getAuthHeaders(),
                  body: JSON.stringify({ columnMapping, sheetSettings, invalidRowMode }),
                });
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not start generation");
                setJobStatus({ id: job.jobId, status: "PROCESSING", rowsTotal: job.rowCount, rowsGenerated: 0, rowsFailed: 0, errorMessage: null });
                setStep("generate");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          />
        )}

        {step === "generate" && job && jobStatus && (
          <GenerateStep jobId={job.jobId} status={jobStatus} onStartOver={() => setStep("templates")} />
        )}
      </div>
    </DashboardShell>
  );
}

// ─────────────────────────── Step bar ───────────────────────────

function StepBar({ step }: { step: string }) {
  const steps: Array<[string, string]> = [
    ["templates", "Template"],
    ["editor", "Fields"],
    ["upload", "Upload"],
    ["mapping", "Map & Validate"],
    ["sheet", "Sheet Settings"],
    ["generate", "Generate"],
  ];
  const idx = steps.findIndex(([k]) => k === step);
  return (
    <div className="flex flex-wrap items-center gap-1 mb-5 text-xs">
      {steps.map(([k, label], i) => (
        <div key={k} className="flex items-center gap-1">
          <span
            className={`px-2 py-1 rounded-full font-semibold ${
              i === idx ? "bg-amber-600 text-white" : i < idx ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            {i + 1}. {label}
          </span>
          {i < steps.length - 1 && <span className="text-slate-300">→</span>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Step 1: Templates ───────────────────────────

function TemplatesStep({
  templates, loading, onCreateNew, onEdit, onUse, onDelete,
}: {
  templates: Template[];
  loading: boolean;
  onCreateNew: () => void;
  onEdit: (t: Template) => void;
  onUse: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onCreateNew}
        className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
      >
        <Plus size={16} /> New Certificate Template
      </button>

      {loading ? (
        <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="text-slate-400 text-sm p-6 border border-dashed rounded-lg text-center">
          No templates yet — create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="border rounded-lg p-3 bg-white shadow-sm">
              <div className="font-semibold text-slate-800 text-sm">{t.name}</div>
              <div className="text-xs text-slate-500 mb-2">
                {Number(t.widthIn)}×{Number(t.heightIn)}in · {t.dpi} DPI · {t.fields?.length ?? 0} field(s)
              </div>
              <div className="flex gap-2">
                <button onClick={() => onUse(t)} className="flex-1 px-2 py-1.5 rounded bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
                  Use for a batch
                </button>
                <button onClick={() => onEdit(t)} className="px-2 py-1.5 rounded border text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Edit
                </button>
                <button onClick={() => onDelete(t.id)} className="px-2 py-1.5 rounded border text-xs text-red-500 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Step 2: Field editor ───────────────────────────

function EditorStep({
  template, fields, setFields, imagePreview, setImagePreview, onSaved, onCancel, setError,
}: {
  template: Template | null;
  fields: FieldConfig[];
  setFields: React.Dispatch<React.SetStateAction<FieldConfig[]>>;
  imagePreview: string | null;
  setImagePreview: (s: string | null) => void;
  onSaved: (t: Template) => void;
  onCancel: () => void;
  setError: (s: string | null) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [unit, setUnit] = useState<"in" | "mm" | "cm">("in");
  const [widthIn, setWidthIn] = useState(template ? Number(template.widthIn) : 11.5);
  const [heightIn, setHeightIn] = useState(template ? Number(template.heightIn) : 8.5);
  const [dpi, setDpi] = useState(template?.dpi ?? 300);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toIn = (v: number) => (unit === "in" ? v : unit === "mm" ? v / 25.4 : v / 2.54);
  const fromIn = (v: number) => (unit === "in" ? v : unit === "mm" ? v * 25.4 : v * 2.54);

  const pxPerIn = Math.min(EDITOR_MAX_WIDTH_PX / widthIn, 700 / heightIn);
  const canvasWpx = widthIn * pxPerIn;
  const canvasHpx = heightIn * pxPerIn;
  const pxW = widthIn * dpi;
  const pxH = heightIn * dpi;

  const selected = fields.find((f) => f.key === selectedKey) ?? null;

  const addField = () => {
    const label = `Field ${fields.length + 1}`;
    const key = slugKey(label, fields.map((f) => f.key));
    const f: FieldConfig = {
      key, label, x: widthIn * 0.2, y: heightIn * 0.4, w: widthIn * 0.6, h: heightIn * 0.12,
      fontFamily: "DejaVu Sans", fontSizePt: 24, bold: false, color: "#111111", align: "center", verticalAlign: "middle",
    };
    setFields([...fields, f]);
    setSelectedKey(key);
  };

  const updateSelected = (patch: Partial<FieldConfig>) => {
    if (!selectedKey) return;
    setFields(fields.map((f) => (f.key === selectedKey ? { ...f, ...patch } : f)));
  };

  // Each drag gesture registers its OWN move/up closures (rather than
  // reusing component-scope functions) and removes exactly those same
  // closure instances on mouseup — reusing a function identity that gets
  // recreated on every render (which setFields inside a drag triggers)
  // would make removeEventListener silently no-op and leak listeners.
  const onPointerDown = (e: React.MouseEvent, f: FieldConfig, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelectedKey(f.key);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = f;

    const move = (ev: MouseEvent) => {
      const dxIn = (ev.clientX - startX) / pxPerIn;
      const dyIn = (ev.clientY - startY) / pxPerIn;
      if (mode === "move") {
        const x = Math.max(0, Math.min(widthIn - orig.w, orig.x + dxIn));
        const y = Math.max(0, Math.min(heightIn - orig.h, orig.y + dyIn));
        setFields((prev) => prev.map((field) => (field.key === orig.key ? { ...field, x, y } : field)));
      } else {
        const w = Math.max(0.2, Math.min(widthIn - orig.x, orig.w + dxIn));
        const h = Math.max(0.1, Math.min(heightIn - orig.y, orig.h + dyIn));
        setFields((prev) => prev.map((field) => (field.key === orig.key ? { ...field, w, h } : field)));
      }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
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
        formData.append("widthIn", String(widthIn));
        formData.append("heightIn", String(heightIn));
        formData.append("dpi", String(dpi));
        formData.append("fields", JSON.stringify(fields.map(toApiField)));
        formData.append("file", file as File);
        const res = await fetch(`${API_BASE_URL}/certificate-generator/templates`, { method: "POST", headers: uploadHeaders(), body: formData });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not save template");
        const created = await res.json();
        onSaved({ ...created, widthIn: Number(created.widthIn), heightIn: Number(created.heightIn), fields: fromApiFields(created.fields) });
      } else {
        const res = await fetch(`${API_BASE_URL}/certificate-generator/templates/${template.id}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ name, fields: fields.map(toApiField) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not save template");
        const updated = await res.json();
        onSaved({ ...updated, widthIn: Number(updated.widthIn), heightIn: Number(updated.heightIn), fields: fromApiFields(updated.fields), imageDataUrl: template.imageDataUrl });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="col-span-2 sm:col-span-4 border rounded px-2 py-1.5 text-sm" />
          <div>
            <label className="text-xs text-slate-500">Width</label>
            <input type="number" step="0.01" value={fromIn(widthIn).toFixed(2)} onChange={(e) => setWidthIn(toIn(Number(e.target.value) || 0))} disabled={!!template} className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Height</label>
            <input type="number" step="0.01" value={fromIn(heightIn).toFixed(2)} onChange={(e) => setHeightIn(toIn(Number(e.target.value) || 0))} disabled={!!template} className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value as any)} disabled={!!template} className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-slate-50">
              <option value="in">inches</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">DPI</label>
            <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} disabled={!!template} className="w-full border rounded px-2 py-1.5 text-sm disabled:bg-slate-50">
              {[72, 150, 200, 300, 600].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div className="text-xs text-slate-400 mb-2">{Math.round(pxW)}×{Math.round(pxH)}px at {dpi} DPI</div>

        {!template && (
          <div className="mb-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) {
                  const url = URL.createObjectURL(f);
                  setImagePreview(url);
                }
              }}
              className="text-sm"
            />
          </div>
        )}

        <div
          ref={containerRef}
          onClick={() => setSelectedKey(null)}
          style={{ width: canvasWpx, height: canvasHpx, position: "relative", backgroundImage: imagePreview ? `url(${imagePreview})` : undefined, backgroundSize: "cover", backgroundColor: "#f8fafc" }}
          className="border-2 border-slate-300 rounded overflow-hidden select-none"
        >
          {!imagePreview && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm gap-2">
              <Upload size={16} /> Upload a template image above
            </div>
          )}
          {fields.map((f) => (
            <div
              key={f.key}
              onMouseDown={(e) => onPointerDown(e, f, "move")}
              style={{
                position: "absolute",
                left: f.x * pxPerIn, top: f.y * pxPerIn, width: f.w * pxPerIn, height: f.h * pxPerIn,
                border: f.key === selectedKey ? "2px solid #d97706" : "1px dashed #64748b",
                background: f.key === selectedKey ? "rgba(217,119,6,0.12)" : "rgba(100,116,139,0.08)",
                cursor: "move",
                display: "flex", alignItems: f.verticalAlign === "top" ? "flex-start" : f.verticalAlign === "bottom" ? "flex-end" : "center",
                justifyContent: f.align === "left" ? "flex-start" : f.align === "right" ? "flex-end" : "center",
                fontSize: Math.max(8, f.fontSizePt * (pxPerIn / 72)), color: f.color, fontWeight: f.bold ? 700 : 400, overflow: "hidden", padding: 2,
              }}
            >
              {`{{${f.key}}}`}
              <div
                onMouseDown={(e) => onPointerDown(e, f, "resize")}
                style={{ position: "absolute", right: -4, bottom: -4, width: 10, height: 10, background: "#d97706", borderRadius: 2, cursor: "nwse-resize" }}
              />
            </div>
          ))}
        </div>

        <button onClick={addField} className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50">
          <Plus size={14} /> Add field
        </button>
      </div>

      <div className="border rounded-lg p-3 bg-white h-fit sticky top-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">Fields</div>
        <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
          {fields.map((f) => (
            <button
              key={f.key}
              onClick={() => setSelectedKey(f.key)}
              className={`w-full text-left px-2 py-1 rounded text-xs flex justify-between items-center ${f.key === selectedKey ? "bg-amber-100 text-amber-800" : "hover:bg-slate-50"}`}
            >
              <span>{f.label} <span className="text-slate-400">{`{{${f.key}}}`}</span></span>
              <Trash2
                size={12}
                className="text-slate-400 hover:text-red-500"
                onClick={(e) => { e.stopPropagation(); setFields(fields.filter((x) => x.key !== f.key)); if (selectedKey === f.key) setSelectedKey(null); }}
              />
            </button>
          ))}
        </div>

        {selected && (
          <div className="space-y-2 border-t pt-2">
            <div>
              <label className="text-xs text-slate-500">Label</label>
              <input value={selected.label} onChange={(e) => updateSelected({ label: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Font</label>
                <select value={selected.fontFamily} onChange={(e) => updateSelected({ fontFamily: e.target.value as FontFamily })} className="w-full border rounded px-2 py-1 text-sm">
                  {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Size (pt)</label>
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

        <div className="flex gap-2 mt-4 pt-3 border-t">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded border text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 px-3 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 className="animate-spin" size={14} /> : <ArrowRight size={14} />} Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function toApiField(f: FieldConfig) {
  return { key: f.key, label: f.label, x: f.x, y: f.y, w: f.w, h: f.h, fontFamily: f.fontFamily, fontSizePt: f.fontSizePt, bold: f.bold, color: f.color, align: f.align, verticalAlign: f.verticalAlign };
}
function fromApiFields(raw: any[]): FieldConfig[] {
  return (raw ?? []).map((f) => ({
    key: f.key, label: f.label, x: Number(f.xIn ?? f.x) || 0, y: Number(f.yIn ?? f.y) || 0, w: Number(f.wIn ?? f.w) || 1, h: Number(f.hIn ?? f.h) || 0.3,
    fontFamily: (f.fontFamily as FontFamily) || "DejaVu Sans", fontSizePt: Number(f.fontSizePt) || 18, bold: !!f.bold, color: f.color || "#111111",
    align: (f.align as Align) || "left", verticalAlign: (f.verticalAlign as VAlign) || "top",
  }));
}

// ─────────────────────────── Step 3: Upload Excel/CSV ───────────────────────────

function UploadStep({ templateId, onUploaded, onBack, setError }: { templateId: string; onUploaded: (r: JobUploadResult) => void; onBack: () => void; setError: (s: string | null) => void; }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    if (!file) return setError("Please choose a .xlsx, .xls, or .csv file");
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("templateId", templateId);
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/certificate-generator/jobs`, { method: "POST", headers: uploadHeaders(), body: formData });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not read this file");
      onUploaded(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-md">
      <p className="text-sm text-slate-600 mb-3">Upload the list of candidates/names for this batch (.xlsx, .xls, or .csv — first row must be column headers).</p>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm mb-3" />
      <div className="flex gap-2">
        <button onClick={onBack} className="px-3 py-2 rounded border text-sm font-semibold text-slate-600 flex items-center gap-1"><ArrowLeft size={14} /> Back</button>
        <button onClick={upload} disabled={uploading || !file} className="px-4 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
          {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />} Upload
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 4: Mapping + validation ───────────────────────────

function MappingStep({
  job, templateId, fields, columnMapping, setColumnMapping, invalidRowMode, setInvalidRowMode, onNext, onBack,
}: {
  job: JobUploadResult;
  templateId: string;
  fields: FieldConfig[];
  columnMapping: Record<string, string>;
  setColumnMapping: (m: Record<string, string>) => void;
  invalidRowMode: "SKIP" | "BLANK";
  setInvalidRowMode: (m: "SKIP" | "BLANK") => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSampleIndex, setPreviewSampleIndex] = useState(0);

  const showPreview = async () => {
    setPreviewLoading(true);
    try {
      const sample = job.sampleRows[previewSampleIndex % Math.max(1, job.sampleRows.length)] ?? {};
      const values: Record<string, string> = {};
      for (const f of fields) {
        const column = columnMapping[f.key];
        values[f.key] = String((column ? sample[column] : "") ?? "");
      }
      const res = await fetch(`${API_BASE_URL}/certificate-generator/templates/${templateId}/preview`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ values }),
      });
      if (!res.ok) throw new Error("Could not render preview");
      const blob = await res.blob();
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
      setPreviewSampleIndex((i) => i + 1);
    } catch {
      /* leave previous preview showing, if any */
    } finally {
      setPreviewLoading(false);
    }
  };
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  // job.validation is a snapshot from upload time (based on the
  // auto-suggested mapping) — re-validate against whatever mapping the user
  // actually confirms here, so the valid/invalid counts (and the
  // skip-vs-blank choice) reflect their real choice, not the initial guess.
  const [validation, setValidation] = useState(job.validation);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/certificate-generator/jobs/${job.jobId}/validate`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ columnMapping }),
        });
        if (res.ok && !cancelled) setValidation(await res.json());
      } catch {
        /* keep showing the last known validation */
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [job.jobId, columnMapping]);

  return (
    <div className="max-w-2xl">
      <div className="mb-4 p-3 rounded-lg bg-slate-50 border text-sm flex items-center gap-4">
        <span><strong>{job.rowCount}</strong> rows found</span>
        <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> {validation.validCount} valid</span>
        {validation.invalidCount > 0 && <span className="text-amber-700 flex items-center gap-1"><AlertTriangle size={14} /> {validation.invalidCount} need attention</span>}
      </div>

      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">Certificate field → Excel column</div>
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <span className="w-40 text-sm text-slate-600 truncate">{f.label}</span>
              <select
                value={columnMapping[f.key] ?? ""}
                onChange={(e) => setColumnMapping({ ...columnMapping, [f.key]: e.target.value })}
                className="flex-1 border rounded px-2 py-1.5 text-sm"
              >
                <option value="">— not mapped —</option>
                {job.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <button onClick={showPreview} disabled={previewLoading} className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-semibold text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50">
          {previewLoading ? <Loader2 className="animate-spin" size={14} /> : null} Preview a real certificate with this mapping
        </button>
        {previewUrl && (
          <iframe src={previewUrl} title="Certificate preview" className="mt-2 w-full border rounded-lg" style={{ height: 420 }} />
        )}
      </div>

      {validation.invalidCount > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
          <div className="font-semibold text-amber-800 mb-1">How should rows with missing data be handled?</div>
          <label className="flex items-center gap-2 mb-1"><input type="radio" checked={invalidRowMode === "SKIP"} onChange={() => setInvalidRowMode("SKIP")} /> Skip them (recommended)</label>
          <label className="flex items-center gap-2"><input type="radio" checked={invalidRowMode === "BLANK"} onChange={() => setInvalidRowMode("BLANK")} /> Generate anyway, leave missing fields blank</label>
        </div>
      )}

      {job.sampleRows.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">Sample data</div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="text-xs w-full">
              <thead className="bg-slate-50"><tr>{job.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-semibold text-slate-500">{c}</th>)}</tr></thead>
              <tbody>{job.sampleRows.map((r, i) => <tr key={i} className="border-t">{job.columns.map((c) => <td key={c} className="px-2 py-1">{String(r[c] ?? "")}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onBack} className="px-3 py-2 rounded border text-sm font-semibold text-slate-600 flex items-center gap-1"><ArrowLeft size={14} /> Back</button>
        <button onClick={onNext} className="px-4 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 flex items-center gap-1">
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 5: Sheet / imposition settings ───────────────────────────

function SheetStep({
  certWidthIn, certHeightIn, sheetSettings, setSheetSettings, onBack, onGenerate,
}: {
  certWidthIn: number;
  certHeightIn: number;
  sheetSettings: SheetSettings;
  setSheetSettings: (s: SheetSettings) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const layout = useMemo(() => computeImpositionPreview(sheetSettings, certWidthIn, certHeightIn), [sheetSettings, certWidthIn, certHeightIn]);

  const num = (k: "sheetWidthIn" | "sheetHeightIn" | "marginIn" | "gapIn") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSheetSettings({ ...sheetSettings, [k]: Number(e.target.value) || 0 });

  const previewScale = 320 / Math.max(sheetSettings.sheetWidthIn, sheetSettings.sheetHeightIn);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 max-w-3xl">
      <div className="space-y-2">
        <div><label className="text-xs text-slate-500">Sheet width (in)</label><input type="number" step="0.1" value={sheetSettings.sheetWidthIn} onChange={num("sheetWidthIn")} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Sheet height (in)</label><input type="number" step="0.1" value={sheetSettings.sheetHeightIn} onChange={num("sheetHeightIn")} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Margin (in)</label><input type="number" step="0.05" value={sheetSettings.marginIn} onChange={num("marginIn")} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Gap between certificates (in)</label><input type="number" step="0.05" value={sheetSettings.gapIn} onChange={num("gapIn")} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
        <label className="flex items-center gap-2 text-sm text-slate-600 pt-1">
          <input type="checkbox" checked={sheetSettings.allowRotation} onChange={(e) => setSheetSettings({ ...sheetSettings, allowRotation: e.target.checked })} />
          Allow rotating certificates to fit more per sheet
        </label>
      </div>

      <div>
        <div className="text-sm text-slate-600 mb-2 flex items-center gap-2">
          {layout.perSheet > 0 ? (
            <>
              <CheckCircle2 size={14} className="text-green-600" />
              <strong>{layout.perSheet}</strong> certificate{layout.perSheet !== 1 ? "s" : ""} per sheet
              {layout.rotated && <span className="text-amber-600 flex items-center gap-1"><RotateCw size={12} /> rotated</span>}
            </>
          ) : (
            <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> Certificate doesn't fit this sheet with these settings</span>
          )}
        </div>
        <div
          style={{ width: sheetSettings.sheetWidthIn * previewScale, height: sheetSettings.sheetHeightIn * previewScale, position: "relative", border: "2px solid #334155", background: "#fff" }}
        >
          {layout.slots.map((s, i) => (
            <div
              key={i}
              style={{
                position: "absolute", left: s.x * previewScale, top: s.y * previewScale, width: layout.placedWidthIn * previewScale, height: layout.placedHeightIn * previewScale,
                border: "1px solid #d97706", background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#92400e",
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 flex gap-2 pt-2">
        <button onClick={onBack} className="px-3 py-2 rounded border text-sm font-semibold text-slate-600 flex items-center gap-1"><ArrowLeft size={14} /> Back</button>
        <button onClick={onGenerate} disabled={layout.perSheet === 0} className="px-4 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
          Generate Certificates <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

/** Mirrors backend/src/certificate-generator/imposition.ts's computeImposition()
 *  — kept lightweight here purely for the live settings preview; the
 *  backend is the single source of truth for the actual generated output. */
function computeImpositionPreview(s: SheetSettings, certWidthIn: number, certHeightIn: number) {
  const usableW = s.sheetWidthIn - 2 * s.marginIn;
  const usableH = s.sheetHeightIn - 2 * s.marginIn;
  const fit = (w: number, h: number) => {
    if (w <= 0 || h <= 0 || usableW <= 0 || usableH <= 0) return { cols: 0, rows: 0 };
    return { cols: Math.max(0, Math.floor((usableW + s.gapIn) / (w + s.gapIn))), rows: Math.max(0, Math.floor((usableH + s.gapIn) / (h + s.gapIn))) };
  };
  const normal = fit(certWidthIn, certHeightIn);
  const normalCount = normal.cols * normal.rows;
  let rotatedGrid = { cols: 0, rows: 0 };
  let rotatedCount = 0;
  if (s.allowRotation) {
    rotatedGrid = fit(certHeightIn, certWidthIn);
    rotatedCount = rotatedGrid.cols * rotatedGrid.rows;
  }
  const useRotated = rotatedCount > normalCount;
  const chosen = useRotated ? rotatedGrid : normal;
  const placedWidthIn = useRotated ? certHeightIn : certWidthIn;
  const placedHeightIn = useRotated ? certWidthIn : certHeightIn;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < chosen.rows; r++)
    for (let c = 0; c < chosen.cols; c++)
      slots.push({ x: s.marginIn + c * (placedWidthIn + s.gapIn), y: s.marginIn + r * (placedHeightIn + s.gapIn) });
  return { cols: chosen.cols, rows: chosen.rows, perSheet: chosen.cols * chosen.rows, rotated: useRotated, placedWidthIn, placedHeightIn, slots };
}

// ─────────────────────────── Step 6: Generate + download ───────────────────────────

function GenerateStep({ jobId, status, onStartOver }: { jobId: string; status: JobStatus; onStartOver: () => void }) {
  const pct = status.rowsTotal > 0 ? Math.round(((status.rowsGenerated + status.rowsFailed) / status.rowsTotal) * 100) : 0;

  return (
    <div className="max-w-md">
      {status.status === "PROCESSING" && (
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
            <Loader2 className="animate-spin" size={16} /> Generating certificates… {status.rowsGenerated + status.rowsFailed} / {status.rowsTotal} ({pct}%)
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-600" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {status.status === "COMPLETED" && (
        <div>
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-1"><CheckCircle2 size={18} /> Done</div>
          <div className="text-sm text-slate-600 mb-4">
            {status.rowsTotal} records · {status.rowsGenerated} generated{status.rowsFailed > 0 && ` · ${status.rowsFailed} skipped/failed`}
          </div>
          <a
            href={`${API_BASE_URL}/certificate-generator/jobs/${jobId}/download`}
            onClick={(e) => {
              // fetch with auth header, then trigger a normal download —
              // a bare <a href> can't attach the Authorization header
              e.preventDefault();
              void (async () => {
                const res = await fetch(`${API_BASE_URL}/certificate-generator/jobs/${jobId}/download`, { headers: getAuthHeaders() });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `certificates-${jobId}.pdf`; a.click();
                URL.revokeObjectURL(url);
              })();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
          >
            <Download size={16} /> Download print-ready PDF
          </a>
        </div>
      )}

      {status.status === "FAILED" && (
        <div className="text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {status.errorMessage || "Generation failed"}</div>
      )}

      <button onClick={onStartOver} className="mt-6 text-sm text-slate-500 hover:text-slate-700 underline">Start a new batch</button>
    </div>
  );
}
