'use client';

// Free layout mode for the Sheet Layout Composer: every design is a layer that
// can be selected, moved, resized, rotated, cropped, paint-filled, duplicated
// and re-ordered, with undo/redo. Layers live only in this browser tab's
// memory; the 600 DPI sheet is assembled by POST /sheet-layout/assemble-free.

import { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { listDesignSizes, formatDesignSize, type SavedDesignSize } from '@/lib/sheetLayoutStore';

export type FreeSheetDef = { label: string; widthIn: number; heightIn: number; marginIn: number; usableW: number; usableH: number };

type Crop = { l: number; t: number; r: number; b: number }; // fractions of the bitmap trimmed per edge
interface Layer {
  id: string; name: string;
  /** Pixels with rotation and paint fills baked in. Never mutated — edits make a new canvas, so undo can keep the old one. */
  bmp: HTMLCanvasElement;
  xIn: number; yIn: number; wIn: number; hIn: number; // position/size on the sheet (inches, from the sheet's top-left)
  crop: Crop;
}
type Tool = 'select' | 'crop' | 'fill';
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type Drag = { kind: 'move' | 'resize' | 'crop'; handle?: Handle; id: string; startX: number; startY: number; start: Layer; changed: boolean };

const PRINT_DPI = 600;            // mirrors backend sheet-layout.service DPI
const IMPORT_DPI = 300;           // assumed resolution when a design is first added
const MIN_IN = 0.1;               // smallest layer edge (inches)
const HISTORY_LIMIT = 20;         // undo steps kept (old bitmaps stay in memory)
const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `l-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const isUncropped = (c: Crop) => !c.l && !c.t && !c.r && !c.b;

function handlePoint(L: Layer, h: Handle): [number, number] {
  const x = h.includes('w') ? L.xIn : h.includes('e') ? L.xIn + L.wIn : L.xIn + L.wIn / 2;
  const y = h.includes('n') ? L.yIn : h.includes('s') ? L.yIn + L.hIn : L.yIn + L.hIn / 2;
  return [x, y];
}

/** Resize from a handle. Corners keep the aspect ratio unless `free`; edge handles stretch one side. */
function resizeLayer(L0: Layer, h: Handle, dx: number, dy: number, free: boolean): Layer {
  const E = h.includes('e'), W = h.includes('w'), N = h.includes('n'), S = h.includes('s');
  let w = L0.wIn + (E ? dx : 0) - (W ? dx : 0);
  let ht = L0.hIn + (S ? dy : 0) - (N ? dy : 0);
  if (!free && (E || W) && (N || S)) {
    const s = Math.max(w / L0.wIn, ht / L0.hIn);
    w = L0.wIn * s; ht = L0.hIn * s;
  }
  w = Math.max(MIN_IN, w); ht = Math.max(MIN_IN, ht);
  return { ...L0, wIn: w, hIn: ht, xIn: W ? L0.xIn + L0.wIn - w : L0.xIn, yIn: N ? L0.yIn + L0.hIn - ht : L0.yIn };
}

/** Crop from a handle: trims (or restores) that edge while the design's scale stays put. */
function cropLayer(L0: Layer, h: Handle, dx: number, dy: number): Layer {
  const c0 = L0.crop;
  const FW = L0.wIn / (1 - c0.l - c0.r), FH = L0.hIn / (1 - c0.t - c0.b); // uncropped size at current scale
  let { l, t, r, b } = c0;
  if (h.includes('e')) r = clamp(c0.r - dx / FW, 0, 1 - c0.l - MIN_IN / FW);
  if (h.includes('w')) l = clamp(c0.l + dx / FW, 0, 1 - c0.r - MIN_IN / FW);
  if (h.includes('s')) b = clamp(c0.b - dy / FH, 0, 1 - c0.t - MIN_IN / FH);
  if (h.includes('n')) t = clamp(c0.t + dy / FH, 0, 1 - c0.b - MIN_IN / FH);
  return { ...L0, crop: { l, t, r, b }, xIn: L0.xIn + (l - c0.l) * FW, yIn: L0.yIn + (t - c0.t) * FH, wIn: FW * (1 - l - r), hIn: FH * (1 - t - b) };
}

/** Rotates a layer 90° (cw) or -90° (ccw) about its centre, baking the turn into new pixels. */
function rotateLayer(L: Layer, cw: boolean): Layer {
  const src = L.bmp;
  const oc = document.createElement('canvas');
  oc.width = src.height; oc.height = src.width;
  const ctx = oc.getContext('2d')!;
  if (cw) { ctx.translate(oc.width, 0); ctx.rotate(Math.PI / 2); }
  else { ctx.translate(0, oc.height); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(src, 0, 0);
  const c = L.crop;
  const crop = cw ? { l: c.b, t: c.l, r: c.t, b: c.r } : { l: c.t, t: c.r, r: c.b, b: c.l };
  return { ...L, bmp: oc, crop, wIn: L.hIn, hIn: L.wIn, xIn: L.xIn + (L.wIn - L.hIn) / 2, yIn: L.yIn + (L.hIn - L.wIn) / 2 };
}

/** Paint-bucket: fills the area connected to (sx, sy) whose colour is within `tol` (0–255 per channel). Returns a new canvas. */
function floodFill(src: HTMLCanvasElement, sx: number, sy: number, rgb: [number, number, number], tol: number): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const s0 = (sy * W + sx) * 4;
  const tr = d[s0], tg = d[s0 + 1], tb = d[s0 + 2], ta = d[s0 + 3];
  const seen = new Uint8Array(W * H);
  const match = (p: number) => {
    const i = p * 4;
    return Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol && Math.abs(d[i + 2] - tb) <= tol && Math.abs(d[i + 3] - ta) <= tol;
  };
  const stack: number[] = [sy * W + sx];
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p] || !match(p)) continue;
    const y = (p / W) | 0;
    let xl = p - y * W, xr = xl;
    while (xl > 0 && !seen[y * W + xl - 1] && match(y * W + xl - 1)) xl--;
    while (xr < W - 1 && !seen[y * W + xr + 1] && match(y * W + xr + 1)) xr++;
    let upOpen = false, downOpen = false;
    for (let x = xl; x <= xr; x++) {
      const q = y * W + x;
      seen[q] = 1;
      const i = q * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      // Push one seed per run of fillable pixels in the rows above/below
      if (y > 0) {
        const u = q - W, ok = !seen[u] && match(u);
        if (ok && !upOpen) stack.push(u);
        upOpen = ok;
      }
      if (y < H - 1) {
        const v = q + W, ok = !seen[v] && match(v);
        if (ok && !downOpen) stack.push(v);
        downOpen = ok;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function loadLayerBitmap(file: File): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) { rej(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0);
      res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`Could not read ${file.name}`)); };
    img.src = url;
  });
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

interface Props {
  active: boolean;
  sheetSize: string;
  sheet: FreeSheetDef;
  sheetSizes: { key: string; label: string }[];
  onSheetSizeChange: (key: string) => void;
  sheetNumber: string;
  onSheetNumberChange: (v: string) => void;
  downloadFileName: string;
}

export default function FreeLayoutEditor({ active, sheetSize, sheet, sheetSizes, onSheetSizeChange, sheetNumber, onSheetNumberChange, downloadFileName }: Props) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [fillTol, setFillTol] = useState(32);
  const [lockRatio, setLockRatio] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [designSizes, setDesignSizes] = useState<SavedDesignSize[]>([]);
  const [, setHistoryTick] = useState(0);
  const [cursor, setCursor] = useState('default');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pastRef = useRef<Layer[][]>([]);
  const futureRef = useRef<Layer[][]>([]);
  const dragRef = useRef<Drag | null>(null);
  const layersRef = useRef<Layer[]>(layers);
  layersRef.current = layers;

  const selected = layers.find(l => l.id === selectedId) ?? null;
  const aspect = sheet.widthIn / sheet.heightIn;
  const CW = 1400, CH = Math.round(CW / aspect);

  useEffect(() => { if (active) setDesignSizes(listDesignSizes()); }, [active]);

  // Unsaved work warning — free layouts are not stored anywhere.
  useEffect(() => {
    if (!layers.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [layers.length]);

  // ── History ──
  const pushHistory = useCallback(() => {
    pastRef.current.push(layersRef.current);
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    setHistoryTick(t => t + 1);
  }, []);
  /** Apply an edit as one undoable step. */
  const commit = useCallback((next: Layer[]) => { pushHistory(); setLayers(next); }, [pushHistory]);
  const undo = useCallback(() => {
    const prev = pastRef.current.pop(); if (!prev) return;
    futureRef.current.push(layersRef.current); setLayers(prev); setHistoryTick(t => t + 1);
  }, []);
  const redo = useCallback(() => {
    const next = futureRef.current.pop(); if (!next) return;
    pastRef.current.push(layersRef.current); setLayers(next); setHistoryTick(t => t + 1);
  }, []);

  const updateSelected = (fn: (l: Layer) => Layer) => {
    if (!selected) return;
    commit(layers.map(l => (l.id === selected.id ? fn(l) : l)));
  };

  // ── Actions ──
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('Loading designs…');
    try {
      const added: Layer[] = [];
      let n = layers.length;
      for (const f of Array.from(files)) {
        const bmp = await loadLayerBitmap(f);
        let w = bmp.width / IMPORT_DPI, h = bmp.height / IMPORT_DPI;
        const fit = Math.min(1, sheet.usableW / w, sheet.usableH / h);
        w *= fit; h *= fit;
        const off = (n++ % 8) * 0.25;
        added.push({ id: newId(), name: f.name, bmp, crop: NO_CROP, wIn: w, hIn: h,
          xIn: Math.min(sheet.marginIn + off, sheet.widthIn - w), yIn: Math.min(sheet.marginIn + off, sheet.heightIn - h) });
      }
      commit([...layers, ...added]);
      setSelectedId(added[added.length - 1].id);
      setTool('select');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally { setBusy(null); }
  };

  const duplicateSelected = useCallback(() => {
    const cur = layersRef.current.find(l => l.id === selectedId); if (!cur) return;
    const copy: Layer = { ...cur, id: newId(), xIn: cur.xIn + 0.25, yIn: cur.yIn + 0.25 };
    commit([...layersRef.current, copy]);
    setSelectedId(copy.id);
  }, [selectedId, commit]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(layersRef.current.filter(l => l.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, commit]);

  const moveInStack = (id: string, dir: 1 | -1 | 'top' | 'bottom') => {
    const i = layers.findIndex(l => l.id === id); if (i < 0) return;
    const next = [...layers]; const [l] = next.splice(i, 1);
    const j = dir === 'top' ? next.length : dir === 'bottom' ? 0 : clamp(i + dir, 0, next.length);
    next.splice(j, 0, l);
    if (j !== i) commit(next);
  };

  const rotateSelected = (cw: boolean) => {
    if (!selected) return;
    setBusy('Rotating…');
    // Let the "Rotating…" label paint before the (possibly heavy) pixel work.
    setTimeout(() => { try { updateSelected(l => rotateLayer(l, cw)); } finally { setBusy(null); } }, 20);
  };

  const flipSelected = (horizontal: boolean) => {
    if (!selected) return;
    updateSelected(l => {
      const oc = document.createElement('canvas');
      oc.width = l.bmp.width; oc.height = l.bmp.height;
      const ctx = oc.getContext('2d')!;
      if (horizontal) { ctx.translate(oc.width, 0); ctx.scale(-1, 1); } else { ctx.translate(0, oc.height); ctx.scale(1, -1); }
      ctx.drawImage(l.bmp, 0, 0);
      const c = l.crop;
      return { ...l, bmp: oc, crop: horizontal ? { ...c, l: c.r, r: c.l } : { ...c, t: c.b, b: c.t } };
    });
  };

  const setSelectedSize = (wIn: number, hIn: number) => {
    if (!selected || !(wIn > 0) || !(hIn > 0)) return;
    updateSelected(l => ({ ...l, wIn: Math.max(MIN_IN, wIn), hIn: Math.max(MIN_IN, hIn) }));
  };

  // ── Keyboard ──
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) { e.preventDefault(); deleteSelected(); } return; }
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (e.key === 'v') setTool('select');
      if (e.key === 'c') setTool('crop');
      if (e.key === 'g') setTool('fill');
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;
        const [ax, ay] = arrows[e.key];
        commit(layersRef.current.map(l => (l.id === selectedId ? { ...l, xIn: l.xIn + ax * step, yIn: l.yIn + ay * step } : l)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, selectedId, undo, redo, duplicateSelected, deleteSelected, commit]);

  // ── Drawing ──
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const sc = CW / sheet.widthIn;
    const ui = CW / 900;
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CW, CH);
    // Printable area (inside the margin)
    ctx.save();
    ctx.setLineDash([6 * ui, 4 * ui]); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1 * ui;
    ctx.strokeRect(sheet.marginIn * sc, sheet.marginIn * sc, sheet.usableW * sc, sheet.usableH * sc);
    ctx.restore();

    for (const L of layers) {
      const { bmp, crop: c } = L;
      const sx = c.l * bmp.width, sy = c.t * bmp.height;
      const sw = (1 - c.l - c.r) * bmp.width, sh = (1 - c.t - c.b) * bmp.height;
      ctx.drawImage(bmp, sx, sy, sw, sh, L.xIn * sc, L.yIn * sc, L.wIn * sc, L.hIn * sc);
    }
    if (!layers.length) {
      ctx.fillStyle = '#9ca3af'; ctx.font = `${14 * ui}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Add designs to start — each one becomes a layer you can move, resize, crop and fill', CW / 2, CH / 2);
    }
    if (selected) {
      const x = selected.xIn * sc, y = selected.yIn * sc, w = selected.wIn * sc, h = selected.hIn * sc;
      const color = tool === 'crop' ? '#ea580c' : '#4f46e5';
      if (tool === 'crop') {
        // Ghost of the trimmed-off parts, so you can see what you're cropping
        const c = selected.crop;
        const FW = w / (1 - c.l - c.r), FH = h / (1 - c.t - c.b);
        ctx.save(); ctx.globalAlpha = 0.25;
        ctx.drawImage(selected.bmp, x - c.l * FW, y - c.t * FH, FW, FH);
        ctx.restore();
        ctx.drawImage(selected.bmp, c.l * selected.bmp.width, c.t * selected.bmp.height,
          (1 - c.l - c.r) * selected.bmp.width, (1 - c.t - c.b) * selected.bmp.height, x, y, w, h);
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.5 * ui; ctx.strokeRect(x, y, w, h);
      if (tool !== 'fill') {
        const hs = 5 * ui;
        for (const hd of HANDLES) {
          const [hx, hy] = handlePoint(selected, hd);
          ctx.fillStyle = '#fff'; ctx.fillRect(hx * sc - hs, hy * sc - hs, hs * 2, hs * 2);
          ctx.strokeStyle = color; ctx.lineWidth = 1.5 * ui; ctx.strokeRect(hx * sc - hs, hy * sc - hs, hs * 2, hs * 2);
        }
      }
      ctx.fillStyle = color; ctx.font = `bold ${10 * ui}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${r3(selected.wIn)}×${r3(selected.hIn)}"`, x, y - 4 * ui);
    }
  }, [layers, selected, tool, sheet, CW, CH]);

  // ── Pointer ──
  const toInches = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const k = canvas.width / rect.width;
    const sc = CW / sheet.widthIn;
    return { x: ((e.clientX - rect.left) * k) / sc, y: ((e.clientY - rect.top) * k) / sc, tolIn: (9 * k) / sc };
  };
  const hitHandle = (L: Layer | null, x: number, y: number, tol: number): Handle | null => {
    if (!L) return null;
    for (const h of HANDLES) { const [hx, hy] = handlePoint(L, h); if (Math.abs(hx - x) <= tol && Math.abs(hy - y) <= tol) return h; }
    return null;
  };
  const hitLayer = (x: number, y: number) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (x >= L.xIn && x <= L.xIn + L.wIn && y >= L.yIn && y <= L.yIn + L.hIn) return L;
    }
    return null;
  };
  const HANDLE_CURSOR: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, tolIn } = toInches(e);
    if (tool === 'fill') {
      const L = hitLayer(x, y); if (!L) return;
      setSelectedId(L.id);
      const c = L.crop;
      const u = (x - L.xIn) / L.wIn, v = (y - L.yIn) / L.hIn;
      const px = clamp(Math.floor((c.l + u * (1 - c.l - c.r)) * L.bmp.width), 0, L.bmp.width - 1);
      const py = clamp(Math.floor((c.t + v * (1 - c.t - c.b)) * L.bmp.height), 0, L.bmp.height - 1);
      setBusy('Filling…');
      setTimeout(() => {
        try {
          const bmp = floodFill(L.bmp, px, py, hexToRgb(fillColor), Math.round((fillTol / 100) * 255));
          commit(layersRef.current.map(l => (l.id === L.id ? { ...l, bmp } : l)));
        } catch (err) { alert(`Fill failed: ${err instanceof Error ? err.message : String(err)}`); }
        finally { setBusy(null); }
      }, 20);
      return;
    }
    const h = hitHandle(selected, x, y, tolIn);
    if (selected && h) {
      dragRef.current = { kind: tool === 'crop' ? 'crop' : 'resize', handle: h, id: selected.id, startX: x, startY: y, start: selected, changed: false };
    } else {
      const L = hitLayer(x, y);
      setSelectedId(L?.id ?? null);
      if (!L) return;
      dragRef.current = { kind: 'move', id: L.id, startX: x, startY: y, start: L, changed: false };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, tolIn } = toInches(e);
    const d = dragRef.current;
    if (!d) {
      if (tool === 'fill') { setCursor(hitLayer(x, y) ? 'cell' : 'default'); return; }
      const h = hitHandle(selected, x, y, tolIn);
      setCursor(h ? HANDLE_CURSOR[h] : hitLayer(x, y) ? 'move' : 'default');
      return;
    }
    const dx = x - d.startX, dy = y - d.startY;
    if (!d.changed) {
      if (Math.abs(dx) < tolIn / 4 && Math.abs(dy) < tolIn / 4) return; // ignore click jitter
      pushHistory(); d.changed = true;
    }
    let next: Layer;
    if (d.kind === 'move') next = { ...d.start, xIn: d.start.xIn + dx, yIn: d.start.yIn + dy };
    else if (d.kind === 'resize') next = resizeLayer(d.start, d.handle!, dx, dy, e.shiftKey || !lockRatio);
    else next = cropLayer(d.start, d.handle!, dx, dy);
    setLayers(prev => prev.map(l => (l.id === d.id ? next : l)));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // ── Export ──
  const handleDownload = async () => {
    if (!layers.length) return;
    setBusy('Building 600 DPI sheet…');
    try {
      const fd = new FormData();
      const placements: { xIn: number; yIn: number; wIn: number; hIn: number }[] = [];
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i], c = L.crop;
        const sw = Math.max(1, Math.round((1 - c.l - c.r) * L.bmp.width));
        const sh = Math.max(1, Math.round((1 - c.t - c.b) * L.bmp.height));
        // Never upload more pixels than 600 DPI needs; smaller designs go as-is.
        const k = Math.min(1, (L.wIn * PRINT_DPI) / sw, (L.hIn * PRINT_DPI) / sh);
        const oc = document.createElement('canvas');
        oc.width = Math.max(1, Math.round(sw * k)); oc.height = Math.max(1, Math.round(sh * k));
        const ctx = oc.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, oc.width, oc.height); // JPEG has no transparency
        ctx.drawImage(L.bmp, c.l * L.bmp.width, c.t * L.bmp.height, sw, sh, 0, 0, oc.width, oc.height);
        const blob = await new Promise<Blob>((res, rej) => oc.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.95));
        fd.append('layers', blob, `layer_${i}.jpg`);
        placements.push({ xIn: L.xIn, yIn: L.yIn, wIn: L.wIn, hIn: L.hIn });
      }
      fd.append('placements', JSON.stringify(placements));
      const res = await fetch(`${API_BASE_URL}/sheet-layout/assemble-free?sheetSize=${encodeURIComponent(sheetSize)}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = downloadFileName; a.click();
    } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  };

  // ── UI ──
  const label = { fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 };
  const section = { padding: '7px 10px', borderBottom: '1px solid #f3f4f6' };
  const btn = (on = false, disabled = false) => ({
    padding: '4px 6px', fontSize: 11, fontWeight: 700, borderRadius: 5, fontFamily: 'inherit',
    border: `1.5px solid ${on ? '#4f46e5' : '#e5e7eb'}`, background: disabled ? '#f3f4f6' : on ? '#eef2ff' : '#f9fafb',
    color: disabled ? '#c4c4c4' : on ? '#4f46e5' : '#374151', cursor: disabled ? 'not-allowed' : 'pointer',
  });
  const numInput = { width: 0, flex: 1, padding: '4px 4px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: '1.5px solid #e5e7eb', textAlign: 'center' as const, color: '#374151', outline: 'none', fontFamily: 'inherit' };
  const canUndo = pastRef.current.length > 0, canRedo = futureRef.current.length > 0;

  return (
    <div className="sheet-layout-body" style={{ flex: 1, display: active ? 'flex' : 'none', overflow: 'hidden' }}>
      {/* ── LEFT PANEL ── */}
      <div className="sheet-layout-sidebar" style={{ width: 256, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={section}>
          <div style={label}>Sheet Number</div>
          <input type="text" value={sheetNumber} maxLength={60} placeholder="e.g. 001 or MED-12" onChange={e => onSheetNumberChange(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', borderRadius: 6, border: `1.5px solid ${sheetNumber.trim() ? '#4f46e5' : '#e5e7eb'}`, background: sheetNumber.trim() ? '#eef2ff' : '#f9fafb', color: '#374151', outline: 'none' }} />
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Saves as {downloadFileName}</div>
        </div>

        <div style={section}>
          <div style={label}>Sheet Size</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {sheetSizes.map(sz => (
              <button key={sz.key} onClick={() => onSheetSizeChange(sz.key)} style={{ ...btn(sheetSize === sz.key), flex: 1, fontSize: 12 }}>{sz.label}</button>
            ))}
          </div>
        </div>

        <div style={section}>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy}
            style={{ width: '100%', padding: '6px 7px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>
            ＋ Add designs
          </button>
        </div>

        <div style={section}>
          <div style={label}>Tool</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['select', '↖ Move', 'V'], ['crop', '⌗ Crop', 'C'], ['fill', '🪣 Fill', 'G']] as [Tool, string, string][]).map(([t, name, key]) => (
              <button key={t} onClick={() => setTool(t)} title={`${name.slice(2)} (${key})`} style={{ ...btn(tool === t), flex: 1 }}>{name}</button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4, lineHeight: 1.35 }}>
            {tool === 'select' && 'Drag a design to move it, drag the handles to resize. Corners keep proportions (hold Shift to stretch).'}
            {tool === 'crop' && 'Drag the orange handles of the selected design to trim its edges. Drag back out to restore.'}
            {tool === 'fill' && 'Click a colour area on a design to fill it — e.g. turn an off-white background pure white.'}
          </div>
          {tool === 'fill' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <input type="color" value={fillColor} onChange={e => setFillColor(e.target.value)} style={{ width: 30, height: 24, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
              <span style={{ fontSize: 10, color: '#6b7280' }}>Tolerance</span>
              <input type="range" min={0} max={100} value={fillTol} onChange={e => setFillTol(+e.target.value)} style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: '#374151', width: 22, textAlign: 'right' }}>{fillTol}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...btn(false, !canUndo), flex: 1 }}>↶ Undo</button>
            <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...btn(false, !canRedo), flex: 1 }}>↷ Redo</button>
          </div>
        </div>

        {selected && (
          <div style={section}>
            <div style={label}>Selected design</div>
            <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 5 }}>{selected.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 14px 1fr', gap: 4, alignItems: 'center', fontSize: 10, color: '#6b7280' }}>
              <span>X</span><input type="number" step="0.05" value={r3(selected.xIn)} onChange={e => updateSelected(l => ({ ...l, xIn: parseFloat(e.target.value) || 0 }))} style={numInput} />
              <span>Y</span><input type="number" step="0.05" value={r3(selected.yIn)} onChange={e => updateSelected(l => ({ ...l, yIn: parseFloat(e.target.value) || 0 }))} style={numInput} />
              <span>W</span><input type="number" step="0.05" min={MIN_IN} value={r3(selected.wIn)}
                onChange={e => { const w = parseFloat(e.target.value); setSelectedSize(w, lockRatio ? (w * selected.hIn) / selected.wIn : selected.hIn); }} style={numInput} />
              <span>H</span><input type="number" step="0.05" min={MIN_IN} value={r3(selected.hIn)}
                onChange={e => { const h = parseFloat(e.target.value); setSelectedSize(lockRatio ? (h * selected.wIn) / selected.hIn : selected.wIn, h); }} style={numInput} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b7280', marginTop: 4 }}>
              <input type="checkbox" checked={lockRatio} onChange={e => setLockRatio(e.target.checked)} /> Keep proportions
            </label>
            {designSizes.length > 0 && (
              <select value="" onChange={e => { const d = designSizes.find(s => s.id === e.target.value); if (d) setSelectedSize(d.wIn, d.hIn); }}
                style={{ width: '100%', marginTop: 4, fontSize: 10, padding: '2px 4px', borderRadius: 3, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontFamily: 'inherit' }}>
                <option value="">Set to saved size…</option>
                {designSizes.map(d => <option key={d.id} value={d.id}>{formatDesignSize(d)}</option>)}
              </select>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
              <button onClick={() => rotateSelected(false)} style={btn()}>⟲ 90°</button>
              <button onClick={() => rotateSelected(true)} style={btn()}>⟳ 90°</button>
              <button onClick={() => flipSelected(true)} style={btn()}>⇋ Flip H</button>
              <button onClick={() => flipSelected(false)} style={btn()}>⇅ Flip V</button>
              <button onClick={duplicateSelected} title="Duplicate (Ctrl+D)" style={btn()}>⧉ Duplicate</button>
              <button onClick={() => updateSelected(l => {
                // Restore the full image at the current scale
                const c = l.crop, FW = l.wIn / (1 - c.l - c.r), FH = l.hIn / (1 - c.t - c.b);
                return { ...l, crop: NO_CROP, xIn: l.xIn - c.l * FW, yIn: l.yIn - c.t * FH, wIn: FW, hIn: FH };
              })} disabled={isUncropped(selected.crop)} style={btn(false, isUncropped(selected.crop))}>Reset crop</button>
              <button onClick={() => updateSelected(l => ({ ...l, xIn: (sheet.widthIn - l.wIn) / 2, yIn: (sheet.heightIn - l.hIn) / 2 }))} style={btn()}>Centre</button>
              <button onClick={deleteSelected} title="Delete (Del)" style={{ ...btn(), color: '#dc2626' }}>✕ Delete</button>
            </div>
          </div>
        )}

        <div style={{ ...section, flex: 1 }}>
          <div style={label}>Layers {layers.length > 0 && `· ${layers.length}`}</div>
          {[...layers].reverse().map(L => {
            const on = L.id === selectedId;
            return (
              <div key={L.id} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                <button onClick={() => setSelectedId(L.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '3px 6px', borderRadius: 5, border: `1px solid ${on ? '#4f46e5' : '#e5e7eb'}`, background: on ? '#eef2ff' : '#f9fafb', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: on ? '#4f46e5' : '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{L.name}</div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>{r3(L.wIn)}×{r3(L.hIn)}&quot;</div>
                </button>
                <button onClick={() => moveInStack(L.id, 1)} title="Bring forward" style={{ ...btn(), width: 22, padding: 0 }}>▲</button>
                <button onClick={() => moveInStack(L.id, -1)} title="Send backward" style={{ ...btn(), width: 22, padding: 0 }}>▼</button>
              </div>
            );
          })}
          {!layers.length && <div style={{ fontSize: 9, color: '#9ca3af' }}>No designs yet.</div>}
          {layers.length > 0 && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4, lineHeight: 1.35 }}>Top of the list prints on top. Free layouts aren&apos;t saved — download before leaving.</div>}
        </div>
      </div>

      {/* ── CANVAS ── */}
      <div className="sheet-layout-preview" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '6px 10px' }}>
          {busy && <span style={{ fontSize: 11, color: '#6b7280' }}>⏳ {busy}</span>}
          <button onClick={handleDownload} disabled={!layers.length || !!busy}
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 16px', borderRadius: 6, border: 'none', cursor: layers.length && !busy ? 'pointer' : 'not-allowed', background: layers.length && !busy ? '#111' : '#e5e7eb', color: layers.length && !busy ? '#fff' : '#9ca3af', fontFamily: 'inherit' }}>
            ⬇ Download 600 DPI JPG
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <canvas ref={canvasRef} width={CW} height={CH}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', background: '#fff', borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.13)', cursor, touchAction: 'none' }} />
        </div>
      </div>

      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/jpg,image/png" style={{ display: 'none' }}
        onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
