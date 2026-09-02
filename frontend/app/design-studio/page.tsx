"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { Clipboard, Database, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

type ProductRecord = { id: string; name: string; category: string; description: string };
type SizeRecord = { id: string; productId: string; label: string; width: string; height: string; unit: "in"; notes: string };
type BusinessData = {
  header: string;
  subheader: string;
  mobiles: string[];
  addresses: string[];
  bulletHeading: string;
  bullets: string[];
  body: string;
  backsideHeading: string;
  backsideBullets: string[];
  extraFields: { id: string; label: string; value: string }[];
};
type PromptForm = {
  productId: string;
  sizeId: string;
  businessField: string;
  customField: string;
  language: string;
  colorCombination: string;
  customColors: string;
  templateStyle: string;
  backgroundType: string;
  backgroundDescription: string;
  audience: string;
  priority: string;
  visualElements: string;
  avoid: string;
  extraFactors: string;
};

const storageKeys = {
  products: "rareprint.designPrompt.products",
  sizes: "rareprint.designPrompt.sizes",
};

const defaultProducts: ProductRecord[] = [
  { id: "envelope", name: "Center Pasting Envelope", category: "Packaging", description: "Open layout for product or retail counter envelope." },
  { id: "leaflet", name: "Leaflet / Flyer", category: "Marketing", description: "Single sheet promotional design." },
  { id: "sticker", name: "Sticker Label", category: "Label", description: "Product label, bottle label, or seal sticker." },
  { id: "visiting-card", name: "Visiting Card", category: "Stationery", description: "Business identity card." },
];

const defaultSizes: SizeRecord[] = [
  { id: "env-8-5x6-5", productId: "envelope", label: "Open 8.5 x 6.5", width: "8.5", height: "6.5", unit: "in", notes: "Includes flap and pasting area if needed." },
  { id: "env-4-25x5-5", productId: "envelope", label: "Closed 4.25 x 5.5", width: "4.25", height: "5.5", unit: "in", notes: "Final folded envelope size." },
  { id: "a5", productId: "leaflet", label: "A5 approx 5.83 x 8.27", width: "5.83", height: "8.27", unit: "in", notes: "Vertical flyer." },
  { id: "vc-3-5x2", productId: "visiting-card", label: "3.5 x 2", width: "3.5", height: "2", unit: "in", notes: "Standard visiting card." },
];

const productCategories = ["Packaging", "Marketing", "Label", "Stationery", "Medical Print", "Retail Print", "Other"];
const productDescriptions = [
  "Open layout for product or retail counter envelope.",
  "Single sheet promotional design.",
  "Product label, bottle label, or seal sticker.",
  "Business identity card.",
  "Medical counter, pharmacy, clinic, or diagnostic print design.",
  "Premium retail packaging with service and contact information.",
];
const sizePresets = [
  { label: "Open 8.5 x 6.5", width: "8.5", height: "6.5", notes: "Includes flap and pasting area if needed." },
  { label: "Closed 4.25 x 5.5", width: "4.25", height: "5.5", notes: "Final folded envelope size." },
  { label: "A5 approx 5.83 x 8.27", width: "5.83", height: "8.27", notes: "Vertical flyer." },
  { label: "A4 approx 8.27 x 11.69", width: "8.27", height: "11.69", notes: "Full page print." },
  { label: "3.5 x 2 Visiting Card", width: "3.5", height: "2", notes: "Standard visiting card." },
  { label: "4 x 6 Sticker", width: "4", height: "6", notes: "Product sticker or label." },
];

const businessFields = ["Path Lab", "Medical Store", "Doctor / Clinic", "Hospital", "Education / Classes", "Restaurant / Cafe", "Real Estate", "Beauty / Salon", "Retail Shop", "Other"];
const languageOptions = ["Hindi / Marathi / English mixed", "Hindi only", "Marathi only", "English only", "Hindi + English", "Marathi + English"];
const colorCombinations = ["Medical teal + deep navy + clean white", "Premium black + gold + warm white", "Fresh green + white + charcoal", "Corporate blue + light grey + white", "Festive red + saffron + cream", "Elegant maroon + beige + dark brown", "Custom"];
const templateStyles = ["Modern clean professional", "Premium luxury minimal", "Bold retail counter style", "Medical trust and hygiene style", "Information-heavy but neat", "Elegant traditional Indian", "Children friendly playful"];
const backgroundTypes = ["Plain clean background", "Soft gradient background", "Subtle pattern background", "Photo-based background", "Abstract wave background", "Icon watermark background", "Premium texture background"];
const backgroundDescriptions = [
  "White base, subtle teal and navy wave accents, light medical cross watermark, clean spacing.",
  "Soft gradient base with faint professional pattern and high readability.",
  "Premium textured background with minimal decorative borders.",
  "Clean white space with small icon watermark and balanced accent shapes.",
  "Photo-inspired background kept light enough so all text remains readable.",
  "Abstract wave background with clear central content area.",
];
const audiences = ["Families, patients, local walk-in customers", "Premium retail customers", "Students and parents", "Business owners and professionals", "Local shop visitors", "Doctors, clinics, and lab customers"];
const priorities = ["Trust, readability, clean medical look, premium retail finish", "Premium look with strong brand recall", "Maximum readability from distance", "Offer/service clarity with contact focus", "Elegant traditional feel with modern spacing", "Information-heavy but neat and uncrowded"];
const visualElementOptions = [
  "Medical cross, leaf, shield/check icon, medicine category icons, phone and location icons",
  "Doctor stethoscope, lab test tube, report icon, clean medical symbols",
  "Product category icons, badge shapes, phone and location icons",
  "Minimal geometric shapes, premium border, subtle watermark",
  "Education icons, book, badge, achievement symbols",
  "No extra icons, only typography and clean background",
];
const avoidOptions = [
  "Avoid changing Devanagari text style, avoid crowded small text, avoid unnecessary fold/dividing guide lines in final artwork.",
  "Avoid spelling changes, transliteration, low contrast, and text near edges.",
  "Avoid heavy decoration, dark photo overlays, and unreadable small text.",
  "Avoid cartoon style, random icons, and font changes for Hindi or Marathi.",
];
const factorPresets = [
  "Medical trust factors",
  "Premium retail factors",
  "High readability factors",
  "Information-heavy design factors",
];
const factorText: Record<string, string> = {
  "Medical trust factors": [
    "Clear hierarchy: business name first, service promise second, contact details easy to read.",
    "Use clean hygiene, trust, authenticity, and calm colors.",
    "Use medical symbols only where useful, not as decoration overload.",
    "Keep contrast high for small text and phone numbers.",
    "Use print-safe spacing, bleed, margin, and avoid important text near cut or fold areas.",
    "Do not change, stylize, replace, or transliterate Hindi, Marathi, or Devanagari font/text.",
  ].join("\n"),
  "Premium retail factors": [
    "Use strong brand recall with restrained premium decoration.",
    "Make contact details and service categories easy to scan.",
    "Balance empty space with information density so the design looks premium, not crowded.",
    "Use consistent icon style and limited color palette.",
    "Do not change, stylize, replace, or transliterate Hindi, Marathi, or Devanagari font/text.",
  ].join("\n"),
  "High readability factors": [
    "Keep headline large, short, and visible from distance.",
    "Use high contrast for phone number, address, and service list.",
    "Avoid placing important text over busy background.",
    "Use simple layout blocks and clear spacing.",
    "Do not change, stylize, replace, or transliterate Hindi, Marathi, or Devanagari font/text.",
  ].join("\n"),
  "Information-heavy design factors": [
    "Group information into sections with clear headings.",
    "Use hierarchy, dividers, and spacing without making the design crowded.",
    "Use compact but readable service lists.",
    "Keep all mandatory details inside safe printable margins.",
    "Do not change, stylize, replace, or transliterate Hindi, Marathi, or Devanagari font/text.",
  ].join("\n"),
};

const initialBusinessData: BusinessData = {
  header: "प्रकाश मेडिकल स्टोर्स",
  subheader: "संपूर्ण स्वास्थ्य सेवा केंद्र",
  mobiles: ["+91 80041 76377"],
  addresses: ["मेन रोड, सिटी सेंटर के पास", "नागपुर, महाराष्ट्र"],
  bulletHeading: "हमें क्यों चुनें",
  bullets: ["असली दवायें", "उचित कीमतें", "परिवार जैसी देखभाल"],
  body: "आधुनिक सुविधाओं और व्यक्तिगत देखभाल के साथ भरोसेमंद स्वास्थ्य सेवाएं।",
  backsideHeading: "हमारी प्रमुख श्रेणियां",
  backsideBullets: ["दवायें", "व्यक्तिगत देखभाल", "मेडिकल उपकरण", "सर्जिकल सामग्री"],
  extraFields: [],
};

const initialForm: PromptForm = {
  productId: "envelope",
  sizeId: "env-8-5x6-5",
  businessField: "Medical Store",
  customField: "",
  language: "Hindi / Marathi / English mixed",
  colorCombination: "Medical teal + deep navy + clean white",
  customColors: "",
  templateStyle: "Medical trust and hygiene style",
  backgroundType: "Soft gradient background",
  backgroundDescription: backgroundDescriptions[0],
  audience: audiences[0],
  priority: priorities[0],
  visualElements: visualElementOptions[0],
  avoid: avoidOptions[0],
  extraFactors: factorText["Medical trust factors"],
};

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function businessText(data: BusinessData) {
  return [
    data.header,
    data.subheader,
    data.mobiles.filter(Boolean).join(" / "),
    data.addresses.filter(Boolean).join(", "),
    data.body,
    data.bullets.length ? `${data.bulletHeading}: ${data.bullets.filter(Boolean).join(", ")}` : "",
    data.backsideBullets.length ? `${data.backsideHeading}: ${data.backsideBullets.filter(Boolean).join(", ")}` : "",
    ...data.extraFields.filter((field) => field.label || field.value).map((field) => `${field.label || "Extra"}: ${field.value}`),
  ].filter(Boolean).join("\n");
}

export default function DesignStudioPage() {
  const [products, setProducts] = useState<ProductRecord[]>(() => readStored(storageKeys.products, defaultProducts));
  const [sizes, setSizes] = useState<SizeRecord[]>(() => readStored(storageKeys.sizes, defaultSizes));
  const [form, setForm] = useState<PromptForm>(initialForm);
  const [business, setBusiness] = useState<BusinessData>(initialBusinessData);
  const [newProduct, setNewProduct] = useState({ name: "", category: productCategories[0], description: productDescriptions[0] });
  const [newSize, setNewSize] = useState(sizePresets[0]);
  const [factorPreset, setFactorPreset] = useState(factorPresets[0]);
  const [copied, setCopied] = useState(false);

  useEffect(() => { window.localStorage.setItem(storageKeys.products, JSON.stringify(products)); }, [products]);
  useEffect(() => { window.localStorage.setItem(storageKeys.sizes, JSON.stringify(sizes)); }, [sizes]);

  const selectedProduct = products.find((product) => product.id === form.productId) ?? products[0];
  const productSizes = sizes.filter((size) => size.productId === selectedProduct?.id);
  const selectedSize = sizes.find((size) => size.id === form.sizeId) ?? productSizes[0];
  const field = form.businessField === "Other" ? form.customField.trim() : form.businessField;
  const colors = form.colorCombination === "Custom" ? form.customColors.trim() : form.colorCombination;

  const prompt = useMemo(() => [
    "You are an expert Indian print design prompt engineer.",
    "",
    "Create a detailed AI image/design prompt for a print-ready design brief.",
    "",
    `Product: ${selectedProduct?.name ?? "Custom product"}`,
    `Product category: ${selectedProduct?.category ?? "-"}`,
    `Product description: ${selectedProduct?.description ?? "-"}`,
    `Final size: ${selectedSize ? `${selectedSize.width} x ${selectedSize.height} inches` : "Not selected"}`,
    `Size notes: ${selectedSize?.notes || "None"}`,
    `Field/industry: ${field || "Not provided"}`,
    `Language/text style: ${form.language}`,
    "",
    "Business data to include exactly:",
    businessText(business),
    "",
    `Template style: ${form.templateStyle}`,
    `Color combination: ${colors || "Designer should choose suitable print-safe colors"}`,
    `Background type: ${form.backgroundType}`,
    `Background description: ${form.backgroundDescription}`,
    `Target audience: ${form.audience}`,
    `Design priority: ${form.priority}`,
    `Suggested visual elements: ${form.visualElements}`,
    "",
    "Important design factors:",
    form.extraFactors,
    "",
    "Strict font and language rule:",
    "Do not change, replace, stylize, transliterate, or convert Hindi, Marathi, or any Devanagari text. Keep Devanagari wording exactly as supplied. Do not suggest alternate Devanagari fonts. Preserve the original Devanagari font appearance as much as possible.",
    "",
    "Avoid:",
    form.avoid,
    "",
    "Output requirement:",
    "Give a complete generation prompt with layout direction, hierarchy, color use, background description, icon/photo guidance, print-safe spacing, and a negative prompt.",
  ].join("\n"), [business, colors, field, form, selectedProduct, selectedSize]);

  function update<K extends keyof PromptForm>(key: K, value: PromptForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBusiness<K extends keyof BusinessData>(key: K, value: BusinessData[K]) {
    setBusiness((prev) => ({ ...prev, [key]: value }));
  }

  function updateBusinessList(key: "mobiles" | "addresses" | "bullets" | "backsideBullets", index: number, value: string) {
    setBusiness((prev) => ({
      ...prev,
      [key]: prev[key].map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function addBusinessListItem(key: "mobiles" | "addresses" | "bullets" | "backsideBullets", value = "") {
    setBusiness((prev) => ({ ...prev, [key]: [...prev[key], value] }));
  }

  function removeBusinessListItem(key: "mobiles" | "addresses" | "bullets" | "backsideBullets", index: number) {
    setBusiness((prev) => ({ ...prev, [key]: prev[key].filter((_, itemIndex) => itemIndex !== index) }));
  }

  function addExtraField() {
    setBusiness((prev) => ({ ...prev, extraFields: [...prev.extraFields, { id: id(), label: "Extra Matter", value: "" }] }));
  }

  function updateExtraField(fieldId: string, patch: Partial<{ label: string; value: string }>) {
    setBusiness((prev) => ({
      ...prev,
      extraFields: prev.extraFields.map((field) => field.id === fieldId ? { ...field, ...patch } : field),
    }));
  }

  function removeExtraField(fieldId: string) {
    setBusiness((prev) => ({ ...prev, extraFields: prev.extraFields.filter((field) => field.id !== fieldId) }));
  }

  function addProduct() {
    if (!newProduct.name.trim()) return;
    const product = { id: id(), name: newProduct.name.trim(), category: newProduct.category, description: newProduct.description };
    setProducts((prev) => [...prev, product]);
    setForm((prev) => ({ ...prev, productId: product.id, sizeId: "" }));
    setNewProduct({ name: "", category: productCategories[0], description: productDescriptions[0] });
  }

  function addSize() {
    if (!selectedProduct) return;
    const size = { id: id(), productId: selectedProduct.id, label: newSize.label, width: newSize.width, height: newSize.height, unit: "in" as const, notes: newSize.notes };
    setSizes((prev) => [...prev, size]);
    setForm((prev) => ({ ...prev, sizeId: size.id }));
    setNewSize(sizePresets[0]);
  }

  function resetDatabase() {
    setProducts(defaultProducts);
    setSizes(defaultSizes);
    setForm(initialForm);
    setBusiness(initialBusinessData);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <DashboardShell>
      <div className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-normal">Design Prompt Generator</h1>
              <p className="mt-1 text-sm text-slate-500">Create product, size, business data, color, background, and field-based prompts for print designs.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={resetDatabase} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Reset</button>
              <button onClick={copyPrompt} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"><Clipboard className="h-4 w-4" /> {copied ? "Copied" : "Copy Prompt"}</button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2"><Database className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-bold">Product And Size Database</h2></div>
                <Field label="Product">
                  <MobileSelect value={form.productId} onChange={(nextProductId) => {
                    const nextSize = sizes.find((size) => size.productId === nextProductId);
                    setForm((prev) => ({ ...prev, productId: nextProductId, sizeId: nextSize?.id ?? "" }));
                  }} className="input"
                    options={products.map((product) => ({ value: product.id, label: product.name }))} />
                </Field>
                <Field label="Size In Inches">
                  <MobileSelect value={form.sizeId} onChange={(v) => update("sizeId", v)} className="input"
                    placeholder={productSizes.length === 0 ? "No size added" : undefined}
                    options={[
                      ...(productSizes.length === 0 ? [{ value: "", label: "No size added" }] : []),
                      ...productSizes.map((size) => ({ value: size.id, label: `${size.label} - ${size.width} x ${size.height} in` })),
                    ]} />
                </Field>

                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold text-slate-600">Create Product</p>
                  <div className="space-y-2">
                    <input value={newProduct.name} onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))} placeholder="Product name" className="input" />
                    <MobileSelect value={newProduct.category} onChange={(v) => setNewProduct((prev) => ({ ...prev, category: v }))} className="input" options={productCategories.map((item) => ({ value: item, label: item }))} />
                    <MobileSelect value={newProduct.description} onChange={(v) => setNewProduct((prev) => ({ ...prev, description: v }))} className="input" options={productDescriptions.map((item) => ({ value: item, label: item }))} />
                    <button onClick={addProduct} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Add Product</button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold text-slate-600">Add Size For Selected Product</p>
                  <div className="space-y-2">
                    <MobileSelect value={newSize.label} onChange={(v) => setNewSize(sizePresets.find((size) => size.label === v) ?? sizePresets[0])} className="input"
                      options={sizePresets.map((size) => ({ value: size.label, label: size.label }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <input readOnly value={newSize.width} className="input bg-slate-100" />
                      <input readOnly value={newSize.height} className="input bg-slate-100" />
                    </div>
                    <input readOnly value={newSize.notes} className="input bg-slate-100" />
                    <button onClick={addSize} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Add Size</button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-bold">Saved Items</h2>
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {products.map((product) => (
                    <div key={product.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-xs font-bold text-slate-800">{product.name}</p><p className="text-[11px] text-slate-500">{product.category}</p></div>
                        {!defaultProducts.some((item) => item.id === product.id) && (
                          <button onClick={() => { setProducts((prev) => prev.filter((item) => item.id !== product.id)); setSizes((prev) => prev.filter((item) => item.productId !== product.id)); }} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{sizes.filter((size) => size.productId === product.id).length} sizes</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-bold">Business Data</h2></div>
                  <button onClick={addExtraField} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /> Add Field</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Header / Shop Name" value={business.header} onChange={(value) => updateBusiness("header", value)} />
                  <TextField label="Subheader / Tagline" value={business.subheader} onChange={(value) => updateBusiness("subheader", value)} />
                  <TextField label="Bullet Heading" value={business.bulletHeading} onChange={(value) => updateBusiness("bulletHeading", value)} />
                  <TextField label="Body / Message" value={business.body} onChange={(value) => updateBusiness("body", value)} wide />
                  <TextField label="Backside Heading" value={business.backsideHeading} onChange={(value) => updateBusiness("backsideHeading", value)} />
                  <RepeatableFields title="Mobiles" addLabel="Add Mobile" values={business.mobiles} onAdd={() => addBusinessListItem("mobiles")} onChange={(index, value) => updateBusinessList("mobiles", index, value)} onRemove={(index) => removeBusinessListItem("mobiles", index)} />
                  <RepeatableFields title="Addresses" addLabel="Add Address" values={business.addresses} onAdd={() => addBusinessListItem("addresses")} onChange={(index, value) => updateBusinessList("addresses", index, value)} onRemove={(index) => removeBusinessListItem("addresses", index)} />
                  <RepeatableFields title="Bullets" addLabel="Add Bullet" values={business.bullets} onAdd={() => addBusinessListItem("bullets")} onChange={(index, value) => updateBusinessList("bullets", index, value)} onRemove={(index) => removeBusinessListItem("bullets", index)} />
                  <RepeatableFields title="Backside Bullets" addLabel="Add Backside Bullet" values={business.backsideBullets} onAdd={() => addBusinessListItem("backsideBullets")} onChange={(index, value) => updateBusinessList("backsideBullets", index, value)} onRemove={(index) => removeBusinessListItem("backsideBullets", index)} />
                  {business.extraFields.map((field) => (
                    <div key={field.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-600">Custom Field</p>
                        <button onClick={() => removeExtraField(field.id)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /> Remove</button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <input value={field.label} onChange={(e) => updateExtraField(field.id, { label: e.target.value })} placeholder="Field label" className="input" />
                        <input value={field.value} onChange={(e) => updateExtraField(field.id, { value: e.target.value })} placeholder="Field value" className="input" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-4 text-sm font-bold">Prompt Details</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Business Field"><MobileSelect value={form.businessField} onChange={(v) => update("businessField", v)} className="input" options={businessFields.map((item) => ({ value: item, label: item }))} /></Field>
                  {form.businessField === "Other" && <TextField label="Other Field" value={form.customField} onChange={(value) => update("customField", value)} />}
                  <Field label="Language"><MobileSelect value={form.language} onChange={(v) => update("language", v)} className="input" options={languageOptions.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Color Combination"><MobileSelect value={form.colorCombination} onChange={(v) => update("colorCombination", v)} className="input" options={colorCombinations.map((item) => ({ value: item, label: item }))} /></Field>
                  {form.colorCombination === "Custom" && <TextField label="Custom Colors" value={form.customColors} onChange={(value) => update("customColors", value)} />}
                  <Field label="Template"><MobileSelect value={form.templateStyle} onChange={(v) => update("templateStyle", v)} className="input" options={templateStyles.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Background Type"><MobileSelect value={form.backgroundType} onChange={(v) => update("backgroundType", v)} className="input" options={backgroundTypes.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Background Description" wide><MobileSelect value={form.backgroundDescription} onChange={(v) => update("backgroundDescription", v)} className="input" options={backgroundDescriptions.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Target Audience"><MobileSelect value={form.audience} onChange={(v) => update("audience", v)} className="input" options={audiences.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Design Priority"><MobileSelect value={form.priority} onChange={(v) => update("priority", v)} className="input" options={priorities.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Visual Elements" wide><MobileSelect value={form.visualElements} onChange={(v) => update("visualElements", v)} className="input" options={visualElementOptions.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="AI Design Expert Factors"><MobileSelect value={factorPreset} onChange={(v) => { setFactorPreset(v); update("extraFactors", factorText[v]); }} className="input" options={factorPresets.map((item) => ({ value: item, label: item }))} /></Field>
                  <Field label="Avoid / Negative Direction"><MobileSelect value={form.avoid} onChange={(v) => update("avoid", v)} className="input" options={avoidOptions.map((item) => ({ value: item, label: item }))} /></Field>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold">Generated Prompt</h2>
                  <button onClick={copyPrompt} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Clipboard className="h-4 w-4" /> {copied ? "Copied" : "Copy"}</button>
                </div>
                <textarea readOnly value={prompt} rows={18} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs leading-5 text-slate-800 outline-none" />
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Hindi, Marathi, and Devanagari text is protected in every generated prompt. The prompt explicitly tells AI not to change that font/text.</div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          background: white;
        }
        .input:focus { border-color: #3b82f6; }
      `}</style>
    </DashboardShell>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "block md:col-span-2" : "block"}><span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>{children}</label>;
}

function TextField({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return <Field label={label} wide={wide}><input value={value} onChange={(e) => onChange(e.target.value)} className="input" /></Field>;
}

function RepeatableFields({
  title,
  addLabel,
  values,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  addLabel: string;
  values: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-600">{title}</p>
        <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-md border border-brand-200 px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50"><Plus className="h-3 w-3" /> {addLabel}</button>
      </div>
      <div className="space-y-2">
        {values.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">No {title.toLowerCase()} added.</p>
        ) : values.map((value, index) => (
          <div key={`${title}-${index}`} className="flex gap-2">
            <input value={value} onChange={(e) => onChange(index, e.target.value)} className="input" />
            <button onClick={() => onRemove(index)} className="shrink-0 rounded-lg border border-red-200 px-2.5 text-red-600 hover:bg-red-50" title={`Remove ${title}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
