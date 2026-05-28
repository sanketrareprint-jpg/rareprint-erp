"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Loader2, CheckCircle2, AlertCircle, Truck, Settings2 } from "lucide-react";

type CarrierCfg = {
  activeCarrier: "shiprocket" | "bigship";
  bigship: {
    username: string;
    password: string;
    accessKey: string;
    pickupWarehouseId: number | null;
    returnWarehouseId: number | null;
    isConfigured: boolean;
  };
  shiprocket: {
    email: string;
    password: string;
    pickupLocation: string;
    pickupPincode: string;
    isConfigured: boolean;
  };
};

export default function SettingsPage() {
  const [cfg, setCfg]         = useState<CarrierCfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Local edit state (passwords shown as blank when masked)
  const [activeCarrier, setActiveCarrier]     = useState<"shiprocket" | "bigship">("shiprocket");
  const [bsUsername, setBsUsername]           = useState("");
  const [bsPassword, setBsPassword]           = useState("");
  const [bsAccessKey, setBsAccessKey]         = useState("");
  const [bsPickupWH, setBsPickupWH]           = useState("");
  const [bsReturnWH, setBsReturnWH]           = useState("");
  const [srEmail, setSrEmail]                 = useState("");
  const [srPassword, setSrPassword]           = useState("");
  const [srPickupLocation, setSrPickupLocation] = useState("");
  const [srPickupPincode, setSrPickupPincode] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/carrier-config`, { headers: getAuthHeaders() });
      if (!res.ok) { setError("Could not load settings"); return; }
      const data: CarrierCfg = await res.json();
      setCfg(data);
      setActiveCarrier(data.activeCarrier);
      setBsUsername(data.bigship.username);
      setBsPassword("");          // never pre-fill masked passwords
      setBsAccessKey("");
      setBsPickupWH(data.bigship.pickupWarehouseId ? String(data.bigship.pickupWarehouseId) : "");
      setBsReturnWH(data.bigship.returnWarehouseId ? String(data.bigship.returnWarehouseId) : "");
      setSrEmail(data.shiprocket.email);
      setSrPassword("");
      setSrPickupLocation(data.shiprocket.pickupLocation);
      setSrPickupPincode(data.shiprocket.pickupPincode);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const body: Record<string, unknown> = {
        activeCarrier,
        bigship: {
          username:          bsUsername,
          ...(bsPassword   ? { password:  bsPassword  } : {}),
          ...(bsAccessKey  ? { accessKey: bsAccessKey } : {}),
          pickupWarehouseId: bsPickupWH ? parseInt(bsPickupWH, 10) : null,
          returnWarehouseId: bsReturnWH ? parseInt(bsReturnWH, 10) : null,
        },
        shiprocket: {
          email:          srEmail,
          ...(srPassword  ? { password: srPassword } : {}),
          pickupLocation: srPickupLocation,
          pickupPincode:  srPickupPincode,
        },
      };
      const res = await fetch(`${API_BASE_URL}/carrier-config`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError("Save failed"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Reload to get fresh masked state
      void load();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <DashboardShell>
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    </DashboardShell>
  );

  return (
    <DashboardShell>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings2 className="text-indigo-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Courier Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Choose your active courier provider and manage API credentials</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── Active Carrier Toggle ───────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 text-base flex items-center gap-2">
            <Truck size={18} className="text-indigo-500" /> Active Courier Provider
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {(["shiprocket", "bigship"] as const).map((carrier) => {
              const isActive = activeCarrier === carrier;
              const labels: Record<string, string> = { shiprocket: "Shiprocket", bigship: "BigShip" };
              const configured =
                carrier === "shiprocket" ? cfg?.shiprocket.isConfigured :
                carrier === "bigship"    ? cfg?.bigship.isConfigured    : false;
              return (
                <button
                  key={carrier}
                  onClick={() => setActiveCarrier(carrier)}
                  className={`relative flex flex-col items-start gap-1 rounded-xl border-2 px-5 py-4 text-left transition-all
                    ${isActive
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 bg-white hover:border-gray-300"}`}
                >
                  <span className={`font-semibold text-sm ${isActive ? "text-indigo-700" : "text-gray-700"}`}>
                    {labels[carrier]}
                  </span>
                  <span className={`text-xs flex items-center gap-1 ${configured ? "text-green-600" : "text-gray-400"}`}>
                    {configured
                      ? <><CheckCircle2 size={12} /> Configured</>
                      : "Not configured"}
                  </span>
                  {isActive && (
                    <span className="absolute top-2.5 right-3 text-xs font-bold text-indigo-600 bg-indigo-100 rounded-full px-2 py-0.5">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── BigShip Credentials ─────────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-base">BigShip API Credentials</h2>
            {cfg?.bigship.isConfigured && (
              <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                <CheckCircle2 size={13} /> Configured
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Get these from your BigShip account → <strong>API Settings</strong>.
            Contact <a href="mailto:apisupport@bigship.in" className="underline">apisupport@bigship.in</a> if you need help.
          </p>

          <div className="space-y-4">
            <Field label="Username (Email)" value={bsUsername} onChange={setBsUsername} placeholder="your@email.com" />
            <Field label="Password" value={bsPassword} onChange={setBsPassword} type="password"
              placeholder={cfg?.bigship.isConfigured ? "••••••••  (leave blank to keep current)" : "BigShip login password"} />
            <Field label="Access Key" value={bsAccessKey} onChange={setBsAccessKey} type="password"
              placeholder={cfg?.bigship.isConfigured ? "••••••••  (leave blank to keep current)" : "6e2ac11e…"} />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Warehouse IDs</p>
            <p className="text-xs text-gray-400 -mt-2">
              Find these in your BigShip panel under <strong>Warehouses</strong>.
              You can also use the <code className="bg-gray-100 px-1 rounded">GET /api/warehouse/get/list</code> API.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Pickup Warehouse ID" value={bsPickupWH} onChange={setBsPickupWH} placeholder="e.g. 44156" inputMode="numeric" />
              <Field label="Return Warehouse ID" value={bsReturnWH} onChange={setBsReturnWH} placeholder="Same as pickup" inputMode="numeric" />
            </div>
          </div>
        </section>

        {/* ── Shiprocket Credentials ──────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-base">Shiprocket API Credentials</h2>
            {cfg?.shiprocket.isConfigured && (
              <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                <CheckCircle2 size={13} /> Configured
              </span>
            )}
          </div>

          <div className="space-y-4">
            <Field label="Email" value={srEmail} onChange={setSrEmail} placeholder="shiprocket@yourcompany.com" />
            <Field label="Password" value={srPassword} onChange={setSrPassword} type="password"
              placeholder={cfg?.shiprocket.isConfigured ? "••••••••  (leave blank to keep current)" : "Shiprocket password"} />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pickup Details</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Pickup Location Name" value={srPickupLocation} onChange={setSrPickupLocation} placeholder="Office" />
              <Field label="Pickup Pincode" value={srPickupPincode} onChange={setSrPickupPincode} placeholder="442402" inputMode="numeric" />
            </div>
          </div>
        </section>

        {/* ── Save Button ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm text-sm"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Saving…" : "Save Settings"}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle2 size={16} /> Settings saved!
            </span>
          )}
        </div>

      </div>
    </DashboardShell>
  );
}

// ── Reusable input field ─────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = "text", inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-gray-50"
      />
    </div>
  );
}
