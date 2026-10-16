'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardShell } from '@/components/dashboard-shell';
import { API_BASE_URL } from '@/lib/api';
import {
  listSavedSheets, getSavedSheet, putSavedSheet, deleteSavedSheet, newSheetId, formatBytes,
  listDesignSizes, storeDesignSizes, formatDesignSize, isValidDesignSize, MAX_DESIGN_SIZE_IN,
  type SavedSheetSummary, type DesignSize, type SavedDesignSize,
} from '@/lib/sheetLayoutStore';

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

/** Real physical width/height (inches) per slot type — mirrors backend SLOT_TYPES.
 *  Used to give each slot its true footprint instead of splitting a row's
 *  columns evenly (which only happens to be correct when every slot in the
 *  row is the same type). */
const SLOT_DIMS: Record<SlotType, { wIn: number; hIn: number }> = {
  SMALL_5_5x8_5:  { wIn: 5.5,    hIn: 8.5 },
  MEDIUM_7_5x8_5: { wIn: 7.3333, hIn: 8.5 },
  LARGE_8_5x11:   { wIn: 11.0,   hIn: 8.5 },
  XL_11x17:       { wIn: 11.0,   hIn: 17.0 },
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
  { id:'18x23_3M_2S_1L', label:'3× Medium + 2× Small + 1× Large', sheetSize:'18x23', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','LARGE_8_5x11']], totalSlots:6, slotCounts:{ MEDIUM_7_5x8_5:3, SMALL_5_5x8_5:2, LARGE_8_5x11:1 } },
  { id:'18x23_2L_3M',   label:'2× Large + 3× Medium',   sheetSize:'18x23', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:5, slotCounts:{ LARGE_8_5x11:2, MEDIUM_7_5x8_5:3 } },
  { id:'18x23_1L2S_x2', label:'2× (1 Large + 2 Small)', sheetSize:'18x23', rows:[['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5'],['LARGE_8_5x11','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:6, slotCounts:{ LARGE_8_5x11:2, SMALL_5_5x8_5:4 } },
  { id:'18x23_6S_1L',   label:'6× Small + 1× Large',    sheetSize:'18x23', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','LARGE_8_5x11']], totalSlots:7, slotCounts:{ SMALL_5_5x8_5:6, LARGE_8_5x11:1 } },
  { id:'19x25_8S',  label:'8× Small',       sheetSize:'19x25', rows:[['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5'],['SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5','SMALL_5_5x8_5']], totalSlots:8, slotCounts:{ SMALL_5_5x8_5:8 } },
  { id:'19x25_6M',  label:'6× Medium',      sheetSize:'19x25', rows:[['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5'],['MEDIUM_7_5x8_5','MEDIUM_7_5x8_5','MEDIUM_7_5x8_5']], totalSlots:6, slotCounts:{ MEDIUM_7_5x8_5:6 } },
  { id:'19x25_4L',  label:'4× Large',       sheetSize:'19x25', rows:[['LARGE_8_5x11','LARGE_8_5x11'],['LARGE_8_5x11','LARGE_8_5x11']], totalSlots:4, slotCounts:{ LARGE_8_5x11:4 } },
  { id:'19x25_2XL', label:'2× XL (11×18")', sheetSize:'19x25', rows:[['XL_11x17','XL_11x17']], totalSlots:2, slotCounts:{ XL_11x17:2 } },
];

interface SlotGeo { row:number; col:number; slotType:SlotType; xPx:number; yPx:number; wPx:number; hPx:number; }

/** Mirror of backend geometry — gapMm in mm, canvas coords */
function computeGeos(pattern: SlotPattern, cw: number, ch: number, gapMm: number): SlotGeo[] {
  const s    = SHEET_DEFS[pattern.sheetSize];
  const scX  = cw / s.widthIn;
  const scY  = ch / s.heightIn;
  const mx   = s.marginIn * scX;
  const my   = s.marginIn * scY;
  // gap in canvas pixels (scale from inches: 1mm = 1/25.4 inch)
  const gapX = gapMm / 25.4 * scX;
  const gapY = gapMm / 25.4 * scY;
  const result: SlotGeo[] = [];
  let curY = my;

  for (let r = 0; r < pattern.rows.length; r++) {
    const row      = pattern.rows[r];
    const numRows  = pattern.rows.length;
    const numCols  = row.length;
    const rowHIn   = row[0] === 'XL_11x17' ? s.usableH : s.usableH / 2;
    const rowH     = rowHIn * scY - ((numRows - 1) * gapY) / numRows;

    // Column widths follow each slot's real physical width, scaled so the
    // row still fills the usable width exactly — not an equal split, which
    // only matches reality when every slot in the row is the same size.
    const rawWIn  = row.map(st => SLOT_DIMS[st].wIn);
    const sumWIn  = rawWIn.reduce((a, b) => a + b, 0);
    const scale   = sumWIn > 0 ? s.usableW / sumWIn : 1;
    let curX = mx;

    for (let c = 0; c < numCols; c++) {
      const slotW = rawWIn[c] * scale * scX - ((numCols - 1) * gapX) / numCols;
      result.push({ row: r, col: c, slotType: row[c], xPx: curX, yPx: curY, wPx: slotW, hPx: rowH });
      curX += slotW + gapX;
    }
    curY += rowH + gapY;
  }
  return result;
}

async function rotateBlob(file: File, deg: number): Promise<Blob> {
  if (!deg || deg === 360) return file;
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const swap = deg === 90 || deg === 270;
      const oc = document.createElement('canvas');
      oc.width  = swap ? img.height : img.width;
      oc.height = swap ? img.width  : img.height;
      const ctx = oc.getContext('2d')!;
      ctx.translate(oc.width / 2, oc.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      oc.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.95);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

/** Places an already-rotated design onto a white slot-sized canvas at its true
 *  printed footprint, centred (anything larger than the slot is cropped). The
 *  result matches the slot's pixel size, so the backend's fill-resize leaves it
 *  undistorted — no backend change needed for custom design sizes. */
async function placeInSlot(src: Blob, slotWPx: number, slotHPx: number, footWPx: number, footHPx: number): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(src);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const oc = document.createElement('canvas');
      oc.width = slotWPx; oc.height = slotHPx;
      const ctx = oc.getContext('2d');
      if (!ctx) { rej(new Error('Canvas unavailable')); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, slotWPx, slotHPx);
      ctx.drawImage(img, (slotWPx - footWPx) / 2, (slotHPx - footHPx) / 2, footWPx, footHPx);
      oc.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.95);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read a design image')); };
    img.src = url;
  });
}

/** Footprint on the sheet: a 90°/270° turn swaps the design's width and height. */
const footprint = (size: DesignSize, deg: number): DesignSize =>
  deg === 90 || deg === 270 ? { wIn: size.hIn, hIn: size.wIn } : size;

const sizeKey = (s: DesignSize | null) => s ? `${s.wIn}x${s.hIn}` : '';
const PRINT_DPI = 600; // mirrors backend sheet-layout.service DPI

const ROT_STEPS = [0, 90, 180, 270] as const;
type RotDeg = 0 | 90 | 180 | 270;
const GAP_PRESETS = [0, 1, 2, 3, 5] as const;

function SheetLayoutContent() {
  const [sheetSize, setSheetSize]   = useState<SheetSize>('18x23');
  const [pattern,   setPattern]     = useState<SlotPattern | null>(null);
  const [slotImages, setSlotImages] = useState<(string | null)[]>([]);
  const [slotFiles,  setSlotFiles]  = useState<(File | null)[]>([]);
  const [rotations,  setRotations]  = useState<RotDeg[]>([]);
  const [gapMm,      setGapMm]      = useState<number>(2);
  const [sheetNumber, setSheetNumber] = useState<string>('');
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedSheets, setSavedSheets] = useState<SavedSheetSummary[]>([]);
  const [savingSheet, setSavingSheet] = useState(false);
  const [loadedSheetId, setLoadedSheetId] = useState<string | null>(null);
  const [slotSizes, setSlotSizes] = useState<(DesignSize | null)[]>([]);
  const [designSizes, setDesignSizes] = useState<SavedDesignSize[]>([]);
  const [newSizeW, setNewSizeW] = useState('');
  const [newSizeH, setNewSizeH] = useState('');

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set to the pattern a saved sheet is being loaded into, so the effect below
  // keeps that sheet's restored slots instead of blanking them.
  const skipPatternResetRef = useRef<SlotPattern | null>(null);

  const patterns      = ALL_PATTERNS.filter(p => p.sheetSize === sheetSize);
  const sheet         = SHEET_DEFS[sheetSize];
  const slotList      = pattern ? pattern.rows.flatMap((row, r) => row.map((st, c) => ({ r, c, st }))) : [];
  const uploadedCount = slotImages.filter(Boolean).length;
  // Slot sizes in inches (1 canvas unit = 1 inch) — used to warn when a chosen
  // design size is bigger than its slot.
  const slotInches    = pattern ? computeGeos(pattern, SHEET_DEFS[pattern.sheetSize].widthIn, SHEET_DEFS[pattern.sheetSize].heightIn, gapMm) : [];

  useEffect(() => { setDesignSizes(listDesignSizes()); }, []);

  useEffect(() => {
    if (!pattern) return;
    // A sheet just loaded from the saved list already populated these.
    if (skipPatternResetRef.current === pattern) { skipPatternResetRef.current = null; return; }
    setSlotImages(Array(pattern.totalSlots).fill(null));
    setSlotFiles(Array(pattern.totalSlots).fill(null));
    setRotations(Array(pattern.totalSlots).fill(0));
    setSlotSizes(Array(pattern.totalSlots).fill(null));
    setActiveSlot(null);
  }, [pattern]);

  const setRotation = (i: number, deg: RotDeg) =>
    setRotations(prev => { const n = [...prev]; n[i] = deg; return n; });

  const setSlotSize = (i: number, size: DesignSize | null) =>
    setSlotSizes(prev => { const n = [...prev]; n[i] = size; return n; });

  const addDesignSize = () => {
    const wIn = Math.round(parseFloat(newSizeW) * 1000) / 1000;
    const hIn = Math.round(parseFloat(newSizeH) * 1000) / 1000;
    if (!isValidDesignSize({ wIn, hIn })) {
      alert(`Enter a width and height in inches, each above 0 and up to ${MAX_DESIGN_SIZE_IN}.`);
      return;
    }
    if (designSizes.some(s => s.wIn === wIn && s.hIn === hIn)) { setNewSizeW(''); setNewSizeH(''); return; }
    const next = [...designSizes, { id: newSheetId(), wIn, hIn }];
    setDesignSizes(next); storeDesignSizes(next);
    setNewSizeW(''); setNewSizeH('');
  };

  const removeDesignSize = (id: string) => {
    // Slots already using this size keep it — only the saved shortcut goes.
    const next = designSizes.filter(s => s.id !== id);
    setDesignSizes(next); storeDesignSizes(next);
  };

  // ── Canvas draw ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: cw, height: ch } = canvas;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    // Draw gap areas as light grey background (so gap is visible in preview)
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, cw, ch);
    // white sheet area
    const s  = SHEET_DEFS[pattern.sheetSize];
    const mx = s.marginIn * (cw / s.widthIn);
    const my = s.marginIn * (ch / s.heightIn);
    const uw = s.usableW * (cw / s.widthIn);
    const uh = s.usableH * (ch / s.heightIn);
    ctx.fillStyle = '#f9fafb'; ctx.fillRect(mx, my, uw, uh);

    const geos = computeGeos(pattern, cw, ch, gapMm);
    // fixed-size preview badges/borders scale with canvas resolution (baseline 900px wide)
    const ui = cw / 900;

    const render = (imgs: (HTMLImageElement | null)[]) => {
      geos.forEach((g, i) => {
        const meta = SLOT_META[g.slotType];
        const img  = imgs[i];
        const deg  = rotations[i] ?? 0;
        const isAct = activeSlot === i;
        const size = slotSizes[i] ?? null;

        if (img) {
          const swap = deg === 90 || deg === 270;
          // Fixed design size → its true inches (pre-rotation), centred; else stretch to fill.
          const dw   = size ? size.wIn * (cw / s.widthIn) : swap ? g.hPx : g.wPx;
          const dh   = size ? size.hIn * (ch / s.heightIn) : swap ? g.wPx : g.hPx;
          ctx.save();
          ctx.beginPath();
          ctx.rect(g.xPx, g.yPx, g.wPx, g.hPx);
          ctx.clip();
          ctx.translate(g.xPx + g.wPx / 2, g.yPx + g.hPx / 2);
          ctx.rotate((deg * Math.PI) / 180);
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
          // rotation badge
          if (deg) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(g.xPx + g.wPx - 29 * ui, g.yPx + 3 * ui, 26 * ui, 13 * ui);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${8 * ui}px monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${deg}°`, g.xPx + g.wPx - 16 * ui, g.yPx + 9.5 * ui);
          }
        } else {
          ctx.fillStyle = isAct ? 'rgba(99,102,241,0.18)' : meta.bg;
          ctx.fillRect(g.xPx, g.yPx, g.wPx, g.hPx);
          ctx.fillStyle = meta.color;
          ctx.font = `bold ${Math.max(8, g.wPx * 0.07)}px monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(meta.label, g.xPx + g.wPx / 2, g.yPx + g.hPx / 2 - g.hPx * 0.08);
          ctx.fillStyle = '#aaa';
          ctx.font = `${Math.max(7, g.wPx * 0.048)}px monospace`;
          ctx.fillText('tap to upload', g.xPx + g.wPx / 2, g.yPx + g.hPx / 2 + g.hPx * 0.1);
        }

        // Slot border — subtle grey, active = indigo (NO red lines)
        ctx.strokeStyle = isAct ? '#4f46e5' : 'rgba(150,150,150,0.35)';
        ctx.lineWidth   = (isAct ? 1.5 : 0.6) * ui;
        ctx.strokeRect(g.xPx + 0.5, g.yPx + 0.5, g.wPx - 1, g.hPx - 1);

        // Slot number badge
        ctx.fillStyle = isAct ? '#4f46e5' : 'rgba(0,0,0,0.28)';
        ctx.fillRect(g.xPx + 3 * ui, g.yPx + 3 * ui, 16 * ui, 13 * ui);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${8 * ui}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), g.xPx + 11 * ui, g.yPx + 9.5 * ui);
      });
    };

    const imgs: (HTMLImageElement | null)[] = Array(geos.length).fill(null);
    let pending = slotImages.filter(Boolean).length;
    if (!pending) { render(imgs); return; }
    slotImages.forEach((src, i) => {
      if (!src) { pending--; if (!pending) render(imgs); return; }
      const el = new Image();
      el.onload  = () => { imgs[i] = el; pending--; if (!pending) render(imgs); };
      el.onerror = () => {               pending--; if (!pending) render(imgs); };
      el.src = src;
    });
  }, [pattern, slotImages, activeSlot, rotations, gapMm, slotSizes]);

  useEffect(() => { draw(); }, [draw]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pattern) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const geos = computeGeos(pattern, canvas.width, canvas.height, gapMm);
    const hit = geos.findIndex(g => x >= g.xPx && x <= g.xPx + g.wPx && y >= g.yPx && y <= g.yPx + g.hPx);
    if (hit >= 0) { setActiveSlot(hit); fileInputRef.current?.click(); }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeSlot !== null) {
      setSlotImages(p => { const n = [...p]; n[activeSlot] = URL.createObjectURL(file); return n; });
      setSlotFiles(p  => { const n = [...p]; n[activeSlot] = file; return n; });
    }
    e.target.value = '';
  };

  const safeSheetName = sheetNumber.trim().replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 60);
  const downloadFileName = safeSheetName
    ? `Sheet-${safeSheetName}-600dpi.jpg`
    : `Sheet-${pattern?.id ?? 'layout'}-600dpi.jpg`;

  // ── Saved sheets (this browser only — see lib/sheetLayoutStore.ts) ──
  const refreshSavedSheets = useCallback(async () => {
    try { setSavedSheets(await listSavedSheets()); }
    catch { /* a browser with IndexedDB blocked just shows an empty list */ }
  }, []);

  useEffect(() => { void refreshSavedSheets(); }, [refreshSavedSheets]);

  const saveCurrentSheet = async () => {
    if (!pattern) return;
    const name = sheetNumber.trim();
    if (!name) {
      alert('Enter a Sheet Number first — that is the name the sheet is saved under.');
      return;
    }
    const existing = savedSheets.find(s => s.name.toLowerCase() === name.toLowerCase());
    // Only ask before writing over a DIFFERENT sheet. Pressing "Save changes"
    // on the sheet you already have open is not an overwrite worth a prompt.
    const wouldReplaceAnother = !!existing && existing.id !== loadedSheetId;
    if (wouldReplaceAnother && !window.confirm(`A saved sheet named "${name}" already exists. Replace it?`)) return;
    setSavingSheet(true);
    try {
      await putSavedSheet({
        id: existing?.id ?? newSheetId(),
        name,
        sheetSize,
        patternId: pattern.id,
        gapMm,
        rotations: rotations.slice(),
        sizes: slotSizes.slice(),
        // The ORIGINAL uploaded files, unrotated — rotation stays a separate
        // setting so a reopened sheet is still editable, and re-downloading
        // rebuilds the same 600 DPI JPG the live composer would.
        slots: slotFiles.map(f => f ? { fileName: f.name, type: f.type || 'image/jpeg', blob: f } : null),
        updatedAt: Date.now(),
      });
      setLoadedSheetId(existing?.id ?? null);
      await refreshSavedSheets();
    } catch (err) {
      alert(`Could not save this sheet: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSavingSheet(false); }
  };

  const loadSavedSheet = async (id: string) => {
    try {
      const saved = await getSavedSheet(id);
      if (!saved) { alert('That saved sheet is no longer available.'); await refreshSavedSheets(); return; }
      const p = ALL_PATTERNS.find(x => x.id === saved.patternId);
      if (!p) { alert(`This sheet used layout "${saved.patternId}", which no longer exists.`); return; }
      // Rebuild to the pattern's CURRENT slot count — layout patterns are code
      // constants and can gain/lose slots between releases, and a mismatched
      // array length would break the canvas draw.
      const files = Array.from({ length: p.totalSlots }, (_, i) => {
        const slot = saved.slots[i];
        return slot ? new File([slot.blob], slot.fileName, { type: slot.type || 'image/jpeg' }) : null;
      });
      // Tell the pattern-change effect below to keep these instead of clearing them.
      skipPatternResetRef.current = p;
      setSheetSize(saved.sheetSize as SheetSize);
      setPattern(p);
      setGapMm(saved.gapMm);
      setSheetNumber(saved.name);
      setRotations(Array.from({ length: p.totalSlots }, (_, i) => (saved.rotations[i] ?? 0) as RotDeg));
      setSlotSizes(Array.from({ length: p.totalSlots }, (_, i) => {
        const sz = saved.sizes?.[i];
        return isValidDesignSize(sz) ? { wIn: sz.wIn, hIn: sz.hIn } : null;
      }));
      setSlotFiles(files);
      setSlotImages(files.map(f => f ? URL.createObjectURL(f) : null));
      setActiveSlot(null);
      setLoadedSheetId(id);
    } catch (err) {
      alert(`Could not open that sheet: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const removeSavedSheet = async (id: string, name: string) => {
    if (!window.confirm(`Delete saved sheet "${name}"? This cannot be undone.`)) return;
    try {
      await deleteSavedSheet(id);
      if (loadedSheetId === id) setLoadedSheetId(null);
      await refreshSavedSheets();
    } catch (err) {
      alert(`Could not delete that sheet: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDownload = async () => {
    if (!pattern || !slotFiles.some(Boolean)) return;
    setIsGenerating(true);
    try {
      const fd = new FormData();
      const s = SHEET_DEFS[pattern.sheetSize];
      const printGeos = computeGeos(pattern, s.widthIn * PRINT_DPI, s.heightIn * PRINT_DPI, gapMm);
      for (let i = 0; i < slotFiles.length; i++) {
        const f = slotFiles[i]; if (!f) continue;
        const deg = rotations[i] ?? 0;
        let blob = await rotateBlob(f, deg);
        const size = slotSizes[i];
        const g = printGeos[i];
        if (size && g) {
          const fp = footprint(size, deg);
          blob = await placeInSlot(blob, Math.round(g.wPx), Math.round(g.hPx),
            Math.round(fp.wIn * PRINT_DPI), Math.round(fp.hIn * PRINT_DPI));
        }
        fd.append('slots', blob, `slot_${i}.jpg`);
      }
      const res = await fetch(`${API_BASE_URL}/sheet-layout/assemble?patternId=${pattern.id}&gapMm=${gapMm}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = downloadFileName; a.click();
    } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
    finally { setIsGenerating(false); }
  };

  const aspect = sheet.widthIn / sheet.heightIn;

  return (
    <div className="sheet-layout-root" style={{ fontFamily:"'DM Mono','Courier New',monospace", height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', background:'#f8fafc' }}>

      {/* ── Header ── */}
      <div className="sheet-layout-header" style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <span style={{ fontSize:13, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'#111' }}>Sheet Layout Composer</span>
          <span style={{ fontSize:11, color:'#9ca3af', marginLeft:10 }}>600 DPI · JPG · TARGET ~25MB</span>
        </div>
        {pattern && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:11, color:'#6b7280' }}>{uploadedCount}/{pattern.totalSlots} uploaded</span>
            <div style={{ width:80, height:4, background:'#e5e7eb', borderRadius:2 }}>
              <div style={{ height:'100%', background:'#4f46e5', borderRadius:2, width:`${pattern.totalSlots?(uploadedCount/pattern.totalSlots)*100:0}%`, transition:'width 0.2s' }} />
            </div>
            <button onClick={handleDownload} disabled={!slotFiles.some(Boolean)||isGenerating}
              style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', padding:'6px 16px', borderRadius:6, border:'none', cursor:slotFiles.some(Boolean)&&!isGenerating?'pointer':'not-allowed', background:slotFiles.some(Boolean)&&!isGenerating?'#111':'#e5e7eb', color:slotFiles.some(Boolean)&&!isGenerating?'#fff':'#9ca3af' }}>
              {isGenerating ? '⏳ Building…' : '⬇ Download 600 DPI JPG'}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="sheet-layout-body" style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── LEFT PANEL ── */}
        <div className="sheet-layout-sidebar" style={{ width:256, flexShrink:0, borderRight:'1px solid #e5e7eb', background:'#fff', display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Sheet number */}
          <div style={{ padding:'8px 10px 7px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:5 }}>Sheet Number</div>
            <input type="text" value={sheetNumber} maxLength={60} placeholder="e.g. 001 or MED-12"
              onChange={e => setSheetNumber(e.target.value)}
              style={{ width:'100%', boxSizing:'border-box', padding:'5px 7px', fontSize:12, fontWeight:700, fontFamily:'inherit', borderRadius:6, border:`1.5px solid ${sheetNumber.trim()?'#4f46e5':'#e5e7eb'}`, background:sheetNumber.trim()?'#eef2ff':'#f9fafb', color:'#374151', outline:'none' }}
            />
            {!!pattern && (
              <div style={{ fontSize:9, color:'#9ca3af', marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                Saves as {downloadFileName}
              </div>
            )}
          </div>

          {/* Saved sheets — re-openable, editable copies kept in this browser */}
          <div style={{ padding:'7px 10px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase' }}>Saved Sheets</div>
              {savedSheets.length > 0 && <span style={{ fontSize:9, color:'#9ca3af' }}>{savedSheets.length}</span>}
            </div>
            <button onClick={saveCurrentSheet} disabled={!pattern || savingSheet}
              title={pattern ? 'Save this sheet so it can be reopened and edited later' : 'Pick a layout first'}
              style={{ width:'100%', padding:'5px 7px', fontSize:11, fontWeight:700, fontFamily:'inherit', borderRadius:6, border:'1.5px solid #4f46e5', background:pattern&&!savingSheet?'#4f46e5':'#e5e7eb', color:pattern&&!savingSheet?'#fff':'#9ca3af', borderColor:pattern&&!savingSheet?'#4f46e5':'#e5e7eb', cursor:pattern&&!savingSheet?'pointer':'not-allowed' }}>
              {savingSheet ? 'Saving…' : loadedSheetId ? '💾 Save changes' : '💾 Save sheet'}
            </button>
            {savedSheets.length > 0 && (
              <div style={{ maxHeight:124, overflowY:'auto', marginTop:5 }}>
                {savedSheets.map(s => {
                  const isOpen = loadedSheetId === s.id;
                  return (
                    <div key={s.id} style={{ display:'flex', alignItems:'stretch', gap:3, marginBottom:3 }}>
                      <button onClick={() => loadSavedSheet(s.id)} title="Open this sheet for editing"
                        style={{ flex:1, minWidth:0, textAlign:'left', padding:'4px 6px', borderRadius:5, border:`1px solid ${isOpen?'#4f46e5':'#e5e7eb'}`, background:isOpen?'#eef2ff':'#f9fafb', cursor:'pointer', fontFamily:'inherit' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:isOpen?'#4f46e5':'#374151', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                        <div style={{ fontSize:9, color:'#9ca3af', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {s.filledCount}/{s.slotCount} designs · {formatBytes(s.bytes)} · {new Date(s.updatedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                        </div>
                      </button>
                      <button onClick={() => removeSavedSheet(s.id, s.name)} title="Delete this saved sheet"
                        style={{ width:22, flexShrink:0, borderRadius:5, border:'1px solid #e5e7eb', background:'#fff', color:'#9ca3af', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:4, lineHeight:1.35 }}>
              Kept on this PC in this browser — not shared with other users.
            </div>
          </div>

          {/* Sheet size */}
          <div style={{ padding:'8px 10px 7px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:5 }}>Sheet Size</div>
            <div style={{ display:'flex', gap:5 }}>
              {(['18x23','19x25'] as SheetSize[]).map(sz => (
                <button key={sz} onClick={() => { setSheetSize(sz); skipPatternResetRef.current = null; setPattern(null); }}
                  style={{ flex:1, padding:'5px 4px', fontSize:12, fontWeight:700, borderRadius:6, border:`1.5px solid ${sheetSize===sz?'#4f46e5':'#e5e7eb'}`, background:sheetSize===sz?'#eef2ff':'#f9fafb', color:sheetSize===sz?'#4f46e5':'#374151', cursor:'pointer' }}>
                  {SHEET_DEFS[sz].label}
                </button>
              ))}
            </div>
          </div>

          {/* Gap setting */}
          <div style={{ padding:'7px 10px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:5 }}>Gap Between Designs</div>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              {GAP_PRESETS.map(g => (
                <button key={g} onClick={() => setGapMm(g)}
                  style={{ flex:1, padding:'4px 2px', fontSize:11, fontWeight:700, borderRadius:5, border:`1.5px solid ${gapMm===g?'#4f46e5':'#e5e7eb'}`, background:gapMm===g?'#eef2ff':'#f9fafb', color:gapMm===g?'#4f46e5':'#374151', cursor:'pointer' }}>
                  {g}mm
                </button>
              ))}
              {/* Custom input */}
              <input type="number" min="0" max="20" step="0.5" value={gapMm}
                onChange={e => setGapMm(Math.max(0, Math.min(20, parseFloat(e.target.value)||0)))}
                style={{ width:44, padding:'4px 4px', fontSize:11, fontWeight:700, borderRadius:5, border:`1.5px solid ${GAP_PRESETS.includes(gapMm as typeof GAP_PRESETS[number])?'#e5e7eb':'#4f46e5'}`, textAlign:'center', color:'#374151', outline:'none' }}
              />
            </div>
          </div>

          {/* Saved design sizes — pick one per slot below to print at that exact size */}
          <div style={{ padding:'7px 10px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:5 }}>Design Sizes (inches)</div>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <input type="number" min="0" max={MAX_DESIGN_SIZE_IN} step="0.01" value={newSizeW} placeholder="W"
                onChange={e => setNewSizeW(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDesignSize(); }}
                style={{ width:0, flex:1, padding:'4px 4px', fontSize:11, fontWeight:700, borderRadius:5, border:'1.5px solid #e5e7eb', textAlign:'center', color:'#374151', outline:'none' }} />
              <span style={{ fontSize:11, color:'#9ca3af' }}>×</span>
              <input type="number" min="0" max={MAX_DESIGN_SIZE_IN} step="0.01" value={newSizeH} placeholder="H"
                onChange={e => setNewSizeH(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDesignSize(); }}
                style={{ width:0, flex:1, padding:'4px 4px', fontSize:11, fontWeight:700, borderRadius:5, border:'1.5px solid #e5e7eb', textAlign:'center', color:'#374151', outline:'none' }} />
              <button onClick={addDesignSize} disabled={!newSizeW || !newSizeH}
                style={{ padding:'4px 8px', fontSize:11, fontWeight:700, borderRadius:5, border:'none', background:newSizeW&&newSizeH?'#4f46e5':'#e5e7eb', color:newSizeW&&newSizeH?'#fff':'#9ca3af', cursor:newSizeW&&newSizeH?'pointer':'not-allowed' }}>
                Save
              </button>
            </div>
            {designSizes.length > 0 ? (
              <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginTop:5 }}>
                {designSizes.map(ds => (
                  <span key={ds.id} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:600, padding:'1px 2px 1px 6px', borderRadius:3, background:'#eef2ff', color:'#4f46e5' }}>
                    {formatDesignSize(ds)}
                    <button onClick={() => removeDesignSize(ds.id)} title="Remove this saved size"
                      style={{ border:'none', background:'transparent', color:'#9ca3af', cursor:'pointer', fontSize:10, padding:'0 2px' }}>✕</button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize:9, color:'#9ca3af', marginTop:4, lineHeight:1.35 }}>
                Save sizes here, then choose one on any slot to print the design at that size instead of stretching it.
              </div>
            )}
          </div>

          {/* Pattern list */}
          <div style={{ padding:'6px 10px 4px', borderBottom:'1px solid #f3f4f6', flexShrink:0 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase' }}>Layout Pattern</div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'2px 6px 4px' }}>
            {patterns.map(p => {
              const active = pattern?.id === p.id;
              return (
                <button key={p.id} onClick={() => { skipPatternResetRef.current = null; setPattern(p); }}
                  style={{ width:'100%', textAlign:'left', padding:'5px 6px', marginBottom:2, borderRadius:5, border:`1px solid ${active?'#4f46e5':'transparent'}`, background:active?'#eef2ff':'transparent', cursor:'pointer' }}
                  onMouseEnter={e=>{ if(!active)(e.currentTarget as HTMLElement).style.background='#f9fafb'; }}
                  onMouseLeave={e=>{ if(!active)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                  <div style={{ fontSize:12, fontWeight:active?700:500, color:active?'#4f46e5':'#374151', marginBottom:2 }}>{p.label}</div>
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                    {(Object.entries(p.slotCounts) as [SlotType,number][]).map(([st,cnt]) => (
                      <span key={st} style={{ fontSize:10, padding:'1px 5px', borderRadius:3, background:SLOT_META[st].bg, color:SLOT_META[st].color, fontWeight:600 }}>
                        {cnt}×{SLOT_META[st].label}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Slot list + rotation */}
          {pattern && (
            <>
              <div style={{ padding:'5px 10px 3px', borderTop:'1px solid #f3f4f6', borderBottom:'1px solid #f3f4f6', flexShrink:0 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase' }}>Designs · Rotate</div>
              </div>
              <div style={{ overflowY:'auto', maxHeight:200, padding:'3px 6px 4px' }}>
                {slotList.map((s, i) => {
                  const meta  = SLOT_META[s.st];
                  const has   = !!slotImages[i];
                  const isAct = activeSlot === i;
                  const cur   = rotations[i] ?? 0;
                  return (
                    <div key={i} style={{ marginBottom:4, borderRadius:5, border:`1px solid ${isAct?'#4f46e5':'#f3f4f6'}`, background:isAct?'#eef2ff':'#fafafa', padding:'4px 6px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:20, height:20, borderRadius:3, background:has?'#059669':meta.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                          {has ? '✓' : i+1}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:'#374151' }}>Slot {i+1} · {meta.label}</div>
                          <div style={{ fontSize:10, color:'#9ca3af', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:148 }}>
                            {has ? (slotFiles[i]?.name ?? 'uploaded') : 'no design'}
                          </div>
                        </div>
                        <button onClick={() => { setActiveSlot(i); fileInputRef.current?.click(); }}
                          style={{ fontSize:11, padding:'2px 7px', borderRadius:4, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontWeight:600, flexShrink:0 }}>
                          {has ? '↑' : '+'}
                        </button>
                      </div>
                      {/* Design size */}
                      {(() => {
                        const sz = slotSizes[i] ?? null;
                        const fp = sz ? footprint(sz, cur) : null;
                        const slotIn = slotInches[i];
                        const tooBig = !!fp && !!slotIn && (fp.wIn > slotIn.wPx + 0.001 || fp.hIn > slotIn.hPx + 0.001);
                        const unsaved = !!sz && !designSizes.some(d => sizeKey(d) === sizeKey(sz));
                        return (
                          <>
                            <select value={sizeKey(sz)}
                              onChange={e => {
                                const v = e.target.value;
                                const pick = v ? (designSizes.find(d => sizeKey(d) === v) ?? (sz && sizeKey(sz) === v ? sz : null)) : null;
                                setSlotSize(i, pick ? { wIn: pick.wIn, hIn: pick.hIn } : null);
                              }}
                              title="Print this design at a saved size (centred in the slot) instead of stretching it"
                              style={{ width:'100%', marginTop:3, fontSize:10, padding:'2px 4px', borderRadius:3, border:`1px solid ${sz?'#4f46e5':'#e5e7eb'}`, background:sz?'#eef2ff':'#f9fafb', color:sz?'#4f46e5':'#6b7280', fontFamily:'inherit', cursor:'pointer' }}>
                              <option value="">Size: fill slot{slotIn ? ` (${+slotIn.wPx.toFixed(2)}×${+slotIn.hPx.toFixed(2)}")` : ''}</option>
                              {designSizes.map(d => <option key={d.id} value={sizeKey(d)}>Size: {formatDesignSize(d)}</option>)}
                              {unsaved && sz && <option value={sizeKey(sz)}>Size: {formatDesignSize(sz)}</option>}
                            </select>
                            {tooBig && (
                              <div style={{ fontSize:9, color:'#d97706', marginTop:2 }}>
                                Bigger than this slot — edges will be cropped
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {/* Rotation buttons */}
                      <div style={{ display:'flex', gap:3, marginTop:3 }}>
                        {ROT_STEPS.map(deg => (
                          <button key={deg} onClick={e => { e.stopPropagation(); setRotation(i, deg as RotDeg); }}
                            style={{ flex:1, fontSize:10, padding:'2px 0', borderRadius:3, border:`1px solid ${cur===deg?'#4f46e5':'#e5e7eb'}`, background:cur===deg?'#4f46e5':'#f9fafb', color:cur===deg?'#fff':'#6b7280', cursor:'pointer', fontWeight:cur===deg?700:400 }}>
                            {deg}°
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Specs footer */}
          {pattern && (
            <div style={{ borderTop:'1px solid #f3f4f6', padding:'5px 10px', flexShrink:0 }}>
              {[
                [`${sheet.widthIn}"×${sheet.heightIn}"`, `Usable ${sheet.usableW}"×${sheet.usableH}"`],
                [`${pattern.totalSlots} slots`, `Gap: ${gapMm}mm · Margin: 0.5"`],
                ['600 DPI', 'JPG · target ~25MB'],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#374151' }}>{k}</span>
                  <span style={{ fontSize:10, color:'#9ca3af' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CANVAS ── */}
        <div className="sheet-layout-preview" style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#f1f5f9', padding:8, overflow:'hidden' }}>
          {!pattern ? (
            <div style={{ textAlign:'center', color:'#9ca3af' }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📐</div>
              <div style={{ fontSize:13, fontWeight:600 }}>Select sheet size + layout</div>
              <div style={{ fontSize:11, marginTop:4 }}>Preview will appear here</div>
            </div>
          ) : (
            <canvas ref={canvasRef} width={1400} height={Math.round(1400/aspect)}
              onClick={handleCanvasClick}
              style={{ display:'block', width:'auto', height:'auto', maxWidth:'100%', maxHeight:'100%', background:'#fff', borderRadius:4, boxShadow:'0 4px 24px rgba(0,0,0,0.13)', cursor:'crosshair' }}
            />
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handleFileInput} style={{ display:'none' }} />
    </div>
  );
}

export default function SheetLayout() {
  return <DashboardShell><SheetLayoutContent /></DashboardShell>;
}
