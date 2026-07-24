"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Tab = "forward" | "reverse" | "rates" | "history" | "clubbing" | "nwbag";
type LamOption = "none" | "gloss-single" | "gloss-double" | "matt-single" | "matt-double";
type Layer = { psize: string; gsm: string; qty: number; fsize: string; colors: number; sides: string };
type BreakdownRow = { label: string; amount: number };
type QuoteCopy = { number: string; text: string };
type QuoteInputParams = {
  layers?: Layer[];
  lam?: string;
  padSize?: string;
  pads?: number;
  punch?: boolean;
  envelope?: string;
  multiplier?: number;
  product?: string;
  qty?: number;
  sheetsPerUnit?: number;
  fsize?: string;
  paper?: string;
  parent?: string;
  colors?: number;
  sides?: string;
  micron?: number;
  creasing?: string;
  clip?: boolean;
  pocketSides?: number;
  fileClip?: boolean;
  filePocket?: boolean;
  bagSize?: string;
  stickerW?: number;
  stickerH?: number;
  stickerType?: string;
  halfCut?: boolean;
  dieCutting?: boolean;
  nonWovenSize?: string;
  nonWovenPrintMode?: string;
  dotMatrixSize?: string;
  dotMatrixGsm?: number;
  carbonCopy?: boolean;
  keychainNumber?: string;
  penNumber?: string;
};
type Result = {
  breakdown: BreakdownRow[];
  subtotal: number;
  total: number;
  perPiece?: number;
  perSticker?: number;
  totalQty?: number;
  multiplier?: number;
  description?: string;
  clubbing?: {
    vendorName: string;
    vendorCost: number;
    vendorTotal: number;
    ourCost: number;
    ourTotal: number;
    winner: "vendor" | "ours";
  };
  sticker?: {
    width: number;
    height: number;
    area: number;
    usableSheet: string;
    openSheet: string;
    columns: number;
    rows: number;
    rotated: boolean;
    stickersPerSheet: number;
    sheetsNeeded: number;
    selectedType: "plain" | "nontearable";
    halfCut?: boolean;
    halfCutPct?: number;
    dieCutting?: boolean;
    dieRatePerSqIn?: number;
    punchingRatePer1000?: number;
    dieBlockW?: number;
    dieBlockH?: number;
    dieW?: number;
    dieH?: number;
    dieArea?: number;
    dieCost?: number;
    punchingCost?: number;
    dieCuttingCost?: number;
    plainBaseSubtotal?: number;
    nonTearableBaseSubtotal?: number;
    plainHalfCutCost?: number;
    nonTearableHalfCutCost?: number;
    plainSheetRate: number;
    nonTearableSheetRate: number;
    plainSubtotal: number;
    nonTearableSubtotal: number;
    plainMultiplier: number;
    nonTearableMultiplier: number;
    plainTotal: number;
    nonTearableTotal: number;
    clubbingEligible: boolean;
    clubbingBlockColumns: number;
    clubbingBlockRows: number;
    clubbingStickersPerBlock: number;
    clubbingBlockArea: number;
    clubbingSets: number;
    clubbingMultiplier: number | null;
    clubbingCost: number | null;
    clubbingTotal: number | null;
    clubbingUnavailableReason: string | null;
  };
};

// Cuts per parent sheet — mirrors backend CUTS table
const CUTS: Record<string, Record<string, number>> = {
  '1823': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 32, file: 1,
            env425x925: 4, env425x45: 8, env425x63: 6, env525x75: 4, env85x11: 2, env11x17: 1 },
  '1925': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 40, file: 2,
            env425x925: 4, env425x45: 8, env425x63: 6, env525x75: 4, env85x11: 2 },
  '1520': { env9x12: 1 },
};

// Per-product config
type ProductConfig = {
  label: string;
  fixedSize?: string;
  fixedSizeLabel?: string; // human-readable dimension for a fixedSize product (e.g. "12×18\"")
  fixedParent?: string;
  sizes?: { value: string; label: string }[];
  hasSheetsPerUnit?: boolean;
  fixedInfo?: string;
  // envelope-style: auto-set & optionally lock parent sheet based on chosen size
  sizeParentMap?: Record<string, string>;
  sizeParentLocked?: Record<string, boolean>;
};

const ENVELOPE_SIZES = [
  { value: "env425x925", label: "4.25×9.25\" Office / DL" },
  { value: "env425x45",  label: "4.25×4.5\" Small" },
  { value: "env425x63",  label: "4.25×6.3\" Medium" },
  { value: "env525x75",  label: "5.25×7.5\" Document" },
  { value: "env85x11",   label: "8.5×11\" A4 Envelope" },
  { value: "env9x12",    label: "9×12\" Catalog" },
  { value: "env11x17",   label: "11×17\" Large" },
];

const PRODUCT_CONFIG: Record<string, ProductConfig> = {
  pads:       { label: "Pads (Gum Binding)", hasSheetsPerUnit: true,
                sizes: [{value:"A4",label:"A4"},{value:"A5",label:"A5"},{value:"A6",label:"A6"},{value:"A8",label:"A8"},{value:"1/3A4",label:"1/3 A4"}] },
  billbook:   { label: "Bill Book (Duplicate)", hasSheetsPerUnit: true,
                sizes: [{value:"A4",label:"A4"},{value:"A5",label:"A5"},{value:"A8",label:"A8"}] },
  letterhead: { label: "Letterheads",
                sizes: [{value:"A4",label:"A4"},{value:"A5",label:"A5"}] },
  pamphlet:   { label: "Pamphlet / Leaflet",
                sizes: [{value:"A4",label:"A4"},{value:"A5",label:"A5"},{value:"A6",label:"A6"},{value:"1/3A4",label:"1/3 A4 (DL size)"},{value:"DL",label:"DL"}] },
  envelope:   { label: "Envelopes", sizes: ENVELOPE_SIZES,
                sizeParentMap: {
                  env9x12:    "1520",  // fits only on 15×20" sheet
                  env11x17:   "1823",  // fits only on 18×23" sheet
                  env85x11:   "1823",  // A4 envelope standard parent sheet
                },
                sizeParentLocked: {
                  env9x12:  true,   // MUST use 15×20
                  env11x17: true,   // MUST use 18×23
                } },
  ppfile:     { label: "PP Files with Punching",
                fixedInfo: "PP file pricing uses quantity tiers, GST, clip and pocket options." },
  diagnosticbag: { label: "X-ray / CT Scan Bags",
                fixedInfo: "Small = X-ray bag 10.5x16 inch. Big = CT scan bag 16x21 inch." },
  nonwovenbag: { label: "Non Woven Bag",
                fixedInfo: "Choose bag size and single color or multicolor. Multicolor adds the master extra per bag." },
  dotmatrixbill: { label: "Dot Matrix Bill",
                fixedInfo: "Choose size, GSM and carbon-copy option." },
  keychain:   { label: "Keychain",
                fixedInfo: "Choose keychain number from the master rate list." },
  pen:        { label: "Pen",
                fixedInfo: "Choose pen number from the master rate list." },
  sticker:     { label: "Sticker",
                fixedInfo: "In-house uses 12×18 sheets with 11.5×17.5 printable area. Clubbing is only plain stickers above 1000 pcs and 6 sq inch block area." },
  file:       { label: "Files with Punching",
                fixedSize: "file", fixedParent: "1925", fixedSizeLabel: "12×18\"",
                fixedInfo: "Fixed: 12×18 inch size | 19×25\" parent sheet | 2 per sheet" },
  visiting:   { label: "Visiting Cards",
                fixedSize: "visiting", fixedSizeLabel: "3.5×2\"",
                fixedInfo: "Fixed: 3.5×2\" visiting card | 32 per 18×23\" / 40 per 19×25\" sheet" },
};

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Sequential quotation numbers (1, 2, 3, ... forever) come from the backend
// (GET /rate-calculator/next-quotation-number), which atomically increments a
// counter in SystemConfig. That has to live server-side: a client-side
// counter would let two people quoting at the same time both start from
// whatever number their own browser last saw, producing duplicates.
async function fetchNextQuotationNumber(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/rate-calculator/next-quotation-number`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      return String(data.number);
    }
  } catch { /* fall through to local fallback below */ }
  // Offline/error fallback so quoting never hard-blocks — still numeric only.
  return String(Date.now()).slice(-6);
}

// Standard paper sizes get their exact dimension appended in brackets, e.g.
// "A4 (8.27×11.69")" — these are the fixed ISO 216 dimensions, not specific
// to any particular parent sheet this shop cuts from.
const STANDARD_SIZE_DIMENSIONS: Record<string, string> = {
  A4: "8.27×11.69\"",
  A5: "5.83×8.27\"",
  A6: "4.13×5.83\"",
  A8: "2.05×2.91\"",
};

function appendStandardDimension(label: string) {
  const dim = STANDARD_SIZE_DIMENSIONS[label];
  return dim ? `${label} (${dim})` : label;
}

/** Looks up the human-readable size label (with its inch unit already baked
 *  in, e.g. 4.25×4.5" Small) instead of printing the raw option value (e.g.
 *  "env425x45") in the quotation text. Standard sizes (A4, A5...) get their
 *  exact dimension appended in brackets; fixed-size products (Files, Visiting
 *  Cards) resolve to their documented dimension instead of the raw internal
 *  key ("file", "visiting"). */
function formatFinalSize(product: string | undefined, fsize: string | undefined) {
  if (!fsize) return "";
  const config = product ? PRODUCT_CONFIG[product] : undefined;
  if (config?.fixedSize && fsize === config.fixedSize && config.fixedSizeLabel) {
    return config.fixedSizeLabel;
  }
  const label = config?.sizes?.find(s => s.value === fsize)?.label ?? fsize;
  return appendStandardDimension(label);
}

/** Reformats a raw "WxH" dimension string (e.g. "4x6", "9.5x11") into
 *  "4×6"" — used for sizes that are already plain numeric dimensions
 *  (dot matrix bill, non-woven bag) but were missing a unit suffix. */
function formatRawDimension(raw?: string) {
  if (!raw) return "";
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return raw;
  return `${match[1]}×${match[2]}"`;
}

function formatYesNo(value?: boolean) {
  return value ? "Yes" : "No";
}

function formatLam(lam?: string) {
  if (!lam || lam === "none") return "None";
  return lam.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function buildQuoteDetailLines(calcType: string, inputParams: QuoteInputParams, result: Result) {
  const details: string[] = [];

  if (calcType === "forward") {
    if (inputParams.layers?.length) {
      details.push("Product / Printing Details:");
      inputParams.layers.forEach((layer, index) => {
        details.push(
          `Layer ${index + 1}: ${layer.qty.toLocaleString("en-IN")} pcs, ${layer.fsize}, ${formatPaperType(layer.gsm)}, ${layer.colors} color, ${layer.sides === "double" ? "Double Side" : "Single Side"}`
        );
      });
    }
    details.push(`Lamination: ${formatLam(inputParams.lam)}`);
    details.push(`Pad Binding: ${inputParams.pads ? `${inputParams.pads.toLocaleString("en-IN")} pads, ${inputParams.padSize || "size as selected"}` : "No"}`);
    details.push(`File Punching: ${formatYesNo(inputParams.punch)}`);
    details.push(`Envelope Making: ${inputParams.envelope && inputParams.envelope !== "none" ? inputParams.envelope : "No"}`);
  } else {
    details.push("Product Details:");
    // Quantity is already printed once near the top of the quotation (see
    // buildQuotationText's own `qty` line) — don't repeat it in this section.

    if (inputParams.product === "file") {
      details.push(`File Clip: ${inputParams.fileClip !== false ? "Yes" : "No"}`);
      details.push(`Pocket: ${inputParams.filePocket ? "Yes" : "No"}`);
    }

    if (inputParams.product === "sticker") {
      const sticker = result.sticker;
      details.push(`Sticker Size: ${inputParams.stickerW || 0} x ${inputParams.stickerH || 0} inch`);
      details.push(`Sticker Type: ${inputParams.stickerType === "nontearable" ? "Non Tearable" : "Plain"}`);
      details.push(`Half Cutting: ${inputParams.halfCut ? `Yes${sticker?.halfCutPct ? ` (${sticker.halfCutPct}%)` : ""}` : "No"}`);
      details.push(`Die Cutting: ${inputParams.dieCutting ? `Yes (die ${sticker?.dieW?.toFixed(1) ?? ""}x${sticker?.dieH?.toFixed(1) ?? ""} in)` : "No"}`);
      if (sticker) {
        details.push(`Area: ${sticker.area.toFixed(2)} sq inch each`);
        details.push(`Sheet Layout: ${sticker.columns} x ${sticker.rows} = ${sticker.stickersPerSheet} stickers per sheet`);
        details.push(`Sheets Required: ${sticker.sheetsNeeded.toLocaleString("en-IN")} sheets`);
      }
    } else if (inputParams.product === "ppfile") {
      details.push(`Micron: ${inputParams.micron || ""}`);
      details.push(`Printing Side: ${inputParams.sides === "double" ? "Double Side" : "Single Side"}`);
      details.push(`Creasing: ${inputParams.creasing === "double" ? "Double Creasing" : "Single Creasing"}`);
      details.push(`Clip: ${formatYesNo(inputParams.clip)}`);
      details.push(`Pocket: ${inputParams.pocketSides ? `${inputParams.pocketSides} side` : "No Pocket"}`);
    } else if (inputParams.product === "diagnosticbag") {
      details.push(`Bag Type: ${inputParams.bagSize === "big" ? "Big CT Scan Bag (16x21 inch)" : "Small X-ray Bag (10.5x16 inch)"}`);
    } else if (inputParams.product === "nonwovenbag") {
      details.push(`Bag Size: ${formatRawDimension(inputParams.nonWovenSize)}`);
      details.push(`Printing: ${inputParams.nonWovenPrintMode === "multicolor" ? "Multicolor" : "Single Color"}`);
    } else if (inputParams.product === "dotmatrixbill") {
      details.push(`Size: ${formatRawDimension(inputParams.dotMatrixSize)}`);
      details.push(`GSM: ${inputParams.dotMatrixGsm || ""}`);
      details.push(`Carbon Copy: ${inputParams.carbonCopy ? "Yes" : "No"}`);
    } else if (inputParams.product === "keychain") {
      details.push(`Keychain Number: ${inputParams.keychainNumber || ""}`);
    } else if (inputParams.product === "pen") {
      details.push(`Pen Number: ${inputParams.penNumber || ""}`);
    } else {
      if (PRODUCT_CONFIG[inputParams.product ?? ""]?.hasSheetsPerUnit && inputParams.sheetsPerUnit) {
        details.push(`Pages per Pad / Book: ${inputParams.sheetsPerUnit}`);
      }
      if (inputParams.fsize) details.push(`Final Size: ${formatFinalSize(inputParams.product, inputParams.fsize)}`);

      if (inputParams.paper) details.push(`Paper: ${formatPaperType(inputParams.paper)}`);
      if (inputParams.colors) details.push(`Printing Colors: ${inputParams.colors} color${inputParams.colors > 1 ? "s" : ""}`);
      if (inputParams.sides) details.push(`Printing Side: ${inputParams.sides === "double" ? "Double Side" : "Single Side"}`);
      details.push(`Lamination: ${formatLam(inputParams.lam)}`);
    }
  }

  return details;
}

function sanitizeQuotationText(text: string) {
  const cleanedLines = text
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();
      return !(
        /^Parent Sheet:/i.test(trimmed) ||
        /^Calculation Note:/i.test(trimmed) ||
        /^Pricing Multiplier:/i.test(trimmed) ||
        /^-\s*Final amount includes margin and GST as calculated\.?$/i.test(trimmed) ||
        /^-\s*Artwork\/design, delivery or special finishing can be confirmed separately if applicable\.?$/i.test(trimmed)
      );
    });

  const notesIndex = cleanedLines.findIndex(line => line.trim().toLowerCase() === "notes:");
  if (notesIndex !== -1) {
    return [
      ...cleanedLines.slice(0, notesIndex),
      "Notes:",
      "- Shipping Charges Extra",
    ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return [...cleanedLines, "", "Notes:", "- Shipping Charges Extra"].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildQuotationText({
  quoteNumber,
  customer,
  product,
  job,
  qty,
  calcType,
  inputParams,
  result,
}: {
  quoteNumber: string;
  customer?: string;
  product?: string;
  job?: string;
  qty?: number;
  calcType: string;
  inputParams: QuoteInputParams;
  result: Result;
}) {
  const detailLines = buildQuoteDetailLines(calcType, inputParams, result);
  const lines = [
    `Quotation No: ${quoteNumber}`,
    `Date: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    customer ? `Customer: ${customer}` : "",
    product ? `Product: ${product}` : "",
    job ? `Job: ${job}` : "",
    qty ? `Quantity: ${qty.toLocaleString("en-IN")}` : "",
    "",
    ...detailLines,
    "",
    `Total Quote: ${fmt(result.total)}`,
  ].filter(Boolean);

  const perVal = result.perPiece ?? result.perSticker;
  if (perVal) lines.push(`Per Piece: ${fmt(perVal)}`);
  lines.push("", "Notes:", "- Shipping Charges Extra");
  return sanitizeQuotationText(lines.join("\n"));
}

function getStickerMultiplier(cost: number) {
  if (cost < 500) return 4;
  if (cost < 1000) return 3;
  if (cost < 3000) return 2;
  return 1.67;
}

// Converts type key like "bond70" → "70 GSM Bond", "map90" → "90 GSM Maplitho"
function formatPaperType(type: string): string {
  const m = type.match(/^([a-z]+)(\d+(?:\.\d+)?)$/i);
  if (!m) return type;
  const [, name, gsm] = m;
  const n = name.toLowerCase();
  const pname = n === 'bond' ? 'Bond' : n === 'map' ? 'Maplitho' : n.charAt(0).toUpperCase() + n.slice(1);
  return gsm + ' GSM ' + pname;
}

// ─── DYNAMIC RATE SECTION (generic add/remove key-value rows) ─────────────────
function DynamicRateSection({
  data, onUpdate, step = 1, addKeyPlaceholder = "key", addValPlaceholder = "rate",
  formatLabel,
}: {
  data: Record<string, number>;
  onUpdate: (d: Record<string, number>) => void;
  step?: number;
  addKeyPlaceholder?: string;
  addValPlaceholder?: string;
  formatLabel?: (k: string) => string;
}) {
  const [nk, setNk] = useState("");
  const [nv, setNv] = useState("");
  const del = (k: string) => { const n = { ...data }; delete n[k]; onUpdate(n); };
  const change = (k: string, v: number) => onUpdate({ ...data, [k]: v });
  const add = () => {
    const k = nk.trim(); if (!k || nv === "") return;
    onUpdate({ ...data, [k]: parseFloat(nv) }); setNk(""); setNv("");
  };
  return (
    <div className="space-y-1.5">
      {Object.entries(data || {}).map(([k, v]) => (
        <div key={k} className="flex gap-2 items-center">
          <span className="flex-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 truncate min-w-0">
            {formatLabel ? formatLabel(k) : k}
          </span>
          <input type="number" step={step} value={v}
            onChange={e => change(k, +e.target.value)}
            className="w-28 border border-slate-200 rounded-lg text-xs px-2 py-1.5 shrink-0" />
          <button onClick={() => del(k)}
            className="text-red-400 hover:text-red-600 text-lg font-bold w-6 shrink-0 leading-none" title="Remove">×</button>
        </div>
      ))}
      <div className="flex gap-2 items-center pt-2 border-t border-dashed border-slate-200">
        <input placeholder={addKeyPlaceholder} value={nk} onChange={e => setNk(e.target.value)}
          className="flex-1 border border-blue-200 rounded-lg text-xs px-2 py-1.5 min-w-0" />
        <input type="number" step={step} placeholder={addValPlaceholder} value={nv} onChange={e => setNv(e.target.value)}
          className="w-28 border border-blue-200 rounded-lg text-xs px-2 py-1.5 shrink-0" />
        <button onClick={add}
          className="bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold shrink-0">+ Add</button>
      </div>
    </div>
  );
}

// ─── DYNAMIC PAPER RATES (structured parent + type key) ───────────────────────
function DynamicPaperRates({ data, onUpdate }: { data: Record<string, number>; onUpdate: (d: Record<string, number>) => void }) {
  const [np, setNp] = useState("1823");
  const [nt, setNt] = useState("");
  const [nr, setNr] = useState("");
  const del = (k: string) => { const n = { ...data }; delete n[k]; onUpdate(n); };
  const change = (k: string, v: number) => onUpdate({ ...data, [k]: v });
  const fmtKey = (k: string) => {
    const [p, ...rest] = k.split("-");
    const pl = p === "1823" ? "18×23\"" : p === "1925" ? "19×25\"" : p === "1520" ? "15×20\"" : p + "\"";
    return pl + " " + rest.join("-");
  };
  const add = () => {
    const t = nt.trim().replace(/\s+/g, ""); if (!t || nr === "") return;
    onUpdate({ ...data, [np + "-" + t]: parseFloat(nr) }); setNt(""); setNr("");
  };
  return (
    <div className="space-y-1.5">
      {Object.entries(data || {}).map(([k, v]) => (
        <div key={k} className="flex gap-2 items-center">
          <span className="flex-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 truncate min-w-0">{fmtKey(k)}</span>
          <input type="number" value={v} onChange={e => change(k, +e.target.value)}
            className="w-28 border border-slate-200 rounded-lg text-xs px-2 py-1.5 shrink-0" />
          <button onClick={() => del(k)}
            className="text-red-400 hover:text-red-600 text-lg font-bold w-6 shrink-0 leading-none" title="Remove">×</button>
        </div>
      ))}
      <p className="text-xs text-slate-400">Per-sheet rate = ream rate ÷ 500</p>
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-dashed border-slate-200 items-end">
        <div>
          <p className="text-xs text-slate-500 mb-1">Parent</p>
          <select value={np} onChange={e => setNp(e.target.value)}
            className="w-full border border-blue-200 rounded-lg text-xs px-2 py-1.5 bg-white">
            <option value="1823">18×23"</option>
            <option value="1925">19×25"</option>
            <option value="1520">15×20"</option>
          </select>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-slate-500 mb-1">Type key (e.g. ivory100, art130)</p>
          <input placeholder="ivory100" value={nt} onChange={e => setNt(e.target.value)}
            className="w-full border border-blue-200 rounded-lg text-xs px-2 py-1.5" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">₹/ream</p>
          <input type="number" placeholder="0" value={nr} onChange={e => setNr(e.target.value)}
            className="w-full border border-blue-200 rounded-lg text-xs px-2 py-1.5" />
        </div>
      </div>
      <button onClick={add}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-1.5 text-xs font-semibold mt-1">+ Add Paper Type</button>
    </div>
  );
}

function ResultCard({ result, perLabel = "Per Piece", desc, isAdmin = true }: {
  result: Result; perLabel?: string; desc?: string; isAdmin?: boolean;
}) {
  const perVal = result.perPiece ?? result.perSticker ?? 0;
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
      <p className="text-sm font-bold text-green-800 mb-2">📊 Quote Breakdown</p>
      {desc && <p className="text-xs text-slate-500 mb-3">{desc}</p>}
      {/* Cost breakdown — admin only */}
      {isAdmin && (
        <div className="space-y-1">
          {result.breakdown.map((r, i) => (
            <div key={i} className="flex justify-between text-xs py-1 border-b border-green-100">
              <span className="text-slate-600">{r.label}</span>
              <span className="font-semibold text-slate-800">{fmt(r.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs py-1 border-b border-green-100">
            <span className="text-slate-600">Total Cost (before multiplier)</span>
            <span className="font-semibold">{fmt(result.subtotal)}</span>
          </div>
          {result.multiplier && (
            <div className="flex justify-between text-xs py-1 border-b border-green-100">
              <span className="text-slate-500">Multiplier applied</span>
              <span className="text-slate-500">×{result.multiplier}</span>
            </div>
          )}
        </div>
      )}
      <div className="bg-green-700 text-white rounded-lg px-4 py-2.5 flex justify-between items-center mt-3">
        <span className="font-bold text-sm">Total Quote (incl. margin + GST)</span>
        <span className="font-extrabold text-lg">{fmt(result.total)}</span>
      </div>
      {perVal > 0 && (
        <div className="bg-teal-700 text-white rounded-lg px-4 py-2 flex justify-between items-center mt-1.5">
          <span className="font-semibold text-sm">{perLabel}</span>
          <span className="font-bold">{fmt(perVal)}</span>
        </div>
      )}
    </div>
  );
}

function QuotationCopyCard({ quote }: { quote: QuoteCopy }) {
  const [copied, setCopied] = useState(false);
  const quoteText = sanitizeQuotationText(quote.text);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(quoteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 mt-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-bold text-slate-800">Quotation Copy</p>
          <p className="text-[11px] text-slate-500">{quote.number}</p>
        </div>
        <button onClick={copy}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea readOnly value={quoteText}
        className="h-36 w-full resize-none rounded border border-slate-200 bg-slate-50 p-2 text-xs leading-5 text-slate-700 outline-none" />
    </div>
  );
}

// ─── COMMISSION PANEL ─────────────────────────────────────────────────────────
// Office agents: 10% of selling price  = ~1/4 of profit at ×1.67
// WFH agents:   12% of selling price  = ~30% of profit at ×1.67
// When discount given → profit shrinks; % of selling stays same, % of profit goes up
// Commission formula:
//   Office = Profit / 4   (where Profit = Selling Price - Our Cost)
//   WFH    = Profit / 4 + 2% of Selling Price  (2% extra on top of office)
function calcCommission(price: number, cost: number, type: "office" | "wfh"): number {
  const profit = price - cost;
  const base = Math.max(0, profit) / 4;
  if (type === "office") return base;
  return base + price * 0.02; // WFH gets 2% of order value on top
}

function CommissionPanel({ cost, total, qty, isAdmin }: {
  cost: number; total: number; qty: number; isAdmin: boolean;
}) {
  const [agentType, setAgentType] = useState<"office" | "wfh">("office");
  const [customPrice, setCustomPrice] = useState("");

  const scenarios = [
    { label: "No Discount", price: total,        disc: 0  },
    { label: "5% Discount",  price: total * 0.95, disc: 5  },
    { label: "10% Discount", price: total * 0.90, disc: 10 },
  ];

  const customVal  = customPrice !== "" ? parseFloat(customPrice) : null;
  const belowCost  = customVal !== null && customVal < cost;
  const profitOf   = (p: number) => p - cost;
  const profitPct  = (p: number) => p > 0 ? ((p - cost) / p * 100) : 0;
  const comm       = (p: number) => calcCommission(p, cost, agentType);
  const commPctP   = (p: number) => profitOf(p) > 0 ? (comm(p) / profitOf(p) * 100) : 0;

  const officeComm = calcCommission(total, cost, "office");
  const wfhComm    = calcCommission(total, cost, "wfh");

  return (
    <div className="border border-blue-200 rounded-xl p-4 mt-3 bg-blue-50">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-bold text-blue-800">💰 Commission Calculator</p>
        <div className="flex gap-1">
          <button onClick={() => setAgentType("office")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${agentType === "office" ? "bg-brand-600 text-white border-brand-600" : "bg-white text-brand-600 border-brand-300"}`}>
            🏢 Office — {fmt(officeComm)}
          </button>
          <button onClick={() => setAgentType("wfh")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${agentType === "wfh" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-purple-600 border-purple-300"}`}>
            🏠 WFH — {fmt(wfhComm)}
          </button>
        </div>
      </div>

      <p className="text-xs text-blue-600 mb-3">
        {agentType === "office"
          ? <><strong>Office:</strong> Commission = Profit ÷ 4 &nbsp;(Profit = Selling − Cost)</>
          : <><strong>WFH:</strong> Commission = Profit ÷ 4 + 2% of Selling Price</>
        }
      </p>

      {/* Scenario table */}
      <div className="rounded-lg overflow-hidden border border-blue-200">
        <div className={`grid text-xs font-bold text-white py-2 px-3 ${isAdmin ? "grid-cols-5" : "grid-cols-3"} bg-blue-700`}>
          <span>Scenario</span>
          <span className="text-right">Order Value</span>
          {isAdmin && <><span className="text-right">Profit</span><span className="text-right">Net (you keep)</span></>}
          <span className="text-right">Commission</span>
        </div>
        {scenarios.map((s, i) => {
          const c    = comm(s.price);
          const prof = profitOf(s.price);
          const net  = prof - c;
          const loss = s.price < cost;
          return (
            <div key={i} className={`grid text-xs py-2 px-3 border-t border-blue-100 items-center ${isAdmin ? "grid-cols-5" : "grid-cols-3"} ${loss ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-blue-50/40"}`}>
              <span className="font-medium text-slate-700">
                {s.label}
                {s.disc > 0 && <span className="ml-1 text-orange-600 font-bold">-{s.disc}%</span>}
              </span>
              <span className="text-right font-semibold">{fmt(s.price)}</span>
              {isAdmin && (
                <>
                  <span className={`text-right ${prof < 0 ? "text-red-600 font-bold" : "text-slate-600"}`}>
                    {fmt(prof)}
                    {prof > 0 && <span className="text-slate-400 ml-1">({profitPct(s.price).toFixed(1)}%)</span>}
                  </span>
                  <span className={`text-right font-semibold ${net < 0 ? "text-red-600" : "text-green-700"}`}>{fmt(net)}</span>
                </>
              )}
              <span className="text-right font-bold text-blue-700">
                {fmt(c)}
                {isAdmin && prof > 0 && (
                  <span className="text-slate-400 font-normal ml-1">({commPctP(s.price).toFixed(0)}% of P)</span>
                )}
              </span>
            </div>
          );
        })}
        {/* Custom price row */}
        <div className={`grid text-xs py-2 px-3 border-t-2 border-blue-300 items-center ${isAdmin ? "grid-cols-5" : "grid-cols-3"} bg-amber-50`}>
          <span className="font-medium text-slate-700">Custom Rate</span>
          <span className="text-right">
            <input type="number" placeholder="enter price" value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              className="w-full text-right border border-amber-300 rounded px-1 py-0.5 text-xs bg-white max-w-[90px] ml-auto block" />
          </span>
          {isAdmin && (
            <>
              <span className={`text-right ${customVal !== null ? (belowCost ? "text-red-600 font-bold" : "text-slate-600") : "text-slate-300"}`}>
                {customVal !== null ? (belowCost ? "BELOW COST" : fmt(profitOf(customVal))) : "—"}
              </span>
              <span className={`text-right text-xs ${customVal !== null && !belowCost ? "text-green-700 font-semibold" : "text-slate-300"}`}>
                {customVal !== null && !belowCost ? fmt(profitOf(customVal) - comm(customVal)) : "—"}
              </span>
            </>
          )}
          <span className={`text-right font-bold ${customVal !== null ? (belowCost ? "text-red-600" : "text-blue-700") : "text-slate-300"}`}>
            {customVal !== null ? (belowCost ? "Loss!" : fmt(comm(customVal))) : "—"}
          </span>
        </div>
      </div>

      {belowCost && isAdmin && (
        <p className="text-xs text-red-600 font-semibold mt-2">
          Custom price {fmt(Number(customPrice))} is below your cost of {fmt(cost)} — selling at a loss.
        </p>
      )}
      {isAdmin && qty > 0 && (
        <p className="text-xs text-slate-500 mt-2">
          Per piece (no discount): Office <strong>{fmt(officeComm / qty)}</strong> · WFH <strong>{fmt(wfhComm / qty)}</strong>
        </p>
      )}
      <p className="text-xs text-slate-400 mt-2 border-t border-blue-200 pt-2">
        {agentType === "office"
          ? "Office formula: Profit ÷ 4  (≈ ¼ of margin)"
          : "WFH formula: Profit ÷ 4  +  2% of order value  (office commission + 2% extra)"
        }
      </p>
    </div>
  );
}

function StickerProductionCard({ sticker }: {
  sticker: NonNullable<Result["sticker"]>;
}) {
  return (
    <div className="border border-amber-200 rounded-xl p-4 mt-3 bg-amber-50">
      <p className="text-sm font-bold text-amber-900 mb-3">Sticker Production</p>
      <p className="text-xs text-amber-700 mb-3">
        {sticker.width}×{sticker.height} inch · {sticker.area.toFixed(2)} sq inch · {sticker.columns}×{sticker.rows} = {sticker.stickersPerSheet}/sheet on {sticker.usableSheet} usable area
        {sticker.rotated ? " · rotated for better fit" : ""}{sticker.halfCut ? ` · half cutting ${sticker.halfCutPct}%` : ""}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className={`rounded-lg border p-3 ${sticker.selectedType === "plain" ? "border-green-400 bg-green-50" : "border-amber-200 bg-white"}`}>
          <p className="text-xs font-bold text-slate-700 mb-1">Plain In-house</p>
          <p className="text-xs text-slate-500">{sticker.sheetsNeeded.toLocaleString()} sheets × Rs.{sticker.plainSheetRate}</p>
          <p className="text-sm font-extrabold text-slate-800 mt-2">{fmt(sticker.plainTotal)}</p>
          <p className="text-[10px] text-slate-400">Cost {fmt(sticker.plainSubtotal)} × {sticker.plainMultiplier}</p>
          {sticker.halfCut && <p className="text-[10px] text-green-700">Includes half cut {fmt(sticker.plainHalfCutCost ?? 0)}</p>}
        </div>
        <div className={`rounded-lg border p-3 ${sticker.selectedType === "nontearable" ? "border-green-400 bg-green-50" : "border-amber-200 bg-white"}`}>
          <p className="text-xs font-bold text-slate-700 mb-1">Non Tearable In-house</p>
          <p className="text-xs text-slate-500">{sticker.sheetsNeeded.toLocaleString()} sheets × Rs.{sticker.nonTearableSheetRate}</p>
          <p className="text-sm font-extrabold text-slate-800 mt-2">{fmt(sticker.nonTearableTotal)}</p>
          <p className="text-[10px] text-slate-400">Cost {fmt(sticker.nonTearableSubtotal)} × {sticker.nonTearableMultiplier}</p>
          {sticker.halfCut && <p className="text-[10px] text-green-700">Includes half cut {fmt(sticker.nonTearableHalfCutCost ?? 0)}</p>}
        </div>
        <div className={`rounded-lg border p-3 ${sticker.clubbingEligible ? "border-purple-300 bg-white" : "border-slate-200 bg-slate-50"}`}>
          <p className="text-xs font-bold text-slate-700 mb-1">Clubbing Plain</p>
          {sticker.clubbingEligible && sticker.clubbingCost != null && sticker.clubbingTotal != null ? (
            <>
              <p className="text-xs text-slate-500">
                {sticker.clubbingStickersPerBlock > 1
                  ? `${sticker.clubbingBlockColumns}×${sticker.clubbingBlockRows} = ${sticker.clubbingStickersPerBlock}/block · ${sticker.clubbingSets.toLocaleString()} blocks`
                  : "Area × qty"} × 0.035 + Rs.150
              </p>
              <p className="text-sm font-extrabold text-purple-800 mt-2">{fmt(sticker.clubbingTotal)}</p>
              <p className="text-[10px] text-slate-400">Cost {fmt(sticker.clubbingCost)} × {sticker.clubbingMultiplier}</p>
            </>
          ) : (
            <p className="text-xs font-semibold text-slate-400 mt-2">Nil - {sticker.clubbingUnavailableReason}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CLUBBING COMPARISON CARD ─────────────────────────────────────────────────
function ClubbingComparisonCard({ clubbing, multiplier }: {
  clubbing: NonNullable<Result["clubbing"]>;
  multiplier?: number;
}) {
  const mult = multiplier ?? 1.67;
  const ourWins = clubbing.winner === "ours";
  return (
    <div className="border border-purple-200 rounded-xl p-4 mt-3 bg-purple-50">
      <p className="text-sm font-bold text-purple-800 mb-3">🤝 Clubbing Vendor Comparison</p>
      <p className="text-xs text-purple-600 mb-3">
        4-color job — comparing our in-house cost vs {clubbing.vendorName}
        <span className="ml-1 text-slate-500">(vendor absorbs paper + printing + plates; lamination excluded)</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        {/* Our cost */}
        <div className={`rounded-lg p-3 border-2 ${ourWins ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs font-bold text-slate-600 mb-2">🏭 Our In-House</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Base cost</span>
              <span>{fmt(clubbing.ourCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">After ×{mult}</span>
              <span className="font-bold">{fmt(clubbing.ourTotal)}</span>
            </div>
          </div>
          {ourWins && <p className="text-xs text-green-700 font-bold mt-2">✅ WINNER — Lower Cost</p>}
        </div>
        {/* Vendor cost */}
        <div className={`rounded-lg p-3 border-2 ${!ourWins ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs font-bold text-slate-600 mb-2">🚚 {clubbing.vendorName}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Vendor cost</span>
              <span>{fmt(clubbing.vendorCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">After ×{mult}</span>
              <span className="font-bold">{fmt(clubbing.vendorTotal)}</span>
            </div>
          </div>
          {!ourWins && <p className="text-xs text-green-700 font-bold mt-2">✅ WINNER — Lower Cost</p>}
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        💡 Binding/Punching + Envelope Making are charged separately on top of whichever option wins.
      </p>
    </div>
  );
}

// ─── LAYER ROW ────────────────────────────────────────────────────────────────
function LayerRow({ layer, idx, onChange, onRemove, canRemove, paperOptions }: {
  layer: Layer; idx: number;
  onChange: (f: Partial<Layer>) => void;
  onRemove: () => void; canRemove: boolean;
  paperOptions: { value: string; label: string }[];
}) {
  const cuts = CUTS[layer.psize]?.[layer.fsize] ?? 4;
  const parentSheets = Math.ceil(layer.qty / cuts);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 mb-1.5 relative">
      <p className="text-xs font-bold text-slate-400 mb-2">LAYER {idx + 1}</p>
      {canRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 text-lg leading-none font-bold">×</button>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Paper Size</label>
          <select value={layer.psize} onChange={e => onChange({ psize: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white">
            <option value="1823">18×23 inch</option>
            <option value="1925">19×25 inch</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">GSM / Paper</label>
          <select value={layer.gsm} onChange={e => onChange({ gsm: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white">
            {paperOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Print Quantity (pieces)</label>
          <input type="number" value={layer.qty} onChange={e => onChange({ qty: +e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Final Size</label>
          <select value={layer.fsize} onChange={e => onChange({ fsize: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white">
            <option value="A4">A4</option><option value="A5">A5</option>
            <option value="A6">A6</option><option value="A8">A8</option>
            <option value="1/3A4">1/3 A4</option><option value="DL">DL</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Colors</label>
          <select value={layer.colors} onChange={e => onChange({ colors: +e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white">
            <option value={1}>1 Color</option>
            <option value={2}>2 Color</option>
            <option value={4}>4 Colors (CMYK)</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Sides</label>
          <select value={layer.sides} onChange={e => onChange({ sides: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white">
            <option value="single">Single Side</option>
            <option value="double">Double Side</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Cuts/sheet: <strong>{cuts}</strong> → Parent sheets: <strong>{parentSheets.toLocaleString()}</strong>
        {layer.colors === 4
          ? <> → Printing billed on <strong>{parentSheets.toLocaleString()} parent sheets</strong></>
          : <> → Printing billed on <strong>{(parentSheets * cuts).toLocaleString()} pieces</strong> (flat rate)</>
        }
      </p>
    </div>
  );
}

// ─── SMALL UI HELPERS ─────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">{label}</label>
      {children}
    </div>
  );
}
function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-400" />;
}
function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return <select {...props} className="w-full border border-slate-200 rounded text-xs px-2 py-1 bg-white">{children}</select>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-2.5 mb-1.5">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function AccordionCategory({ title, icon, defaultOpen = false, children }: { title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-100 hover:bg-slate-200 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span>{icon}</span> {title}
        </span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="p-2.5 space-y-1.5">{children}</div>}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function RateCalculatorPage() {
  const [tab, setTab] = useState<Tab>("forward");
  const [isAdmin, setIsAdmin] = useState(true); // default true until user loaded
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [resultDesc, setResultDesc] = useState("");
  const [currentQuote, setCurrentQuote] = useState<QuoteCopy | null>(null);

  // ── Forward State ──
  const [layers, setLayers] = useState<Layer[]>([{ psize: "1823", gsm: "bond70", qty: 1000, fsize: "A4", colors: 1, sides: "single" }]);
  const [fCustomer, setFCustomer] = useState("");
  const [fJob, setFJob] = useState("");
  const [fLam, setFLam] = useState<LamOption>("none");
  const [fPad, setFPad] = useState("no");
  const [fPadSize, setFPadSize] = useState("A4");
  const [fPads, setFPads] = useState(0);
  const [fPunch, setFPunch] = useState("no");
  const [fEnv, setFEnv] = useState("none");
  const [fMult, setFMult] = useState<number | "">("");  // blank = use master default

  // ── Reverse State ──
  const [rCustomer, setRCustomer] = useState("");
  const [rProduct, setRProduct] = useState("pads");
  const [rWindow, setRWindow] = useState(false);
  const [rQty, setRQty] = useState(50);
  const [rSheets, setRSheets] = useState(100);
  const [rSize, setRSize] = useState("A4");
  const [rPaper, setRPaper] = useState("map100");
  const [rParent, setRParent] = useState("1823");
  const [rColors, setRColors] = useState(4);
  const [rSides, setRSides] = useState("single");
  const [rLam, setRLam] = useState<LamOption>("none");
  const [rPpMicron, setRPpMicron] = useState(300);
  const [rPpCreasing, setRPpCreasing] = useState("single");
  const [rPpClip, setRPpClip] = useState(true);
  const [rPpPocketSides, setRPpPocketSides] = useState(0);
  const [rFileClip, setRFileClip] = useState(true);
  const [rFilePocket, setRFilePocket] = useState(false);
  const [rBagSize, setRBagSize] = useState("small");
  const [rStickerW, setRStickerW] = useState(2);
  const [rStickerH, setRStickerH] = useState(3);
  const [rStickerType, setRStickerType] = useState<"plain" | "nontearable">("plain");
  const [rStickerHalfCut, setRStickerHalfCut] = useState(false);
  const [rStickerDieCutting, setRStickerDieCutting] = useState(false);
  const [rNonWovenSize, setRNonWovenSize] = useState("12x15");
  const [rNonWovenPrintMode, setRNonWovenPrintMode] = useState<"single" | "multicolor">("single");
  const [rNonWovenPlateMode, setRNonWovenPlateMode] = useState<"1" | "2">("1");
  const [rNonWovenPerPlateRate, setRNonWovenPerPlateRate] = useState<number | "">("");
  const [rDotMatrixSize, setRDotMatrixSize] = useState("4x6");
  const [rDotMatrixGsm, setRDotMatrixGsm] = useState(70);
  const [rCarbonCopy, setRCarbonCopy] = useState(false);
  const [rKeychainNumber, setRKeychainNumber] = useState("KC1");
  const [rPenNumber, setRPenNumber] = useState("PEN1");
  const [rMult, setRMult] = useState<number | "">("");  // blank = use master default

  // ── NW Bag Cost Calculator State ──
  const [nwBag, setNwBag] = useState({
    description: "",
    weightGm: "",
    quantity: "",
    ratePerKg: "",
    printingCostPerBag: "",
    plateMode: "1" as "1" | "2",
    perPlateRate: "",
  });
  const nwCalc = (() => {
    const wt = parseFloat(nwBag.weightGm) || 0;
    const qty = parseFloat(nwBag.quantity) || 0;
    const rkg = parseFloat(nwBag.ratePerKg) || 0;
    const prt = parseFloat(nwBag.printingCostPerBag) || 0;
    const plates = nwBag.plateMode === "2" ? 2 : 1;
    const ppr = parseFloat(nwBag.perPlateRate) || 0;
    if (!wt || !qty || !rkg) return null;
    const fabricCost = (wt * qty / 1000) * rkg;
    const printingCost = prt * qty;
    const plateCost = plates * ppr;
    const totalCost = fabricCost + printingCost + plateCost;
    const costPerBag = qty > 0 ? totalCost / qty : 0;
    return { fabricCost, printingCost, plateCost, totalCost, costPerBag, plates };
  })();

  // Auto-set size/parent when product changes
  useEffect(() => {
    const cfg = PRODUCT_CONFIG[rProduct];
    if (rProduct === "sticker") {
      setRQty(1000);
      setRStickerW(2);
      setRStickerH(3);
      setRStickerType("plain");
      setRStickerHalfCut(false);
      return;
    }
    if (rProduct === "ppfile") {
      setRQty(1000);
      setRSides("single");
      setRPpCreasing("single");
      setRPpClip(true);
      setRPpPocketSides(0);
      return;
    }
    if (rProduct === "diagnosticbag") {
      setRQty(1000);
      setRBagSize("small");
      return;
    }
    if (rProduct === "nonwovenbag") {
      setRQty(1000);
      setRNonWovenSize("12x15");
      setRNonWovenPrintMode("single");
      setRNonWovenPlateMode("1");
      setRNonWovenPerPlateRate("");
      return;
    }
    if (rProduct === "dotmatrixbill") {
      setRQty(1000);
      setRDotMatrixSize("4x6");
      setRDotMatrixGsm(70);
      setRCarbonCopy(false);
      return;
    }
    if (rProduct === "keychain") {
      setRQty(1000);
      setRKeychainNumber("KC1");
      return;
    }
    if (rProduct === "pen") {
      setRQty(1000);
      setRPenNumber("PEN1");
      return;
    }
    if (rProduct === "file") {
      setRFileClip(true);
      setRFilePocket(false);
    }
    if (cfg?.fixedSize)   setRSize(cfg.fixedSize);
    if (cfg?.fixedParent) setRParent(cfg.fixedParent);
    if (!cfg?.fixedSize && cfg?.sizes?.[0]) setRSize(cfg.sizes[0].value);
  }, [rProduct]);

  // Auto-set parent sheet when envelope size changes (sizeParentMap)
  useEffect(() => {
    const cfg = PRODUCT_CONFIG[rProduct];
    const mappedParent = cfg?.sizeParentMap?.[rSize];
    if (mappedParent) setRParent(mappedParent);
    else if (!cfg?.fixedParent) setRParent("1823"); // default for unlocked sizes
  }, [rProduct, rSize]);

  // ── Rates State ──
  const [rates, setRates] = useState<any>(null);
  const [ratesSaved, setRatesSaved] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── History State ──
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Clubbing Vendor State ──
  const [clubbingData, setClubbingData] = useState<any>({ vendorName: "", rates: {} });
  const [clubbingSaved, setClubbingSaved] = useState(false);
  const [clubbingError, setClubbingError] = useState<string | null>(null);

  // Sticker preview for reverse calculator
  const stickerArea = rStickerW * rStickerH;
  const stickerNormalCols = rStickerW > 0 ? Math.floor(11.5 / rStickerW) : 0;
  const stickerNormalRows = rStickerH > 0 ? Math.floor(17.5 / rStickerH) : 0;
  const stickerRotatedCols = rStickerH > 0 ? Math.floor(11.5 / rStickerH) : 0;
  const stickerRotatedRows = rStickerW > 0 ? Math.floor(17.5 / rStickerW) : 0;
  const stickerNormalFit = stickerNormalCols * stickerNormalRows;
  const stickerRotatedFit = stickerRotatedCols * stickerRotatedRows;
  const stickerBestFit = stickerRotatedFit > stickerNormalFit
    ? { cols: stickerRotatedCols, rows: stickerRotatedRows, perSheet: stickerRotatedFit, rotated: true }
    : { cols: stickerNormalCols, rows: stickerNormalRows, perSheet: stickerNormalFit, rotated: false };
  const stickerSheetsNeeded = stickerBestFit.perSheet > 0 ? Math.ceil(rQty / stickerBestFit.perSheet) : 0;
  const stickerPlainCost = stickerSheetsNeeded * 13;
  const stickerNonTearableCost = stickerSheetsNeeded * 19;
  const stickerHalfCutPct = Number(rates?.sticker?.halfCutPct ?? 30);
  const stickerSelectedBaseCost = rStickerType === "nontearable" ? stickerNonTearableCost : stickerPlainCost;
  const stickerHalfCutCost = rStickerHalfCut ? stickerSelectedBaseCost * stickerHalfCutPct / 100 : 0;
  const stickerDieRatePerSqIn = Number(rates?.sticker?.dieRatePerSqIn ?? 6);
  const stickerPunchingRatePer1000 = Number(rates?.sticker?.punchingRatePer1000 ?? 500);
  const stickerDieBlockW = stickerBestFit.cols * rStickerW;
  const stickerDieBlockH = stickerBestFit.rows * rStickerH;
  const stickerDieW = stickerDieBlockW > 0 ? stickerDieBlockW + 2 : 0;
  const stickerDieH = stickerDieBlockH > 0 ? stickerDieBlockH + 2 : 0;
  const stickerDieArea = stickerDieW * stickerDieH;
  const stickerDieCost = rStickerDieCutting ? stickerDieArea * stickerDieRatePerSqIn : 0;
  const stickerPunchingCost = rStickerDieCutting ? (stickerSheetsNeeded / 1000) * stickerPunchingRatePer1000 : 0;
  const stickerDieCuttingCost = stickerDieCost + stickerPunchingCost;
  const stickerSelectedCost = stickerSelectedBaseCost + stickerHalfCutCost + stickerDieCuttingCost;
  const stickerAutoMultiplier = getStickerMultiplier(stickerSelectedCost);
  const stickerClubCols = stickerArea <= 0 || stickerArea >= 6 ? 1 : Math.max(1, Math.ceil(5 / rStickerW));
  const stickerClubRows = stickerArea <= 0 || stickerArea >= 6 ? 1 : Math.max(1, Math.ceil(6 / (stickerClubCols * stickerArea)));
  const stickerClubPerBlock = stickerClubCols * stickerClubRows;
  const stickerClubBlockArea = stickerArea * stickerClubPerBlock;
  const stickerClubSets = stickerClubPerBlock > 0 ? Math.ceil(rQty / stickerClubPerBlock) : 0;
  const stickerClubEligible = rQty >= 1000 && stickerClubBlockArea >= 6;
  const stickerClubCost = stickerClubEligible ? stickerClubBlockArea * stickerClubSets * 0.035 + 150 : 0;
  const stickerClubMultiplier = stickerClubEligible ? getStickerMultiplier(stickerClubCost) : 0;

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/rates`, { headers: getAuthHeaders() });
      if (!res.ok) { setRatesError(`Failed to load rates: ${res.status}`); return; }
      const data = await res.json();
      setRates(data);
      // Pre-fill multiplier placeholders from master
      setFMult("");
      setRMult("");
    } catch {
      setRatesError("Unable to load master rates. Please refresh.");
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
    const user = getStoredUser();
    // Only ADMIN and INHOUSE/ACCOUNTS roles see full cost breakdown
    const adminRoles = ["ADMIN", "INHOUSE", "ACCOUNTS"];
    setIsAdmin(!user || adminRoles.includes(user.role));
  }, [loadRates]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/history?limit=200`, { headers: getAuthHeaders() });
      if (res.ok) setHistory(await res.json());
    } finally { setHistoryLoading(false); }
  }, []);

  const deleteHistoryItem = async (id: string) => {
    await fetch(`${API_BASE_URL}/rate-calculator/history/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const loadClubbing = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/clubbing-rates`, { headers: getAuthHeaders() });
      if (res.ok) setClubbingData(await res.json());
    } catch {}
  }, []);

  const saveClubbing = async () => {
    setClubbingError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/clubbing-rates`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(clubbingData),
      });
      if (res.ok) { setClubbingSaved(true); setTimeout(() => setClubbingSaved(false), 3000); }
      else setClubbingError("Save failed (HTTP " + res.status + ").");
    } catch { setClubbingError("Save failed — check connection."); }
  };

  // Auto-save quote to history
  const saveToHistory = async (calcType: string, inputParams: any, result: Result, product?: string, qty?: number) => {
    const quoteNumber = await fetchNextQuotationNumber();
    const customer = inputParams.customer ?? inputParams.rCustomer ?? "";
    const job = inputParams.job ?? inputParams.fJob ?? "";
    const quotationText = buildQuotationText({
      quoteNumber,
      customer,
      product: product ?? calcType,
      job,
      qty,
      calcType,
      inputParams,
      result,
    });
    setCurrentQuote({ number: quoteNumber, text: quotationText });
    try {
      await fetch(`${API_BASE_URL}/rate-calculator/history`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          calcType, product: product ?? calcType,
          qty, customer,
          job,
          breakdown: result.breakdown ?? [],
          subtotal: result.subtotal ?? 0,
          total: result.total ?? 0,
          perPiece: result.perPiece ?? result.perSticker ?? null,
          multiplier: result.multiplier ?? 1.67,
          inputParams: { ...inputParams, quotationNumber: quoteNumber, quotationText },
        }),
      });
    } catch {}
  };

  const post = async (endpoint: string, body: any) => {
    setLoading(true); setResult(null); setCurrentQuote(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/${endpoint}`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
    } finally { setLoading(false); }
    return null;
  };

  const calcForward = async () => {
    const body = {
      layers, lam: fLam, padSize: fPadSize,
      pads: fPad === "yes" ? fPads : 0,
      punch: fPunch === "yes", envelope: fEnv,
      multiplier: fMult !== "" ? fMult : undefined,
      customer: fCustomer, job: fJob,
    };
    const r = await post("forward", body);
    if (r) {
      setResult(r);
      setResultDesc(`Job: ${fJob || "—"} | Customer: ${fCustomer || "—"}`);
      saveToHistory("forward", body, r, "Forward Quote", layers[0]?.qty);
    }
  };

  const calcReverse = async () => {
    const body = {
      product: rProduct, qty: rQty, sheetsPerUnit: rSheets,
      fsize: rSize, paper: rPaper, parent: rParent,
      colors: rColors, sides: rSides, lam: ["letterhead","pamphlet","visiting","file"].includes(rProduct) ? rLam : "none",
      micron: rPpMicron, creasing: rPpCreasing, printSide: rSides,
      clip: rPpClip, pocketSides: rPpPocketSides,
      bagSize: rBagSize,
      stickerW: rStickerW, stickerH: rStickerH, stickerType: rStickerType,
      halfCut: rProduct === "sticker" ? rStickerHalfCut : undefined,
      dieCutting: rProduct === "sticker" ? rStickerDieCutting : undefined,
      nonWovenSize: rNonWovenSize,
      nonWovenPrintMode: rNonWovenPrintMode,
      nonWovenPlateMode: rNonWovenPlateMode,
      nonWovenPerPlateRate: rNonWovenPerPlateRate !== "" ? rNonWovenPerPlateRate : undefined,
      dotMatrixSize: rDotMatrixSize,
      dotMatrixGsm: rDotMatrixGsm,
      carbonCopy: rCarbonCopy,
      keychainNumber: rKeychainNumber,
      penNumber: rPenNumber,
      multiplier: rProduct === "sticker" ? undefined : (rMult !== "" ? rMult : undefined),
      customer: rCustomer,
      envelopeWindow: rProduct === "envelope" ? rWindow : undefined,
      clip: rProduct === "file" ? rFileClip : undefined,
      filePocket: rProduct === "file" ? rFilePocket : undefined,
    };
    const r = await post("reverse", body);
    if (r) {
      setResult(r);
      setResultDesc(r.description || "");
      saveToHistory("reverse", body, r, rProduct, rQty);
    }
  };

  const saveRates = async () => {
    if (!rates) return;
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/rates`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(rates),
      });
      if (res.ok) {
        setRatesSaved(true);
        setTimeout(() => setRatesSaved(false), 3000);
      } else {
        setSaveError("Save failed (HTTP " + res.status + "). Try again.");
      }
    } catch {
      setSaveError("Save failed — check your connection.");
    }
  };

  const updateRate = (path: string, val: number) => {
    setRates((prev: any) => {
      const next = { ...prev };
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = val;
      return next;
    });
  };

  const updateRateSection = (section: string, next: Record<string, number>) => {
    setRates((prev: any) => ({ ...prev, [section]: next }));
  };


  // Derive paper type options from master rates (keeps dropdowns in sync with Master Rates)
  const DEFAULT_PAPER_OPTIONS = [
    { value: 'bond70', label: '70 GSM Bond' },
    { value: 'bond80', label: '80 GSM Bond' },
    { value: 'map90', label: '90 GSM Maplitho' },
    { value: 'map100', label: '100 GSM Maplitho' },
  ];
  const paperOptions: { value: string; label: string }[] = rates?.paper
    ? [...new Set(Object.keys(rates.paper).map((k: string) => k.split('-').slice(1).join('-')))]
        .map(t => ({ value: t, label: formatPaperType(t) }))
    : DEFAULT_PAPER_OPTIONS;

  const ALL_TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "forward",  label: "→ Forward" },
    { id: "reverse",  label: "↺ Reverse" },
    { id: "nwbag",   label: "🧺 NW Bag Cost" },
    { id: "rates",    label: "⚙ Rates",    adminOnly: true },
    { id: "history",  label: "📋 History" },
    { id: "clubbing", label: "🤝 Clubbing", adminOnly: true },
  ];
  const TABS = ALL_TABS.filter(t => isAdmin || !t.adminOnly);

  // Multiplier hint label
  const masterMult = rates?.multiplier ?? 1.67;
  const multHint = `Default from master: ×${masterMult}`;

  const reverseCuts = rProduct === "sticker" ? stickerBestFit.perSheet : (CUTS[rParent]?.[rSize] ?? 4);
  const reversePieces = rProduct === "pads" || rProduct === "billbook" ? rQty * rSheets : rQty;
  const reverseParentSheets = rProduct === "sticker" ? stickerSheetsNeeded : Math.ceil(reversePieces / reverseCuts);
  const parentLabel = rParent === "1520" ? "15×20\"" : rParent === "1823" ? "18×23\"" : "19×25\"";
  const rSizeParentLocked = !!(PRODUCT_CONFIG[rProduct]?.sizeParentLocked?.[rSize]);
  const ppRates = rates?.ppFiles;
  const ppTiers = (ppRates?.tiers ?? [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]).map(Number).sort((a: number, b: number) => b - a);
  const ppTier = ppTiers.find((t: number) => rQty >= t) ?? ppTiers[ppTiers.length - 1] ?? 1000;
  const ppRateKey = `${rPpCreasing === "double" ? "double" : "single"}-${rSides === "double" ? "double" : "single"}-${rPpMicron === 350 ? 350 : 300}`;
  const ppBaseRate = ppRates?.baseCosts?.[ppRateKey]?.[ppTier] ?? 0;
  const ppClipRate = rPpClip ? (ppRates?.clip ?? 1.25) : 0;
  const ppPocketRate = rPpPocketSides * (ppRates?.pocketOneSide ?? 2.5);
  const ppGstPct = ppRates?.gstPct ?? 18;
  const ppMult = rMult !== "" ? rMult : (ppRates?.multiplier ?? 1.67);
  const ppPreviewPerFile = (ppBaseRate + ppClipRate + ppPocketRate) * (1 + ppGstPct / 100) * ppMult;
  const bagRates = rates?.diagnosticBags;
  const bagTiers = (bagRates?.tiers ?? [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]).map(Number).sort((a: number, b: number) => b - a);
  const bagTier = bagTiers.find((t: number) => rQty >= t) ?? bagTiers[bagTiers.length - 1] ?? 1000;
  const bagBaseRate = bagRates?.baseCosts?.[rBagSize]?.[bagTier] ?? 0;
  const bagGstPct = bagRates?.gstPct ?? 18;
  const bagMult = rMult !== "" ? rMult : (bagRates?.multiplier ?? 1.67);
  const bagPreviewPerPiece = bagBaseRate * (1 + bagGstPct / 100) * bagMult;
  const nonWovenRates = rates?.nonWovenBag;
  const nonWovenBaseRate = Number(nonWovenRates?.sizeRates?.[rNonWovenSize] ?? 0);
  const nonWovenExtraRate = rNonWovenPrintMode === "multicolor" ? Number(nonWovenRates?.multicolorExtraPerBag ?? 2) : 0;
  const nonWovenMult = rMult !== "" ? rMult : (nonWovenRates?.multiplier ?? 1.67);
  const nonWovenPreviewPerBag = (nonWovenBaseRate + nonWovenExtraRate) * nonWovenMult;
  const dotMatrixRates = rates?.dotMatrixBill;
  const dotMatrixBaseRate = Number(dotMatrixRates?.sizeRates?.[rDotMatrixSize]?.[rDotMatrixGsm] ?? 0);
  const dotMatrixCarbonRate = rCarbonCopy ? Number(dotMatrixRates?.carbonCopyExtraPerBook ?? 8) : 0;
  const dotMatrixMult = rMult !== "" ? rMult : (dotMatrixRates?.multiplier ?? 1.67);
  const dotMatrixPreviewPerBook = (dotMatrixBaseRate + dotMatrixCarbonRate) * dotMatrixMult;
  const keychainRates = rates?.keychain;
  const keychainBaseRate = Number(keychainRates?.numberRates?.[rKeychainNumber] ?? 0);
  const keychainMult = rMult !== "" ? rMult : (keychainRates?.multiplier ?? 1.67);
  const keychainPreviewPerPiece = keychainBaseRate * keychainMult;
  const penRates = rates?.pen;
  const penBaseRate = Number(penRates?.numberRates?.[rPenNumber] ?? 0);
  const penMult = rMult !== "" ? rMult : (penRates?.multiplier ?? 1.67);
  const penPreviewPerPiece = penBaseRate * penMult;

  return (
    <DashboardShell>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Tab bar ── */}
        <div className="flex gap-1 bg-slate-100 px-2 pt-2 pb-0 shrink-0">
          <div className="flex gap-1 bg-slate-100 rounded-t-lg p-1 flex-wrap flex-1">
            <span className="hidden md:flex items-center px-2 text-xs font-bold text-blue-700 whitespace-nowrap">Rate Calc</span>
            {TABS.map(t => (
              <button key={t.id} onClick={() => {
                setTab(t.id); setResult(null); setCurrentQuote(null);
                if (t.id === "history") loadHistory();
                if (t.id === "clubbing") loadClubbing();
              }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all min-w-[52px] ${tab === t.id ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-2">

        {/* ── FORWARD ── */}
        {tab === "forward" && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(460px,2fr)] xl:grid-cols-[minmax(0,5fr)_minmax(560px,4fr)] gap-2 items-start">
            {/* Left: inputs */}
            <div>
              <Card title="📋 Job Details">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Customer Name"><Input value={fCustomer} onChange={e => setFCustomer(e.target.value)} placeholder="e.g. ABC Traders" /></Field>
                  <Field label="Job Name"><Input value={fJob} onChange={e => setFJob(e.target.value)} placeholder="e.g. Letterhead" /></Field>
                </div>
              </Card>

              <Card title="📄 Paper Layers">
                {layers.map((l, i) => (
                  <LayerRow key={i} layer={l} idx={i}
                    onChange={f => setLayers(prev => prev.map((x, j) => j === i ? { ...x, ...f } : x))}
                    onRemove={() => setLayers(prev => prev.filter((_, j) => j !== i))}
                    canRemove={layers.length > 1}
                    paperOptions={paperOptions} />
                ))}
                <button
                  onClick={() => setLayers(p => [...p, { psize: "1823", gsm: "bond70", qty: 1000, fsize: "A4", colors: 1, sides: "single" }])}
                  className="border border-dashed border-slate-300 rounded px-3 py-1 text-xs text-slate-500 hover:bg-slate-50">
                  + Add Layer
                </button>
              </Card>

              <Card title="✂️ Finishing">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Field label="Lamination">
                    <Select value={fLam} onChange={e => setFLam(e.target.value as LamOption)}>
                      <option value="none">None</option>
                      <option value="gloss-single">Gloss Single</option>
                      <option value="gloss-double">Gloss Double</option>
                      <option value="matt-single">Matt Single</option>
                      <option value="matt-double">Matt Double</option>
                    </Select>
                  </Field>
                  <Field label="Pad Binding">
                    <Select value={fPad} onChange={e => setFPad(e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </Select>
                  </Field>
                  {fPad === "yes" && <>
                    <Field label="Pad Size">
                      <Select value={fPadSize} onChange={e => setFPadSize(e.target.value)}>
                        <option value="A4">A4</option><option value="A5">A5</option>
                        <option value="A6">A6</option><option value="A8">A8</option>
                        <option value="1/3A4">1/3 A4</option>
                      </Select>
                    </Field>
                    <Field label="No. of Pads">
                      <Input type="number" value={fPads} onChange={e => setFPads(+e.target.value)} />
                    </Field>
                  </>}
                  <Field label="File Punching">
                    <Select value={fPunch} onChange={e => setFPunch(e.target.value)}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </Select>
                  </Field>
                  <Field label="Envelope Making">
                    <Select value={fEnv} onChange={e => setFEnv(e.target.value)}>
                      <option value="none">None</option>
                      {ENVELOPE_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </Select>
                  </Field>
                </div>
              </Card>

              <Card title="💰 Multiplier">
                <div className="grid grid-cols-2 gap-2 items-end">
                  <Field label={`Multiplier (×) — ${multHint}`}>
                    <Input type="number" step="0.01" placeholder={String(masterMult)}
                      value={fMult} onChange={e => setFMult(e.target.value === "" ? "" : +e.target.value)} />
                  </Field>
                  <button onClick={calcForward} disabled={loading}
                    className="bg-brand-600 text-white rounded py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:opacity-60">
                    {loading ? "Calculating…" : "🧮 Calculate"}
                  </button>
                </div>
              </Card>
            </div>

            {/* Right: result */}
            <div className="lg:sticky lg:top-0">
              {result && (
                <>
                  <ResultCard result={result} desc={resultDesc} isAdmin={isAdmin} />
                  {currentQuote && <QuotationCopyCard quote={currentQuote} />}
                  <CommissionPanel
                    cost={result.subtotal}
                    total={result.total}
                    qty={result.totalQty ?? layers[0]?.qty ?? 0}
                    isAdmin={isAdmin}
                  />
                </>
              )}
              {!result && (
                <div className="hidden lg:flex items-center justify-center h-48 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 flex-col gap-2">
                  <span className="text-2xl">🧮</span>
                  Fill details and click Calculate
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REVERSE ── */}
        {tab === "reverse" && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(460px,2fr)] xl:grid-cols-[minmax(0,5fr)_minmax(560px,4fr)] gap-2 items-start">
            {/* Left: inputs */}
            <div>
              <div className="bg-blue-50 border border-blue-200 rounded px-3 py-1.5 text-xs text-blue-700 mb-2">
                📌 Enter what your customer wants — costs and quote calculated automatically.
              </div>

              <Card title="📦 Requirement">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Customer Name"><Input value={rCustomer} onChange={e => setRCustomer(e.target.value)} placeholder="e.g. Raj Enterprises" /></Field>
                  <Field label="Product Type">
                    <Select value={rProduct} onChange={e => setRProduct(e.target.value)}>
                      {Object.entries(PRODUCT_CONFIG).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </Card>

              <Card title="🔢 Details">
                {PRODUCT_CONFIG[rProduct]?.fixedInfo && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-800 font-medium mb-2">
                    📐 {PRODUCT_CONFIG[rProduct].fixedInfo}
                  </div>
                )}
                {rProduct === "sticker" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Length (in)">
                        <Input type="number" min="0" step="0.1" value={rStickerW} onChange={e => setRStickerW(+e.target.value)} />
                      </Field>
                      <Field label="Width (in)">
                        <Input type="number" min="0" step="0.1" value={rStickerH} onChange={e => setRStickerH(+e.target.value)} />
                      </Field>
                      <Field label="Sticker Type">
                        <Select value={rStickerType} onChange={e => setRStickerType(e.target.value as "plain" | "nontearable")}>
                          <option value="plain">Plain</option>
                          <option value="nontearable">Non Tearable</option>
                        </Select>
                      </Field>
                      <Field label={`Half Cutting (${stickerHalfCutPct}%)`}>
                        <label className="flex h-[30px] items-center gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                          <input type="checkbox" checked={rStickerHalfCut} onChange={e => setRStickerHalfCut(e.target.checked)} />
                          Apply
                        </label>
                      </Field>
                      <Field label={`Die Cutting (Rs.${stickerDieRatePerSqIn}/sq in + Rs.${stickerPunchingRatePer1000}/1000 sheets)`}>
                        <label className="flex h-[30px] items-center gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                          <input type="checkbox" checked={rStickerDieCutting} onChange={e => setRStickerDieCutting(e.target.checked)} />
                          Apply
                        </label>
                      </Field>
                    </div>
                    {rStickerDieCutting && stickerBestFit.perSheet > 0 && (
                      <div className="mt-2 bg-orange-50 border border-orange-200 rounded p-2 text-xs text-orange-800">
                        Die Cutting: block <strong>{stickerBestFit.cols}×{stickerBestFit.rows}</strong> = <strong>{stickerDieBlockW.toFixed(2)}×{stickerDieBlockH.toFixed(2)} in</strong> → die (+1" each side) <strong>{stickerDieW.toFixed(2)}×{stickerDieH.toFixed(2)} in</strong> = <strong>{stickerDieArea.toFixed(2)} sq in</strong>{" "}
                        → die cost <strong>{fmt(stickerDieCost)}</strong> + punching ({stickerSheetsNeeded.toLocaleString()} sheets) <strong>{fmt(stickerPunchingCost)}</strong> = <strong>{fmt(stickerDieCuttingCost)}</strong>
                      </div>
                    )}
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} stickers</strong> · {stickerArea.toFixed(2)} sq inch each → open sheet <strong>12×18"</strong>, usable <strong>11.5×17.5"</strong> →{" "}
                      {stickerBestFit.perSheet > 0 ? (
                        <>
                          <strong>{stickerBestFit.cols}×{stickerBestFit.rows} = {stickerBestFit.perSheet}/sheet</strong>{stickerBestFit.rotated ? " (rotated)" : ""} → <strong>{stickerSheetsNeeded.toLocaleString()} sheets</strong>
                          {" "}· base <strong>{fmt(stickerSelectedBaseCost)}</strong>{rStickerHalfCut ? <> + half cutting <strong>{fmt(stickerHalfCutCost)}</strong></> : ""}{rStickerDieCutting ? <> + die cutting <strong>{fmt(stickerDieCuttingCost)}</strong></> : ""} → cost <strong>{fmt(stickerSelectedCost)}</strong> → auto multiplier <strong>×{stickerAutoMultiplier}</strong>
                        </>
                      ) : (
                        <span className="text-amber-600 font-semibold">size does not fit usable area</span>
                      )}
                    </div>
                    {rQty < 1000 || !stickerClubEligible ? (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                        Clubbing Nil: minimum 1000 pcs and 6 sq inch block area required. Clubbing is only for plain stickers.
                      </div>
                    ) : (
                      <div className="mt-2 bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-700">
                        Clubbing plain sticker preview:{" "}
                        {stickerClubPerBlock > 1 && (
                          <>{stickerClubCols}×{stickerClubRows} = {stickerClubPerBlock} stickers/block · {stickerClubSets.toLocaleString()} blocks · </>
                        )}
                        cost {fmt(stickerClubCost)} → auto multiplier ×{stickerClubMultiplier}.
                      </div>
                    )}
                  </>
                ) : rProduct === "ppfile" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Micron">
                        <Select value={rPpMicron} onChange={e => setRPpMicron(+e.target.value)}>
                          <option value={300}>300 micron</option>
                          <option value={350}>350 micron</option>
                        </Select>
                      </Field>
                      <Field label="Printing Side">
                        <Select value={rSides} onChange={e => setRSides(e.target.value)}>
                          <option value="single">Single Side</option>
                          <option value="double">Double Side</option>
                        </Select>
                      </Field>
                      <Field label="Creasing">
                        <Select value={rPpCreasing} onChange={e => setRPpCreasing(e.target.value)}>
                          <option value="single">Single Creasing</option>
                          <option value="double">Double Creasing</option>
                        </Select>
                      </Field>
                      <Field label="Clip">
                        <label className="flex h-[30px] items-center gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                          <input type="checkbox" checked={rPpClip} onChange={e => setRPpClip(e.target.checked)} />
                          Add clip (+Rs.{(ppRates?.clip ?? 1.25).toFixed(2)})
                        </label>
                      </Field>
                      <Field label="Pocket">
                        <Select value={rPpPocketSides} onChange={e => setRPpPocketSides(+e.target.value)}>
                          <option value={0}>No Pocket</option>
                          <option value={1}>Yes - 1 Side (+Rs.2.50)</option>
                          <option value={2}>Yes - 2 Side (+Rs.5.00)</option>
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} PP files</strong> → tier <strong>{ppTier.toLocaleString()}</strong> → base <strong>{fmt(ppBaseRate)}</strong>/file
                      {" + "}GST {ppGstPct}% × multiplier {ppMult} → approx <strong>{fmt(ppPreviewPerFile)}</strong>/file
                    </div>
                  </>
                ) : rProduct === "diagnosticbag" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Bag Type">
                        <Select value={rBagSize} onChange={e => setRBagSize(e.target.value)}>
                          <option value="small">Small X-ray Bag (10.5x16 inch)</option>
                          <option value="big">Big CT Scan Bag (16x21 inch)</option>
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} {rBagSize === "big" ? "CT scan bags" : "X-ray bags"}</strong> → tier <strong>{bagTier.toLocaleString()}</strong> → base <strong>{fmt(bagBaseRate)}</strong>/bag
                      {" + "}GST {bagGstPct}% × multiplier {bagMult} → approx <strong>{fmt(bagPreviewPerPiece)}</strong>/bag
                    </div>
                  </>
                ) : rProduct === "nonwovenbag" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Bag Size">
                        <Select value={rNonWovenSize} onChange={e => setRNonWovenSize(e.target.value)}>
                          {Object.keys(nonWovenRates?.sizeRates ?? { "9x12": 8, "10x14": 10, "12x15": 12, "12x18": 14, "16x21": 18 }).map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Printing">
                        <Select value={rNonWovenPrintMode} onChange={e => setRNonWovenPrintMode(e.target.value as "single" | "multicolor")}>
                          <option value="single">Single Color</option>
                          <option value="multicolor">Multicolor (+₹{nonWovenRates?.multicolorExtraPerBag ?? 2}/bag)</option>
                        </Select>
                      </Field>
                      <Field label="Plate Design">
                        <Select value={rNonWovenPlateMode} onChange={e => setRNonWovenPlateMode(e.target.value as "1" | "2")}>
                          <option value="1">1 Plate — Same design front &amp; back</option>
                          <option value="2">2 Plates — Different design front &amp; back</option>
                        </Select>
                      </Field>
                      <Field label={`Per Plate Rate (₹) — default ₹${nonWovenRates?.perPlateRate ?? 500}`}>
                        <Input
                          type="number"
                          value={rNonWovenPerPlateRate}
                          onChange={e => setRNonWovenPerPlateRate(e.target.value === "" ? "" : +e.target.value)}
                          placeholder={String(nonWovenRates?.perPlateRate ?? 500)}
                        />
                      </Field>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} bags</strong> · base <strong>{fmt(nonWovenBaseRate)}</strong>/bag
                      {nonWovenExtraRate > 0 ? <> + multicolor <strong>{fmt(nonWovenExtraRate)}</strong>/bag</> : ""}
                      {" "}+ <strong>{rNonWovenPlateMode} plate{rNonWovenPlateMode === "2" ? "s" : ""}</strong> × ₹{rNonWovenPerPlateRate || (nonWovenRates?.perPlateRate ?? 500)}
                      {" "}× multiplier {nonWovenMult} → approx <strong>{fmt(nonWovenPreviewPerBag)}</strong>/bag (excl. plates)
                    </div>
                  </>
                ) : rProduct === "dotmatrixbill" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Size">
                        <Select value={rDotMatrixSize} onChange={e => setRDotMatrixSize(e.target.value)}>
                          {Object.keys(dotMatrixRates?.sizeRates ?? { "4x6": {}, "7.5x4": {}, "8.5x11": {} }).map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="GSM">
                        <Select value={rDotMatrixGsm} onChange={e => setRDotMatrixGsm(+e.target.value)}>
                          {Object.keys(dotMatrixRates?.sizeRates?.[rDotMatrixSize] ?? { 60: 0, 70: 0, 80: 0, 100: 0 }).map(gsm => (
                            <option key={gsm} value={gsm}>{gsm} GSM</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Carbon Copy">
                        <label className="flex h-[30px] items-center gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                          <input type="checkbox" checked={rCarbonCopy} onChange={e => setRCarbonCopy(e.target.checked)} />
                          Add carbon
                        </label>
                      </Field>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} books</strong> → base <strong>{fmt(dotMatrixBaseRate)}</strong>/book
                      {rCarbonCopy ? <> + carbon <strong>{fmt(dotMatrixCarbonRate)}</strong>/book</> : ""} × multiplier {dotMatrixMult} → approx <strong>{fmt(dotMatrixPreviewPerBook)}</strong>/book
                    </div>
                  </>
                ) : rProduct === "keychain" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Keychain Number">
                        <Select value={rKeychainNumber} onChange={e => setRKeychainNumber(e.target.value)}>
                          {Object.keys(keychainRates?.numberRates ?? { KC1: 12, KC2: 14, KC3: 16, KC4: 18, KC5: 20 }).map(number => (
                            <option key={number} value={number}>{number}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} keychains</strong> → base <strong>{fmt(keychainBaseRate)}</strong>/pc × multiplier {keychainMult} → approx <strong>{fmt(keychainPreviewPerPiece)}</strong>/pc
                    </div>
                  </>
                ) : rProduct === "pen" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      <Field label="Pen Number">
                        <Select value={rPenNumber} onChange={e => setRPenNumber(e.target.value)}>
                          {Object.keys(penRates?.numberRates ?? { PEN1: 6, PEN2: 7, PEN3: 8, PEN4: 9, PEN5: 10 }).map(number => (
                            <option key={number} value={number}>{number}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      <strong>{rQty.toLocaleString()} pens</strong> → base <strong>{fmt(penBaseRate)}</strong>/pc × multiplier {penMult} → approx <strong>{fmt(penPreviewPerPiece)}</strong>/pc
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Field label={PRODUCT_CONFIG[rProduct]?.hasSheetsPerUnit ? "No. of Pads / Books" : "Quantity"}>
                        <Input type="number" value={rQty} onChange={e => setRQty(+e.target.value)} />
                      </Field>
                      {PRODUCT_CONFIG[rProduct]?.hasSheetsPerUnit && (
                        <Field label="Pages per Pad / Book">
                          <Input type="number" value={rSheets} onChange={e => setRSheets(+e.target.value)} />
                        </Field>
                      )}
                      {!PRODUCT_CONFIG[rProduct]?.fixedSize && PRODUCT_CONFIG[rProduct]?.sizes && (
                        <Field label="Final Size">
                          <Select value={rSize} onChange={e => setRSize(e.target.value)}>
                            {PRODUCT_CONFIG[rProduct].sizes!.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </Select>
                        </Field>
                      )}
                      <Field label="Paper Type">
                        <Select value={rPaper} onChange={e => setRPaper(e.target.value)}>
                          {paperOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </Select>
                      </Field>
                      <div className="col-span-1">
                        <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Parent Sheet Size</label>
                        <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-800 font-medium">
                          🔒 Auto: {parentLabel}
                        </div>
                      </div>
                      <Field label="No. of Colors">
                        <Select value={rColors} onChange={e => setRColors(+e.target.value)}>
                          <option value={1}>1 Color</option>
                          <option value={2}>2 Color</option>
                          <option value={4}>4 Colors (CMYK)</option>
                        </Select>
                      </Field>
                      <Field label="Printing Side">
                        <Select value={rSides} onChange={e => setRSides(e.target.value)}>
                          <option value="single">Single Side</option>
                          <option value="double">Double Side</option>
                        </Select>
                      </Field>
                      {rProduct === "envelope" && (
                        <Field label="Window">
                          <Select value={rWindow ? "yes" : "no"} onChange={e => setRWindow(e.target.value === "yes")}>
                            <option value="no">No</option>
                            <option value="yes">Yes (+₹200/1000)</option>
                          </Select>
                        </Field>
                      )}
                      {["letterhead","pamphlet","visiting","file"].includes(rProduct) && (
                        <Field label="Lamination">
                          <Select value={rLam} onChange={e => setRLam(e.target.value as LamOption)}>
                            <option value="none">None</option>
                            <option value="gloss-single">Gloss Single</option>
                            <option value="gloss-double">Gloss Double</option>
                            <option value="matt-single">Matt Single</option>
                            <option value="matt-double">Matt Double</option>
                          </Select>
                        </Field>
                      )}
                      {rProduct === "file" && (
                        <Field label={`File Clip (+₹${rates?.fileClip ?? 1}/file)`}>
                          <label className="flex h-[30px] items-center gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                            <input type="checkbox" checked={rFileClip} onChange={e => setRFileClip(e.target.checked)} />
                            Add clip
                          </label>
                        </Field>
                      )}
                      {rProduct === "file" && (
                        <Field label={`Pocket (+₹${rates?.filePocket ?? 2.2}/file)`}>
                          <Select value={rFilePocket ? "yes" : "no"} onChange={e => setRFilePocket(e.target.value === "yes")}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </Select>
                        </Field>
                      )}
                    </div>
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-600">
                      {rProduct === "pads" || rProduct === "billbook"
                        ? <>{rQty} × {rSheets} pages = <strong>{reversePieces.toLocaleString()} pieces</strong></>
                        : <strong>{reversePieces.toLocaleString()} pieces</strong>
                      }
                      {reverseCuts > 0
                        ? <> → {reverseCuts} cuts → <strong>{reverseParentSheets.toLocaleString()} sheets of {parentLabel}</strong>
                            {rColors === 4
                              ? <> → 4-color on <strong>{reverseParentSheets.toLocaleString()} parent sheets</strong></>
                              : <> → billed on <strong>{(reverseParentSheets * reverseCuts).toLocaleString()} pieces</strong></>
                            }
                          </>
                        : <span className="text-amber-600"> → ⚠ Size not available on {parentLabel}</span>
                      }
                    </div>
                  </>
                )}
              </Card>

              <Card title="💰 Multiplier">
                <div className="grid grid-cols-2 gap-2 items-end">
                  {rProduct === "sticker" ? (
                    <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                      <span className="font-semibold">Auto:</span> cost {fmt(stickerSelectedCost)} → ×{stickerAutoMultiplier}
                      <span className="block text-[10px] text-amber-600">Under 500=4 · 500-1000=3 · 1000-3000=2 · 3000+=1.67</span>
                    </div>
                  ) : (
                    <Field label={`Multiplier (×) — ${multHint}`}>
                      <Input type="number" step="0.01" placeholder={String(masterMult)}
                        value={rMult} onChange={e => setRMult(e.target.value === "" ? "" : +e.target.value)} />
                    </Field>
                  )}
                  <button onClick={calcReverse} disabled={loading}
                    className="bg-brand-600 text-white rounded py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:opacity-60">
                    {loading ? "Calculating…" : "🧮 Calculate"}
                  </button>
                </div>
              </Card>
            </div>

            {/* Right: result */}
            <div className="lg:sticky lg:top-0">
              {result && (
                <>
                  <ResultCard result={result} desc={resultDesc} isAdmin={isAdmin} />
                  {currentQuote && <QuotationCopyCard quote={currentQuote} />}
                  {result?.sticker && (
                    <StickerProductionCard sticker={result.sticker} />
                  )}
                  {result?.clubbing && (
                    <ClubbingComparisonCard clubbing={result.clubbing} multiplier={result.multiplier} />
                  )}
                  <CommissionPanel
                    cost={result.subtotal}
                    total={result.total}
                    qty={result.totalQty ?? rQty}
                    isAdmin={isAdmin}
                  />
                </>
              )}
              {!result && (
                <div className="hidden lg:flex items-center justify-center h-48 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 flex-col gap-2">
                  <span className="text-2xl">🧮</span>
                  Fill details and click Calculate
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── NW BAG COST CALCULATOR ── */}
        {tab === "nwbag" && (
          <div className="max-w-2xl space-y-4 pt-1">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div>
                <p className="text-sm font-bold text-slate-800">🧺 Non Woven Bag Cost Calculator</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Formula: (Weight/bag × Qty ÷ 1000 × Rate/kg) + (Printing/bag × Qty) + (Plates × Per plate rate)
                </p>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Bag Description / Size (optional)</label>
                <input
                  type="text"
                  value={nwBag.description}
                  onChange={e => setNwBag(s => ({ ...s, description: e.target.value }))}
                  placeholder="e.g. 12×15 inch W-Cut Non Woven Bag"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Weight per Bag (gm) *</label>
                  <input type="number" step="0.1" value={nwBag.weightGm}
                    onChange={e => setNwBag(s => ({ ...s, weightGm: e.target.value }))}
                    placeholder="e.g. 45"
                    className="w-full border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-400" />
                  <p className="text-[10px] text-slate-400 mt-0.5">Size-wise fabric weight</p>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Total Quantity (bags) *</label>
                  <input type="number" value={nwBag.quantity}
                    onChange={e => setNwBag(s => ({ ...s, quantity: e.target.value }))}
                    placeholder="e.g. 1000"
                    className="w-full border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Rate per KG (₹/kg) *</label>
                  <input type="number" step="0.01" value={nwBag.ratePerKg}
                    onChange={e => setNwBag(s => ({ ...s, ratePerKg: e.target.value }))}
                    placeholder="e.g. 120"
                    className="w-full border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-400" />
                  <p className="text-[10px] text-slate-400 mt-0.5">Non woven fabric cost/kg</p>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Printing Cost per Bag (₹)</label>
                  <input type="number" step="0.01" value={nwBag.printingCostPerBag}
                    onChange={e => setNwBag(s => ({ ...s, printingCostPerBag: e.target.value }))}
                    placeholder="e.g. 2.50"
                    className="w-full border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Plate Configuration</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700">
                    <input type="radio" name="nwPlateMode" value="1" checked={nwBag.plateMode === "1"}
                      onChange={() => setNwBag(s => ({ ...s, plateMode: "1" }))} className="accent-blue-600" />
                    1 Plate <span className="text-[10px] text-slate-400">(Same design front &amp; back)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700">
                    <input type="radio" name="nwPlateMode" value="2" checked={nwBag.plateMode === "2"}
                      onChange={() => setNwBag(s => ({ ...s, plateMode: "2" }))} className="accent-blue-600" />
                    2 Plates <span className="text-[10px] text-slate-400">(Different design front &amp; back)</span>
                  </label>
                </div>
                <div className="w-44">
                  <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Per Plate Rate (₹)</label>
                  <input type="number" step="1" value={nwBag.perPlateRate}
                    onChange={e => setNwBag(s => ({ ...s, perPlateRate: e.target.value }))}
                    placeholder="e.g. 500"
                    className="w-full border border-slate-200 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              <button onClick={() => setNwBag({ description: "", weightGm: "", quantity: "", ratePerKg: "", printingCostPerBag: "", plateMode: "1", perPlateRate: "" })}
                className="text-[10px] text-slate-400 hover:text-slate-600 underline">
                Clear all
              </button>
            </div>

            {nwCalc && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-bold text-green-800">
                  📊 Cost Breakdown
                  {nwBag.description && <span className="text-green-600 font-normal ml-2">— {nwBag.description}</span>}
                </p>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs py-1.5 border-b border-green-100">
                    <div>
                      <span className="text-slate-700">Fabric Cost</span>
                      <p className="text-slate-400">{nwBag.weightGm}gm × {Number(nwBag.quantity).toLocaleString("en-IN")} bags ÷ 1000 × ₹{nwBag.ratePerKg}/kg = {((parseFloat(nwBag.weightGm) * parseFloat(nwBag.quantity)) / 1000).toFixed(2)} kg</p>
                    </div>
                    <span className="font-semibold text-slate-800 ml-4">{fmt(nwCalc.fabricCost)}</span>
                  </div>
                  {nwCalc.printingCost > 0 && (
                    <div className="flex justify-between text-xs py-1.5 border-b border-green-100">
                      <div>
                        <span className="text-slate-700">Printing Cost</span>
                        <p className="text-slate-400">₹{nwBag.printingCostPerBag}/bag × {Number(nwBag.quantity).toLocaleString("en-IN")} bags</p>
                      </div>
                      <span className="font-semibold text-slate-800 ml-4">{fmt(nwCalc.printingCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs py-1.5 border-b border-green-100">
                    <div>
                      <span className="text-slate-700">Plate Cost</span>
                      <p className="text-slate-400">{nwCalc.plates} plate{nwCalc.plates > 1 ? "s" : ""} × ₹{nwBag.perPlateRate || "0"} ({nwBag.plateMode === "2" ? "different design front & back" : "same design front & back"})</p>
                    </div>
                    <span className="font-semibold text-slate-800 ml-4">{fmt(nwCalc.plateCost)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg bg-brand-600 text-white p-4 text-center">
                    <div className="text-xs opacity-80 mb-1">Total Cost</div>
                    <div className="text-2xl font-extrabold">{fmt(nwCalc.totalCost)}</div>
                    <div className="text-xs opacity-70 mt-0.5">for {Number(nwBag.quantity).toLocaleString("en-IN")} bags</div>
                  </div>
                  <div className="rounded-lg bg-green-700 text-white p-4 text-center">
                    <div className="text-xs opacity-80 mb-1">Cost per Bag</div>
                    <div className="text-2xl font-extrabold">{fmt(nwCalc.costPerBag)}</div>
                    <div className="text-xs opacity-70 mt-0.5">per piece</div>
                  </div>
                </div>
              </div>
            )}

            {!nwCalc && (nwBag.weightGm || nwBag.quantity || nwBag.ratePerKg) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                Fill in Weight per Bag, Quantity, and Rate per KG to see the cost breakdown.
              </div>
            )}
          </div>
        )}

        {/* ── MASTER RATES ── */}
        {tab === "rates" && (
          ratesLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">Loading master rates…</div>
          ) : ratesError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 text-sm">
              <p className="font-semibold mb-2">Unable to load master rates</p>
              <p className="text-xs">{ratesError}</p>
              <button onClick={loadRates} className="mt-4 rounded-lg bg-amber-600 text-white px-4 py-2 text-xs font-semibold hover:bg-amber-700">Retry</button>
            </div>
          ) : rates ? (
            <>
              {/* ── CATEGORY: General ── */}
              <AccordionCategory title="General" icon="⚙️" defaultOpen={true}>
                <Card title="Selling Multiplier (covers Margin + GST)">
                  <div className="flex items-end gap-3">
                    <div className="w-32">
                      <Field label="Default Multiplier (×)">
                        <Input type="number" step="0.01" value={rates.multiplier ?? ""} onChange={e => updateRate("multiplier", +e.target.value)} />
                      </Field>
                    </div>
                    <p className="text-xs text-slate-400 pb-1">
                      cost ₹6,100 × {rates.multiplier ?? 1.67} = ₹{(6100 * (rates.multiplier ?? 1.67)).toFixed(0)}
                    </p>
                  </div>
                </Card>
                <Card title="Plate & Punching">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Plate Rate (₹/plate)">
                      <Input type="number" value={rates.plate ?? ""} onChange={e => updateRate("plate", +e.target.value)} />
                    </Field>
                    <Field label="File Punching (₹/piece)">
                      <Input type="number" value={rates.punch ?? ""} onChange={e => updateRate("punch", +e.target.value)} />
                    </Field>
                    <Field label="File Clip (₹/file)">
                      <Input type="number" step="0.01" value={rates.fileClip ?? 1} onChange={e => updateRate("fileClip", +e.target.value)} />
                    </Field>
                    <Field label="File Pocket (₹/file)">
                      <Input type="number" step="0.01" value={rates.filePocket ?? 2.2} onChange={e => updateRate("filePocket", +e.target.value)} />
                    </Field>
                  </div>
                </Card>
              </AccordionCategory>

              {/* ── CATEGORY: Paper ── */}
              <AccordionCategory title="Paper" icon="📄" defaultOpen={false}>
                <Card title="Paper Rates (₹ per ream of 500 sheets)">
                  <DynamicPaperRates
                    data={rates.paper ?? {}}
                    onUpdate={d => updateRateSection("paper", d)}
                  />
                </Card>
              </AccordionCategory>

              {/* ── CATEGORY: Printing & Finishing ── */}
              <AccordionCategory title="Printing & Finishing" icon="🖨️" defaultOpen={false}>
                <Card title="Offset Printing Rates">
                  <p className="text-[10px] text-blue-600 mb-2">4-Color: per parent sheet (rounds to 1000) · 1/2-Color: flat per 1,000 pcs</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="4-Color 1st 1,000 sheets (₹)">
                      <Input type="number" value={rates.printing?.['4color']?.first1k ?? ""} onChange={e => updateRate("printing.4color.first1k", +e.target.value)} />
                    </Field>
                    <Field label="4-Color next 1,000 sheets (₹)">
                      <Input type="number" value={rates.printing?.['4color']?.nextK ?? ""} onChange={e => updateRate("printing.4color.nextK", +e.target.value)} />
                    </Field>
                    <Field label="1-Color per 1,000 pcs (₹)">
                      <Input type="number" value={rates.printing?.['1color']?.flat ?? ""} onChange={e => updateRate("printing.1color.flat", +e.target.value)} />
                    </Field>
                    <Field label="2-Color per 1,000 pcs (₹)">
                      <Input type="number" value={rates.printing?.['2color']?.flat ?? ""} onChange={e => updateRate("printing.2color.flat", +e.target.value)} />
                    </Field>
                  </div>
                </Card>
                <Card title="Lamination (₹/100 sq in)">
                  <p className="text-[10px] text-slate-400 mb-2">18×23 sheet = 414 sq in → per sheet = 4.14 × rate</p>
                  <DynamicRateSection
                    data={rates.lamination ?? {}}
                    onUpdate={d => updateRateSection("lamination", d)}
                    step={0.01}
                    addKeyPlaceholder="type (e.g. matt, gloss)"
                    addValPlaceholder="₹/100sqin"
                    formatLabel={k => k.charAt(0).toUpperCase() + k.slice(1)}
                  />
                </Card>
                <Card title="Gum Pad Binding (₹/pad)">
                  <DynamicRateSection
                    data={rates.padBinding ?? {}}
                    onUpdate={d => updateRateSection("padBinding", d)}
                    addKeyPlaceholder="size (e.g. A4, A5)"
                    addValPlaceholder="₹/pad"
                    formatLabel={k => k}
                  />
                </Card>
                <Card title="Bill Book Binding (₹/book)">
                  <DynamicRateSection
                    data={rates.billBookBinding ?? {}}
                    onUpdate={d => updateRateSection("billBookBinding", d)}
                    addKeyPlaceholder="size (e.g. A5, A6)"
                    addValPlaceholder="₹/book"
                    formatLabel={k => k}
                  />
                </Card>
                <Card title="Envelope Making (₹/piece)">
                  <div className="mb-3">
                    <Field label="Window Cutting (₹/envelope)">
                      <Input type="number" step="0.01" value={rates.envelopeWindow ?? ""} onChange={e => updateRate("envelopeWindow", +e.target.value)} />
                    </Field>
                    <p className="text-[10px] text-slate-400 mt-1">Default ₹0.20/pc (₹200 per 1,000 envelopes)</p>
                  </div>
                  <DynamicRateSection
                    data={rates.envelope ?? {}}
                    onUpdate={d => updateRateSection("envelope", d)}
                    step={0.5}
                    addKeyPlaceholder="key (e.g. env6x9)"
                    addValPlaceholder="₹/pc"
                  />
                </Card>
              </AccordionCategory>

              {/* ── CATEGORY: Files & Bags ── */}
              <AccordionCategory title="Files & Bags" icon="📁" defaultOpen={false}>
                <Card title="PP Files">
                  <p className="text-[10px] text-slate-400 mb-2">Base costs by qty tier. Extras applied per file before multiplier.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="GST Extra (%)">
                      <Input type="number" step="0.01" value={rates.ppFiles?.gstPct ?? 18} onChange={e => updateRate("ppFiles.gstPct", +e.target.value)} />
                    </Field>
                    <Field label="Clip Extra (₹/file)">
                      <Input type="number" step="0.01" value={rates.ppFiles?.clip ?? 1.25} onChange={e => updateRate("ppFiles.clip", +e.target.value)} />
                    </Field>
                    <Field label="Pocket Extra (₹/side)">
                      <Input type="number" step="0.01" value={rates.ppFiles?.pocketOneSide ?? 2.5} onChange={e => updateRate("ppFiles.pocketOneSide", +e.target.value)} />
                    </Field>
                    <Field label="PP File Multiplier (×)">
                      <Input type="number" step="0.01" value={rates.ppFiles?.multiplier ?? 1.67} onChange={e => updateRate("ppFiles.multiplier", +e.target.value)} />
                    </Field>
                  </div>
                </Card>
                <Card title="Non Woven Bag">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <Field label="Selling Multiplier (×)">
                      <Input type="number" step="0.01" value={rates.nonWovenBag?.multiplier ?? 1.67} onChange={e => updateRate("nonWovenBag.multiplier", +e.target.value)} />
                    </Field>
                    <Field label="Multicolor Extra (₹/bag)">
                      <Input type="number" step="0.01" value={rates.nonWovenBag?.multicolorExtraPerBag ?? 2} onChange={e => updateRate("nonWovenBag.multicolorExtraPerBag", +e.target.value)} />
                    </Field>
                    <Field label="Fabric Rate (₹/kg)">
                      <Input type="number" step="0.01" value={rates.nonWovenBag?.ratePerKg ?? 120} onChange={e => updateRate("nonWovenBag.ratePerKg", +e.target.value)} />
                    </Field>
                    <Field label="Printing Cost (₹/bag)">
                      <Input type="number" step="0.01" value={rates.nonWovenBag?.printingCostPerBag ?? 2} onChange={e => updateRate("nonWovenBag.printingCostPerBag", +e.target.value)} />
                    </Field>
                    <Field label="Per Plate Rate (₹)">
                      <Input type="number" step="1" value={rates.nonWovenBag?.perPlateRate ?? 500} onChange={e => updateRate("nonWovenBag.perPlateRate", +e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Selling Rate per Bag (₹/bag by size)</p>
                  <DynamicRateSection
                    data={rates.nonWovenBag?.sizeRates ?? {}}
                    onUpdate={d => setRates((prev: any) => ({ ...prev, nonWovenBag: { ...(prev.nonWovenBag ?? {}), sizeRates: d } }))}
                    step={0.01}
                    addKeyPlaceholder="size (e.g. 12x15)"
                    addValPlaceholder="₹/bag"
                    formatLabel={k => k + " Bag"}
                  />
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 mt-3">Bag Weight by Size (gm/bag)</p>
                  <DynamicRateSection
                    data={rates.nonWovenBag?.weightGm ?? {}}
                    onUpdate={d => setRates((prev: any) => ({ ...prev, nonWovenBag: { ...(prev.nonWovenBag ?? {}), weightGm: d } }))}
                    step={0.1}
                    addKeyPlaceholder="size (e.g. 12x15)"
                    addValPlaceholder="gm/bag"
                    formatLabel={k => k + " — weight"}
                  />
                </Card>
                <Card title="X-ray / CT Scan Bags">
                  <p className="text-[10px] text-slate-400 mb-2">Small = 10.5×16 X-ray · Big = 16×21 CT scan. Base costs by qty tier.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="GST Extra (%)">
                      <Input type="number" step="0.01" value={rates.diagnosticBags?.gstPct ?? 18} onChange={e => updateRate("diagnosticBags.gstPct", +e.target.value)} />
                    </Field>
                    <Field label="Bag Multiplier (×)">
                      <Input type="number" step="0.01" value={rates.diagnosticBags?.multiplier ?? 1.67} onChange={e => updateRate("diagnosticBags.multiplier", +e.target.value)} />
                    </Field>
                  </div>
                </Card>
              </AccordionCategory>

              {/* ── CATEGORY: Stationery & Gifts ── */}
              <AccordionCategory title="Stationery & Gifts" icon="🖊️" defaultOpen={false}>
                <Card title="Stickers">
                  <p className="text-[10px] text-slate-400 mb-2">Half cut % added to base cost before auto multiplier (auto: under 500=×4, 500-1k=×3, 1k-3k=×2, 3k+=×1.67)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Half Cutting Extra (%)">
                      <Input type="number" step="0.01" value={rates.sticker?.halfCutPct ?? 30} onChange={e => updateRate("sticker.halfCutPct", +e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 mb-2">Die Cutting (shaped stickers): die = printed block + 1" margin on all 4 sides, priced per sq in, plus a punching charge per 1000 sheets.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Die Rate (₹/sq in)">
                      <Input type="number" step="0.01" value={rates.sticker?.dieRatePerSqIn ?? 6} onChange={e => updateRate("sticker.dieRatePerSqIn", +e.target.value)} />
                    </Field>
                    <Field label="Punching Rate (₹/1000 sheets)">
                      <Input type="number" step="0.01" value={rates.sticker?.punchingRatePer1000 ?? 500} onChange={e => updateRate("sticker.punchingRatePer1000", +e.target.value)} />
                    </Field>
                  </div>
                </Card>
                <Card title="Dot Matrix Bills">
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <Field label="Multiplier (×)">
                      <Input type="number" step="0.01" value={rates.dotMatrixBill?.multiplier ?? 1.67} onChange={e => updateRate("dotMatrixBill.multiplier", +e.target.value)} />
                    </Field>
                    <Field label="Carbon Copy Extra (₹/book)">
                      <Input type="number" step="0.01" value={rates.dotMatrixBill?.carbonCopyExtraPerBook ?? 8} onChange={e => updateRate("dotMatrixBill.carbonCopyExtraPerBook", +e.target.value)} />
                    </Field>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(rates.dotMatrixBill?.sizeRates ?? {}).map(([size, gsmRates]) => (
                      <div key={size} className="rounded border border-slate-200 bg-white p-2">
                        <p className="text-[10px] font-bold text-slate-500 mb-1.5 uppercase">{size}</p>
                        <DynamicRateSection
                          data={gsmRates as Record<string, number>}
                          onUpdate={d => setRates((prev: any) => ({ ...prev, dotMatrixBill: { ...(prev.dotMatrixBill ?? {}), sizeRates: { ...(prev.dotMatrixBill?.sizeRates ?? {}), [size]: d } } }))}
                          step={0.01}
                          addKeyPlaceholder="gsm"
                          addValPlaceholder="₹/book"
                          formatLabel={k => k + " GSM"}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Keychains">
                  <div className="mb-2">
                    <Field label="Multiplier (×)">
                      <div className="w-24">
                        <Input type="number" step="0.01" value={rates.keychain?.multiplier ?? 1.67} onChange={e => updateRate("keychain.multiplier", +e.target.value)} />
                      </div>
                    </Field>
                  </div>
                  <DynamicRateSection
                    data={rates.keychain?.numberRates ?? {}}
                    onUpdate={d => setRates((prev: any) => ({ ...prev, keychain: { ...(prev.keychain ?? {}), numberRates: d } }))}
                    step={0.01}
                    addKeyPlaceholder="number (e.g. KC6)"
                    addValPlaceholder="₹/pc"
                  />
                </Card>
                <Card title="Pens">
                  <div className="mb-2">
                    <Field label="Multiplier (×)">
                      <div className="w-24">
                        <Input type="number" step="0.01" value={rates.pen?.multiplier ?? 1.67} onChange={e => updateRate("pen.multiplier", +e.target.value)} />
                      </div>
                    </Field>
                  </div>
                  <DynamicRateSection
                    data={rates.pen?.numberRates ?? {}}
                    onUpdate={d => setRates((prev: any) => ({ ...prev, pen: { ...(prev.pen ?? {}), numberRates: d } }))}
                    step={0.01}
                    addKeyPlaceholder="number (e.g. PEN6)"
                    addValPlaceholder="₹/pc"
                  />
                </Card>
              </AccordionCategory>

              <button onClick={saveRates} className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700">
                Save All Rates
              </button>
              {ratesSaved && <p className="text-center text-green-600 font-semibold text-sm mt-2">Rates saved successfully!</p>}
              {saveError && <p className="text-center text-red-600 text-sm mt-2">{"Error: " + saveError}</p>}
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">No master rates available.</div>
          )
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Quote History</h2>
                <p className="text-xs text-slate-500">All saved quotes — latest first</p>
              </div>
              <button onClick={loadHistory} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-3 py-1.5 font-medium">Refresh</button>
            </div>
            {historyLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500 text-sm">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
                No quotes yet. Calculate a quote — it will appear here automatically.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((h: any) => (
                  <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            h.calcType === "forward" ? "bg-blue-100 text-blue-700" :
                            h.calcType === "reverse" ? "bg-purple-100 text-purple-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>{h.calcType.toUpperCase()}</span>
                          {h.inputParams?.quotationNumber && (
                            <span className="text-xs font-bold text-slate-700 bg-slate-100 rounded px-2 py-0.5">
                              {h.inputParams.quotationNumber}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-700 truncate">{h.product || "—"}</span>
                          {h.customer && <span className="text-xs text-slate-500">Customer: {h.customer}</span>}
                          {h.job && <span className="text-xs text-slate-500">Job: {h.job}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {h.qty && <span className="text-xs text-slate-500">Qty: <strong>{Number(h.qty).toLocaleString()}</strong></span>}
                          {isAdmin && <span className="text-xs text-slate-500">Cost: <strong>{fmt(h.subtotal)}</strong></span>}
                          <span className="text-xs font-bold text-green-700">Total: {fmt(h.total)}</span>
                          {h.perPiece && <span className="text-xs text-teal-700">Per pc: {fmt(h.perPiece)}</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(h.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {" · x"}{h.multiplier}
                        </p>
                        {h.inputParams?.quotationText && (
                          <details className="mt-2">
                            <summary className="text-xs text-green-700 cursor-pointer hover:underline">Copy quotation</summary>
                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                              <button
                                onClick={() => navigator.clipboard.writeText(sanitizeQuotationText(h.inputParams.quotationText))}
                                className="mb-2 rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700">
                                Copy Text
                              </button>
                              <textarea readOnly value={sanitizeQuotationText(h.inputParams.quotationText)}
                                className="h-32 w-full resize-none rounded border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-700 outline-none" />
                            </div>
                          </details>
                        )}
                        {isAdmin && (
                          <details className="mt-2">
                            <summary className="text-xs text-blue-600 cursor-pointer hover:underline">View breakdown</summary>
                            <div className="mt-1.5 space-y-0.5 pl-2 border-l-2 border-slate-100">
                              {(h.breakdown || []).map((b: any, i: number) => (
                                <div key={i} className="flex justify-between text-xs text-slate-600 py-0.5">
                                  <span className="truncate pr-2">{b.label}</span>
                                  <span className="shrink-0 font-medium">{fmt(b.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                      <button onClick={() => deleteHistoryItem(h.id)}
                        className="shrink-0 text-slate-300 hover:text-red-500 text-lg font-bold leading-none" title="Delete">x</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CLUBBING MASTER ── */}
        {tab === "clubbing" && (
          <>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700 mb-3">
              <strong>Clubbing Vendor Master</strong> — Store your vendor rates by size, sides and qty tier.
              When you run a 4-color Reverse quote, the system auto-compares and highlights the winner.
            </div>
            <Card title="Vendor Info">
              <Field label="Vendor / Firm Name">
                <Input value={clubbingData.vendorName ?? ""}
                  onChange={e => setClubbingData((p: any) => ({ ...p, vendorName: e.target.value }))}
                  placeholder="e.g. Mehta Offset Works" />
              </Field>
            </Card>
            <Card title="Vendor Rates — Per Piece">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-700 mb-3">
                Enter rate per piece for each size and sides. Qty tiers must be multiples of 1000 (min 1000).
                The system picks the nearest tier at or below the job quantity.
              </div>
              {(["A4","A5","A6","A8","1/3A4","DL","letterhead"] as string[]).map(size => {
                const sizeRates = clubbingData.rates?.[size] ?? { single: {}, double: {} };
                const updateSizeRate = (sides: "single"|"double", tier: string, val: string) => {
                  setClubbingData((p: any) => ({
                    ...p,
                    rates: { ...p.rates, [size]: { ...sizeRates, [sides]: { ...sizeRates[sides], [tier]: val === "" ? undefined : parseFloat(val) } } }
                  }));
                };
                const removeTier = (sides: "single"|"double", tier: string) => {
                  setClubbingData((p: any) => {
                    const next = { ...(p.rates?.[size]?.[sides] ?? {}) };
                    delete next[tier];
                    return { ...p, rates: { ...p.rates, [size]: { ...(p.rates?.[size] ?? {}), [sides]: next } } };
                  });
                };
                const addTier = (sides: "single"|"double", tier: string, val: string) => {
                  if (!tier || !val) return;
                  setClubbingData((p: any) => ({
                    ...p,
                    rates: { ...p.rates, [size]: { ...(p.rates?.[size] ?? {}), [sides]: { ...(p.rates?.[size]?.[sides] ?? {}), [tier]: parseFloat(val) } } }
                  }));
                };
                return (
                  <details key={size} className="border border-slate-200 rounded-lg mb-2">
                    <summary className="px-3 py-2 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 rounded-lg flex items-center gap-2">
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-mono">{size}</span>
                      <span className="text-slate-400 font-normal">click to expand</span>
                    </summary>
                    <div className="p-3 space-y-4">
                      {(["single","double"] as ("single"|"double")[]).map(sides => {
                        const tiers = Object.entries(sizeRates[sides] ?? {}).sort(([a],[b]) => Number(a)-Number(b));
                        return (
                          <div key={sides}>
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">{sides === "single" ? "Single Side" : "Double Side"}</p>
                            <div className="space-y-1">
                              {tiers.map(([tier, val]) => (
                                <div key={tier} className="flex gap-2 items-center">
                                  <span className="text-xs text-slate-500 w-20 shrink-0">Qty {Number(tier).toLocaleString()}</span>
                                  <input type="number" step="0.1" value={val as number}
                                    onChange={e => updateSizeRate(sides, tier, e.target.value)}
                                    className="w-24 border border-slate-200 rounded text-xs px-2 py-1" />
                                  <span className="text-xs text-slate-400">per pc</span>
                                  <button onClick={() => removeTier(sides, tier)} className="text-red-400 hover:text-red-600 text-base font-bold leading-none">x</button>
                                </div>
                              ))}
                              <AddTierRow onAdd={(tier, val) => addTier(sides, tier, val)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </Card>
            <button onClick={saveClubbing} className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 mt-2">
              Save Clubbing Rates
            </button>
            {clubbingSaved && <p className="text-center text-purple-700 font-semibold text-sm mt-2">Clubbing rates saved!</p>}
            {clubbingError && <p className="text-center text-red-600 text-sm mt-2">{clubbingError}</p>}
          </>
        )}

        </div>{/* end tab content scroll area */}
      </div>{/* end flex-col h-full */}
    </DashboardShell>
  );
}

// ─── ADD TIER ROW ─────────────────────────────────────────────────────────────
function AddTierRow({ onAdd }: { onAdd: (tier: string, val: string) => void }) {
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const handle = () => {
    if (!qty || !rate) return;
    const tier = String(Math.max(1000, Math.round(Number(qty) / 1000) * 1000));
    onAdd(tier, rate);
    setQty(""); setRate("");
  };
  return (
    <div className="flex gap-2 items-center pt-1 border-t border-dashed border-slate-200">
      <input type="number" step="1000" min="1000" placeholder="qty" value={qty}
        onChange={e => setQty(e.target.value)}
        className="w-20 border border-blue-200 rounded text-xs px-2 py-1" />
      <input type="number" step="0.1" placeholder="per pc" value={rate}
        onChange={e => setRate(e.target.value)}
        className="w-20 border border-blue-200 rounded text-xs px-2 py-1" />
      <button onClick={handle}
        className="bg-brand-500 hover:bg-brand-600 text-white rounded px-2 py-1 text-xs font-semibold">+ Add</button>
    </div>
  );
}
