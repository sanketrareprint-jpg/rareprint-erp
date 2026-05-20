"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Tab = "forward" | "reverse" | "sticker" | "rates" | "history" | "clubbing";
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
  clubbing?: {
    vendorName: string;
    vendorCost: number;
    vendorTotal: number;
    ourCost: number;
    ourTotal: number;
    winner: "vendor" | "ours";
  };
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

// ─── COMMISSION PANEL ─────────────────────────────────────────────────────────
// Office agents: 10% of selling price  = ~1/4 of profit at ×1.67
// WFH agents:   12% of selling price  = ~30% of profit at ×1.67
// When discount given → profit shrinks; % of selling stays same, % of profit goes up
const COMMISSION_RATES = { office: 0.10, wfh: 0.12 };

function CommissionPanel({ cost, total, qty, isAdmin }: {
  cost: number; total: number; qty: number; isAdmin: boolean;
}) {
  const [agentType, setAgentType] = useState<"office" | "wfh">("office");
  const [customPrice, setCustomPrice] = useState("");
  const rate = COMMISSION_RATES[agentType];

  const scenarios = [
    { label: "No Discount", price: total, disc: 0 },
    { label: "5% Discount",  price: total * 0.95, disc: 5 },
    { label: "10% Discount", price: total * 0.90, disc: 10 },
  ];

  const customVal = customPrice !== "" ? parseFloat(customPrice) : null;
  const belowCost = customVal !== null && customVal < cost;

  const commissionOf = (price: number) => price * rate;
  const profitOf     = (price: number) => price - cost;
  const profitPct    = (price: number) => cost > 0 ? ((price - cost) / price * 100) : 0;
  const commPctOfProfit = (price: number) => profitOf(price) > 0 ? (commissionOf(price) / profitOf(price) * 100) : 0;

  return (
    <div className="border border-blue-200 rounded-xl p-4 mt-3 bg-blue-50">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-bold text-blue-800">💰 Commission Calculator</p>
        <div className="flex gap-1">
          <button onClick={() => setAgentType("office")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${agentType === "office" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-300"}`}>
            🏢 Office (10%)
          </button>
          <button onClick={() => setAgentType("wfh")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${agentType === "wfh" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-purple-600 border-purple-300"}`}>
            🏠 WFH (12%)
          </button>
        </div>
      </div>

      <p className="text-xs text-blue-600 mb-3">
        Commission = <strong>{(rate * 100).toFixed(0)}% of selling price</strong>
        {isAdmin && <> = ~{(rate / (1 - 1/1.67) * 100 / 1.67).toFixed(0)}% of profit at ×1.67 multiplier</>}
      </p>

      {/* Scenario table */}
      <div className="rounded-lg overflow-hidden border border-blue-200">
        {/* Header */}
        <div className={`grid text-xs font-bold text-white py-2 px-3 ${isAdmin ? "grid-cols-5" : "grid-cols-3"} bg-blue-700`}>
          <span>Scenario</span>
          <span className="text-right">Order Value</span>
          {isAdmin && <><span className="text-right">Profit</span><span className="text-right">Net (after comm.)</span></>}
          <span className="text-right">Your Commission</span>
        </div>
        {/* Rows */}
        {scenarios.map((s, i) => {
          const comm = commissionOf(s.price);
          const profit = profitOf(s.price);
          const net = profit - comm;
          const belowCostRow = s.price < cost;
          return (
            <div key={i} className={`grid text-xs py-2 px-3 border-t border-blue-100 items-center ${isAdmin ? "grid-cols-5" : "grid-cols-3"} ${belowCostRow ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-blue-50/40"}`}>
              <span className="font-medium text-slate-700">
                {s.label}
                {s.disc > 0 && <span className="ml-1 text-orange-600 font-bold">-{s.disc}%</span>}
              </span>
              <span className="text-right font-semibold">{fmt(s.price)}</span>
              {isAdmin && (
                <>
                  <span className={`text-right ${profit < 0 ? "text-red-600 font-bold" : "text-slate-600"}`}>
                    {fmt(profit)}
                    {profit > 0 && <span className="text-slate-400 ml-1">({profitPct(s.price).toFixed(1)}%)</span>}
                  </span>
                  <span className={`text-right ${net < 0 ? "text-red-600" : "text-green-700"} font-semibold`}>{fmt(net)}</span>
                </>
              )}
              <span className="text-right font-bold text-blue-700">
                {fmt(comm)}
                {isAdmin && profit > 0 && (
                  <span className="text-slate-400 font-normal ml-1">({commPctOfProfit(s.price).toFixed(0)}% of P)</span>
                )}
              </span>
            </div>
          );
        })}
        {/* Custom price row */}
        <div className={`grid text-xs py-2 px-3 border-t-2 border-blue-300 items-center ${isAdmin ? "grid-cols-5" : "grid-cols-3"} bg-amber-50`}>
          <span className="font-medium text-slate-700">Custom Rate</span>
          <span className="text-right">
            <input type="number" placeholder={fmt(total).replace("₹","")} value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              className="w-full text-right border border-amber-300 rounded px-1 py-0.5 text-xs bg-white max-w-[90px] ml-auto block" />
          </span>
          {isAdmin && (
            <>
              <span className={`text-right ${customVal !== null ? (belowCost ? "text-red-600 font-bold" : "text-slate-600") : "text-slate-300"}`}>
                {customVal !== null ? (belowCost ? "BELOW COST" : fmt(profitOf(customVal))) : "—"}
              </span>
              <span className={`text-right text-xs ${customVal !== null && !belowCost ? "text-green-700 font-semibold" : "text-slate-300"}`}>
                {customVal !== null && !belowCost ? fmt(profitOf(customVal) - commissionOf(customVal)) : "—"}
              </span>
            </>
          )}
          <span className={`text-right font-bold ${customVal !== null ? (belowCost ? "text-red-600" : "text-blue-700") : "text-slate-300"}`}>
            {customVal !== null ? (belowCost ? "⚠ Loss!" : fmt(commissionOf(customVal))) : "—"}
          </span>
        </div>
      </div>

      {belowCost && isAdmin && (
        <p className="text-xs text-red-600 font-semibold mt-2">
          ⚠ Custom price ₹{Number(customPrice).toLocaleString()} is below your cost of {fmt(cost)}. Selling at this price means a loss.
        </p>
      )}

      {isAdmin && qty > 0 && (
        <p className="text-xs text-slate-500 mt-2">
          Per piece commission (no discount): <strong>{fmt(total * rate / qty)}</strong> per piece
        </p>
      )}

      <p className="text-xs text-slate-400 mt-2 border-t border-blue-200 pt-2">
        Formula: Commission = Selling Price × {(rate * 100).toFixed(0)}%
        {isAdmin && " | At ×1.67: Office gets ¼ of profit, WFH gets ~30% of profit"}
      </p>
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
  const [isAdmin, setIsAdmin] = useState(true); // default true until user loaded
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
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── History State ──
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Clubbing Vendor State ──
  const [clubbingData, setClubbingData] = useState<any>({ vendorName: "", rates: {} });
  const [clubbingSaved, setClubbingSaved] = useState(false);
  const [clubbingError, setClubbingError] = useState<string | null>(null);

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
  const saveToHistory = async (calcType: string, inputParams: any, result: any, product?: string, qty?: number) => {
    try {
      await fetch(`${API_BASE_URL}/rate-calculator/history`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          calcType, product: product ?? calcType,
          qty, customer: inputParams.customer ?? inputParams.rCustomer ?? "",
          job: inputParams.job ?? inputParams.fJob ?? "",
          breakdown: result.breakdown ?? [],
          subtotal: result.subtotal ?? 0,
          total: result.total ?? 0,
          perPiece: result.perPiece ?? result.perSticker ?? null,
          multiplier: result.multiplier ?? 1.67,
          inputParams,
        }),
      });
    } catch {}
  };

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
      colors: rColors, sides: rSides, lam: rLam,
      multiplier: rMult !== "" ? rMult : undefined,
      customer: rCustomer,
    };
    const r = await post("reverse", body);
    if (r) {
      setResult(r);
      setResultDesc(r.description || "");
      saveToHistory("reverse", body, r, rProduct, rQty);
    }
  };

  const calcSticker = async () => {
    const body = {
      stickerW: sW, stickerH: sH, qty: sQty, cols: sCols, rows: sRows,
      margin: sMarg, mode: sMode, halfcut: sHalfcut === "yes",
      paperRate: sPaperRate, printRate: sPrintRate, hcPct: sHcPct,
      vendorRate: sVendorRate, transport: sTransport, hcPct2: sHcPct2,
      multiplier: sMult !== "" ? sMult : undefined,
    };
    const r = await post("sticker", body);
    if (r) {
      setResult(r);
      setResultDesc(`${sQty.toLocaleString()} stickers | ${stickersPerSheet}/sheet | ${sheetsNeeded} sheets`);
      saveToHistory("sticker", body, r, "Sticker", sQty);
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
    { id: "sticker",  label: "🏷 Sticker" },
    { id: "rates",    label: "⚙ Rates",    adminOnly: true },
    { id: "history",  label: "📋 History" },
    { id: "clubbing", label: "🤝 Clubbing", adminOnly: true },
  ];
  const TABS = ALL_TABS.filter(t => isAdmin || !t.adminOnly);

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
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => {
              setTab(t.id); setResult(null);
              if (t.id === "history") loadHistory();
              if (t.id === "clubbing") loadClubbing();
            }}
              className={`flex-1 py-2 px-1 rounded-lg text-xs font-semibold transition-all min-w-[60px] ${tab === t.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
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
                  canRemove={layers.length > 1}
                  paperOptions={paperOptions} />
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

            {result && (
              <>
                <ResultCard result={result} desc={resultDesc} isAdmin={isAdmin} />
                <CommissionPanel
                  cost={result.subtotal}
                  total={result.total}
                  qty={result.totalQty ?? layers[0]?.qty ?? 0}
                  isAdmin={isAdmin}
                />
              </>
            )}
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
                    {paperOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
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

            {result && (
              <>
                <ResultCard result={result} desc={resultDesc} isAdmin={isAdmin} />
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

            {result && (
              <>
                <ResultCard result={result} perLabel="Per Sticker" desc={resultDesc} isAdmin={isAdmin} />
                <CommissionPanel cost={result.subtotal} total={result.total} qty={sQty} isAdmin={isAdmin} />
              </>
            )}
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
                  {"Formula: (sheet area / 100) x rate x sheets. 18x23 sheet = 414 sq in, per sheet = 4.14 x rate"}
                </div>
                <DynamicRateSection
                  data={rates.lamination ?? {}}
                  onUpdate={d => updateRateSection("lamination", d)}
                  step={0.01}
                  addKeyPlaceholder="type (e.g. matt, uvspot, softtouch)"
                  addValPlaceholder="r/100sqin"
                  formatLabel={k => k.charAt(0).toUpperCase() + k.slice(1) + " Lamination"}
                />
              </Card>

              {/* Envelope Making — dynamic */}
              <Card title="Envelope Making (r/piece) — add/remove sizes">
                <DynamicRateSection
                  data={rates.envelope ?? {}}
                  onUpdate={d => updateRateSection("envelope", d)}
                  step={0.5}
                  addKeyPlaceholder="key (e.g. env6x9, env5x7)"
                  addValPlaceholder="r/pc"
                />
              </Card>

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

      </div>
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
        className="bg-blue-500 hover:bg-blue-600 text-white rounded px-2 py-1 text-xs font-semibold">+ Add</button>
    </div>
  );
}
