'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';

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
    cols: 8,
    rows: 18,
    startX: 0,
    startY: 0,
    stepX: 108,
    stepY: 72,
    imgW: 106,
    imgH: 70,
    cutW: 108,
    cutH: 72,
    offsetX: 0,
    offsetY: 0,
  },
  SIZE_175: {
    cols: 7,
    rows: 14,
    startX: 0,
    startY: 0,
    stepX: 123,
    stepY: 92,
    imgW: 123,
    imgH: 88,
    cutW: 123,
    cutH: 92,
    offsetX: 0,
    offsetY: 0,
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
    description: 'Medium format — 144 per sheet',
  },
  SIZE_175: {
    label: '1.75x1.25 INCH',
    subtitle: 'SHEET 1.75x1.25 IN',
    stickerSize: '44.5 x 31.8 mm',
    description: 'Large format — 98 per sheet',
  },
};

export default function StickerSheet() {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [layout, setLayout] = useState<'SPARSH' | 'SIZE_150' | 'SIZE_175'>('SPARSH');
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cfg = layouts[layout];
  const meta = LAYOUT_META[layout];
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

          // Cut border
          ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(
            (cfg.startX + col * cfg.stepX + cfg.offsetX) * SCALE,
            (cfg.startY + row * cfg.stepY + cfg.offsetY) * SCALE,
            cfg.cutW * SCALE,
            cfg.cutH * SCALE
          );

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
        }
      }

      // Corner dots
      ctx.fillStyle = 'rgb(33, 31, 28)';
      const dotR = 7.26 * SCALE;
      [[31.62, 31.62], [832.38, 31.62], [31.62, 1264.38], [832.38, 1264.38]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(dx * SCALE, dy * SCALE, dotR, 0, Math.PI * 2);
        ctx.fill();
      });

      // Toyocut dash (TL only)
      ctx.fillStyle = 'rgb(33, 31, 28)';
      ctx.fillRect(39.9 * SCALE, 24.34 * SCALE, 3.3 * SCALE, 1.92 * SCALE);
    };

    if (image) {
      const img = new Image();
      img.onload = () => drawStickers(img);
      img.src = image;
    } else {
      drawStickers();
    }
  }, [image, layout, cfg]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const handleUpload = (file: File) => {
    setFileName(file.name);
    setImage(URL.createObjectURL(file));
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

  const generatePDF = async () => {
    if (!image) return;
    setIsGenerating(true);

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [PAGE_WIDTH, PAGE_HEIGHT],
      });

      const img = new Image();
      img.src = image;
      await new Promise((res) => (img.onload = res));

      for (let row = 0; row < cfg.rows; row++) {
        for (let col = 0; col < cfg.cols; col++) {
          const x = cfg.startX + col * cfg.stepX;
          const y = cfg.startY + row * cfg.stepY;

          pdf.setDrawColor(255, 0, 0);
          pdf.rect(x + cfg.offsetX, y + cfg.offsetY, cfg.cutW, cfg.cutH);

          pdf.addImage(img, 'PNG', x, y, cfg.imgW, cfg.imgH, undefined, 'FAST');
        }
      }

      pdf.setFillColor(33, 31, 28);
      [[31.62, 31.62], [832.38, 31.62], [31.62, 1264.38], [832.38, 1264.38]].forEach(([x, y]) => {
        pdf.circle(x, y, 7.26, 'F');
      });
      pdf.rect(39.9, 24.34, 3.3, 1.92, 'F');

      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sticker-sheet';
      pdf.save(`${baseName} 12X18 STICKER SHEET.pdf`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ fontFamily: "'DM Mono', 'Courier New', monospace" }} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase text-gray-900">
              Sticker Sheet Generator
            </h1>
            <p className="text-xs text-gray-400 tracking-wider mt-0.5">300 DPI · PDF READY · PRINT ACCURATE</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded font-mono">
              ● READY
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6" style={{ minHeight: 'calc(100vh - 73px)' }}>

        {/* LEFT PANEL — Controls */}
        <div className="w-80 flex-shrink-0 space-y-4">

          {/* Layout Info */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Layout</span>
            </div>
            <div className="p-3">
              {(['SPARSH', 'SIZE_150', 'SIZE_175'] as const).map((key) => {
                const m = LAYOUT_META[key];
                const l = layouts[key];
                const isActive = layout === key;
                return (
                  <div key={key} onClick={() => setLayout(key)}
                    className={"px-3 py-3 rounded border cursor-pointer transition-all mb-2 " + (isActive ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={"text-sm font-bold tracking-wider " + (isActive ? "text-indigo-700" : "text-gray-700")}>{m.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{m.stickerSize}</div>
                      </div>
                      <div className="text-right">
                        <div className={"text-xs font-mono " + (isActive ? "text-indigo-600" : "text-gray-500")}>{l.cols}x{l.rows}</div>
                        <div className={"text-xs " + (isActive ? "text-indigo-500" : "text-gray-400")}>{l.cols * l.rows} stickers</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Layout Stats */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Sheet Details</span>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                ['Grid', `${cfg.cols} cols × ${cfg.rows} rows`],
                ['Total Stickers', `${totalStickers}`],
                ['Sticker Size', meta.stickerSize],
                ['Sheet Size', '12.25 × 18.25 in'],
                ['Resolution', '300 DPI'],
                ['Cut Border', 'Red (RGB 255,0,0)'],
                ['Corner Marks', '4× Toyocut dots'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
                  <span className="text-xs font-mono font-medium text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upload */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Design Image</span>
            </div>
            <div className="p-3">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-400 bg-indigo-50'
                    : image
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {image ? (
                  <div className="space-y-2">
                    <div className="w-16 h-16 mx-auto rounded border border-green-200 overflow-hidden">
                      <img src={image} alt="preview" className="w-full h-full object-contain" />
                    </div>
                    <p className="text-xs text-green-700 font-medium truncate">{fileName}</p>
                    <p className="text-xs text-gray-400">Click to replace</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-3xl">🖼️</div>
                    <p className="text-xs text-gray-500 font-medium">Drop image here</p>
                    <p className="text-xs text-gray-400">PNG · JPG · WEBP</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          </div>

          {/* Download Button */}
          <button
            onClick={generatePDF}
            disabled={!image || isGenerating}
            className={`w-full py-3.5 rounded-lg font-bold tracking-widest uppercase text-sm transition-all ${
              image && !isGenerating
                ? 'bg-gray-900 text-white hover:bg-gray-800 active:scale-95'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
          >
            {isGenerating ? '⏳ Generating PDF...' : '⬇ Download PDF'}
          </button>

          {!image && (
            <p className="text-center text-xs text-gray-400">Upload a design image to enable PDF export</p>
          )}
        </div>

        {/* RIGHT PANEL — Preview */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col flex-1">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500">Live Preview</span>
              <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 border border-red-400 opacity-60"></span>
                  Cut line
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full bg-gray-800"></span>
                  Corner mark
                </span>
                {image && (
                  <span className="flex items-center gap-1 text-green-600">
                    <span>●</span> Design loaded
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
              <div className="shadow-xl rounded overflow-hidden" style={{ maxHeight: '75vh' }}>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={600}
                  style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '75vh' }}
                />
              </div>
            </div>

            {/* Bottom stats bar */}
            <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Layout</span>
                <span className="text-xs font-mono font-bold text-gray-700">{meta.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Grid</span>
                <span className="text-xs font-mono font-bold text-gray-700">{cfg.cols}×{cfg.rows}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Stickers</span>
                <span className="text-xs font-mono font-bold text-indigo-600">{totalStickers}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Sheet</span>
                <span className="text-xs font-mono font-bold text-gray-700">12.25 × 18.25 in</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



