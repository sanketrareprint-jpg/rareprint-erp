'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { DashboardShell } from "@/components/dashboard-shell";

const PAGE_WIDTH = 864;
const PAGE_HEIGHT = 1296;

const layouts = {
  SPARSH: {
    cols: 10,
    rows: 21,
    startX: 54,
    startY: 50,
    stepX: 77,
    stepY: 56,
    imgW: 70,
    imgH: 50,
    cutW: 77,
    cutH: 56,
    offsetX: -3,
    offsetY: -3,
  },
  SIZE_150: {
    cols: 7,
    rows: 17,
    startX: 45.35,
    startY: 26.93,
    stepX: 108.02,
    stepY: 71.97,
    imgW: 102.92,
    imgH: 67.15,
    cutW: 108.02,
    cutH: 71.97,
    offsetX: -2.55,
    offsetY: -2.41,
  },
  SIZE_175: {
    cols: 6,
    rows: 14,
    startX: 61.51,
    startY: 43.65,
    stepX: 126.14,
    stepY: 87.45,
    imgW: 119.76,
    imgH: 81.35,
    cutW: 126.14,
    cutH: 87.45,
    offsetX: -3.19,
    offsetY: -3.05,
  },
  // Grid geometry extracted directly from the reference PDF (vector cut
  // lines + registration marks), not eyeballed: 7 cols x 23 rows, cut cells
  // pitched exactly 1.5in (108pt) wide and ~0.739in (53.22pt) tall — the
  // PDF's own dieline is already calibrated slightly under the nominal
  // 0.75in (54pt), the same way SIZE_150/SIZE_175 above are each calibrated
  // a little under their own nominal pitch. Margins: 0.75in left/right,
  // 0.5in top/bottom on the 12x18in sheet. Image inset (offsetX/offsetY)
  // reuses SIZE_150's inset ratio — the PDF has no design image, only
  // dielines, so there's nothing to extract it from directly.
  SIZE_150_075: {
    cols: 7,
    rows: 23,
    startX: 56.55,
    startY: 37.78,
    stepX: 108,
    stepY: 53.22,
    imgW: 102.9,
    imgH: 49.66,
    cutW: 108,
    cutH: 53.22,
    offsetX: -2.55,
    offsetY: -1.78,
  },
};

const LAYOUT_META = {
  SPARSH: {
    label: '1X0.75 INCH',
    subtitle: 'SHEET 1x0.75 IN',
    stickerSize: '27.3 x 20.7 mm',
    description: 'Small format sticker',
  },
  SIZE_150: {
    label: '1.5x1 INCH',
    subtitle: 'SHEET 1.5x1 IN',
    stickerSize: '38.1 x 25.4 mm',
    description: '8x18 grid — 144 per sheet',
  },
  SIZE_175: {
    label: '1.75x1.25 INCH',
    subtitle: 'SHEET 1.75x1.25 IN',
    stickerSize: '44.5 x 31.8 mm',
    description: '6x14 grid — 84 per sheet',
  },
  SIZE_150_075: {
    label: '1.5x0.75 INCH',
    subtitle: 'SHEET 1.5x0.75 IN',
    stickerSize: '38.1 x 19.05 mm',
    description: '7x23 grid — 161 per sheet',
  },
};

// Custom size: user types a sticker width/height (in) and the grid is
// computed to fit, rather than hand-tuned per size like the presets above.
// Fit against the same 11.5x17.5in usable print area the rate-calculator
// module already assumes for 12x18 in-house sheets (12x18 sheet minus a
// 0.25in margin on every side), so a custom size prints inside the same
// safe area the standard sizes do. Custom sizes draw no cut line, so the
// image fills the full entered size with no inset — the gap inputs are then
// the exact visible spacing between printed stickers (0 = touching).
const CUSTOM_USABLE_W = 828; // 11.5in
const CUSTOM_USABLE_H = 1260; // 17.5in

function computeCustomLayout(widthIn: number, heightIn: number, gapXIn: number, gapYIn: number) {
  const cellW = widthIn * 72;
  const cellH = heightIn * 72;
  if (!Number.isFinite(cellW) || !Number.isFinite(cellH) || cellW <= 0 || cellH <= 0) {
    return { cols: 0, rows: 0, startX: 0, startY: 0, stepX: 0, stepY: 0, imgW: 0, imgH: 0, cutW: 0, cutH: 0, offsetX: 0, offsetY: 0 };
  }
  // Gap between stickers -- pure spacing added to the pitch between cells,
  // set separately per axis. cols/rows fit n cells + (n-1) gaps into the usable
  // area: n*cellW + (n-1)*gap <= USABLE_W  =>  n <= (USABLE_W + gap) / (cellW + gap).
  const gapX = Math.max(0, Number.isFinite(gapXIn) ? gapXIn : 0) * 72;
  const gapY = Math.max(0, Number.isFinite(gapYIn) ? gapYIn : 0) * 72;
  const stepX = cellW + gapX;
  const stepY = cellH + gapY;
  const cols = Math.max(0, Math.floor((CUSTOM_USABLE_W + gapX) / stepX));
  const rows = Math.max(0, Math.floor((CUSTOM_USABLE_H + gapY) / stepY));
  const totalW = cols > 0 ? cols * stepX - gapX : 0;
  const totalH = rows > 0 ? rows * stepY - gapY : 0;
  return {
    cols,
    rows,
    startX: (PAGE_WIDTH - totalW) / 2,
    startY: (PAGE_HEIGHT - totalH) / 2,
    stepX,
    stepY,
    imgW: cellW,
    imgH: cellH,
    cutW: cellW,
    cutH: cellH,
    offsetX: 0,
    offsetY: 0,
  };
}

function StickerSheetContent() {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [layout, setLayout] = useState<'SPARSH' | 'SIZE_150' | 'SIZE_175' | 'SIZE_150_075' | 'CUSTOM'>('SPARSH');
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [customWidthIn, setCustomWidthIn] = useState('');
  const [customHeightIn, setCustomHeightIn] = useState('');
  const [customGapXIn, setCustomGapXIn] = useState('0');
  const [customGapYIn, setCustomGapYIn] = useState('0');
  const [borderEnabled, setBorderEnabled] = useState(false);
  const [borderWidthPt, setBorderWidthPt] = useState('1');
  const [borderColor, setBorderColor] = useState('#000000');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const customCfg = computeCustomLayout(parseFloat(customWidthIn), parseFloat(customHeightIn), parseFloat(customGapXIn) || 0, parseFloat(customGapYIn) || 0);
  // Border stroke (custom only), in pt. Drawn inside each sticker's edge so
  // it never spills into the gap or a neighbouring sticker.
  const borderPt = layout === 'CUSTOM' && borderEnabled ? Math.max(0, parseFloat(borderWidthPt) || 0) : 0;
  const cfg = layout === 'CUSTOM' ? customCfg : layouts[layout];
  const meta = layout === 'CUSTOM'
    ? {
        label: customWidthIn && customHeightIn ? `${customWidthIn}x${customHeightIn} INCH` : 'CUSTOM SIZE',
        subtitle: 'CUSTOM SIZE',
        stickerSize: customWidthIn && customHeightIn
          ? `${(parseFloat(customWidthIn) * 25.4).toFixed(1)} x ${(parseFloat(customHeightIn) * 25.4).toFixed(1)} mm`
          : 'Enter size',
        description: customCfg.cols > 0 && customCfg.rows > 0
          ? `${customCfg.cols}x${customCfg.rows} grid — ${customCfg.cols * customCfg.rows} per sheet`
          : 'Enter a width and height to fit',
      }
    : LAYOUT_META[layout];
  const totalStickers = cfg.cols * cfg.rows;

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SCALE = canvas.width / PAGE_WIDTH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sheet background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sheet border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

    const drawStickers = (imgEl?: HTMLImageElement) => {
      for (let row = 0; row < cfg.rows; row++) {
        for (let col = 0; col < cfg.cols; col++) {
          const x = (cfg.startX + col * cfg.stepX) * SCALE;
          const y = (cfg.startY + row * cfg.stepY) * SCALE;

          // Cut border — custom sizes are rarely die-cut, so skip the red
          // cut-line marking for them (still drawn for every preset size).
          if (layout !== 'CUSTOM') {
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(
              (cfg.startX + col * cfg.stepX + cfg.offsetX) * SCALE,
              (cfg.startY + row * cfg.stepY + cfg.offsetY) * SCALE,
              cfg.cutW * SCALE,
              cfg.cutH * SCALE
            );
          }

          if (imgEl) {
            ctx.drawImage(imgEl, x, y, cfg.imgW * SCALE, cfg.imgH * SCALE);
          } else {
            // Placeholder cell
            ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
            ctx.fillRect(x, y, cfg.imgW * SCALE, cfg.imgH * SCALE);
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, cfg.imgW * SCALE, cfg.imgH * SCALE);
          }

          if (borderPt > 0) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = borderPt * SCALE;
            ctx.strokeRect(
              x + (borderPt / 2) * SCALE,
              y + (borderPt / 2) * SCALE,
              (cfg.imgW - borderPt) * SCALE,
              (cfg.imgH - borderPt) * SCALE
            );
          }
        }
      }

      // Custom sizes aren't Toyocut-cut, so no corner dots / dash for them.
      if (layout === 'CUSTOM') return;

      // Corner dots - 2.5mm from each edge = 7.09px, radius = 7.09px
      ctx.fillStyle = 'rgb(33, 31, 28)';
      const dotR = layout === 'SPARSH' ? 7.26 * SCALE : 7.09 * SCALE;
      const dotPositions = layout === 'SPARSH'
        ? [[31.62, 31.62], [832.38, 31.62], [31.62, 1264.38], [832.38, 1264.38]]
        : layout === 'SIZE_150_075'
        ? [[22.68, 22.68], [841.32, 22.68], [22.68, 1273.32], [841.32, 1273.32]]
        : [[20.98, 20.98], [858.05, 20.98], [20.98, 1290.33], [858.05, 1290.33]];
      dotPositions.forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(dx * SCALE, dy * SCALE, dotR, 0, Math.PI * 2);
        ctx.fill();
      });
      // Toyocut dash (TL only)
      ctx.fillStyle = 'rgb(33, 31, 28)';
      if (layout === 'SIZE_150_075') {
        ctx.fillRect(31.18 * SCALE, 15.59 * SCALE, 2.83 * SCALE, 1.42 * SCALE);
      } else {
        ctx.fillRect(39.9 * SCALE, 24.34 * SCALE, 3.3 * SCALE, 1.92 * SCALE);
      }
    };

    if (image) {
      const img = new Image();
      img.onload = () => drawStickers(img);
      img.src = image;
    } else {
      drawStickers();
    }
  }, [image, layout, cfg, borderPt, borderColor]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image);
    };
  }, [image]);

  const handleUpload = (file: File) => {
    setFileName(file.name);
    setImage(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleUpload(file);
  };

  // Builds the sheet PDF once; both Download and Print use this exact output,
  // so a direct print is identical to printing the downloaded file.
  const buildPDF = async (imageSrc: string) => {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [PAGE_WIDTH, PAGE_HEIGHT],
      });

      const img = new Image();
      img.src = imageSrc;
      await new Promise((res) => (img.onload = res));

      for (let row = 0; row < cfg.rows; row++) {
        for (let col = 0; col < cfg.cols; col++) {
          const x = cfg.startX + col * cfg.stepX;
          const y = cfg.startY + row * cfg.stepY;

          if (layout !== 'CUSTOM') {
            pdf.setDrawColor(255, 0, 0);
            pdf.rect(x + cfg.offsetX, y + cfg.offsetY, cfg.cutW, cfg.cutH);
          }

          pdf.addImage(img, 'PNG', x, y, cfg.imgW, cfg.imgH, undefined, 'FAST');

          if (borderPt > 0) {
            pdf.setDrawColor(borderColor);
            pdf.setLineWidth(borderPt);
            pdf.rect(x + borderPt / 2, y + borderPt / 2, cfg.imgW - borderPt, cfg.imgH - borderPt, 'S');
          }
        }
      }

      if (layout !== 'CUSTOM') {
        pdf.setFillColor(33, 31, 28);
        const pdfDotR = layout === 'SPARSH' ? 7.26 : 7.09;
        const pdfDots = layout === 'SPARSH'
          ? [[31.62, 31.62], [832.38, 31.62], [31.62, 1264.38], [832.38, 1264.38]]
          : layout === 'SIZE_175'
          ? [[28.32, 27.81], [847.53, 27.81], [28.32, 1278.11], [847.53, 1278.11]]
          : layout === 'SIZE_150_075'
          ? [[22.68, 22.68], [841.32, 22.68], [22.68, 1273.32], [841.32, 1273.32]]
          : [[11.99, 11.25], [831.2, 11.25], [11.99, 1262.75], [831.2, 1262.75]];
        pdfDots.forEach(([x, y]) => {
          pdf.circle(x, y, pdfDotR, 'F');
        });
        if (layout === 'SPARSH') pdf.rect(39.9, 24.34, 3.3, 1.92, 'F');
        else if (layout === 'SIZE_175') pdf.rect(36.6, 20.53, 3.3, 1.92, 'F');
        else if (layout === 'SIZE_150_075') pdf.rect(31.18, 15.59, 2.83, 1.42, 'F');
        else pdf.rect(20.27, 3.97, 3.3, 1.92, 'F');
      }

      return pdf;
  };

  const generatePDF = async () => {
    if (!image) return;
    setIsGenerating(true);
    try {
      const pdf = await buildPDF(image);
      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sticker-sheet';
      pdf.save(`${baseName} 12X18 STICKER SHEET.pdf`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Print directly: load the generated PDF into a hidden iframe and open the
  // browser's print dialog on it. Select the 12x18 paper size / "Actual size"
  // in the dialog so the sheet prints at 100% scale.
  const printPDF = async () => {
    if (!image) return;
    setIsPrinting(true);
    try {
      const pdf = await buildPDF(image);
      const url = URL.createObjectURL(pdf.output('blob'));
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.src = url;
      // Chrome's PDF viewer can fire load more than once — print only once.
      let printed = false;
      iframe.onload = () => {
        if (printed) return;
        printed = true;
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // Some browsers block printing a PDF inside an iframe — open it in a
          // new tab instead so the user can print from the PDF viewer.
          window.open(url, '_blank');
        }
        // Keep the iframe alive long enough for the print dialog to use it.
        setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(url);
        }, 60000);
      };
      document.body.appendChild(iframe);
    } finally {
      setIsPrinting(false);
    }
  };

  const canExport = !!image && totalStickers > 0;
  const inputCls = "w-full min-w-0 text-xs font-mono px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-indigo-400";

  return (
    <div style={{ fontFamily: "'DM Mono', 'Courier New', monospace" }} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-sm font-bold tracking-widest uppercase text-gray-900">
              Sticker Sheet Generator
            </h1>
            <p className="text-xs text-gray-400 tracking-wider">300 DPI · PDF READY · PRINT ACCURATE</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={printPDF}
              disabled={!canExport || isPrinting}
              title={!image ? 'Upload a design image first' : totalStickers === 0 ? 'Enter a valid custom size' : 'Print the sheet directly'}
              className={`px-3 py-1.5 rounded font-bold tracking-widest uppercase text-xs transition-all border ${
                canExport && !isPrinting
                  ? 'bg-white text-gray-900 border-gray-900 hover:bg-gray-100 active:scale-95'
                  : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
              }`}
            >
              {isPrinting ? '⏳ Preparing...' : '🖨 Print'}
            </button>
            <button
              onClick={generatePDF}
              disabled={!canExport || isGenerating}
              title={!image ? 'Upload a design image first' : totalStickers === 0 ? 'Enter a valid custom size' : 'Download the sheet PDF'}
              className={`px-3 py-1.5 rounded font-bold tracking-widest uppercase text-xs transition-all border ${
                canExport && !isGenerating
                  ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800 active:scale-95'
                  : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
              }`}
            >
              {isGenerating ? '⏳ Generating...' : '⬇ Download PDF'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-3 flex gap-4">

        {/* LEFT PANEL — Controls */}
        <div className="w-72 flex-shrink-0 space-y-3">

          {/* Upload */}
          <div
            className={`border-2 border-dashed rounded-lg px-3 py-2 cursor-pointer transition-all flex items-center gap-3 ${
              isDragging
                ? 'border-indigo-400 bg-indigo-50'
                : image
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {image ? (
              <>
                <div className="w-10 h-10 shrink-0 rounded border border-green-200 overflow-hidden bg-white">
                  <img src={image} alt="preview" className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-green-700 font-medium truncate">{fileName}</p>
                  <p className="text-xs text-gray-400">Click to replace</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl shrink-0">🖼️</div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">Drop design image / click</p>
                  <p className="text-xs text-gray-400">PNG · JPG · WEBP</p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {/* Layout */}
          <div className="bg-white border border-gray-200 rounded-lg p-2">
            <div className="text-xs font-bold tracking-widest uppercase text-gray-500 px-1 pb-1.5">Layout</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['SPARSH', 'SIZE_150', 'SIZE_175', 'SIZE_150_075'] as const).map((key) => {
                const m = LAYOUT_META[key];
                const l = layouts[key];
                const isActive = layout === key;
                return (
                  <div key={key} onClick={() => setLayout(key)} title={m.stickerSize}
                    className={"px-2 py-1.5 rounded border cursor-pointer transition-all " + (isActive ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300")}>
                    <div className={"text-xs font-bold tracking-wider " + (isActive ? "text-indigo-700" : "text-gray-700")}>{m.label}</div>
                    <div className={"text-xs font-mono " + (isActive ? "text-indigo-500" : "text-gray-400")}>{l.cols}x{l.rows} · {l.cols * l.rows}</div>
                  </div>
                );
              })}

              {/* Custom size */}
              <div onClick={() => setLayout('CUSTOM')}
                className={"col-span-2 px-2 py-1.5 rounded border cursor-pointer transition-all " + (layout === 'CUSTOM' ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300")}>
                <div className="flex items-center justify-between">
                  <div className={"text-xs font-bold tracking-wider " + (layout === 'CUSTOM' ? "text-indigo-700" : "text-gray-700")}>CUSTOM SIZE</div>
                  {layout === 'CUSTOM' && (
                    <div className="text-xs font-mono text-indigo-500">{customCfg.cols}x{customCfg.rows} · {customCfg.cols * customCfg.rows}</div>
                  )}
                </div>
                {layout === 'CUSTOM' && (
                  <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 shrink-0 w-10">Size</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.05"
                        placeholder="W"
                        value={customWidthIn}
                        onChange={(e) => setCustomWidthIn(e.target.value)}
                        className={inputCls}
                      />
                      <span className="text-xs text-gray-400">×</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.05"
                        placeholder="H"
                        value={customHeightIn}
                        onChange={(e) => setCustomHeightIn(e.target.value)}
                        className={inputCls}
                      />
                      <span className="text-xs text-gray-400 shrink-0">in</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 shrink-0 w-10">Gap</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="H"
                        title="Horizontal gap"
                        value={customGapXIn}
                        onChange={(e) => setCustomGapXIn(e.target.value)}
                        className={inputCls}
                      />
                      <span className="text-xs text-gray-400">×</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="V"
                        title="Vertical gap"
                        value={customGapYIn}
                        onChange={(e) => setCustomGapYIn(e.target.value)}
                        className={inputCls}
                      />
                      <span className="text-xs text-gray-400 shrink-0">in</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer shrink-0">
                        <input type="checkbox" checked={borderEnabled} onChange={(e) => setBorderEnabled(e.target.checked)} />
                        Border
                      </label>
                      {borderEnabled && (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={borderWidthPt}
                            onChange={(e) => setBorderWidthPt(e.target.value)}
                            className={inputCls}
                          />
                          <span className="text-xs text-gray-400 shrink-0">pt</span>
                          <input
                            type="color"
                            value={borderColor}
                            onChange={(e) => setBorderColor(e.target.value)}
                            className="h-6 w-8 shrink-0 border border-gray-300 rounded cursor-pointer"
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
                {layout === 'CUSTOM' && customWidthIn && customHeightIn && (customCfg.cols === 0 || customCfg.rows === 0) && (
                  <p className="text-xs text-red-500 mt-1.5">Too large to fit on a 12x18 sheet — try a smaller size.</p>
                )}
              </div>
            </div>
          </div>

          {/* Sheet Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-2">
            <div className="text-xs font-bold tracking-widest uppercase text-gray-500 px-1 pb-1">Sheet Details</div>
            <div className="px-1">
              {[
                ['Layout', meta.label],
                ['Grid', `${cfg.cols} cols × ${cfg.rows} rows`],
                ['Total Stickers', `${totalStickers}`],
                ['Sticker Size', meta.stickerSize],
                ['Sheet Size', '12.25 × 18.25 in'],
                ['Resolution', '300 DPI'],
                ['Cut Border', layout === 'CUSTOM' ? 'None' : 'Red (RGB 255,0,0)'],
                ...(layout === 'CUSTOM' ? [
                  ['Gap (H × V)', `${parseFloat(customGapXIn) || 0} × ${parseFloat(customGapYIn) || 0} in`],
                  ['Border Stroke', borderPt > 0 ? `${borderPt} pt ${borderColor}` : 'None'],
                ] : []),
                ['Corner Marks', layout === 'CUSTOM' ? 'None' : '4× Toyocut dots'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-0.5 gap-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider shrink-0">{label}</span>
                  <span className="text-xs font-mono font-medium text-gray-800 truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {!image && (
            <p className="text-center text-xs text-gray-400">Upload a design image to enable Print / PDF export</p>
          )}
          {image && totalStickers === 0 && (
            <p className="text-center text-xs text-red-500">Enter a valid custom size to enable Print / PDF export</p>
          )}
        </div>

        {/* RIGHT PANEL — Preview */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Live Preview</span>
              <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
                {layout !== 'CUSTOM' && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2 border border-red-400 opacity-60"></span>
                    Cut line
                  </span>
                )}
                {layout !== 'CUSTOM' && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-gray-800"></span>
                    Corner mark
                  </span>
                )}
                {image && (
                  <span className="flex items-center gap-1 text-green-600">
                    <span>●</span> Design loaded
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center p-3 bg-gray-100">
              <canvas
                ref={canvasRef}
                width={400}
                height={600}
                className="shadow-xl rounded"
                style={{ display: 'block', height: 'calc(100vh - 130px)', minHeight: 360, width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StickerSheet() {
  return (
    <DashboardShell>
      <StickerSheetContent />
    </DashboardShell>
  );
}



