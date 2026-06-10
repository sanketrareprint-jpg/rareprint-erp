"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

const allowed = ".pdf,.ai,.psd,.png,.jpg,.jpeg,.tiff";

export function ArtworkUploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");

  function onFile(file?: File) {
    if (!file) return;
    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      selectedAt: new Date().toISOString(),
    };
    window.localStorage.setItem("rareprint.artworkUpload", JSON.stringify(metadata));
    setFileName(file.name);
    setStatus("Artwork selected. It will be attached during checkout review.");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <Upload className="h-7 w-7 text-slate-700" />
      <h2 className="mt-4 text-xl font-black">Upload Your Artwork File</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
        Upload your PDF, AI, PSD, PNG, JPG, or TIFF file. We store the artwork metadata now and review the file before production.
      </p>
      <input ref={inputRef} type="file" accept={allowed} className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
      <div className="mt-4 flex flex-wrap gap-2">
        {["PDF", "AI", "PSD", "PNG", "JPG", "TIFF"].map((chip) => (
          <span key={chip} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">{chip}</span>
        ))}
      </div>
      <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#CC0000] px-4 py-3 text-sm font-black text-white">
        Choose File
      </button>
      {fileName && <p className="mt-3 text-sm font-bold text-slate-700">Selected: {fileName}</p>}
      {status && <p className="mt-2 text-sm font-semibold text-green-700">{status}</p>}
    </div>
  );
}
