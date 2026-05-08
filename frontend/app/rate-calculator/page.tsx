"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Tab = "forward" | "reverse" | "sticker" | "rates";
type LamOption = "none" | "single" | "double";
type Layer = { psize: string; gsm: string; qty: number; fsize: string; colors: number; sides: string; };
type BreakdownRow = { label: string; amount: number };
type Result = { breakdown: BreakdownRow[]; subtotal: number; marginAmt: number; gstAmt: number; total: number; perPiece?: number; perSticker?: number; totalQty?: number; description?: string; };

const CUTS: Record<string, Record<string, number>> = {
  '1823': { A4:4, A5:8, A6:16, A8:64, '1/3A4':6, DL:6, visiting:32 },
  '1925': { A4:4, A5:8, A6:16, A8:64, '1/3A4':6, DL:6, visiting:40 },
};

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── RESULT CARD ─────────────────────────────────────────────────────────────
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
          <span className="text-slate-600">Subtotal</span>
          <span className="font-semibold">{fmt(result.subtotal)}</span>
        </div>
        <div className="flex justify-between text-xs py-1 border-b border-green-100">
          <span className="text-slate-600">Margin</span>
          <span className="font-semibold">{fmt(result.marginAmt)}</span>
        </div>
        <div className="flex justify-between text-xs py-1 border-b border-green-100">
          <span className="text-slate-600">GST</span>
          <span className="font-semibold">{fmt(result.gstAmt)}</span>
        </div>
      </div>
      <div className="bg-green-700 text-white rounded-lg px-4 py-2.5 flex justify-between items-center mt-3">
        <span className="font-bold text-sm">Total Quote</span>
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

// ─── LAYER COMPONENT ─────────────────────────────────────────────────────────
function LayerRow({ layer, idx, onChange, onRemove, canRemove }: {
  layer: Layer; idx: number;
  onChange: (f: Partial<Layer>) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 relative">
      <p className="text-xs font-bold text-slate-400 mb-2">LAYER {idx + 1}</p>
      {canRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 text-lg leading-none font-bold">×</button>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Paper Size</label>
          <select value={layer.psize} onChange={e => onChange({ psize: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5">
            <option value="1823">18×23 inch</option>
            <option value="1925">19×25 inch</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">GSM / Paper</label>
          <select value={layer.gsm} onChange={e => onChange({ gsm: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5">
            <option value="bond70">70 GSM Bond</option>
            <option value="bond80">80 GSM Bond</option>
            <option value="map90">90 GSM Maplitho</option>
            <option value="map100">100 GSM Maplitho</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Print Quantity</label>
          <input type="number" value={layer.qty} onChange={e => onChange({ qty: +e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Final Size</label>
          <select value={layer.fsize} onChange={e => onChange({ fsize: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5">
            <option value="A4">A4</option><option value="A5">A5</option>
            <option value="A6">A6</option><option value="A8">A8</option>
            <option value="1/3A4">1/3 A4</option><option value="DL">DL</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Colors</label>
          <select value={layer.colors} onChange={e => onChange({ colors: +e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5">
            <option value={1}>1 Color</option>
            <option value={2}>2 Color</option>
            <option value={4}>4 Colors (CMYK)</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Sides</label>
          <select value={layer.sides} onChange={e => onChange({ sides: e.target.value })} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5">
            <option value="single">Single Side</option>
            <option value="double">Double Side</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Cuts per sheet: <strong>{CUTS[layer.psize]?.[layer.fsize] ?? 4}</strong> →
        Parent sheets needed: <strong>{Math.ceil(layer.qty / (CUTS[layer.psize]?.[layer.fsize] ?? 4)).toLocaleString()}</strong>
      </p>
    </div>
  );
}

// ─── FIELD HELPER ─────────────────────────────────────────────────────────────
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
  const [fCustomer, setFCustomer] = useState(""); const [fJob, setFJob] = useState("");
  const [fLam, setFLam] = useState<LamOption>("none"); const [fPad, setFPad] = useState("no");
  const [fPadSize, setFPadSize] = useState("A4"); const [fPads, setFPads] = useState(0);
  const [fPunch, setFPunch] = useState("no"); const [fEnv, setFEnv] = useState("none");
  const [fMargin, setFMargin] = useState(15); const [fGst, setFGst] = useState(18);

  // ── Reverse State ──
  const [rCustomer, setRCustomer] = useState(""); const [rProduct, setRProduct] = useState("pads");
  const [rQty, setRQty] = useState(50); const [rSheets, setRSheets] = useState(100);
  const [rSize, setRSize] = useState("A4"); const [rPaper, setRPaper] = useState("bond80");
  const [rParent, setRParent] = useState("1823"); const [rColors, setRColors] = useState(4);
  const [rSides, setRSides] = useState("single"); const [rLam, setRLam] = useState<LamOption>("none");
  const [rMargin, setRMargin] = useState(15); const [rGst, setRGst] = useState(18);

  // ── Sticker State ──
  const [sW, setSW] = useState(2); const [sH, setSH] = useState(3);
  const [sQty, setSQty] = useState(4000); const [sCols, setSCols] = useState(2);
  const [sRows, setSRows] = useState(2); const [sMarg, setSMarg] = useState(0.25);
  const [sMode, setSMode] = useState("inhouse"); const [sHalfcut, setSHalfcut] = useState("no");
  const [sPaperRate, setSPaperRate] = useState(3.5); const [sPrintRate, setSPrintRate] = useState(5);
  const [sHcPct, setSHcPct] = useState(30); const [sVendorRate, setSVendorRate] = useState(0.035);
  const [sMinQty, setSMinQty] = useState(1000); const [sTransport, setSTransport] = useState(100);
  const [sHcPct2, setSHcPct2] = useState(30); const [sMargin, setSMargin] = useState(15);
  const [sGst, setSGst] = useState(18);

  // ── Rates State ──
  const [rates, setRates] = useState<any>(null);
  const [ratesSaved, setRatesSaved] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Sheet info
  const sheetW = (sCols * sW + 2 * sMarg).toFixed(2);
  const sheetH = (sRows * sH + 2 * sMarg).toFixed(2);
  const stickersPerSheet = sCols * sRows;
  const sheetsNeeded = Math.ceil(sQty / stickersPerSheet);

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rate-calculator/rates`, { headers: getAuthHeaders() });
      if (!res.ok) {
        setRatesError(`Failed to load rates: ${res.status} ${res.statusText} (${res.url})`);
        return;
      }
      setRates(await res.json());
    } catch (error) {
      setRatesError(`Unable to load master rates. Please refresh.`);
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
      layers, lam: fLam, padSize: fPadSize, pads: fPad === "yes" ? fPads : 0,
      punch: fPunch === "yes", envelope: fEnv, margin: fMargin, gst: fGst,
      customer: fCustomer, job: fJob,
    });
    if (r) { setResult(r); setResultDesc(`Job: ${fJob || "—"} | Customer: ${fCustomer || "—"}`); }
  };

  const calcReverse = async () => {
    const r = await post("reverse", {
      product: rProduct, qty: rQty, sheetsPerUnit: rSheets, fsize: rSize,
      paper: rPaper, parent: rParent, colors: rColors, sides: rSides,
      lam: rLam, margin: rMargin, gst: rGst, customer: rCustomer,
    });
    if (r) { setResult(r); setResultDesc(r.description || ""); }
  };

  const calcSticker = async () => {
    const r = await post("sticker", {
      stickerW: sW, stickerH: sH, qty: sQty, cols: sCols, rows: sRows,
      margin: sMarg, mode: sMode, halfcut: sHalfcut === "yes",
      paperRate: sPaperRate, printRate: sPrintRate, hcPct: sHcPct,
      vendorRate: sVendorRate, minQty: sMinQty, transport: sTransport, hcPct2: sHcPct2,
      profitMargin: sMargin, gst: sGst,
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
      for (let i = 0; i < parts.length - 1; i++) { obj[parts[i]] = { ...obj[parts[i]] }; obj = obj[parts[i]]; }
      obj[parts[parts.length - 1]] = val;
      return next;
    });
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "forward", label: "→ Forward Quote" },
    { id: "reverse", label: "↺ Reverse" },
    { id: "sticker", label: "🏷 Sticker" },
    { id: "rates", label: "⚙ Master Rates" },
  ];

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

            <Card title="📄 Paper Layers — Add multiple for Bill Books etc.">
              {layers.map((l, i) => (
                <LayerRow key={i} layer={l} idx={i}
                  onChange={f => setLayers(prev => prev.map((x, j) => j === i ? { ...x, ...f } : x))}
                  onRemove={() => setLayers(prev => prev.filter((_, j) => j !== i))}
                  canRemove={layers.length > 1} />
              ))}
              <button onClick={() => setLayers(p => [...p, { psize: "1823", gsm: "bond70", qty: 1000, fsize: "A4", colors: 1, sides: "single" }])}
                className="border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">+ Add Layer</button>
            </Card>

            <Card title="✂️ Finishing Options">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Lamination">
                  <Select value={fLam} onChange={e => setFLam(e.target.value as LamOption)}>
                    <option value="none">None</option>
                    <option value="single">Single Side</option>
                    <option value="double">Double Side</option>
                  </Select>
                </Field>
                <Field label="Pad Binding">
                  <Select value={fPad} onChange={e => setFPad(e.target.value)}>
                    <option value="no">No</option><option value="yes">Yes</option>
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
                    <option value="no">No</option><option value="yes">Yes</option>
                  </Select>
                </Field>
                <Field label="Envelope Making">
                  <Select value={fEnv} onChange={e => setFEnv(e.target.value)}>
                    <option value="none">None</option>
                    <option value="DL">DL</option><option value="A4">A4</option>
                    <option value="A5">A5</option><option value="C4">C4</option>
                  </Select>
                </Field>
              </div>
            </Card>

            <Card title="💰 Margin & Output">
              <div className="grid grid-cols-3 gap-3 items-end">
                <Field label="Profit Margin %"><Input type="number" value={fMargin} onChange={e => setFMargin(+e.target.value)} /></Field>
                <Field label="GST %"><Input type="number" value={fGst} onChange={e => setFGst(+e.target.value)} /></Field>
                <button onClick={calcForward} disabled={loading}
                  className="bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60">
                  {loading ? "Calculating…" : "🧮 Calculate"}
                </button>
              </div>
            </Card>

            {result && <ResultCard result={result} desc={resultDesc} />}
          </>
        )}

        {/* ── REVERSE ── */}
        {tab === "reverse" && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-3">
              📌 Enter what your customer wants — the system calculates sheets, costs and quote automatically.
            </div>

            <Card title="📦 Customer Requirement">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer Name"><Input value={rCustomer} onChange={e => setRCustomer(e.target.value)} placeholder="e.g. Raj Enterprises" /></Field>
                <Field label="Product Type">
                  <Select value={rProduct} onChange={e => setRProduct(e.target.value)}>
                    <option value="pads">Pads</option>
                    <option value="letterhead">Letterheads</option>
                    <option value="envelope">Envelopes</option>
                    <option value="file">Files with Punching</option>
                    <option value="visiting">Visiting Cards</option>
                    <option value="billbook">Bill Book (Duplicate)</option>
                  </Select>
                </Field>
              </div>
            </Card>

            <Card title="🔢 Requirement Details">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Quantity"><Input type="number" value={rQty} onChange={e => setRQty(+e.target.value)} /></Field>
                {(rProduct === "pads" || rProduct === "billbook") && (
                  <Field label="Sheets per Pad"><Input type="number" value={rSheets} onChange={e => setRSheets(+e.target.value)} /></Field>
                )}
                <Field label="Final Size">
                  <Select value={rSize} onChange={e => setRSize(e.target.value)}>
                    <option value="A4">A4</option><option value="A5">A5</option>
                    <option value="A6">A6</option><option value="A8">A8</option>
                    <option value="1/3A4">1/3 A4</option>
                    <option value="DL">DL Envelope</option>
                    <option value="visiting">Visiting Card</option>
                  </Select>
                </Field>
                <Field label="Paper Type">
                  <Select value={rPaper} onChange={e => setRPaper(e.target.value)}>
                    <option value="bond70">70 GSM Bond</option>
                    <option value="bond80">80 GSM Bond</option>
                    <option value="map90">90 GSM Maplitho</option>
                    <option value="map100">100 GSM Maplitho</option>
                  </Select>
                </Field>
                <Field label="Parent Sheet Size">
                  <Select value={rParent} onChange={e => setRParent(e.target.value)}>
                    <option value="1823">18×23 inch</option>
                    <option value="1925">19×25 inch</option>
                  </Select>
                </Field>
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
                    <option value="single">Single Side</option>
                    <option value="double">Double Side</option>
                  </Select>
                </Field>
              </div>
              {rProduct === "pads" && rSize && rParent && (
                <p className="text-xs text-slate-400 mt-2">
                  Cuts per parent sheet ({rParent === "1823" ? "18×23" : "19×25"}"): <strong>{CUTS[rParent]?.[rSize] ?? 4}</strong> →
                  Total print sheets: <strong>{(rQty * rSheets).toLocaleString()}</strong> →
                  Parent sheets needed: <strong>{Math.ceil((rQty * rSheets) / (CUTS[rParent]?.[rSize] ?? 4)).toLocaleString()}</strong>
                </p>
              )}
            </Card>

            <Card title="💰 Margin">
              <div className="grid grid-cols-3 gap-3 items-end">
                <Field label="Profit Margin %"><Input type="number" value={rMargin} onChange={e => setRMargin(+e.target.value)} /></Field>
                <Field label="GST %"><Input type="number" value={rGst} onChange={e => setRGst(+e.target.value)} /></Field>
                <button onClick={calcReverse} disabled={loading}
                  className="bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60">
                  {loading ? "Calculating…" : "🧮 Calculate"}
                </button>
              </div>
            </Card>

            {result && <ResultCard result={result} desc={resultDesc} />}
          </>
        )}

        {/* ── STICKER ── */}
        {tab === "sticker" && (
          <>
            <Card title="🏷 Sticker Details">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Sticker Width (in)"><Input type="number" step="0.1" value={sW} onChange={e => setSW(+e.target.value)} /></Field>
                <Field label="Sticker Height (in)"><Input type="number" step="0.1" value={sH} onChange={e => setSH(+e.target.value)} /></Field>
                <Field label="Quantity Required"><Input type="number" value={sQty} onChange={e => setSQty(+e.target.value)} /></Field>
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
                <Field label="Sheet Width (auto)"><Input value={sheetW + '"'} readOnly className="bg-slate-50 text-slate-500" /></Field>
                <Field label="Sheet Height (auto)"><Input value={sheetH + '"'} readOnly className="bg-slate-50 text-slate-500" /></Field>
              </div>
            </Card>

            <Card title="⚙ Calculation Mode">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Mode">
                  <Select value={sMode} onChange={e => setSMode(e.target.value)}>
                    <option value="inhouse">In-House (Paper + Printing)</option>
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
                  <Field label="Min Qty"><Input type="number" value={sMinQty} onChange={e => setSMinQty(+e.target.value)} /></Field>
                  <Field label="Transport (₹)"><Input type="number" value={sTransport} onChange={e => setSTransport(+e.target.value)} /></Field>
                  {sHalfcut === "yes" && <Field label="Half Cut % of total"><Input type="number" value={sHcPct2} onChange={e => setSHcPct2(+e.target.value)} /></Field>}
                </div>
              )}
            </Card>

            <Card title="💰 Margin">
              <div className="grid grid-cols-3 gap-3 items-end">
                <Field label="Profit Margin %"><Input type="number" value={sMargin} onChange={e => setSMargin(+e.target.value)} /></Field>
                <Field label="GST %"><Input type="number" value={sGst} onChange={e => setSGst(+e.target.value)} /></Field>
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
              <p>{ratesError}</p>
              <button onClick={loadRates} className="mt-4 rounded-lg bg-amber-600 text-white px-4 py-2 text-xs font-semibold hover:bg-amber-700">Retry</button>
            </div>
          ) : rates ? (
            <>
              <Card title="📄 Paper Rates (per ream of 500 sheets)">
                <div className="grid grid-cols-2 gap-3">
                  {[["1823-bond70","18×23\" 70 GSM Bond"],["1823-bond80","18×23\" 80 GSM Bond"],
                    ["1925-bond70","19×25\" 70 GSM Bond"],["1925-bond80","19×25\" 80 GSM Bond"],
                    ["1823-map90","18×23\" 90 GSM Maplitho"],["1925-map90","19×25\" 90 GSM Maplitho"],
                    ["1823-map100","18×23\" 100 GSM Maplitho"],["1925-map100","19×25\" 100 GSM Maplitho"],
                  ].map(([key, label]) => (
                    <Field key={key} label={`${label} (₹)`}>
                      <Input type="number" value={rates.paper?.[key] ?? ""} onChange={e => updateRate(`paper.${key}`, +e.target.value)} />
                    </Field>
                  ))}
                </div>
              </Card>

              <Card title="🖨 Offset Printing Rates">
                <div className="grid grid-cols-2 gap-3">
                  {[["first1k.1","First 1000 — 1 Color"],["first1k.2","First 1000 — 2 Color"],["first1k.4","First 1000 — 4 Color CMYK"],
                    ["nextK.1","Next 1000 — 1 Color"],["nextK.2","Next 1000 — 2 Color"],["nextK.4","Next 1000 — 4 Color"],
                  ].map(([key, label]) => (
                    <Field key={key} label={`${label} (₹)`}>
                      <Input type="number" value={rates.printing?.[key.split(".")[0]]?.[key.split(".")[1]] ?? ""} onChange={e => updateRate(`printing.${key}`, +e.target.value)} />
                    </Field>
                  ))}
                </div>
              </Card>

              <Card title="🔲 Plate & Punching">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plate Rate (₹/plate)"><Input type="number" value={rates.plate ?? ""} onChange={e => updateRate("plate", +e.target.value)} /></Field>
                  <Field label="File Punching (₹/piece)"><Input type="number" value={rates.punch ?? ""} onChange={e => updateRate("punch", +e.target.value)} /></Field>
                </div>
              </Card>

              <Card title="📎 Pad Binding Rates (₹/pad)">
                <div className="grid grid-cols-3 gap-3">
                  {["A4","A5","A6","A8","1/3A4"].map(sz => (
                    <Field key={sz} label={`${sz} Pad`}>
                      <Input type="number" value={rates.padBinding?.[sz] ?? ""} onChange={e => updateRate(`padBinding.${sz}`, +e.target.value)} />
                    </Field>
                  ))}
                </div>
              </Card>

              <Card title="✨ Lamination Rates (₹/sheet)">
                <div className="grid grid-cols-2 gap-3">
                  {[["A4-single","A4 Single"],["A4-double","A4 Double"],["A3-single","A3 Single"],["A3-double","A3 Double"]].map(([k,l]) => (
                    <Field key={k} label={`${l} Side (₹)`}>
                      <Input type="number" value={rates.lamination?.[k] ?? ""} onChange={e => updateRate(`lamination.${k}`, +e.target.value)} />
                    </Field>
                  ))}
                </div>
              </Card>

              <Card title="✉️ Envelope Making (₹/piece)">
                <div className="grid grid-cols-2 gap-3">
                  {["DL","A4","A5","C4"].map(sz => (
                    <Field key={sz} label={`${sz} Envelope`}>
                      <Input type="number" value={rates.envelope?.[sz] ?? ""} onChange={e => updateRate(`envelope.${sz}`, +e.target.value)} />
                    </Field>
                  ))}
                </div>
              </Card>

              <button onClick={saveRates} className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700">
                💾 Save All Rates
              </button>
              {ratesSaved && <p className="text-center text-green-600 font-semibold text-sm mt-2">✅ Rates saved!</p>}
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">No master rates available.</div>
          )
        )}
      </div>
    </DashboardShell>
  );
}

