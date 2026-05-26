'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardShell } from '@/components/dashboard-shell';

// ─── Types (mirrored from backend) ───────────────────────────────────────────
type SheetSize = '18x23' | '19x25';
type SlotType = 'SMALL_5_5x8_5' | 'MEDIUM_7_5x8_5' | 'LARGE_8_5x11' | 'XL_11x17';

interface SlotPattern {
  id: string;
  label: string;
  sheetSize: SheetSize;
  rows: SlotType[][];
  totalSlots: number;
  slotCounts: Partial<Record<SlotType, number>>;
}

interface SlotGeometry {
  row: number; col: number; slotType: SlotType;
  xPx: number; yPx: number; wPx: number; hPx: number;
}

// ─── Static data (matches backend) ───────────────────────────────────────────
const SHEET_DEFS: Record<SheetSize, { label: string; widthIn: number; heightIn: number; marginIn: number; usableW: number; usableH: number }> = {
  '18x23': { label: '18×23 Inch', widthIn: 23, heightIn: 18, marginIn: 0.5, usableW: 22, usableH: 17 },
  '19x25': { label: '19×25 Inch', widthIn: 25, heightIn: 19, marginIn: 0.5, usableW: 24, usableH: 18 },
};

const SLOT_META: Record<SlotType, { label: string; color: string; bgColor: string }> = {
  SMALL_5_5x8_5:  { label: '5.5×8.5"',  color: '#4f46e5', bgColor: 'rgba(79,70,229,0.08)' },
  MEDIUM_7_5x8_5: { label: '7.5×8.5"',  color: '#0891b2', bgColor: 'rgba(8,145,178,0.08)' },
  LARGE_8_5x11:   { label: '8.5×11"',   color: '#059669', bgColor: 'rgba(5,150,105,0.08)' },
  XL_11x17:       { label: '11×17"',    color: '#d97706', bgColor: 'rgba(217,119,6,0.08)' },
};

const ALL_PATTERNS: SlotPattern[] = [
  // 18×23
  { id:'18x23_8S',      label:'8× Small (5.5×8.5)',      sheetSize:'18x23', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:8, slotCounts:{ SMALL_5_5x8_5:8 } },
  { id:'18x23_6M',      label:'6× Medium (7.5×8.5)',     sheetSize:'18x23', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:6, slotCounts:{ MEDIUM_7_5x8_5:6 } },
  { id:'18x23_4L',      label:'4× Large (8.5×11)',       sheetSize:'18x23', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['LARGE_8_5x11','LARGE_8_5x11']], totalSlots:4, slotCounts:{ LARGE_8_5x11:4 } },
  { id:'18x23_2XL',     label:'2× XL (11×17)',           sheetSize:'18x23', rows:[['XL_11x17','XL_11x17']], totalSlots:2, slotCounts:{ XL_11x17:2 } },
  { id:'18x23_2L_4S',   label:'2× Large + 4× Small',    sheetSize:'18x23', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:6, slotCounts:{ LARGE_8_5x11:2, SMALL_5_5x8_5:4 } },
  { id:'18x23_4S_2L',   label:'4× Small + 2× Large',    sheetSize:'18x23', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['LARGE_8_5x11','LARGE_8_5x11']], totalSlots:6, slotCounts:{ SMALL_5_5x8_5:4, LARGE_8_5x11:2 } },
  { id:'18x23_3M_4S',   label:'3× Medium + 4× Small',   sheetSize:'18x23', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:7, slotCounts:{ MEDIUM_7_5x8_5:3, SMALL_5_5x8_5:4 } },
  { id:'18x23_4S_3M',   label:'4× Small + 3× Medium',   sheetSize:'18x23', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:7, slotCounts:{ SMALL_5_5x8_5:4, MEDIUM_7_5x8_5:3 } },
  { id:'18x23_3M_2L',   label:'3× Medium + 2× Large',   sheetSize:'18x23', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['LARGE_8_5x11','LARGE_8_5x11']], totalSlots:5, slotCounts:{ MEDIUM_7_5x8_5:3, LARGE_8_5x11:2 } },
  { id:'18x23_2L_3M',   label:'2× Large + 3× Medium',   sheetSize:'18x23', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:5, slotCounts:{ LARGE_8_5x11:2, MEDIUM_7_5x8_5:3 } },
  { id:'18x23_1L2S_x2', label:'2× (1 Large + 2 Small)', sheetSize:'18x23', rows:[['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5'],['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:6, slotCounts:{ LARGE_8_5x11:2, SMALL_5_5x8_5:4 } },
  // 19×25
  { id:'19x25_8S',  label:'8× Small (5.5×9" rows)',      sheetSize:'19x25', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:8, slotCounts:{ SMALL_5_5x8_5:8 } },
  { id:'19x25_6M',  label:'6× Medium (8×9" rows)',       sheetSize:'19x25', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:6, slotCounts:{ MEDIUM_7_5x8_5:6 } },
  { id:'19x25_4L',  label:'4× Large (12×9" rows)',       sheetSize:'19x25', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['LARGE_8_5x11','LARGE_8_5x11']], totalSlots:4, slotCounts:{ LARGE_8_5x11:4 } },
  { id:'19x25_2XL', label:'2× XL (11×18" full height)',  sheetSize:'19x25', rows:[['XL_11x17','XL_11x17']], totalSlots:2, slotCounts:{ XL_11x17:2 } },
];

function computeSlotGeometry(pattern: SlotPattern, canvasW: number, canvasH: number): SlotGeometry[] {
  const sheet = SHEET_DEFS[pattern.sheetSize];
  const scaleX = canvasW / sheet.widthIn;
  const scaleY = canvasH / sheet.heightIn;
  const marginPxX = sheet.marginIn * scaleX;
  const marginPxY = sheet.marginIn * scaleY;
  const result: SlotGeometry[] = [];
  let curY = marginPxY;

  for (let r = 0; r < pattern.rows.length; r++) {
    const row = pattern.rows[r];
    let rowHeightIn: number;
    if (row[0] === 'XL_11x17') {
      rowHeightIn = sheet.usableH;
    } else {
      rowHeightIn = sheet.usableH / 2;
    }
    const rowHeightPx = rowHeightIn * scaleY;
    const slotWIn = sheet.usableW / row.length;
    const slotWPx = slotWIn * scaleX;
    let curX = marginPxX;
    for (let c = 0; c < row.length; c++) {
      result.push({ row: r, col: c, slotType: row[c], xPx: curX, yPx: curY, wPx: slotWPx, hPx: rowHeightPx });
      curX += slotWPx;
    }
    curY += rowHeightPx;
  }
  return result;
}

// ─── Main page component ──────────────────────────────────────────────────────
function SheetLayoutContent() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sheetSize, setSheetSize] = useState<SheetSize>('18x23');
  const [pattern, setPattern] = useState<SlotPattern | null>(null);
  const [slotImages, setSlotImages] = useState<(string | null)[]>([]);     // object URLs
  const [slotFiles, setSlotFiles] = useState<(File | null)[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patterns = ALL_PATTERNS.filter(p => p.sheetSize === sheetSize);
  const sheet = SHEET_DEFS[sheetSize];

  // ── Slot index flat list ──
  const slotList = pattern
    ? pattern.rows.flatMap((row, r) => row.map((st, c) => ({ row: r, col: c, slotType: st })))
    : [];

  // ── Reset slots when pattern changes ──
  useEffect(() => {
    if (pattern) {
      setSlotImages(Array(pattern.totalSlots).fill(null));
      setSlotFiles(Array(pattern.totalSlots).fill(null));
      setActiveSlot(null);
    }
  }, [pattern]);

  // ── Draw canvas preview ──
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // White sheet background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    // Sheet border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    const geos = computeSlotGeometry(pattern, cw, ch);

    const drawSlots = (imgs: HTMLImageElement[]) => {
      geos.forEach((geo, i) => {
        const meta = SLOT_META[geo.slotType];
        const img = imgs[i];

        if (img) {
          ctx.drawImage(img, geo.xPx, geo.yPx, geo.wPx, geo.hPx);
        } else {
          // Placeholder
          ctx.fillStyle = activeSlot === i ? 'rgba(99,102,241,0.15)' : meta.bgColor;
          ctx.fillRect(geo.xPx, geo.yPx, geo.wPx, geo.hPx);

          // Slot label
          ctx.fillStyle = meta.color;
          ctx.font = `bold ${Math.max(8, geo.wPx * 0.06)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(meta.label, geo.xPx + geo.wPx / 2, geo.yPx + geo.hPx / 2 - geo.hPx * 0.06);

          // Upload hint
          ctx.fillStyle = '#9ca3af';
          ctx.font = `${Math.max(7, geo.wPx * 0.045)}px monospace`;
          ctx.fillText('Click to upload', geo.xPx + geo.wPx / 2, geo.yPx + geo.hPx / 2 + geo.hPx * 0.1);
        }

        // Cut border
        ctx.strokeStyle = activeSlot === i ? '#4f46e5' : 'rgba(220,0,0,0.45)';
        ctx.lineWidth = activeSlot === i ? 1.5 : 0.8;
        ctx.strokeRect(geo.xPx + 0.5, geo.yPx + 0.5, geo.wPx - 1, geo.hPx - 1);

        // Slot number badge
        ctx.fillStyle = activeSlot === i ? '#4f46e5' : 'rgba(0,0,0,0.35)';
        const badgeX = geo.xPx + 4;
        const badgeY = geo.yPx + 4;
        ctx.fillRect(badgeX, badgeY, 18, 14);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), badgeX + 9, badgeY + 7);
      });
    };

    // Load images that are available
    const imageEls: HTMLImageElement[] = Array(geos.length).fill(null);
    let pending = slotImages.filter(Boolean).length;

    if (pending === 0) {
      drawSlots(imageEls);
      return;
    }

    slotImages.forEach((src, i) => {
      if (!src) { pending--; if (pending === 0) drawSlots(imageEls); return; }
      const img = new Image();
      img.onload = () => {
        imageEls[i] = img;
        pending--;
        if (pending === 0) drawSlots(imageEls);
      };
      img.onerror = () => { pending--; if (pending === 0) drawSlots(imageEls); };
      img.src = src;
    });
  }, [pattern, slotImages, activeSlot]);

  useEffect(() => { drawPreview(); }, [drawPreview]);

  // ── Handle canvas click → identify slot ──
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const geos = computeSlotGeometry(pattern, canvas.width, canvas.height);
    const hit = geos.findIndex(g => cx >= g.xPx && cx <= g.xPx + g.wPx && cy >= g.yPx && cy <= g.yPx + g.hPx);
    if (hit >= 0) {
      setActiveSlot(hit);
      fileInputRef.current?.click();
    }
  };

  // ── Handle file upload ──
  const handleFile = (file: File) => {
    if (activeSlot === null) return;
    const url = URL.createObjectURL(file);
    setSlotImages(prev => { const n = [...prev]; n[activeSlot] = url; return n; });
    setSlotFiles(prev => { const n = [...prev]; n[activeSlot] = file; return n; });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  // ── Download (calls backend) ──
  const handleDownload = async () => {
    if (!pattern) return;
    setIsGenerating(true);
    setProgress('Preparing images...');
    try {
      const formData = new FormData();
      for (let i = 0; i < slotFiles.length; i++) {
        if (slotFiles[i]) {
          formData.append('slots', slotFiles[i]!, `slot_${i}.jpg`);
          // Add index metadata via filename convention
          const f = slotFiles[i]!;
          const renamed = new File([f], `slot_${i}${f.name.slice(f.name.lastIndexOf('.'))}`, { type: f.type });
          formData.set('slots', renamed);
        }
      }
      // Send all files indexed
      const fd2 = new FormData();
      for (let i = 0; i < slotFiles.length; i++) {
        if (slotFiles[i]) {
          fd2.append('slots', slotFiles[i]!);
        }
      }

      setProgress('Sending to server (600 DPI CMYK assembly)...');
      const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${API}/sheet-layout/assemble?patternId=${pattern.id}`, {
        method: 'POST',
        body: fd2,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Assembly failed');
      }

      setProgress('Downloading TIFF...');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sheet-${pattern.id}-600dpi-CMYK.tiff`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const uploadedCount = slotImages.filter(Boolean).length;
  const allFilled = uploadedCount === (pattern?.totalSlots ?? 0);
  const anyFilled = uploadedCount > 0;

  // ── Compute canvas aspect ratio from sheet ──
  const canvasAspect = sheet.widthIn / sheet.heightIn; // e.g. 23/18 ≈ 1.278

  return (
    <div style={{ fontFamily: "'DM Mono', 'Courier New', monospace" }} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase text-gray-900">Sheet Layout Composer</h1>
            <p className="text-xs text-gray-400 tracking-wider mt-0.5">600 DPI · CMYK TIFF · PRINT-READY</p>
          </div>
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex items-center gap-1.5 ${step >= s ? 'text-indigo-600' : 'text-gray-300'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step >= s ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-300'}`}>
                  {s}
                </div>
                <span className="text-xs font-medium hidden sm:block">
                  {s === 1 ? 'Sheet Size' : s === 2 ? 'Layout' : 'Designs'}
                </span>
                {s < 3 && <span className="text-gray-200 text-xs">›</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6" style={{ minHeight: 'calc(100vh - 73px)' }}>

        {/* ── LEFT PANEL ── */}
        <div className="w-80 flex-shrink-0 space-y-4">

          {/* STEP 1: Sheet Size */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Step 1 · Sheet Size</span>
              {step > 1 && <span className="text-xs text-indigo-600 font-bold">{sheet.label}</span>}
            </div>
            <div className="p-3 space-y-2">
              {(['18x23', '19x25'] as SheetSize[]).map(sz => {
                const s = SHEET_DEFS[sz];
                const active = sheetSize === sz;
                return (
                  <button key={sz} onClick={() => { setSheetSize(sz); setPattern(null); setStep(1); }}
                    className={`w-full text-left px-3 py-3 rounded border transition-all ${active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className={`text-sm font-bold ${active ? 'text-indigo-700' : 'text-gray-700'}`}>{s.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Usable: {s.usableW}" × {s.usableH}" · Margin: {s.marginIn}"</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: Layout Pattern */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Step 2 · Layout Pattern</span>
            </div>
            <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
              {patterns.map(p => {
                const active = pattern?.id === p.id;
                return (
                  <button key={p.id} onClick={() => { setPattern(p); setStep(2); }}
                    className={`w-full text-left px-3 py-2.5 rounded border transition-all ${active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className={`text-xs font-bold ${active ? 'text-indigo-700' : 'text-gray-700'}`}>{p.label}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(Object.entries(p.slotCounts) as [SlotType, number][]).map(([st, cnt]) => (
                        <span key={st} className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{ background: SLOT_META[st].bgColor, color: SLOT_META[st].color }}>
                          {cnt}×{SLOT_META[st].label}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: Slot status */}
          {pattern && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Step 3 · Upload Designs</span>
              </div>
              <div className="p-3 space-y-1 max-h-56 overflow-y-auto">
                {slotList.map((s, i) => {
                  const meta = SLOT_META[s.slotType];
                  const hasImg = !!slotImages[i];
                  return (
                    <button key={i} onClick={() => { setActiveSlot(i); fileInputRef.current?.click(); }}
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-all ${activeSlot === i ? 'bg-indigo-50 border border-indigo-300' : 'hover:bg-gray-50 border border-transparent'}`}>
                      <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: hasImg ? '#059669' : meta.color }}>
                        {hasImg ? '✓' : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-700 truncate">
                          Slot {i + 1} · {meta.label}
                        </div>
                        <div className="text-xs text-gray-400">
                          {hasImg ? slotFiles[i]?.name ?? 'Uploaded' : 'Click to upload'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="px-3 pb-3">
                <div className="text-xs text-gray-500 text-right mt-2">
                  {uploadedCount} / {pattern.totalSlots} designs uploaded
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                  <div className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${(uploadedCount / pattern.totalSlots) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Sheet specs */}
          {pattern && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Sheet Specs</span>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  ['Sheet', sheet.label],
                  ['Usable', `${sheet.usableW}" × ${sheet.usableH}"`],
                  ['Margin', '0.5" all sides'],
                  ['Slots', `${pattern.totalSlots} designs`],
                  ['Gap', '2mm between slots'],
                  ['Output', '600 DPI · CMYK TIFF'],
                  ['Color', 'CMYK (print-ready)'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center px-4 py-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">{k}</span>
                    <span className="text-xs font-mono font-medium text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download Button */}
          {pattern && (
            <>
              <button onClick={handleDownload} disabled={!anyFilled || isGenerating}
                className={`w-full py-3.5 rounded-lg font-bold tracking-widest uppercase text-sm transition-all ${anyFilled && !isGenerating ? 'bg-gray-900 text-white hover:bg-gray-800 active:scale-95' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                {isGenerating ? `⏳ ${progress || 'Assembling...'}` : `⬇ Download 600 DPI CMYK`}
              </button>
              {!allFilled && anyFilled && (
                <p className="text-center text-xs text-amber-600">
                  {pattern.totalSlots - uploadedCount} slot(s) empty — will be white in output
                </p>
              )}
              {!anyFilled && (
                <p className="text-center text-xs text-gray-400">Click any slot on the preview to upload a design</p>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT PANEL — Canvas Preview ── */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col flex-1">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Live Preview</span>
              <div className="flex items-center gap-4 text-xs text-gray-400 font-mono">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 border border-red-400 opacity-60"></span>
                  Cut line
                </span>
                {pattern && (
                  <span className="flex items-center gap-1">
                    <span style={{ color: '#4f46e5' }}>■</span>
                    {pattern.totalSlots} slots
                  </span>
                )}
                {activeSlot !== null && (
                  <span className="text-indigo-600 font-bold">● Slot {activeSlot + 1} selected</span>
                )}
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
              {!pattern ? (
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-3">📐</div>
                  <div className="text-sm font-medium">Select a sheet size and layout pattern</div>
                  <div className="text-xs mt-1">to see the sheet preview</div>
                </div>
              ) : (
                <div className="shadow-xl rounded overflow-hidden cursor-crosshair"
                  style={{ maxHeight: '72vh', maxWidth: '100%', aspectRatio: `${canvasAspect}` }}>
                  <canvas
                    ref={canvasRef}
                    width={920}
                    height={Math.round(920 / canvasAspect)}
                    onClick={handleCanvasClick}
                    style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '72vh' }}
                  />
                </div>
              )}
            </div>

            {/* Bottom stats */}
            {pattern && (
              <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Layout</span>
                  <span className="text-xs font-mono font-bold text-gray-700">{pattern.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Sheet</span>
                  <span className="text-xs font-mono font-bold text-gray-700">{sheet.widthIn}" × {sheet.heightIn}"</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Slots</span>
                  <span className="text-xs font-mono font-bold text-indigo-600">{uploadedCount}/{pattern.totalSlots} filled</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Output</span>
                  <span className="text-xs font-mono font-bold text-gray-700">600 DPI CMYK TIFF</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/tiff,application/pdf"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}

export default function SheetLayout() {
  return (
    <DashboardShell>
      <SheetLayoutContent />
    </DashboardShell>
  );
}
