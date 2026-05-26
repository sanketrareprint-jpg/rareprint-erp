"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Clipboard,
  Database,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

type ProductRecord = {
  id: string;
  name: string;
  category: string;
  description: string;
};

type SizeRecord = {
  id: string;
  productId: string;
  label: string;
  width: string;
  height: string;
  unit: "in";
  notes: string;
};

type PromptForm = {
  productId: string;
  sizeId: string;
  businessName: string;
  businessField: string;
  customField: string;
  language: string;
  requiredText: string;
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

const businessFields = [
  "Path Lab",
  "Medical Store",
  "Doctor / Clinic",
  "Hospital",
  "Education / Classes",
  "Restaurant / Cafe",
  "Real Estate",
  "Beauty / Salon",
  "Retail Shop",
  "Other",
];

const colorCombinations = [
  "Medical teal + deep navy + clean white",
  "Premium black + gold + warm white",
  "Fresh green + white + charcoal",
  "Corporate blue + light grey + white",
  "Festive red + saffron + cream",
  "Elegant maroon + beige + dark brown",
  "Custom",
];

const templateStyles = [
  "Modern clean professional",
  "Premium luxury minimal",
  "Bold retail counter style",
  "Medical trust and hygiene style",
  "Information-heavy but neat",
  "Elegant traditional Indian",
  "Children friendly playful",
];

const backgroundTypes = [
  "Plain clean background",
  "Soft gradient background",
  "Subtle pattern background",
  "Photo-based background",
  "Abstract wave background",
  "Icon watermark background",
  "Premium texture background",
];

const designFactors = [
  "Clear hierarchy: business name first, service promise second, contact details easy to read.",
  "Use print-safe spacing, bleed, margin, and avoid important text near cut or fold areas.",
  "Keep contrast high for small text and phone numbers.",
  "Use field-specific trust symbols only when useful, not as decoration overload.",
  "Balance empty space with information density so the design looks premium, not crowded.",
  "For medical designs, prefer clean hygiene, trust, authenticity, and calm colors.",
  "For retail designs, make offer/service blocks easy to scan from distance.",
  "Do not change, stylize, replace, or transliterate Hindi, Marathi, or Devanagari font/text.",
];

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

const initialForm: PromptForm = {
  productId: "envelope",
  sizeId: "env-8-5x6-5",
  businessName: "Prakash Medical Stores",
  businessField: "Medical Store",
  customField: "",
  language: "Hindi / Marathi / English mixed",
  requiredText: "प्रकाश मेडिकल स्टोर्स\nसंपूर्ण स्वास्थ्य सेवा केंद्र\n+91 80041 76377\nमेन रोड, सिटी सेंटर के पास, नागपुर, महाराष्ट्र\nहमें क्यों चुनें: असली दवायें, उचित कीमतें, परिवार जैसी देखभाल",
  colorCombination: "Medical teal + deep navy + clean white",
  customColors: "",
  templateStyle: "Medical trust and hygiene style",
  backgroundType: "Plain clean background",
  backgroundDescription: "White base, subtle teal and navy wave accents, light medical cross watermark, clean spacing.",
  audience: "Families, patients, local walk-in customers",
  priority: "Trust, readability, clean medical look, premium retail finish",
  visualElements: "Medical cross, leaf, shield/check icon, medicine category icons, phone and location icons",
  avoid: "Avoid changing Devanagari text style, avoid crowded small text, avoid unnecessary fold/dividing guide lines in final artwork.",
  extraFactors: designFactors.slice(0, 6).join("\n"),
};

export default function DesignStudioPage() {
  const [products, setProducts] = useState<ProductRecord[]>(() => readStored(storageKeys.products, defaultProducts));
  const [sizes, setSizes] = useState<SizeRecord[]>(() => readStored(storageKeys.sizes, defaultSizes));
  const [form, setForm] = useState<PromptForm>(initialForm);
  const [newProduct, setNewProduct] = useState({ name: "", category: "", description: "" });
  const [newSize, setNewSize] = useState({ label: "", width: "", height: "", notes: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.products, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.sizes, JSON.stringify(sizes));
  }, [sizes]);

  const selectedProduct = products.find((product) => product.id === form.productId) ?? products[0];
  const productSizes = sizes.filter((size) => size.productId === selectedProduct?.id);
  const selectedSize = sizes.find((size) => size.id === form.sizeId) ?? productSizes[0];
  const field = form.businessField === "Other" ? form.customField.trim() : form.businessField;
  const colors = form.colorCombination === "Custom" ? form.customColors.trim() : form.colorCombination;

  const prompt = useMemo(() => {
    return [
      "You are an expert Indian print design prompt engineer.",
      "",
      "Create a detailed AI image/design prompt for a print-ready design brief.",
      "",
      `Product: ${selectedProduct?.name ?? "Custom product"}`,
      `Product category: ${selectedProduct?.category ?? "-"}`,
      `Product description: ${selectedProduct?.description ?? "-"}`,
      `Final size: ${selectedSize ? `${selectedSize.width} x ${selectedSize.height} inches` : "Not selected"}`,
      `Size notes: ${selectedSize?.notes || "None"}`,
      `Business/name: ${form.businessName || "Not provided"}`,
      `Field/industry: ${field || "Not provided"}`,
      `Language/text style: ${form.language}`,
      "",
      "Text to include exactly:",
      form.requiredText || "Not provided",
      "",
      `Template style: ${form.templateStyle}`,
      `Color combination: ${colors || "Designer should choose suitable print-safe colors"}`,
      `Background type: ${form.backgroundType}`,
      `Background description: ${form.backgroundDescription || "Use a clean professional background."}`,
      `Target audience: ${form.audience || "General customers"}`,
      `Design priority: ${form.priority || "Professional, readable, balanced"}`,
      `Suggested visual elements: ${form.visualElements || "Use only relevant icons/elements"}`,
      "",
      "Important design factors:",
      form.extraFactors || designFactors.join("\n"),
      "",
      "Strict font and language rule:",
      "Do not change, replace, stylize, transliterate, or convert Hindi, Marathi, or any Devanagari text. Keep Devanagari wording exactly as supplied. Do not suggest alternate Devanagari fonts. Preserve the original Devanagari font appearance as much as possible.",
      "",
      "Avoid:",
      form.avoid || "Avoid clutter, low contrast, spelling changes, and decorative elements that reduce readability.",
      "",
      "Output requirement:",
      "Give a complete generation prompt with layout direction, hierarchy, color use, background description, icon/photo guidance, print-safe spacing, and a negative prompt.",
    ].join("\n");
  }, [colors, field, form, selectedProduct, selectedSize]);

  function update<K extends keyof PromptForm>(key: K, value: PromptForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addProduct() {
    if (!newProduct.name.trim()) return;
    const product: ProductRecord = {
      id: id(),
      name: newProduct.name.trim(),
      category: newProduct.category.trim() || "Custom",
      description: newProduct.description.trim(),
    };
    setProducts((prev) => [...prev, product]);
    setForm((prev) => ({ ...prev, productId: product.id, sizeId: "" }));
    setNewProduct({ name: "", category: "", description: "" });
  }

  function addSize() {
    if (!selectedProduct || !newSize.label.trim() || !newSize.width.trim() || !newSize.height.trim()) return;
    const size: SizeRecord = {
      id: id(),
      productId: selectedProduct.id,
      label: newSize.label.trim(),
      width: newSize.width.trim(),
      height: newSize.height.trim(),
      unit: "in",
      notes: newSize.notes.trim(),
    };
    setSizes((prev) => [...prev, size]);
    setForm((prev) => ({ ...prev, sizeId: size.id }));
    setNewSize({ label: "", width: "", height: "", notes: "" });
  }

  function resetDatabase() {
    setProducts(defaultProducts);
    setSizes(defaultSizes);
    setForm((prev) => ({ ...prev, productId: "envelope", sizeId: "env-8-5x6-5" }));
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
              <p className="mt-1 text-sm text-slate-500">Create product, size, color, background, and field-based prompts for print designs.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={resetDatabase} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" /> Reset
              </button>
              <button onClick={copyPrompt} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <Clipboard className="h-4 w-4" /> {copied ? "Copied" : "Copy Prompt"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-bold">Product And Size Database</h2>
                </div>

                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">Product</span>
                  <select value={form.productId} onChange={(e) => {
                    const nextProductId = e.target.value;
                    const nextSize = sizes.find((size) => size.productId === nextProductId);
                    setForm((prev) => ({ ...prev, productId: nextProductId, sizeId: nextSize?.id ?? "" }));
                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </label>

                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">Size In Inches</span>
                  <select value={form.sizeId} onChange={(e) => update("sizeId", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
                    {productSizes.length === 0 && <option value="">No size added</option>}
                    {productSizes.map((size) => <option key={size.id} value={size.id}>{size.label} - {size.width} x {size.height} in</option>)}
                  </select>
                </label>

                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold text-slate-600">Create Product</p>
                  <div className="space-y-2">
                    <input value={newProduct.name} onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))} placeholder="Product name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <input value={newProduct.category} onChange={(e) => setNewProduct((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <textarea value={newProduct.description} onChange={(e) => setNewProduct((prev) => ({ ...prev, description: e.target.value }))} placeholder="Short description" rows={2} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <button onClick={addProduct} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
                      <Plus className="h-4 w-4" /> Add Product
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold text-slate-600">Add Size For Selected Product</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newSize.label} onChange={(e) => setNewSize((prev) => ({ ...prev, label: e.target.value }))} placeholder="Size label" className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <input value={newSize.width} onChange={(e) => setNewSize((prev) => ({ ...prev, width: e.target.value }))} placeholder="Width" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <input value={newSize.height} onChange={(e) => setNewSize((prev) => ({ ...prev, height: e.target.value }))} placeholder="Height" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <input value={newSize.notes} onChange={(e) => setNewSize((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    <button onClick={addSize} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700">
                      <Plus className="h-4 w-4" /> Add Size
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-bold">Saved Items</h2>
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {products.map((product) => (
                    <div key={product.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{product.name}</p>
                          <p className="text-[11px] text-slate-500">{product.category}</p>
                        </div>
                        {!defaultProducts.some((item) => item.id === product.id) && (
                          <button onClick={() => {
                            setProducts((prev) => prev.filter((item) => item.id !== product.id));
                            setSizes((prev) => prev.filter((item) => item.productId !== product.id));
                          }} className="rounded p-1 text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-bold">Prompt Details</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Business Name">
                    <input value={form.businessName} onChange={(e) => update("businessName", e.target.value)} className="input" />
                  </Field>
                  <Field label="Business Field">
                    <select value={form.businessField} onChange={(e) => update("businessField", e.target.value)} className="input">
                      {businessFields.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  {form.businessField === "Other" && (
                    <Field label="Other Field">
                      <input value={form.customField} onChange={(e) => update("customField", e.target.value)} className="input" />
                    </Field>
                  )}
                  <Field label="Language">
                    <input value={form.language} onChange={(e) => update("language", e.target.value)} className="input" />
                  </Field>
                  <Field label="Color Combination">
                    <select value={form.colorCombination} onChange={(e) => update("colorCombination", e.target.value)} className="input">
                      {colorCombinations.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  {form.colorCombination === "Custom" && (
                    <Field label="Custom Colors">
                      <input value={form.customColors} onChange={(e) => update("customColors", e.target.value)} placeholder="Example: teal, navy, white" className="input" />
                    </Field>
                  )}
                  <Field label="Template">
                    <select value={form.templateStyle} onChange={(e) => update("templateStyle", e.target.value)} className="input">
                      {templateStyles.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="Background Type">
                    <select value={form.backgroundType} onChange={(e) => update("backgroundType", e.target.value)} className="input">
                      {backgroundTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="Target Audience">
                    <input value={form.audience} onChange={(e) => update("audience", e.target.value)} className="input" />
                  </Field>
                  <Field label="Design Priority">
                    <input value={form.priority} onChange={(e) => update("priority", e.target.value)} className="input" />
                  </Field>
                  <Field label="Background Description" wide>
                    <textarea value={form.backgroundDescription} onChange={(e) => update("backgroundDescription", e.target.value)} rows={3} className="input resize-none" />
                  </Field>
                  <Field label="Exact Text To Include" wide>
                    <textarea value={form.requiredText} onChange={(e) => update("requiredText", e.target.value)} rows={6} className="input resize-none font-sans" />
                  </Field>
                  <Field label="Visual Elements" wide>
                    <textarea value={form.visualElements} onChange={(e) => update("visualElements", e.target.value)} rows={2} className="input resize-none" />
                  </Field>
                  <Field label="AI Design Expert Factors" wide>
                    <textarea value={form.extraFactors} onChange={(e) => update("extraFactors", e.target.value)} rows={7} className="input resize-none" />
                  </Field>
                  <Field label="Avoid / Negative Direction" wide>
                    <textarea value={form.avoid} onChange={(e) => update("avoid", e.target.value)} rows={3} className="input resize-none" />
                  </Field>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold">Generated Prompt</h2>
                  <button onClick={copyPrompt} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                    <Clipboard className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <textarea readOnly value={prompt} rows={18} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs leading-5 text-slate-800 outline-none" />
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                  Hindi, Marathi, and Devanagari text is protected in every generated prompt. The prompt explicitly tells AI not to change that font/text.
                </div>
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
        .input:focus {
          border-color: #3b82f6;
        }
      `}</style>
    </DashboardShell>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
