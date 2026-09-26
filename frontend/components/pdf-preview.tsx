"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// Draws a PDF onto <canvas> elements with pdf.js instead of showing it in an
// <iframe>: Chrome on Android, the Capacitor app's WebView and iOS Safari
// have no (or only a partial) inline PDF viewer, so an iframe comes up blank
// there. Canvas rendering looks the same in every browser.
export function PdfPreview({ data }: { data: Blob }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy: () => Promise<void> } | null = null;
    setStatus("loading");

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // Parse on the main thread (pdf.js picks up globalThis.pdfjsWorker)
        // rather than a separate worker file that would have to be hosted —
        // works identically on Vercel and in the static Android export.
        // Invoices are one or two pages, so this stays fast.
        const g = globalThis as { pdfjsWorker?: unknown };
        // @ts-expect-error -- the worker bundle ships without type declarations
        if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) }).promise;
        doc = pdf;
        const container = pagesRef.current;
        if (cancelled || !container) return;
        container.replaceChildren();

        const cssWidth = container.clientWidth;
        const pixelRatio = window.devicePixelRatio || 1;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const scale = (cssWidth / page.getViewport({ scale: 1 }).width) * pixelRatio;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.className = "mb-3 block bg-white shadow";
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setStatus("ready");
      } catch (err) {
        console.error("PDF preview failed:", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [data]);

  return (
    <div className="relative h-full overflow-auto bg-slate-100 p-3">
      {status === "loading" && (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      )}
      {status === "error" && (
        <div className="py-16 text-center text-sm text-red-600">Could not display the preview. Use Download instead.</div>
      )}
      <div ref={pagesRef} />
    </div>
  );
}
