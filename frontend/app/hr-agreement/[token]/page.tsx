"use client";
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { FileSignature, CheckCircle2, Loader2, AlertTriangle, Paperclip } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

type AgreementData = {
  employeeName: string;
  termsTitle: string;
  termsContent: string;
  alreadyAccepted: boolean;
  acceptedAt: string | null;
  signatureName: string | null;
};

export default function HrAgreementPage() {
  const params = useParams();
  const token = String(params?.token ?? "");

  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [idProofFile, setIdProofFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/hr/agreement/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.message || "This link is invalid or has expired.");
        }
        return res.json();
      })
      .then((d: AgreementData) => {
        setData(d);
        if (d.alreadyAccepted) setAccepted(true);
      })
      .catch((err) => setError(err.message || "Could not load this agreement."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!signatureName.trim() || !agreed || !idProofFile) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("signatureName", signatureName.trim());
      form.append("file", idProofFile);
      const res = await fetch(`${API_BASE_URL}/hr/agreement/${token}/accept`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "Could not submit acceptance.");
      }
      setAccepted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <FileSignature size={22} />
          <h1 className="text-lg font-bold">RarePrint — HR Agreement</h1>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading agreement...
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {accepted ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Thank you, {data.employeeName}. Your acceptance and ID proof have been recorded.</div>
                  {data.acceptedAt && <div className="text-xs text-green-700 mt-1">Accepted on {new Date(data.acceptedAt).toLocaleString("en-IN")}</div>}
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">Hi {data.employeeName}, please review the terms below and confirm your acceptance.</p>
                <div className="border border-slate-200 rounded-lg">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">{data.termsTitle}</div>
                  <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto">{data.termsContent}</div>
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4" />
                  I have read and agree to the terms above.
                </label>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type your full name to sign</label>
                  <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Your full name" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Upload a scan/photo of your ID proof (required)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setIdProofFile(e.target.files?.[0] ?? null)}
                    className="mt-1 w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {idProofFile && (
                    <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                      <Paperclip size={12} /> {idProofFile.name} ({(idProofFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">Image or PDF, up to 5 MB.</p>
                </div>
                <button
                  onClick={handleAccept}
                  disabled={!agreed || !signatureName.trim() || !idProofFile || submitting}
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-brand-600 text-white rounded-lg px-4 py-2.5 hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Accept & Sign
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
