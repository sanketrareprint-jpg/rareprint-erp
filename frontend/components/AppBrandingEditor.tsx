"use client";
// Settings > App Branding — the name and logo shown in the sidebar, on the
// login pages and in page headers. Leaving the name blank (or removing the
// logo) goes back to this deployment's default (lib/brand-defaults.ts).
// Rendered for ADMIN only; the backend (/branding) also rejects everyone else.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ImageIcon, Loader2, Save, Trash2, Upload } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";
import { DEFAULT_BRAND_LOGO, DEFAULT_BRAND_NAME } from "@/lib/brand-defaults";
import { publishBranding } from "@/lib/branding";
import { BrandLogo } from "@/components/BrandLogo";

type ServerBranding = { appName: string | null; logoUrl: string | null };

const MAX_NAME = 60;
const MAX_LOGO_BYTES = 300 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function AppBrandingEditor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [server, setServer] = useState<ServerBranding>({ appName: null, logoUrl: null });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getStoredUser()?.role !== "ADMIN") { setLoading(false); return; }
    setIsAdmin(true);
    fetch(`${API_BASE_URL}/branding`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerBranding | null) => {
        if (!data) return;
        setServer(data);
        setName(data.appName ?? "");
      })
      .catch(() => setMessage({ ok: false, text: "Could not load the current branding." }))
      .finally(() => setLoading(false));
  }, []);

  if (!isAdmin) return null;

  const apply = (data: ServerBranding, text: string) => {
    setServer(data);
    setName(data.appName ?? "");
    publishBranding(data);
    setMessage({ ok: true, text });
  };

  const send = async (path: string, init: RequestInit, successText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/branding/${path}`, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
      apply(data as ServerBranding, successText);
    } catch (err) {
      setMessage({ ok: false, text: `Could not save: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => {
    const trimmed = name.trim();
    void send("name", {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ appName: trimmed || null }),
    }, trimmed ? "Name saved for everyone." : `Name reset to the default (${DEFAULT_BRAND_NAME}).`);
  };

  const uploadLogo = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) { setMessage({ ok: false, text: "Logo must be a PNG, JPG or WebP image." }); return; }
    if (file.size > MAX_LOGO_BYTES) { setMessage({ ok: false, text: "Logo must be 300 KB or smaller." }); return; }
    const form = new FormData();
    form.append("file", file);
    // No Content-Type: the browser sets the multipart boundary itself.
    const authOnly = getAuthHeaders();
    delete authOnly["Content-Type"];
    void send("logo", { method: "POST", headers: authOnly, body: form }, "Logo saved for everyone.");
  };

  const removeLogo = () => {
    void send("logo", { method: "DELETE", headers: getAuthHeaders() }, "Logo removed.");
  };

  const preview = {
    name: name.trim() || DEFAULT_BRAND_NAME,
    logoUrl: server.logoUrl || DEFAULT_BRAND_LOGO,
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 space-y-5 shadow-sm">
      <div className="flex items-start gap-3">
        <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
        <div>
          <h2 className="font-semibold text-gray-900 text-base">App Branding</h2>
          <p className="text-xs text-gray-500 mt-1">
            The name and logo everyone sees in the sidebar, on the login page and in page headers.
            Invoices use the Company Profile instead.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <BrandLogo branding={preview} size={40} />
            <span className="truncate text-base font-bold text-gray-900">{preview.name}</span>
            <span className="ml-auto text-xs text-gray-400">Preview</span>
          </div>

          <div className="space-y-2">
            <label htmlFor="app-brand-name" className="text-sm font-semibold text-gray-700">Business name</label>
            <div className="flex flex-wrap gap-2">
              <input
                id="app-brand-name"
                value={name}
                maxLength={MAX_NAME}
                placeholder={DEFAULT_BRAND_NAME}
                onChange={(e) => { setName(e.target.value); setMessage(null); }}
                className="min-h-[44px] flex-1 min-w-[200px] rounded-lg border border-gray-200 bg-white px-3 text-sm md:min-h-[36px]"
              />
              <button type="button" onClick={saveName} disabled={busy || name.trim() === (server.appName ?? "")}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-40 md:min-h-[36px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save name
              </button>
            </div>
            <p className="text-xs text-gray-400">Leave blank to use the default ({DEFAULT_BRAND_NAME}).</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Logo</p>
            <div className="flex flex-wrap gap-2">
              <input ref={fileInput} type="file" accept={LOGO_TYPES.join(",")} className="hidden"
                onChange={(e) => uploadLogo(e.target.files?.[0])} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 md:min-h-[36px]">
                <Upload className="h-4 w-4" /> {server.logoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {server.logoUrl && (
                <button type="button" onClick={removeLogo} disabled={busy}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-red-100 bg-white px-4 text-sm font-medium text-red-600 disabled:opacity-40 md:min-h-[36px]">
                  <Trash2 className="h-4 w-4" /> Remove logo
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">PNG, JPG or WebP, up to 300 KB. A square image looks best.</p>
          </div>

          {message && (
            <p className={`flex items-center gap-1.5 text-sm ${message.ok ? "text-green-700" : "text-red-600"}`} role={message.ok ? "status" : "alert"}>
              {message.ok && <CheckCircle2 className="h-4 w-4" />} {message.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
