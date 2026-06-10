"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronLeft,
  Download,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Product } from "../../catalog";

type CanvasElement = {
  id: string;
  type: "text" | "rect" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  imageUrl?: string;
};

const CANVAS_W = 800;
const CANVAS_H = 500;

export function StudioClient({ product }: { product: Product }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<CanvasElement[]>([
    { id: "bg", type: "rect", x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, bgColor: "#FFFFFF" },
    {
      id: "title",
      type: "text",
      x: 60,
      y: 80,
      width: 400,
      height: 60,
      text: "Your Business Name",
      fontSize: 36,
      fontFamily: "Arial",
      color: "#1A1A1A",
      bold: true,
      align: "left",
    },
    {
      id: "sub",
      type: "text",
      x: 60,
      y: 150,
      width: 500,
      height: 40,
      text: "Your tagline or product/service description",
      fontSize: 18,
      fontFamily: "Arial",
      color: "#555555",
      align: "left",
    },
    {
      id: "contact",
      type: "text",
      x: 60,
      y: 420,
      width: 700,
      height: 30,
      text: "+91 98765 43210   info@yourbusiness.com   Your City, India",
      fontSize: 14,
      fontFamily: "Arial",
      color: "#555555",
      align: "left",
    },
  ]);
  const [selected, setSelected] = useState<string | null>("title");
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [tool, setTool] = useState<"select" | "text" | "rect">("select");
  const selectedEl = elements.find((element) => element.id === selected);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    for (const element of elements) {
      if (element.type === "rect") {
        ctx.fillStyle = element.bgColor ?? "#FFFFFF";
        ctx.fillRect(element.x, element.y, element.width, element.height);
      } else if (element.type === "text" && element.text) {
        ctx.save();
        const weight = element.bold ? "bold" : "normal";
        const style = element.italic ? "italic" : "normal";
        ctx.font = `${style} ${weight} ${element.fontSize ?? 16}px ${element.fontFamily ?? "Arial"}`;
        ctx.fillStyle = element.color ?? "#000000";
        ctx.textBaseline = "top";
        ctx.textAlign = element.align ?? "left";
        const tx = element.align === "center" ? element.x + element.width / 2 : element.align === "right" ? element.x + element.width : element.x;
        ctx.fillText(element.text, tx, element.y, element.width);
        ctx.restore();
      }

      if (element.id === selected) {
        ctx.save();
        ctx.strokeStyle = "#CC0000";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(element.x - 2, element.y - 2, element.width + 4, element.height + 4);
        ctx.restore();
      }
    }
  }

  useEffect(() => {
    draw();
  }, [elements, selected]);

  function hitTest(x: number, y: number) {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const element = elements[index];
      if (x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height) {
        return element.id;
      }
    }
    return null;
  }

  function canvasCoords(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function onMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = canvasCoords(event);
    if (tool === "text") {
      const id = `text-${Date.now()}`;
      setElements((current) => [
        ...current,
        { id, type: "text", x, y, width: 300, height: 40, text: "New text", fontSize: 20, fontFamily: "Arial", color: "#1A1A1A", align: "left" },
      ]);
      setSelected(id);
      setTool("select");
      return;
    }
    if (tool === "rect") {
      const id = `rect-${Date.now()}`;
      setElements((current) => [...current, { id, type: "rect", x, y, width: 200, height: 100, bgColor: "#CC0000" }]);
      setSelected(id);
      setTool("select");
      return;
    }
    const hit = hitTest(x, y);
    setSelected(hit);
    if (hit) {
      const element = elements.find((item) => item.id === hit)!;
      setDragging({ id: hit, offsetX: x - element.x, offsetY: y - element.y });
    }
  }

  function onMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const { x, y } = canvasCoords(event);
    setElements((current) =>
      current.map((element) => element.id === dragging.id ? { ...element, x: x - dragging.offsetX, y: y - dragging.offsetY } : element),
    );
  }

  function updateSelected(patch: Partial<CanvasElement>) {
    setElements((current) => current.map((element) => element.id === selected ? { ...element, ...patch } : element));
  }

  function deleteSelected() {
    if (!selected || selected === "bg") return;
    setElements((current) => current.filter((element) => element.id !== selected));
    setSelected(null);
  }

  function downloadCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `rareprint-design-${product.slug}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <div className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <Link href={`/web-to-print/product/${product.slug}`} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" /> Back to Product
        </Link>
        <div className="h-5 w-px bg-slate-200" />
        <span className="line-clamp-1 text-sm font-bold text-slate-900">{product.name}</span>
        <button onClick={downloadCanvas} className="ml-auto flex min-h-10 items-center gap-2 rounded-lg bg-[#CC0000] px-4 py-2 text-sm font-bold text-white hover:bg-red-800">
          <Download className="h-4 w-4" /> Download PNG
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-14 flex-col items-center gap-2 border-r border-slate-200 bg-white py-4">
          {[
            { id: "select", icon: <Square className="h-5 w-5" />, label: "Select" },
            { id: "text", icon: <Type className="h-5 w-5" />, label: "Text" },
            { id: "rect", icon: <Square className="h-5 w-5 fill-current opacity-50" />, label: "Shape" },
          ].map((item) => (
            <button
              key={item.id}
              title={item.label}
              onClick={() => setTool(item.id as "select" | "text" | "rect")}
              className={`grid h-10 w-10 place-items-center rounded-lg text-sm transition-all ${tool === item.id ? "bg-[#CC0000] text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.icon}
            </button>
          ))}
          <div className="my-2 h-px w-8 bg-slate-200" />
          <button title="Delete selected" onClick={deleteSelected} className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={() => setDragging(null)}
            className="max-w-full cursor-crosshair rounded-lg bg-white shadow-2xl"
          />
        </div>

        {selectedEl && (
          <div className="w-64 overflow-y-auto border-l border-slate-200 bg-white p-4">
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Properties</p>

            {selectedEl.type === "text" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Text</label>
                  <textarea value={selectedEl.text ?? ""} onChange={(event) => updateSelected({ text: event.target.value })} rows={3} className="w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Font Size</label>
                  <input type="number" value={selectedEl.fontSize ?? 16} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) })} className="w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Text Color</label>
                  <input type="color" value={selectedEl.color ?? "#000000"} onChange={(event) => updateSelected({ color: event.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-slate-200" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateSelected({ bold: !selectedEl.bold })} className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-bold ${selectedEl.bold ? "border-[#CC0000] bg-[#CC0000] text-white" : "border-slate-200 text-slate-700"}`}>B</button>
                  <button onClick={() => updateSelected({ italic: !selectedEl.italic })} className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-sm italic ${selectedEl.italic ? "border-[#CC0000] bg-[#CC0000] text-white" : "border-slate-200 text-slate-700"}`}>I</button>
                </div>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button key={align} onClick={() => updateSelected({ align })} className={`flex h-9 flex-1 items-center justify-center rounded-lg border ${selectedEl.align === align ? "border-[#CC0000] bg-[#CC0000] text-white" : "border-slate-200 text-slate-600"}`}>
                      {align === "left" ? <AlignLeft className="h-4 w-4" /> : align === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedEl.type === "rect" && selectedEl.id !== "bg" && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Fill Color</label>
                <input type="color" value={selectedEl.bgColor ?? "#CC0000"} onChange={(event) => updateSelected({ bgColor: event.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-slate-200" />
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
              {[
                ["X", "x"],
                ["Y", "y"],
                ["W", "width"],
                ["H", "height"],
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="mb-1 block font-semibold text-slate-500">{label}</label>
                  <input
                    type="number"
                    value={Math.round((selectedEl as any)[key])}
                    onChange={(event) => updateSelected({ [key]: Number(event.target.value) })}
                    className="w-full rounded-lg border border-slate-200 p-1.5 outline-none focus:border-slate-400"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
