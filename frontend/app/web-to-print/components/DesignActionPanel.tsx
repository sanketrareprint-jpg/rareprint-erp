"use client";

import { MessageCircle, Palette, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { type Product } from "../catalog";

export function DesignActionPanel({ product, selectedQty }: { product: Product; selectedQty: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const whatsapp = `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919XXXXXXXXX"}?text=${encodeURIComponent(`Hi RarePrint, I need design help for ${product.name}, quantity ${selectedQty}.`)}`;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.tiff"
        className="hidden"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="min-h-11 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-400">
        <Upload className="mb-3 h-5 w-5 text-slate-600" />
        <strong className="block text-base font-black">Upload Artwork</strong>
        <span className="mt-1 block text-sm font-semibold text-slate-600">{fileName || "Choose File"}</span>
      </button>
      <Link href={`/web-to-print/studio/${product.slug}`} className="min-h-11 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
        <Wand2 className="mb-3 h-5 w-5 text-slate-600" />
        <strong className="block text-base font-black">Design in Studio</strong>
        <span className="mt-1 block text-sm font-semibold text-slate-600">Open Studio →</span>
      </Link>
      <a href="https://www.canva.com/design?utm_source=rareprint" target="_blank" rel="noreferrer" className="min-h-11 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
        <Palette className="mb-3 h-5 w-5 text-slate-600" />
        <strong className="block text-base font-black">Open in Canva</strong>
        <span className="mt-1 block text-sm font-semibold text-slate-600">Open Canva →</span>
      </a>
      <a href={whatsapp} target="_blank" rel="noreferrer" className="min-h-11 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
        <MessageCircle className="mb-3 h-5 w-5 text-slate-600" />
        <strong className="block text-base font-black">Ask Designer</strong>
        <span className="mt-1 block text-sm font-semibold text-slate-600">WhatsApp →</span>
      </a>
    </div>
  );
}
