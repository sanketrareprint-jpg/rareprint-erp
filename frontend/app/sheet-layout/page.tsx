'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardShell } from '@/components/dashboard-shell';

type SheetSize = '18x23' | '19x25';
type SlotType = 'SMALL_5_5x8_5' | 'MEDIUM_7_5x8_5' | 'LARGE_8_5x11' | 'XL_11x17';

interface SlotPattern {
  id: string; label: string; sheetSize: SheetSize;
  rows: SlotType[][]; totalSlots: number;
  slotCounts: Partial<Record<SlotType, number>>;
}

const SHEET_DEFS: Record<SheetSize, { label: string; widthIn: number; heightIn: number; marginIn: number; usableW: number; usableH: number }> = {
  '18x23': { label: '18×23"', widthIn: 23, heightIn: 18, marginIn: 0.5, usableW: 22, usableH: 17 },
  '19x25': { label: '19×25"', widthIn: 25, heightIn: 19, marginIn: 0.5, usableW: 24, usableH: 18 },
};

const SLOT_META: Record<SlotType, { label: string; color: string; bg: string }> = {
  SMALL_5_5x8_5:  { label: '5.5×8.5"', color: '#4f46e5', bg: 'rgba(79,70,229,0.10)' },
  MEDIUM_7_5x8_5: { label: '7.5×8.5"', color: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
  LARGE_8_5x11:   { label: '8.5×11"',  color: '#059669', bg: 'rgba(5,150,105,0.10)' },
  XL_11x17:       { label: '11×17"',   color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
};

const ALL_PATTERNS: SlotPattern[] = [
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
  { id:'19x25_8S',  label:'8× Small',         sheetSize:'19x25', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:8, slotCounts:{ SMALL_5_5x8_5:8 } },
  { id:'19x25_6M',  label:'6× Medium',        sheetSize:'19x25', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:6, slotCounts:{ MEDIUM_7_5x8_5:6 } },
  { id:'19x25_4L',  label:'4× Large',         sheetSize:'19x25', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['LARGE_8_5x11','LARGE_8_5x11']], totalSlots:4, slotCounts:{ LARGE_8_5x11:4 } },
  { id:'19x25_2XL', label:'2× XL (11×18")',   sheetSize:'19x25', rows:[['XL_11x17','XL_11x17']], totalSlots:2, slotCounts:{ XL_11x17:2 } },
];

interface SlotGeo { row:number; col:number; slotType:SlotType; xPx:number; yPx:number; wPx:number; hPx:number; }

function computeGeos(pattern: SlotPattern, cw: number, ch: number): SlotGeo[] {
  const s = SHEET_DEFS[pattern.sheetSize];
  const mx = s.marginIn * (cw / s.widthIn);
  const my = s.marginIn * (ch / s.heightIn);
  const result: SlotGeo[] = [];
  let curY = my;
  for (let r = 0; r < pattern.rows.length; r++) {
    const row = pattern.rows[r];
    const rowHIn = row[0] === 'XL_11x17' ? s.usableH : s.usableH / 2;
    const rowH = rowHIn * (ch / s.heightIn);
    const slotW = s.usableW / row.length * (cw / s.widthIn);
    let curX = mx;
    for (let c = 0; c < row.length; c++) {
      result.push({ row: r, col: c, slotType: row[c], xPx: curX, yPx: curY, wPx: slotW, hPx: rowH });
      curX += slotW;
    }
    curY += rowH;
  }
  return result;
}

// Pre-rotate image buffer on an offscreen canvas → returns a Blob
async function rotateImageBlob(file: File, deg: number): Promise<Blob> {
  if (deg === 0 || deg === 360) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const swap = deg === 90 || deg === 270;
      const w = swap ? img.height : img.width;
      const h = swap ? img.width  : img.height;
      const oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      const ctx = oc.getContext('2d')!;
      ctx.translate(w / 2, h / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      oc.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/jpeg', 0.97);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const ROT_STEPS = [0, 90, 180, 270] as const;
type RotDeg = 0 | 90 | 180 | 270;

function SheetLayoutContent() {
  const [sheetSize, setSheetSize]   = useState<SheetSize>('18x23');
  const [pattern, setPattern]       = useState<SlotPattern | null>(null);
  const [slotImages, setSlotImages] = useState<(string | null)[]>([]);
  const [slotFiles, setSlotFiles]   = useState<(File | null)[]>([]);
  const [rotations, setRotations]   = useState<RotDeg[]>([]);        // per-slot rotation
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patterns = ALL_PATTERNS.filter(p => p.sheetSize === sheetSize);
  const sheet    = SHEET_DEFS[sheetSize];
  const slotList = pattern ? pattern.rows.flatMap((row, r) => row.map((st, c) => ({ r, c, st }))) : [];
  const uploadedCount = slotImages.filter(Boolean).length;

  useEffect(() => {
    if (pattern) {
      setSlotImages(Array(pattern.totalSlots).fill(null));
      setSlotFiles(Array(pattern.totalSlots).fill(null));
      setRotations(Array(pattern.totalSlots).fill(0));
      setActiveSlot(null);
    }
  }, [pattern]);

  // ── rotate a slot (cycle through 0→90→180→270→0) ──
  const cycleRotation = (i: number, dir: 1 | -1 = 1) => {
    setRotations(prev => {
      const next = [...prev];
      const cur = ROT_STEPS.indexOf(prev[i] as RotDeg);
      next[i] = ROT_STEPS[((cur + dir + 4) % 4)] as RotDeg;
      return next;
    });
  };

  const setRotation = (i: number, deg: RotDeg) => {
    setRotations(prev => { const n = [...prev]; n[i] = deg; return n; });
  };

  // ── Draw canvas ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: cw, height: ch } = canvas;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    const geos = computeGeos(pattern, cw, ch);

    const render = (imgs: (HTMLImageElement | null)[]) => {
      geos.forEach((g, i) => {
        const meta = SLOT_META[g.slotType];
        const img  = imgs[i];
        const deg  = rotations[i] ?? 0;

        if (img) {
          const cx = g.xPx + g.wPx / 2;
          const cy = g.yPx + g.hPx / 2;
          const swap = deg === 90 || deg === 270;
          const dw = swap ? g.hPx : g.wPx;
          const dh = swap ? g.wPx : g.hPx;
          ctx.save();
          ctx.rect(g.xPx, g.yPx, g.wPx, g.hPx);  // clip to slot
          ctx.clip();
          ctx.translate(cx, cy);
          ctx.rotate((deg * Math.PI) / 180);
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();

          // rotation badge (top-right)
          if (deg !== 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(g.xPx + g.wPx - 28, g.yPx + 3, 25, 13);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${deg}°`, g.xPx + g.wPx - 15.5, g.yPx + 9.5);
          }
        } else {
          ctx.fillStyle = activeSlot === i ? 'rgba(99,102,241,0.18)' : meta.bg;
          ctx.fillRect(g.xPx, g.yPx, g.wPx, g.hPx);
          ctx.fillStyle = meta.color;
          ctx.font = `bold ${Math.max(8, g.wPx * 0.07)}px monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(meta.label, g.xPx + g.wPx / 2, g.yPx + g.hPx / 2 - g.hPx * 0.08);
          ctx.fillStyle = '#aaa';
          ctx.font = `${Math.max(7, g.wPx * 0.048)}px monospace`;
          ctx.fillText('tap to upload', g.xPx + g.wPx / 2, g.yPx + g.hPx / 2 + g.hPx * 0.1);
        }

        // cut border
        ctx.strokeStyle = activeSlot === i ? '#4f46e5' : 'rgba(200,0,0,0.5)';
        ctx.lineWidth = activeSlot === i ? 1.5 : 0.8;
        ctx.strokeRect(g.xPx + 0.5, g.yPx + 0.5, g.wPx - 1, g.hPx - 1);

        // slot number badge
        ctx.fillStyle = activeSlot === i ? '#4f46e5' : 'rgba(0,0,0,0.3)';
        ctx.fillRect(g.xPx + 3, g.yPx + 3, 16, 13);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), g.xPx + 11, g.yPx + 9.5);
      });
    };

    const imgs: (HTMLImageElement | null)[] = Array(geos.length).fill(null);
    let pending = slotImages.filter(Boolean).length;
    if (!pending) { render(imgs); return; }
    slotImages.forEach((src, i) => {
      if (!src) { pending--; if (!pending) render(imgs); return; }
      const el = new Image();
      el.onload = () => { imgs[i] = el; pending--; if (!pending) render(imgs); };
      el.onerror = () => { pending--; if (!pending) render(imgs); };
      el.src = src;
    });
  }, [pattern, slotImages, activeSlot, rotations]);

  useEffect(() => { draw(); }, [draw]);

  // ── Canvas click → select slot ──
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const geos = computeGeos(pattern, canvas.width, canvas.height);
    const hit = geos.findIndex(g => x >= g.xPx && x <= g.xPx + g.wPx && y >= g.yPx && y <= g.yPx + g.hPx);
    if (hit >= 0) { setActiveSlot(hit); fileInputRef.current?.click(); }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeSlot !== null) {
      const url = URL.createObjectURL(file);
      setSlotImages(p => { const n = [...p]; n[activeSlot] = url; return n; });
      setSlotFiles(p => { const n = [...p]; n[activeSlot] = file; return n; });
    }
    e.target.value = '';
  };

  // ── Download — pre-rotate each image before upload ──
  const handleDownload = async () => {
    if (!pattern || !slotFiles.some(Boolean)) return;
    setIsGenerating(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < slotFiles.length; i++) {
        const f = slotFiles[i];
        if (!f) continue;
        const deg = rotations[i] ?? 0;
        const blob = await rotateImageBlob(f, deg);
        fd.append('slots', blob, `slot_${i}.jpg`);
      }
      const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${API}/sheet-layout/assemble?patternId=${pattern.id}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Sheet-${pattern.id}-600dpi.jpg`;
      a.click();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const aspect = sheet.widthIn / sheet.heightIn;

  // ── Rotation button strip ──
  const RotBtns = ({ idx }: { idx: number }) => {
    const cur = rotations[idx] ?? 0;
    return (
      <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
        {ROT_STEPS.map(deg => (
          <button key={deg} onClick={e => { e.stopPropagation(); setRotation(idx, deg as RotDeg); }}
            title={`Rotate ${deg}°`}
            style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, border: `1px solid ${cur === deg ? '#4f46e5' : '#e5e7eb'}`, background: cur === deg ? '#4f46e5' : '#f9fafb', color: cur === deg ? '#fff' : '#6b7280', cursor: 'pointer', fontWeight: cur === deg ? 700 : 400, lineHeight: 1.5 }}>
            {deg}°
          </button>
        ))}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Mono','Courier New',monospace", height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#111' }}>Sheet Layout Composer</span>
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 10, letterSpacing: '0.04em' }}>600 DPI · HIGH QUALITY JPG · PRINT-READY</span>
        </div>
        {pattern && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{uploadedCount}/{pattern.totalSlots} uploaded</span>
            <div style={{ width: 80, height: 4, background: '#e5e7eb', borderRadius: 2 }}>
              <div style={{ height: '100%', background: '#4f46e5', borderRadius: 2, width: `${pattern.totalSlots ? (uploadedCount / pattern.totalSlots) * 100 : 0}%`, transition: 'width 0.2s' }} />
            </div>
            <button onClick={handleDownload} disabled={!slotFiles.some(Boolean) || isGenerating}
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 16px', borderRadius: 6, border: 'none', cursor: slotFiles.some(Boolean) && !isGenerating ? 'pointer' : 'not-allowed', background: slotFiles.some(Boolean) && !isGenerating ? '#111' : '#e5e7eb', color: slotFiles.some(Boolean) && !isGenerating ? '#fff' : '#9ca3af', transition: 'all 0.15s' }}>
              {isGenerating ? '⏳ Building…' : '⬇ Download JPG'}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ width: 256, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Sheet size */}
          <div style={{ padding: '8px 10px 7px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Sheet Size</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['18x23', '19x25'] as SheetSize[]).map(sz => (
                <button key={sz} onClick={() => { setSheetSize(sz); setPattern(null); }}
                  style={{ flex: 1, padding: '5px 4px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: `1.5px solid ${sheetSize === sz ? '#4f46e5' : '#e5e7eb'}`, background: sheetSize === sz ? '#eef2ff' : '#f9fafb', color: sheetSize === sz ? '#4f46e5' : '#374151', cursor: 'pointer' }}>
                  {SHEET_DEFS[sz].label}
                </button>
              ))}
            </div>
          </div>

          {/* Pattern list */}
          <div style={{ padding: '7px 10px 4px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Layout Pattern</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 6px 4px' }}>
            {patterns.map(p => {
              const active = pattern?.id === p.id;
              return (
                <button key={p.id} onClick={() => setPattern(p)}
                  style={{ width: '100%', textAlign: 'left', padding: '5px 6px', marginBottom: 2, borderRadius: 5, border: `1px solid ${active ? '#4f46e5' : 'transparent'}`, background: active ? '#eef2ff' : 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#4f46e5' : '#374151', marginBottom: 2 }}>{p.label}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {(Object.entries(p.slotCounts) as [SlotType, number][]).map(([st, cnt]) => (
                      <span key={st} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: SLOT_META[st].bg, color: SLOT_META[st].color, fontWeight: 600 }}>
                        {cnt}×{SLOT_META[st].label}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Slot upload + rotation list */}
          {pattern && (
            <>
              <div style={{ padding: '6px 10px 4px', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Designs · Rotate</div>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 210, padding: '3px 6px 4px' }}>
                {slotList.map((s, i) => {
                  const meta = SLOT_META[s.st];
                  const has  = !!slotImages[i];
                  const isActive = activeSlot === i;
                  return (
                    <div key={i} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${isActive ? '#4f46e5' : '#f3f4f6'}`, background: isActive ? '#eef2ff' : '#fafafa', padding: '4px 6px' }}>
                      {/* Row 1: badge + name + upload btn */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 3, background: has ? '#059669' : meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {has ? '✓' : i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Slot {i + 1} · {meta.label}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                            {has ? (slotFiles[i]?.name ?? 'uploaded') : 'no design'}
                          </div>
                        </div>
                        <button onClick={() => { setActiveSlot(i); fileInputRef.current?.click(); }}
                          style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                          {has ? '↑' : '+'}
                        </button>
                      </div>
                      {/* Row 2: rotation buttons (always visible) */}
                      <RotBtns idx={i} />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Specs footer */}
          {pattern && (
            <div style={{ borderTop: '1px solid #f3f4f6', padding: '6px 10px', flexShrink: 0 }}>
              {[
                [`${sheet.widthIn}"×${sheet.heightIn}"`, `Usable ${sheet.usableW}"×${sheet.usableH}"`],
                [`${pattern.totalSlots} slots`, '2mm gap · 0.5" margin'],
                ['600 DPI', 'JPG · print-ready'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{k}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CANVAS PANEL ── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 12, overflow: 'hidden' }}>
          {!pattern ? (
            <div style={{ textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📐</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Select sheet size + layout</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Preview will appear here</div>
            </div>
          ) : (
            <div style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.13)', borderRadius: 4, overflow: 'hidden', maxHeight: '100%', maxWidth: '100%', aspectRatio: `${aspect}`, cursor: 'crosshair' }}>
              <canvas
                ref={canvasRef}
                width={900}
                height={Math.round(900 / aspect)}
                onClick={handleCanvasClick}
                style={{ display: 'block', width: '100%', height: '100%', maxHeight: 'calc(100vh - 90px)' }}
              />
            </div>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handleFileInput} style={{ display: 'none' }} />
    </div>
  );
}

export default function SheetLayout() {
  return <DashboardShell><SheetLayoutContent /></DashboardShell>;
}
