"use client";

import React, { ChangeEvent, PointerEvent, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  ImagePlus,
  Layers,
  MousePointer2,
  Palette,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";

type DesignSide = "front" | "back";
type ElementKind = "text" | "image" | "shape";
type TextAlign = "start" | "middle" | "end";
type TemplateKey = "clean" | "premium" | "education" | "festival";

type DesignElement = {
  id: string;
  kind: ElementKind;
  side: DesignSide;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  src?: string;
  fill: string;
  stroke?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: TextAlign;
  radius?: number;
};

const DPI = 600;
const OPEN_W = 8.5;
const MAIN_H = 5.5;
const FLAP_H = 0.5;
const PASTE_H = 0.5;
const TOTAL_H = MAIN_H + FLAP_H + PASTE_H;
const CENTER_X = OPEN_W / 2;

const templates: Record<TemplateKey, { name: string; background: string; accent: string; text: string; muted: string }> = {
  clean: { name: "Clean White", background: "#ffffff", accent: "#2563eb", text: "#0f172a", muted: "#64748b" },
  premium: { name: "Premium Gold", background: "#fffdf7", accent: "#b7791f", text: "#171717", muted: "#7c6f57" },
  education: { name: "Education Blue", background: "#f7fbff", accent: "#0f766e", text: "#12324a", muted: "#527084" },
  festival: { name: "Indian Festive", background: "#fff7ed", accent: "#dc2626", text: "#3b1d0f", muted: "#9a3412" },
};

const fontOptions = [
  "Noto Sans",
  "Noto Sans Devanagari",
  "Tiro Devanagari Hindi",
  "Arial",
  "Georgia",
  "Times New Roman",
];

const seedText = {
  header: "PRAKASH POLY CLINIC",
  subheader: "Complete Health Care Centre",
  mobile1: "+91 80041 76377",
  mobile2: "",
  mobile3: "",
  address1: "Main Road, Near City Centre",
  address2: "Nagpur, Maharashtra",
  bulletHeading: "Services",
  bullets: "General Physician\nPathology Collection\nEmergency Support",
  body: "Trusted medical care with modern facilities and personal attention.",
  backsideHeading: "Why Choose Us",
  backsideBullets: "Experienced doctors\nQuick reports\nFamily care",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function detectFont(text: string) {
  return /[\u0900-\u097F]/.test(text) ? "Noto Sans Devanagari" : "Noto Sans";
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function splitLines(text: string, maxChars: number) {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line || raw);
  }
  return lines.slice(0, 12);
}

function alignedX(el: DesignElement) {
  if (el.align === "middle") return el.x + el.w / 2;
  if (el.align === "end") return el.x + el.w;
  return el.x;
}

function printGuides(exportMode = false) {
  if (exportMode) return "";
  return `
    <rect x="0.125" y="0.625" width="8.25" height="5.25" fill="none" stroke="#22c55e" stroke-width="0.015" stroke-dasharray="0.08 0.06"/>
    <rect x="0.25" y="0.75" width="8" height="5" fill="none" stroke="#3b82f6" stroke-width="0.012" stroke-dasharray="0.06 0.05"/>
    <line x1="${CENTER_X}" y1="0" x2="${CENTER_X}" y2="${TOTAL_H}" stroke="#f97316" stroke-width="0.012" stroke-dasharray="0.06 0.05"/>
    <line x1="0" y1="${FLAP_H}" x2="${OPEN_W}" y2="${FLAP_H}" stroke="#94a3b8" stroke-width="0.01" stroke-dasharray="0.05 0.05"/>
    <line x1="0" y1="${FLAP_H + MAIN_H}" x2="${OPEN_W}" y2="${FLAP_H + MAIN_H}" stroke="#94a3b8" stroke-width="0.01" stroke-dasharray="0.05 0.05"/>
    <text x="0.12" y="0.31" font-size="0.11" fill="#64748b">Top flap 0.5"</text>
    <text x="0.12" y="6.29" font-size="0.11" fill="#64748b">Bottom pasting 0.5"</text>
    <text x="4.34" y="0.34" font-size="0.11" fill="#f97316">Centre back split</text>
  `;
}

function elementToSvg(el: DesignElement, selectedId?: string | null, exportMode = false) {
  const selected = selectedId === el.id && !exportMode;
  const frame = selected ? `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="none" stroke="#2563eb" stroke-width="0.025" stroke-dasharray="0.06 0.04"/>` : "";
  if (el.kind === "image" && el.src) {
    return `<image href="${el.src}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" preserveAspectRatio="xMidYMid slice"/>${frame}`;
  }
  if (el.kind === "shape") {
    return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${el.radius ?? 0.08}" fill="${el.fill}" stroke="${el.stroke ?? el.fill}" stroke-width="0.015"/>${frame}`;
  }
  const size = el.fontSize ?? 0.18;
  const x = alignedX(el);
  const family = el.fontFamily ?? detectFont(el.text ?? "");
  const lines = splitLines(el.text ?? "", Math.max(8, Math.floor(el.w / size * 1.9)));
  const tspans = lines.map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? 0 : size * 1.18}">${escapeXml(line)}</tspan>`).join("");
  return `<text x="${x}" y="${el.y + size}" font-family="${family}, Arial, sans-serif" font-size="${size}" font-weight="${el.fontWeight ?? 700}" fill="${el.fill}" text-anchor="${el.align ?? "start"}">${tspans}</text>${frame}`;
}

function elementsToSvg(elements: DesignElement[], template: TemplateKey, selectedId?: string | null, exportMode = false) {
  const t = templates[template];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OPEN_W}in" height="${TOTAL_H}in" viewBox="0 0 ${OPEN_W} ${TOTAL_H}">
  <style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700;800&amp;family=Noto+Sans+Devanagari:wght@400;600;700;800&amp;family=Tiro+Devanagari+Hindi:wght@400;700&amp;display=swap');</style>
  <rect width="${OPEN_W}" height="${TOTAL_H}" fill="${t.background}"/>
  <rect x="0" y="0" width="${OPEN_W}" height="${FLAP_H}" fill="${t.accent}" opacity="0.08"/>
  <rect x="0" y="${FLAP_H + MAIN_H}" width="${OPEN_W}" height="${PASTE_H}" fill="${t.accent}" opacity="0.08"/>
  ${printGuides(exportMode)}
  ${elements.map((el) => elementToSvg(el, selectedId, exportMode)).join("")}
</svg>`;
}

function RenderElement({ el, selected }: { el: DesignElement; selected: boolean }) {
  if (el.kind === "image" && el.src) {
    return (
      <>
        <image href={el.src} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="xMidYMid slice" />
        {selected && <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#2563eb" strokeWidth="0.025" strokeDasharray="0.06 0.04" />}
      </>
    );
  }
  if (el.kind === "shape") {
    return (
      <>
        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={el.radius ?? 0.08} fill={el.fill} stroke={el.stroke ?? el.fill} strokeWidth="0.015" />
        {selected && <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#2563eb" strokeWidth="0.025" strokeDasharray="0.06 0.04" />}
      </>
    );
  }
  const size = el.fontSize ?? 0.18;
  const x = alignedX(el);
  const lines = splitLines(el.text ?? "", Math.max(8, Math.floor(el.w / size * 1.9)));
  return (
    <>
      <text x={x} y={el.y + size} fontFamily={`${el.fontFamily ?? detectFont(el.text ?? "")}, Arial, sans-serif`} fontSize={size} fontWeight={el.fontWeight ?? 700} fill={el.fill} textAnchor={el.align ?? "start"}>
        {lines.map((line, idx) => <tspan key={`${line}-${idx}`} x={x} dy={idx === 0 ? 0 : size * 1.18}>{line}</tspan>)}
      </text>
      {selected && <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#2563eb" strokeWidth="0.025" strokeDasharray="0.06 0.04" />}
    </>
  );
}

export default function DesignStudioPage() {
  const [template, setTemplate] = useState<TemplateKey>("clean");
  const [side, setSide] = useState<DesignSide>("front");
  const [form, setForm] = useState(seedText);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState<"openai" | "local" | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const t = templates[template];

  const [elements, setElements] = useState<DesignElement[]>(() => [
    { id: uid(), kind: "text", side: "front", x: 0.55, y: 1.05, w: 3.25, h: 0.38, text: seedText.header, fill: "#0f172a", fontSize: 0.24, fontWeight: 800 },
    { id: uid(), kind: "text", side: "front", x: 0.55, y: 1.42, w: 3.1, h: 0.28, text: seedText.subheader, fill: "#64748b", fontSize: 0.14, fontWeight: 700 },
    { id: uid(), kind: "shape", side: "front", x: 0.55, y: 2.15, w: 3.35, h: 1.2, fill: "#e0f2fe", stroke: "#bae6fd", radius: 0.12 },
    { id: uid(), kind: "text", side: "front", x: 0.75, y: 2.35, w: 2.95, h: 0.75, text: seedText.body, fill: "#0f172a", fontSize: 0.16, fontWeight: 700 },
    { id: uid(), kind: "text", side: "front", x: 0.55, y: 4.95, w: 3.5, h: 0.42, text: `${seedText.mobile1}\n${seedText.address1}`, fill: "#0f172a", fontSize: 0.12, fontWeight: 700 },
    { id: uid(), kind: "text", side: "back", x: 4.72, y: 1.2, w: 3.1, h: 0.3, text: seedText.backsideHeading, fill: "#0f172a", fontSize: 0.22, fontWeight: 800, align: "middle" },
  ]);

  const visibleElements = useMemo(() => elements.filter((el) => el.side === side), [elements, side]);
  const selected = elements.find((el) => el.id === selectedId) ?? null;

  function patchSelected(patch: Partial<DesignElement>) {
    if (!selectedId) return;
    setElements((prev) => prev.map((el) => el.id === selectedId ? { ...el, ...patch } : el));
  }

  function autoArrange() {
    const accent = templates[template].accent;
    const text = templates[template].text;
    const muted = templates[template].muted;
    const front: DesignElement[] = [
      { id: uid(), kind: "shape", side: "front", x: 0.35, y: 0.8, w: 3.55, h: 4.75, fill: "#ffffff", stroke: "#e2e8f0", radius: 0.16 },
      { id: uid(), kind: "shape", side: "front", x: 0.52, y: 1.02, w: 0.72, h: 0.72, fill: accent, stroke: accent, radius: 0.12 },
      { id: uid(), kind: "text", side: "front", x: 1.38, y: 1.03, w: 2.35, h: 0.42, text: form.header, fill: text, fontFamily: detectFont(form.header), fontSize: 0.25, fontWeight: 800 },
      { id: uid(), kind: "text", side: "front", x: 1.39, y: 1.43, w: 2.3, h: 0.28, text: form.subheader, fill: muted, fontFamily: detectFont(form.subheader), fontSize: 0.135, fontWeight: 700 },
      { id: uid(), kind: "shape", side: "front", x: 0.58, y: 2.1, w: 3.1, h: 1.25, fill: `${accent}22`, stroke: `${accent}55`, radius: 0.16 },
      { id: uid(), kind: "text", side: "front", x: 0.78, y: 2.32, w: 2.68, h: 0.8, text: form.body, fill: text, fontFamily: detectFont(form.body), fontSize: 0.155, fontWeight: 700 },
      { id: uid(), kind: "text", side: "front", x: 0.62, y: 3.82, w: 1.1, h: 0.25, text: form.bulletHeading, fill: accent, fontFamily: detectFont(form.bulletHeading), fontSize: 0.16, fontWeight: 800 },
      { id: uid(), kind: "text", side: "front", x: 0.75, y: 4.1, w: 2.9, h: 0.62, text: form.bullets.split("\n").map((b) => `› ${b}`).join("\n"), fill: text, fontFamily: detectFont(form.bullets), fontSize: 0.12, fontWeight: 700 },
      { id: uid(), kind: "text", side: "front", x: 0.62, y: 5.05, w: 3.1, h: 0.35, text: [form.mobile1, form.mobile2, form.mobile3, form.address1, form.address2].filter(Boolean).join("  |  "), fill: text, fontFamily: detectFont(`${form.address1}${form.address2}`), fontSize: 0.095, fontWeight: 700 },
    ];
    const back: DesignElement[] = [
      { id: uid(), kind: "shape", side: "back", x: 4.62, y: 0.95, w: 3.55, h: 4.55, fill: "#ffffff", stroke: "#e2e8f0", radius: 0.16 },
      { id: uid(), kind: "text", side: "back", x: 6.4, y: 1.28, w: 2.7, h: 0.38, text: form.backsideHeading, fill: text, fontFamily: detectFont(form.backsideHeading), fontSize: 0.24, fontWeight: 800, align: "middle" },
      { id: uid(), kind: "text", side: "back", x: 4.98, y: 2.0, w: 2.95, h: 1.05, text: form.backsideBullets.split("\n").map((b, i) => `${i + 1}. ${b}`).join("\n"), fill: text, fontFamily: detectFont(form.backsideBullets), fontSize: 0.16, fontWeight: 700 },
      { id: uid(), kind: "shape", side: "back", x: 5.1, y: 4.72, w: 2.6, h: 0.14, fill: accent, stroke: accent, radius: 0.08 },
    ];
    setElements([...front, ...back, ...elements.filter((el) => el.kind === "image")]);
    setPrompt(`Create a premium editable envelope design for ${form.header}. Open size 8.5x5.5 inch with 0.5 inch top flap and 0.5 inch bottom pasting. Use ${templates[template].name} style, clear logo area, bold multilingual typography, safe margins, front contact block, and center-pasted back split with heading and bullet points.`);
    setAiSource("local");
  }

  async function aiCreateLayout() {
    setAiLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/design-studio/envelope/layout`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ template, form }),
      });
      if (!res.ok) {
        autoArrange();
        alert("AI layout is not available right now. Local auto layout was applied.");
        return;
      }
      const data = await res.json();
      const next = Array.isArray(data.elements)
        ? data.elements.map((el: Partial<DesignElement>) => ({
            id: uid(),
            kind: el.kind === "shape" ? "shape" : "text",
            side: el.side === "back" ? "back" : "front",
            x: Number(el.x ?? 0.8),
            y: Number(el.y ?? 1),
            w: Number(el.w ?? 2.5),
            h: Number(el.h ?? 0.5),
            text: el.text,
            fill: el.fill ?? templates[template].text,
            stroke: el.stroke,
            fontFamily: el.fontFamily,
            fontSize: el.fontSize,
            fontWeight: el.fontWeight,
            align: el.align,
            radius: el.radius,
          }))
        : [];
      if (next.length === 0) {
        autoArrange();
        return;
      }
      setElements([...next, ...elements.filter((el) => el.kind === "image")]);
      setSelectedId(null);
      setPrompt(data.prompt ?? "");
      setAiSource(data.source === "openai" ? "openai" : "local");
    } catch {
      autoArrange();
      alert("AI layout is not available right now. Local auto layout was applied.");
    } finally {
      setAiLoading(false);
    }
  }

  function addText() {
    setElements((prev) => [...prev, { id: uid(), kind: "text", side, x: side === "front" ? 0.7 : 4.75, y: 1.2, w: 2.8, h: 0.4, text: "New text", fill: t.text, fontSize: 0.18, fontWeight: 700, fontFamily: "Noto Sans" }]);
  }

  function addShape() {
    setElements((prev) => [...prev, { id: uid(), kind: "shape", side, x: side === "front" ? 0.8 : 4.85, y: 2.1, w: 2.8, h: 0.9, fill: `${t.accent}22`, stroke: t.accent, radius: 0.14 }]);
  }

  function addImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setElements((prev) => [...prev, { id: uid(), kind: "image", side, x: side === "front" ? 0.65 : 4.85, y: 1.0, w: 0.85, h: 0.85, src: String(reader.result), fill: "#ffffff" }]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function svgPoint(event: PointerEvent<SVGSVGElement | SVGRectElement>) {
    const svg = event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
    const rect = (svg ?? event.currentTarget).getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * OPEN_W, y: ((event.clientY - rect.top) / rect.height) * TOTAL_H };
  }

  function startDrag(event: PointerEvent<SVGRectElement>, id: string) {
    const el = elements.find((item) => item.id === id);
    if (!el) return;
    const p = svgPoint(event);
    setSelectedId(id);
    setDrag({ id, dx: p.x - el.x, dy: p.y - el.y });
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = svgPoint(event);
    setElements((prev) => prev.map((el) => el.id === drag.id ? { ...el, x: Math.max(0.05, Math.min(OPEN_W - el.w - 0.05, p.x - drag.dx)), y: Math.max(0.05, Math.min(TOTAL_H - el.h - 0.05, p.y - drag.dy)) } : el));
  }

  function exportJpg() {
    const svg = elementsToSvg(elements, template, null, true);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(OPEN_W * DPI);
      canvas.height = Math.round(TOTAL_H * DPI);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.96);
      a.download = `envelope-${form.header || "design"}-600dpi.jpg`.replace(/[^\w.-]+/g, "-");
      a.click();
    };
    img.src = url;
  }

  return (
    <DashboardShell>
      <div className="min-h-screen bg-slate-100 p-4 text-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-normal">Envelope Design Studio</h1>
            <p className="mt-1 text-sm text-slate-500">Open size 8.5 x 5.5 in, close size 4.25 x 5.5 in, 0.5 in flap and bottom pasting.</p>
          </div>
          <button onClick={exportJpg} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            <Download className="h-4 w-4" /> Export JPG 600 DPI
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)_300px]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button onClick={() => setSide("front")} className={`rounded-lg border px-3 py-2 text-sm font-bold ${side === "front" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200"}`}>Front</button>
              <button onClick={() => setSide("back")} className={`rounded-lg border px-3 py-2 text-sm font-bold ${side === "back" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200"}`}>Back Split</button>
            </div>

            <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Approved Template</label>
            <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateKey)} className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {Object.entries(templates).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
            </select>

            <div className="space-y-2">
              {Object.entries(form).map(([key, value]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-bold capitalize text-slate-500">{key.replace(/([A-Z])/g, " $1")}</span>
                  <textarea value={value} rows={key.toLowerCase().includes("bullet") || key === "body" ? 3 : 1} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </label>
              ))}
            </div>

            <button onClick={aiCreateLayout} disabled={aiLoading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              <Sparkles className="h-4 w-4" /> {aiLoading ? "AI Designing..." : "AI Create Editable Design"}
            </button>
            <button onClick={autoArrange} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Sparkles className="h-4 w-4" /> Auto Design Layout
            </button>
          </section>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={addText} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"><Type className="h-4 w-4" /> Text</button>
              <button onClick={addShape} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"><Layers className="h-4 w-4" /> Shape</button>
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"><ImagePlus className="h-4 w-4" /> Image</button>
              <input ref={fileRef} type="file" accept="image/*" onChange={addImage} className="hidden" />
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><MousePointer2 className="h-3.5 w-3.5" /> Drag items to edit position</span>
            </div>
            <div className="overflow-auto rounded-lg bg-slate-200 p-4">
              <svg viewBox={`0 0 ${OPEN_W} ${TOTAL_H}`} className="mx-auto block h-auto w-full max-w-[1040px] rounded bg-white shadow" onPointerMove={moveDrag} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
                <rect width={OPEN_W} height={TOTAL_H} fill={t.background} />
                <rect x="0" y="0" width={OPEN_W} height={FLAP_H} fill={t.accent} opacity="0.08" />
                <rect x="0" y={FLAP_H + MAIN_H} width={OPEN_W} height={PASTE_H} fill={t.accent} opacity="0.08" />
                <rect x="0.125" y="0.625" width="8.25" height="5.25" fill="none" stroke="#22c55e" strokeWidth="0.015" strokeDasharray="0.08 0.06" />
                <rect x="0.25" y="0.75" width="8" height="5" fill="none" stroke="#3b82f6" strokeWidth="0.012" strokeDasharray="0.06 0.05" />
                <line x1={CENTER_X} y1="0" x2={CENTER_X} y2={TOTAL_H} stroke="#f97316" strokeWidth="0.012" strokeDasharray="0.06 0.05" />
                <line x1="0" y1={FLAP_H} x2={OPEN_W} y2={FLAP_H} stroke="#94a3b8" strokeWidth="0.01" strokeDasharray="0.05 0.05" />
                <line x1="0" y1={FLAP_H + MAIN_H} x2={OPEN_W} y2={FLAP_H + MAIN_H} stroke="#94a3b8" strokeWidth="0.01" strokeDasharray="0.05 0.05" />
                <text x="0.12" y="0.31" fontSize="0.11" fill="#64748b">Top flap 0.5&quot;</text>
                <text x="0.12" y="6.29" fontSize="0.11" fill="#64748b">Bottom pasting 0.5&quot;</text>
                <text x="4.34" y="0.34" fontSize="0.11" fill="#f97316">Centre back split</text>
                {visibleElements.map((el) => <RenderElement key={el.id} el={el} selected={selectedId === el.id} />)}
                {visibleElements.map((el) => <rect key={`hit-${el.id}`} x={el.x} y={el.y} width={el.w} height={el.h} fill="transparent" className="cursor-move" onPointerDown={(event) => startDrag(event, el.id)} />)}
              </svg>
            </div>
            {prompt && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900"><strong>{aiSource === "openai" ? "AI generated editable layout" : "AI prompt draft"}:</strong> {prompt}</div>}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">Edit Selected</h2>
            {!selected ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Select any text, image, or shape on the design.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-bold text-slate-500">X<input type="number" step="0.05" value={selected.x} onChange={(e) => patchSelected({ x: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                  <label className="text-xs font-bold text-slate-500">Y<input type="number" step="0.05" value={selected.y} onChange={(e) => patchSelected({ y: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                  <label className="text-xs font-bold text-slate-500">W<input type="number" step="0.05" value={selected.w} onChange={(e) => patchSelected({ w: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                  <label className="text-xs font-bold text-slate-500">H<input type="number" step="0.05" value={selected.h} onChange={(e) => patchSelected({ h: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                </div>
                {selected.kind === "text" && (
                  <>
                    <textarea value={selected.text ?? ""} onChange={(e) => patchSelected({ text: e.target.value, fontFamily: detectFont(e.target.value) })} className="h-24 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <select value={selected.fontFamily ?? "Noto Sans"} onChange={(e) => patchSelected({ fontFamily: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      {fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}
                    </select>
                    <label className="text-xs font-bold text-slate-500">Font Size<input type="range" min="0.07" max="0.55" step="0.01" value={selected.fontSize ?? 0.18} onChange={(e) => patchSelected({ fontSize: Number(e.target.value) })} className="mt-1 w-full" /></label>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => patchSelected({ align: "start" })} className="rounded border border-slate-200 p-2"><AlignLeft className="mx-auto h-4 w-4" /></button>
                      <button onClick={() => patchSelected({ align: "middle" })} className="rounded border border-slate-200 p-2"><AlignCenter className="mx-auto h-4 w-4" /></button>
                      <button onClick={() => patchSelected({ align: "end" })} className="rounded border border-slate-200 p-2"><AlignRight className="mx-auto h-4 w-4" /></button>
                    </div>
                  </>
                )}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500"><Palette className="h-4 w-4" /> Color<input type="color" value={selected.fill} onChange={(e) => patchSelected({ fill: e.target.value })} className="h-9 flex-1" /></label>
                <button onClick={() => { setElements((prev) => prev.filter((el) => el.id !== selected.id)); setSelectedId(null); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            )}
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-bold text-slate-700">Print Guides</p>
              <p>Green: bleed/cut margin. Blue: safe margin. Orange: centre back split. Guides are hidden in JPG export.</p>
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
