"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Tab = "forward" | "reverse" | "sticker" | "rates";
type LamOption = "none" | "gloss-single" | "gloss-double" | "matt-single" | "matt-double";
type Layer = { psize: string; gsm: string; qty: number; fsize: string; colors: number; sides: string };
type BreakdownRow = { label: string; amount: number };
type Result = {
  breakdown: BreakdownRow[];
  subtotal: number;
  total: number;
  perPiece?: number;
  perSticker?: number;
  totalQty?: number;
  multiplier?: number;
  description?: string;
};

// Cuts per parent sheet — mirrors backend CUTS table
const CUTS: Record<string, Record<string, number>> = {
  '1823': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 32, file: 1,
            env4x5: 6, env425x925: 4, env425x45: 8, env425x63: 6, env525x75: 4, env85x11: 1, env11x17: 1 },
  '1925': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 40, file: 2,
            env4x5: 8, env425x925: 4, env425x45: 8, env425x63: 6, env525x75: 4, env85x11: 2 },
  '1520': { env9x12: 1 },
};

// Per-product config
type ProductConfig = {
  label: string;
  fixedSize?: string;
  fixedParent?: string;
  sizes?: { value: string; label: string }[];
  hasSheetsPerUnit?: boolean;
  fixedInfo?: string;
  // envelope-style: auto-set & optionally lock parent sheet based on chosen size
  sizeParentMap?: Record<string, string>;
  sizeParentLocked?: Record<string, boolean>;
};

const ENVELOPE_SIZES = [
  { value: "env4x5",     label: "4×5\" Medicine Pouch" },
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
                  env85x11:   "1925",  // best yield on 19×25" (2/sheet vs 1/sheet)
                },
                sizeParentLocked: {
                  env9x12:  true,   // MUST use 15×20
                  env11x17: true,   // MUST use 18×23
                } },
  file:       { label: "Files with Punching",
                fixedSize: "file", fixedParent: "1925",
                fixedInfo: "Fixed: 12×18 inch size | 19×25\" parent sheet | 2 per sheet" },
  visiting:   { label: "Visiting Cards",
                fixedSize: "visiting",
                fixedInfo: "Fixed: 3.5×2\" visiting card | 32 per 18×23\" / 40 per 19×25\" sheet" },
};

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold shrink-0">+ Add</button>
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
        className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold mt-1">+ Add Paper Type</button>
    </div>
  );
}

function ResultCard({ result, perLabel = "Per Piece", desc }: { result: Result; perLabel?: string; desc?: string }) {
  const perVal = result.perPiece ?? result.perSticker ?? 0;
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
      <p className="text-sm font-bold text-green-800 mb-2">📊 Quote Breakdown</p>
      {desc && <p className="text-xs text-slate-500 mb-3">{desc}</p>}
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

// ─── LAYER ROW ────────────────────────────────────────────────────────────────
function LayerRow({ layer, idx, onChange, onRemove, canRemove }: {
  layer: Layer; idx: number;
  onChange: (f: Partial<Layer>) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const cuts = CUTS[layer.psize]?.[layer.fsize] ?? 4;
  const parentSheets = Math.ceil(layer.qty / cuts);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 relative">
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
            <option value="bond70">70 GSM Bond</option>
            <option value="bond80">80 GSM Bond</option>
            <option value="map90">90 GSM Maplitho</option>
            <option value="map100">100 GSM Maplitho</option>
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
      <label className="text-xs font-semibold text-slate-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-blue-400" />;
}
function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return <select {...props} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white">{children}</select>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function RateCalculatorPage() {
  const [tab, setTab] = useState<Tab>("forward");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [resultDesc, setResultDesc] = useState("");

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
  const [rQty, setRQty] = useState(50);
  const [rSheets, setRSheets] = useState(100);
  const [rSize, setRSize] = useState("A4");
  const [rPaper, setRPaper] = useState("map100");
  const [rParent, setRParent] = useState("1823");
  const [rColors, setRColors] = useState(4);
  const [rSides, setRSides] = useState("single");
  const [rLam, setRLam] = useState<LamOption>("none");
  const [rMult, setRMult] = useState<number | "">("");  // blank = use master default

  // Auto-set size/parent when product changes
  useEffect(() => {
    const cfg = PRODUCT_CONFIG[rProduct];
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

  // ── Sticker State ──
  const [sW, setSW] = useState(2); const [sH, setSH] = useState(3);
  const [sQty, setSQty] = useState(4000);
  const [sCols, setSCols] = useState(2); const [sRows, setSRows] = useState(2);
  const [sMarg, setSMarg] = useState(0.25);
  const [sMode, setSMode] = useState("inhouse");
  const [sHalfcut, setSHalfcut] = useState("no");
  const [sPaperRate, setSPaperRate] = useState(3.5);
  const [sPrintRate, setSPrintRate] = useState(5);
  const [sHcPct, setSHcPct] = useState(30);
  const [sVendorRate, setSVendorRate] = useState(0.035);
  const [sTransport, setSTransport] = useState(100);
  const [sHcPct2, setSHcPct2] = useState(30);
  const [sMult, setSMult] = useState<number | "">("");

  // ── Rates State ──
  const [rates, setRates] = useState<any>(null);
  const [ratesSaved, setRatesSaved] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Sheet info for sticker preview
  const sheetW = (sCols * sW + 2 * sMarg).toFixed(2);
  const sheetH = (sRows * sH + 2 * sMarg).toFixed(2);
  const stickersPerSheet = sCols * sRows;
  const sheetsNeeded = Math.ceil(sQty / stickersPerSheet);

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
      setSMult("");
    } catch {
      setRatesError("Unable to load master rates. Please refresh.");
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);

  const post = async (endpoint: string, body: any) => {
    setLoading(true); setResult(null);
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
    const r = await post("forward", {
      layers,
      lam: fLam,
      padSize: fPadSize,
      pads: fPad === "yes" ? fPads : 0,
      punch: fPunch === "yes",
      envelope: fEnv,
      multiplier: fMult !== "" ? fMult : undefined,
      customer: fCustomer,
      job: fJob,
    });
    if (r) { setResult(r); setResultDesc(`Job: ${fJob || "—"} | Customer: ${fCustomer || "—"}`); }
  };

  const calcReverse = async () => {
    const r = await post("reverse", {
      product: rProduct,
      qty: rQty,
      sheetsPerUnit: rSheets,
      fsize: rSize,
      paper: rPaper,
      parent: rParent,
      colors: rColors,
      sides: rSides,
      lam: rLam,
      multiplier: rMult !== "" ? rMult : undefined,
      customer: rCustomer,
    });
    if (r) { setResult(r); setResultDesc(r.description || ""); }
  };

  const calcSticker = async () => {
    const r = await post("sticker", {
      stickerW: sW, stickerH: sH, qty: sQty, cols: sCols, rows: sRows,
      margin: sMarg, mode: sMode, halfcut: sHalfcut === "yes",
      paperRate: sPaperRate, printRate: sPrintRate, hcPct: sHcPct,
      vendorRate: sVendorRate, transport: sTransport, hcPct2: sHcPct2,
      multiplier: sMult !== "" ? sMult : undefined,
    });
    if (r) { setResult(r); setResultDesc(`${sQty.toLocaleString()} stickers | ${stickersPerSheet}/sheet | ${sheetsNeeded} sheets`); }
  };

  const saveRates = async () => {
    if (!rates) return;
    await fetch(`${API_BASE_URL}/rate-calculator/rates`, {
      method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(rates),
    });
    setRatesSaved(true);
    setTimeout(() => setRatesSaved(false), 2000);
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


  const TABS: { id: Tab; label: string }[] = [
    { id: "forward", label: "→ Forward Quote" },
    { id: "reverse", label: "↺ Reverse" },
    { id: "sticker", label: "🏷 Sticker" },
    { id: "rates", label: "⚙ Master Rates" },
  ];

  // Multiplier hint label
  const masterMult = rates?.multiplier ?? 1.67;
  const multHint = `Default from master: ×${masterMult}`;

  const reverseCuts = CUTS[rParent]?.[rSize] ?? 4;
  const reversePieces = rProduct === "pads" || rProduct === "billbook" ? rQty * rSheets : rQty;
  const reverseParentSheets = Math.ceil(reversePieces / reverseCuts);
  const parentLabel = rParent === "1520" ? "15×20\"" : rParent === "1823" ? "18×23\"" : "19×25\"";
  const rSizeParentLocked = !!(PRODUCT_CONFIG[rProduct]?.sizeParentLocked?.[rSize]);

  return (
    <DashboardShell>
      <div className="p-4 max-w-3xl mx-auto pb-16">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900">Rate Calculator</h1>
          <p className="text-sm text-slate-500">Offset · Reverse · Sticker · Master Rates</p>
        </div>

        {/* TABS */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setResult(null); }}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── FORWARD ── */}
        {tab === "forward" && (
          <>
            <Card title="📋 Job Details">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer Name"><Input value={fCustomer} onChange={e => setFCustomer(e.target.value)} placeholder="e.g. ABC Traders" /></Field>
                <Field label="Job Name"><Input value={fJob} onChange={e => setFJob(e.target.value)} placeholder="e.g. Letterhead" /></Field>
              </div>
            </Card>

            <Card title="📄 Paper Layers">
              {layers.map((l, i) => (
                <LayerRow key={i} layer={l} idx={i}
                  onChange={f => setLayers(prev => prev.map((x, j) => j === i ? { ...x, ...f } : x))}
                  onRemove={() => setLayers(prev => prev.filter((_, j) => j !== i))}
                  canRemove={layers.length > 1} />
              ))}
              <button
                onClick={() => setLayers(p => [...p, { psize: "1823", gsm: "bond70", qty: 1000, fsize: "A4", colors: 1, sides: "single" }])}
                className="border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
                + Add Layer
              </button>
            </Card>

            <Card title="✂️ Finishing Options">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Lamination">
                  <Select value={fLam} onChange={e => setFLam(e.target.value as LamOption)}>
                    <option value="none">None</option>
                    <option value="gloss-single">Gloss — Single Side</option>
                    <option value="gloss-double">Gloss — Double Side</option>
                    <option value="matt-single">Matt — Single Side</option>
                    <option value="matt-double">Matt — Double Side</option>
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

            <Card title="💰 Selling Multiplier">
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label={`Multiplier (×) — ${multHint}`}>
                  <Input type="number" step="0.01" placeholder={String(masterMult)}
                    value={fMult} onChange={e => setFMult(e.target.value === "" ? "" : +e.target.value)} />
                </Field>
                <button onClick={calcForward} disabled={loading}
                  className="bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60">
                  {loading ? "Calculating…" : "🧮 Calculate"}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">Leave blank to use default multiplier from Master Rates. The multiplier covers margin + GST together.</p>
            </Card>

            {result && <ResultCard result={result} desc={resultDesc} />}
          </>
        )}

        {/* ── REVERSE ── */}
        {tab === "reverse" && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-3">
              📌 Enter what your customer wants — the system calculates parent sheets, costs and quote automatically.
            </div>

            <Card title="📦 Customer Requirement">
              <div className="grid grid-cols-2 gap-3">
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

            <Card title="🔢 Requirement Details">
              {/* Fixed-size product info badge */}
              {PRODUCT_CONFIG[rProduct]?.fixedInfo && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 font-medium mb-3">
                  📐 {PRODUCT_CONFIG[rProduct].fixedInfo}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label={PRODUCT_CONFIG[rProduct]?.hasSheetsPerUnit ? "No. of Pads / Books" : "Quantity"}>
                  <Input type="number" value={rQty} onChange={e => setRQty(+e.target.value)} />
                </Field>

                {/* Pages per pad — only for pads/billbook */}
                {PRODUCT_CONFIG[rProduct]?.hasSheetsPerUnit && (
                  <Field label="Pages per Pad / Book">
                    <Input type="number" value={rSheets} onChange={e => setRSheets(+e.target.value)} />
                  </Field>
                )}

                {/* Final size — hidden when fixed */}
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
                    <option value="bond70">70 GSM Bond</option>
                    <option value="bond80">80 GSM Bond</option>
                    <option value="map90">90 GSM Maplitho</option>
                    <option value="map100">100 GSM Maplitho</option>
                  </Select>
                </Field>

                {/* Parent sheet — hidden when product-fixed; locked badge when size-fixed */}
                {!PRODUCT_CONFIG[rProduct]?.fixedParent && (
                  rSizeParentLocked ? (
                    <div className="col-span-1">
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Parent Sheet Size</label>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-xs text-amber-800 font-medium">
                        🔒 Auto: {parentLabel} (required for this size)
                      </div>
                    </div>
                  ) : (
                    <Field label="Parent Sheet Size">
                      <Select value={rParent} onChange={e => setRParent(e.target.value)}>
                        <option value="1823">18×23 inch</option>
                        <option value="1925">19×25 inch</option>
                        <option value="1520">15×20 inch (Catalog Envelope)</option>
                      </Select>
                    </Field>
                  )
                )}

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
                <Field label="Lamination">
                  <Select value={rLam} onChange={e => setRLam(e.target.value as LamOption)}>
                    <option value="none">None</option>
                    <option value="gloss-single">Gloss — Single Side</option>
                    <option value="gloss-double">Gloss — Double Side</option>
                    <option value="matt-single">Matt — Single Side</option>
                    <option value="matt-double">Matt — Double Side</option>
                  </Select>
                </Field>
              </div>

              {/* Auto-calculation hint */}
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600">
                <strong>Auto-calculation:</strong>&nbsp;
                {rProduct === "pads" || rProduct === "billbook"
                  ? <>{rQty} × {rSheets} pages = <strong>{reversePieces.toLocaleString()} total pieces</strong></>
                  : <strong>{reversePieces.toLocaleString()} pieces</strong>
                }
                {reverseCuts > 0
                  ? <>{" → "}{reverseCuts} cuts/sheet
                      {" → "}<strong>{reverseParentSheets.toLocaleString()} parent sheets of {parentLabel}</strong>
                      {rColors === 4
                        ? <> → 4-color billed on <strong>{reverseParentSheets.toLocaleString()} parent sheets</strong></>
                        : <> → {rColors}-color billed on <strong>{(reverseParentSheets * reverseCuts).toLocaleString()} pieces</strong></>
                      }
                    </>
                  : <span className="text-amber-600"> → ⚠ This size is not available on {parentLabel} parent sheet</span>
                }
              </div>
            </Card>

            <Card title="💰 Selling Multiplier">
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label={`Multiplier (×) — ${multHint}`}>
                  <Input type="number" step="0.01" placeholder={String(masterMult)}
                    value={rMult} onChange={e => setRMult(e.target.value === "" ? "" : +e.target.value)} />
                </Field>
                <button onClick={calcReverse} disabled={loading}
                  className="bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60">
                  {loading ? "Calculating…" : "🧮 Calculate"}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">Leave blank to use default multiplier from Master Rates.</p>
            </Card>

            {result && <ResultCard result={result} desc={resultDesc} />}
          </>
        )}

        {/* ── STICKER ── */}
        {tab === "sticker" && (
          <>
            <Card title="🏷 Sticker Details">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Width (in)"><Input type="number" step="0.1" value={sW} onChange={e => setSW(+e.target.value)} /></Field>
                <Field label="Height (in)"><Input type="number" step="0.1" value={sH} onChange={e => setSH(+e.target.value)} /></Field>
                <Field label="Quantity"><Input type="number" value={sQty} onChange={e => setSQty(+e.target.value)} /></Field>
              </div>
            </Card>

            <Card title="📐 Sheet Layout">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-700 mb-3">
                Grid: {sCols}×{sRows} = <strong>{stickersPerSheet} stickers/sheet</strong> | Sheet: <strong>{sheetW}" × {sheetH}"</strong> | Sheets needed: <strong>{sheetsNeeded}</strong>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Columns"><Input type="number" value={sCols} onChange={e => setSCols(+e.target.value)} /></Field>
                <Field label="Rows"><Input type="number" value={sRows} onChange={e => setSRows(+e.target.value)} /></Field>
                <Field label="Margin per side (in)"><Input type="number" step="0.05" value={sMarg} onChange={e => setSMarg(+e.target.value)} /></Field>
              </div>
            </Card>

            <Card title="⚙ Calculation Mode">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Mode">
                  <Select value={sMode} onChange={e => setSMode(e.target.value)}>
                    <option value="inhouse">In-House</option>
                    <option value="outsource">Outsource to Vendor</option>
                  </Select>
                </Field>
                <Field label="Half Cutting">
                  <Select value={sHalfcut} onChange={e => setSHalfcut(e.target.value)}>
                    <option value="no">No</option><option value="yes">Yes</option>
                  </Select>
                </Field>
              </div>
              {sMode === "inhouse" && (
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                  <Field label="Paper Rate (₹/sheet)"><Input type="number" step="0.1" value={sPaperRate} onChange={e => setSPaperRate(+e.target.value)} /></Field>
                  <Field label="Printing Rate (₹/sheet)"><Input type="number" step="0.1" value={sPrintRate} onChange={e => setSPrintRate(+e.target.value)} /></Field>
                  {sHalfcut === "yes" && <Field label="Half Cut % of total"><Input type="number" value={sHcPct} onChange={e => setSHcPct(+e.target.value)} /></Field>}
                </div>
              )}
              {sMode === "outsource" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                  <Field label="Rate per sq in (₹)"><Input type="number" step="0.001" value={sVendorRate} onChange={e => setSVendorRate(+e.target.value)} /></Field>
                  <Field label="Transport (₹)"><Input type="number" value={sTransport} onChange={e => setSTransport(+e.target.value)} /></Field>
                  {sHalfcut === "yes" && <Field label="Half Cut %"><Input type="number" value={sHcPct2} onChange={e => setSHcPct2(+e.target.value)} /></Field>}
                </div>
              )}
            </Card>

            <Card title="💰 Selling Multiplier">
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label={`Multiplier (×) — ${multHint}`}>
                  <Input type="number" step="0.01" placeholder={String(masterMult)}
                    value={sMult} onChange={e => setSMult(e.target.value === "" ? "" : +e.target.value)} />
                </Field>
                <button onClick={calcSticker} disabled={loading}
                  className="bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60">
                  {loading ? "Calculating…" : "🧮 Calculate"}
                </button>
              </div>
            </Card>

            {result && <ResultCard result={result} perLabel="Per Sticker" desc={resultDesc} />}
          </>
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
              {/* Multiplier */}
              <Card title="💰 Selling Multiplier (covers Margin + GST)">
                <Field label="Default Multiplier (×) — applied to total cost to get selling price">
                  <Input type="number" step="0.01" value={rates.multiplier ?? ""} onChange={e => updateRate("multiplier", +e.target.value)} />
                </Field>
                <p className="text-xs text-slate-400 mt-2">
                  {"Example: cost ₹6,100 × " + (rates.multiplier ?? 1.67) + " = ₹" + (6100 * (rates.multiplier ?? 1.67)).toFixed(0) + " selling price"}
                </p>
              </Card>

              {/* Paper — fully dynamic */}
              <Card title="📄 Paper Rates (₹ per ream of 500 sheets)">
                <DynamicPaperRates
                  data={rates.paper ?? {}}
                  onUpdate={d => updateRateSection("paper", d)}
                />
              </Card>

              {/* Printing — structural, keep fixed */}
              <Card title="🖨 Offset Printing Rates">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-700 mb-3">
                  <strong>4-Color:</strong> billed per parent sheet (block rounding to 1000).{" "}
                  <strong>1-Color / 2-Color:</strong> flat rate per 1,000 pieces.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="4-Color — First 1,000 parent sheets (₹)">
                    <Input type="number" value={rates.printing?.['4color']?.first1k ?? ""} onChange={e => updateRate("printing.4color.first1k", +e.target.value)} />
                  </Field>
                  <Field label="4-Color — Each next 1,000 sheets (₹)">
                    <Input type="number" value={rates.printing?.['4color']?.nextK ?? ""} onChange={e => updateRate("printing.4color.nextK", +e.target.value)} />
                  </Field>
                  <Field label="1-Color — Flat per 1,000 pieces (₹)">
                    <Input type="number" value={rates.printing?.['1color']?.flat ?? ""} onChange={e => updateRate("printing.1color.flat", +e.target.value)} />
                  </Field>
                  <Field label="2-Color — Flat per 1,000 pieces (₹)">
                    <Input type="number" value={rates.printing?.['2color']?.flat ?? ""} onChange={e => updateRate("printing.2color.flat", +e.target.value)} />
                  </Field>
                </div>
              </Card>

              {/* Plate & Punching */}
              <Card title="🔲 Plate & Punching">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plate Rate (₹/plate) — 1-color=1 plate, 4-color=4 plates">
                    <Input type="number" value={rates.plate ?? ""} onChange={e => updateRate("plate", +e.target.value)} />
                  </Field>
                  <Field label="File Punching (₹/piece)">
                    <Input type="number" value={rates.punch ?? ""} onChange={e => updateRate("punch", +e.target.value)} />
                  </Field>
                </div>
              </Card>

              {/* Pad Binding — dynamic */}
              <Card title="📎 Gum Pad Binding (₹/pad) — add/remove sizes">
                <DynamicRateSection
                  data={rates.padBinding ?? {}}
                  onUpdate={d => updateRateSection("padBinding", d)}
                  addKeyPlaceholder="size (e.g. A3, custom)"
                  addValPlaceholder="₹/pad"
                  formatLabel={k => k + " Pad"}
                />
              </Card>

              {/* Bill Book Binding — dynamic */}
              <Card title="📒 Bill Book Binding (₹/book) — add/remove sizes">
                <DynamicRateSection
                  data={rates.billBookBinding ?? {}}
                  onUpdate={d => updateRateSection("billBookBinding", d)}
                  addKeyPlaceholder="size (e.g. A5, A6)"
                  addValPlaceholder="₹/book"
                  formatLabel={k => k + " Bill Book"}
                />
              </Card>

              {/* Lamination — dynamic */}
              <Card title="✨ Lamination (₹/100 sq in) — add/remove types">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-600 mb-3">
                  {"Formula: (sheet area ÷ 100) × rate × sheets. 18×23\" = 414 sq in → ₹4.14 × rate per sheet"}
                </div>
                <DynamicRateSection
                  data={rates.lamination ?? {}}
                  onUpdate={d => updateRateSection("lamination", d)}
                  step={0.01}
                  addKeyPlaceholder="type (e.g. gloss, matt, uvspot)"
                  addValPlaceholder="₹/100sqin"
                  formatLabel={k => k.charAt(0).toUpperCase() + k.slice(1) + " Lamination"}
                />
              </Card>

              {/* Envelope Making — dynamic */}
              <Card title="✉️ Envelope Making (₹/piece) — add/remove sizes">
                <DynamicRateSection
                  data={rates.envelope ?? {}}
                  onUpdate={d => updateRateSection("envelope", d)}
                  step={0.5}
                  addKeyPlaceholder="key (e.g. env6x9, env5x7)"
                  addValPlaceholder="₹/pc"
                />
              </Card>

              <button onClick={saveRates} className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700">
                {"💾 Save All Rates"}
              </button>
              {ratesSaved && <p className="text-center text-green-600 font-semibold text-sm mt-2">{"✅ Rates saved!"}</p>}
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">No master rates available.</div>
          )
        )}
      </div>
    </DashboardShell>
  );
}
