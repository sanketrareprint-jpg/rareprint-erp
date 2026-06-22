"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Banner = { id: string; title: string; subtitle: string; href: string; image: string; active: boolean; sortOrder: number };
type Photo = { id: string; title: string; url: string; productSlug: string; active: boolean };
type RateRow = { quantity: number; price: number; label: string };
type RateList = { id: string; productSlug: string; title: string; rows: RateRow[] };
type TemplateField = { key: string; label: string; placeholder: string };
type Template = { id: string; name: string; productType: string; size: string; background: string; accent: string; fields: TemplateField[] };
type StorefrontContent = {
  settings: { couponText: string; currency: string; advancePercent: number; whatsappNumber: string };
  heroBanners: Banner[];
  promoBanners: Banner[];
  rateLists: RateList[];
  photos: Photo[];
};

const blankBanner = (kind: string): Banner => ({
  id: `${kind}-${Date.now()}`,
  title: "New Campaign",
  subtitle: "Short customer-facing offer line",
  href: "/web-to-print/categories",
  image: "",
  active: true,
  sortOrder: 1,
});

const blankTemplate = (): Template => ({
  id: `template-${Date.now()}`,
  name: "New Customer Form Template",
  productType: "visiting-card",
  size: "3.5 x 2 in",
  background: "#ffffff",
  accent: "#dc2626",
  fields: [
    { key: "businessName", label: "Business Name", placeholder: "Customer business name" },
    { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
  ],
});

export default function StorefrontModulePage() {
  const [content, setContent] = useState<StorefrontContent | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"slider" | "photos" | "rates" | "templates">("slider");

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/storefront/content`).then((res) => res.json()),
      fetch(`${API_BASE_URL}/storefront/templates`).then((res) => res.json()),
    ])
      .then(([contentData, templateData]) => {
        setContent(contentData);
        setTemplates(templateData.templates ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeHeroCount = useMemo(() => content?.heroBanners.filter((banner) => banner.active).length ?? 0, [content]);

  async function saveAll() {
    if (!content) return;
    setSaving(true);
    setMessage("");
    try {
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      const [contentRes, templateRes] = await Promise.all([
        fetch(`${API_BASE_URL}/storefront/content`, { method: "PUT", headers, body: JSON.stringify(content) }),
        fetch(`${API_BASE_URL}/storefront/templates`, { method: "PUT", headers, body: JSON.stringify({ templates }) }),
      ]);
      if (!contentRes.ok || !templateRes.ok) throw new Error("Save failed");
      setMessage("Saved. The storefront can now read the latest slider, rates, photos, and templates.");
    } catch {
      setMessage("Could not save. Please check login and backend connection.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !content) {
    return (
      <DashboardShell>
        <div className="grid h-full place-items-center bg-slate-100 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="min-h-full bg-slate-100 text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h1 className="text-xl font-black">Storefront Manager</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Manage website slider, photos, rate list, and customer form templates.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/web-to-print" target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50">
              Open Website <ExternalLink className="h-4 w-4" />
            </Link>
            <button onClick={saveAll} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard title="Active Slides" value={String(activeHeroCount)} />
            <SummaryCard title="Photos" value={String(content.photos.length)} />
            <SummaryCard title="Rate Lists" value={String(content.rateLists.length)} />
            <SummaryCard title="Templates" value={String(templates.length)} />
          </div>

          {message && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{message}</div>}

          <div className="mt-5 flex flex-wrap gap-2">
            <TabButton active={tab === "slider"} onClick={() => setTab("slider")} icon={<SlidersHorizontal className="h-4 w-4" />} label="Slider" />
            <TabButton active={tab === "photos"} onClick={() => setTab("photos")} icon={<ImagePlus className="h-4 w-4" />} label="Photos" />
            <TabButton active={tab === "rates"} onClick={() => setTab("rates")} icon={<Table2 className="h-4 w-4" />} label="Rate List" />
            <TabButton active={tab === "templates"} onClick={() => setTab("templates")} icon={<SlidersHorizontal className="h-4 w-4" />} label="Templates" />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {tab === "slider" && (
              <BannerEditor
                title="Homepage Slider"
                rows={content.heroBanners}
                onAdd={() => setContent({ ...content, heroBanners: [...content.heroBanners, blankBanner("hero")] })}
                onChange={(rows) => setContent({ ...content, heroBanners: rows })}
              />
            )}
            {tab === "photos" && (
              <PhotoEditor photos={content.photos} onChange={(photos) => setContent({ ...content, photos })} />
            )}
            {tab === "rates" && (
              <RateEditor rateLists={content.rateLists} onChange={(rateLists) => setContent({ ...content, rateLists })} />
            )}
            {tab === "templates" && (
              <TemplateEditor templates={templates} onChange={setTemplates} />
            )}
          </div>
        </div>
        <style jsx global>{`
          .input {
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid #e2e8f0;
            background: #ffffff;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
          }
          .input:focus {
            border-color: #64748b;
          }
        `}</style>
      </div>
    </DashboardShell>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">{title}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{icon}{label}</button>;
}

function BannerEditor({ title, rows, onAdd, onChange }: { title: string; rows: Banner[]; onAdd: () => void; onChange: (rows: Banner[]) => void }) {
  return (
    <section>
      <EditorHead title={title} onAdd={onAdd} addLabel="Add Slide" />
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <Panel key={row.id} onDelete={() => onChange(rows.filter((item) => item.id !== row.id))}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Title" value={row.title} onChange={(value) => onChange(update(rows, index, { title: value }))} />
              <Input label="Link" value={row.href} onChange={(value) => onChange(update(rows, index, { href: value }))} />
              <Input label="Subtitle" value={row.subtitle} onChange={(value) => onChange(update(rows, index, { subtitle: value }))} wide />
              <Input label="Image URL" value={row.image} onChange={(value) => onChange(update(rows, index, { image: value }))} wide />
              <Input label="Sort Order" value={String(row.sortOrder)} onChange={(value) => onChange(update(rows, index, { sortOrder: Number(value) || 1 }))} />
              <Toggle label="Active" checked={row.active} onChange={(active) => onChange(update(rows, index, { active }))} />
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function PhotoEditor({ photos, onChange }: { photos: Photo[]; onChange: (photos: Photo[]) => void }) {
  return (
    <section>
      <EditorHead title="Product Photos" addLabel="Add Photo" onAdd={() => onChange([...photos, { id: `photo-${Date.now()}`, title: "New Photo", url: "", productSlug: "", active: true }])} />
      <div className="mt-3 space-y-3">
        {photos.map((photo, index) => (
          <Panel key={photo.id} onDelete={() => onChange(photos.filter((item) => item.id !== photo.id))}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Title" value={photo.title} onChange={(value) => onChange(update(photos, index, { title: value }))} />
              <Input label="Product Slug" value={photo.productSlug} onChange={(value) => onChange(update(photos, index, { productSlug: value }))} />
              <Input label="Image URL" value={photo.url} onChange={(value) => onChange(update(photos, index, { url: value }))} wide />
              <Toggle label="Active" checked={photo.active} onChange={(active) => onChange(update(photos, index, { active }))} />
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function RateEditor({ rateLists, onChange }: { rateLists: RateList[]; onChange: (rateLists: RateList[]) => void }) {
  return (
    <section>
      <EditorHead title="Rate Lists" addLabel="Add Rate List" onAdd={() => onChange([...rateLists, { id: `rate-${Date.now()}`, title: "New Rate List", productSlug: "", rows: [{ quantity: 1000, price: 0, label: "1,000 pcs" }] }])} />
      <div className="mt-3 space-y-3">
        {rateLists.map((rateList, index) => (
          <Panel key={rateList.id} onDelete={() => onChange(rateLists.filter((item) => item.id !== rateList.id))}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Title" value={rateList.title} onChange={(value) => onChange(update(rateLists, index, { title: value }))} />
              <Input label="Product Slug" value={rateList.productSlug} onChange={(value) => onChange(update(rateLists, index, { productSlug: value }))} />
            </div>
            <div className="mt-3 space-y-2">
              {rateList.rows.map((row, rowIndex) => (
                <div key={rowIndex} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <input className="input" value={row.label} onChange={(event) => onChange(update(rateLists, index, { rows: update(rateList.rows, rowIndex, { label: event.target.value }) }))} />
                  <input className="input" type="number" value={row.quantity} onChange={(event) => onChange(update(rateLists, index, { rows: update(rateList.rows, rowIndex, { quantity: Number(event.target.value) }) }))} />
                  <input className="input" type="number" value={row.price} onChange={(event) => onChange(update(rateLists, index, { rows: update(rateList.rows, rowIndex, { price: Number(event.target.value) }) }))} />
                  <button className="rounded-lg border border-red-200 px-3 text-red-600" onClick={() => onChange(update(rateLists, index, { rows: rateList.rows.filter((_, itemIndex) => itemIndex !== rowIndex) }))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold" onClick={() => onChange(update(rateLists, index, { rows: [...rateList.rows, { quantity: 0, price: 0, label: "New qty" }] }))}><Plus className="h-3.5 w-3.5" /> Add Row</button>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function TemplateEditor({ templates, onChange }: { templates: Template[]; onChange: (templates: Template[]) => void }) {
  return (
    <section>
      <EditorHead title="Customer Form Templates" addLabel="Add Template" onAdd={() => onChange([...templates, blankTemplate()])} />
      <div className="mt-3 space-y-3">
        {templates.map((template, index) => (
          <Panel key={template.id} onDelete={() => onChange(templates.filter((item) => item.id !== template.id))}>
            <div className="grid gap-3 md:grid-cols-3">
              <Input label="Template Name" value={template.name} onChange={(value) => onChange(update(templates, index, { name: value }))} />
              <Input label="Product Type" value={template.productType} onChange={(value) => onChange(update(templates, index, { productType: value }))} />
              <Input label="Size" value={template.size} onChange={(value) => onChange(update(templates, index, { size: value }))} />
              <Input label="Background" value={template.background} onChange={(value) => onChange(update(templates, index, { background: value }))} />
              <Input label="Accent" value={template.accent} onChange={(value) => onChange(update(templates, index, { accent: value }))} />
            </div>
            <div className="mt-3 space-y-2">
              {template.fields.map((field, fieldIndex) => (
                <div key={fieldIndex} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <input className="input" value={field.key} onChange={(event) => onChange(update(templates, index, { fields: update(template.fields, fieldIndex, { key: event.target.value }) }))} />
                  <input className="input" value={field.label} onChange={(event) => onChange(update(templates, index, { fields: update(template.fields, fieldIndex, { label: event.target.value }) }))} />
                  <input className="input" value={field.placeholder} onChange={(event) => onChange(update(templates, index, { fields: update(template.fields, fieldIndex, { placeholder: event.target.value }) }))} />
                  <button className="rounded-lg border border-red-200 px-3 text-red-600" onClick={() => onChange(update(templates, index, { fields: template.fields.filter((_, itemIndex) => itemIndex !== fieldIndex) }))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold" onClick={() => onChange(update(templates, index, { fields: [...template.fields, { key: "newField", label: "New Field", placeholder: "Value" }] }))}><Plus className="h-3.5 w-3.5" /> Add Field</button>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function EditorHead({ title, addLabel, onAdd }: { title: string; addLabel: string; onAdd: () => void }) {
  return <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-black">{title}</h2><button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" />{addLabel}</button></div>;
}

function Panel({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex justify-end"><button onClick={onDelete} className="mb-2 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" />Remove</button></div>{children}</div>;
}

function Input({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return <label className={wide ? "block md:col-span-2" : "block"}><span className="mb-1 block text-xs font-bold text-slate-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="input" /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function update<T>(rows: T[], index: number, patch: Partial<T>) {
  return rows.map((row, itemIndex) => itemIndex === index ? { ...row, ...patch } : row);
}
