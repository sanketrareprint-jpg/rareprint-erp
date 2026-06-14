"use client";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Loader2, CheckCircle2, AlertCircle, Truck, Settings2, Wifi, WifiOff, Wallet, RefreshCw, Warehouse, Plus, Trash2, Save, Workflow, Shield, PanelLeft, FileText, Tag } from "lucide-react";

type CarrierCfg = {
  activeCarrier: "shiprocket" | "bigship";
  bigship: {
    username: string;
    password: string;
    accessKey: string;
    pickupWarehouseId: number | null;
    returnWarehouseId: number | null;
    isConfigured: boolean;
    tokenExpiresAt: string | null;
  };
  shiprocket: {
    email: string;
    password: string;
    pickupLocation: string;
    pickupPincode: string;
    isConfigured: boolean;
  };
};

type TestResult = {
  ok: boolean;
  message: string;
  walletBalance?: string;
  tokenExpiresAt?: string;
};

type BigshipWarehouse = {
  bigshipWarehouseId: number;
  name: string;
  pincode: string;
  city: string;
  state: string;
  address: string;
  contactPerson: string;
  phone: string;
  isActive: boolean;
};

type CustomField = { id: string; label: string; type: "text" | "number" | "date" | "select" | "textarea"; required?: boolean; options?: string[] };
type ProductionStage = { id: string; label: string; substages: string[] };
type ModuleOption = { key: string; label: string; href: string; fixed?: boolean; enabled: boolean };
type VirtualCeoTag = { id: string; label: string; color: string };
type ErpConfig = {
  orderFields: CustomField[];
  itemFields: CustomField[];
  productionStages: ProductionStage[];
  productionFlow: Array<{ from: string; to: string }>;
  modules: ModuleOption[];
  roleAccess: Record<string, string[]>;
  virtualCeoTags: VirtualCeoTag[];
  virtualCeoCardTags: Record<string, string>;
};

const ROLES = ["ADMIN", "AGENT", "SALES_AGENT", "ACCOUNTS", "PRODUCTION", "DISPATCH", "INHOUSE"];
const FIELD_TYPES: CustomField["type"][] = ["text", "number", "date", "select", "textarea"];
const TAG_COLORS = ["#f59e0b", "#ef4444", "#6366f1", "#10b981", "#0ea5e9", "#64748b"];

export default function SettingsPage() {
  const [cfg, setCfg]         = useState<CarrierCfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [erpConfig, setErpConfig] = useState<ErpConfig | null>(null);
  const [erpSaving, setErpSaving] = useState(false);
  const [erpSaved, setErpSaved] = useState(false);

  // Test connection state
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState<TestResult | null>(null);

  // Bigship warehouse list state
  const [bsWarehouses, setBsWarehouses]           = useState<BigshipWarehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [warehouseError, setWarehouseError]       = useState<string | null>(null);

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
      const [res, erpRes] = await Promise.all([
        fetch(`${API_BASE_URL}/carrier-config`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/erp-config`, { headers: getAuthHeaders() }),
      ]);
      if (!res.ok) { setError("Could not load settings"); return; }
      const data: CarrierCfg = await res.json();
      if (erpRes.ok) setErpConfig(await erpRes.json());
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

  const handleLoadWarehouses = async () => {
    setLoadingWarehouses(true); setWarehouseError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/carrier-config/bigship-warehouses`, { headers: getAuthHeaders() });
      if (!res.ok) { setWarehouseError("Failed to load warehouses"); return; }
      const data = await res.json() as { warehouses: BigshipWarehouse[] };
      setBsWarehouses(data.warehouses ?? []);
      if ((data.warehouses ?? []).length === 0) setWarehouseError("No warehouses found — add one in your Bigship account first.");
    } catch {
      setWarehouseError("Network error loading warehouses.");
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const handleTestBigship = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/carrier-config/test-bigship`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: "Network error — could not reach server." });
    } finally {
      setTesting(false);
    }
  };

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

  const saveErpConfig = async () => {
    if (!erpConfig) return;
    setErpSaving(true); setErpSaved(false); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/erp-config`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(erpConfig),
      });
      if (!res.ok) { setError("ERP configuration save failed"); return; }
      setErpConfig(await res.json());
      setErpSaved(true);
      setTimeout(() => setErpSaved(false), 3000);
    } catch {
      setError("Network error");
    } finally {
      setErpSaving(false);
    }
  };

  const addField = (scope: "orderFields" | "itemFields") => {
    if (!erpConfig) return;
    const id = `${scope === "orderFields" ? "order" : "item"}_${Date.now()}`;
    setErpConfig({ ...erpConfig, [scope]: [...erpConfig[scope], { id, label: "New Field", type: "text" }] });
  };

  const updateField = (scope: "orderFields" | "itemFields", index: number, patch: Partial<CustomField>) => {
    if (!erpConfig) return;
    const rows = erpConfig[scope].map((field, i) => i === index ? { ...field, ...patch } : field);
    setErpConfig({ ...erpConfig, [scope]: rows });
  };

  const removeField = (scope: "orderFields" | "itemFields", index: number) => {
    if (!erpConfig) return;
    setErpConfig({ ...erpConfig, [scope]: erpConfig[scope].filter((_, i) => i !== index) });
  };

  const addStage = () => {
    if (!erpConfig) return;
    const id = `CUSTOM_${Date.now()}`;
    setErpConfig({
      ...erpConfig,
      productionStages: [...erpConfig.productionStages, { id, label: "New Stage", substages: [] }],
    });
  };

  const updateStage = (index: number, patch: Partial<ProductionStage>) => {
    if (!erpConfig) return;
    setErpConfig({ ...erpConfig, productionStages: erpConfig.productionStages.map((stage, i) => i === index ? { ...stage, ...patch } : stage) });
  };

  const removeStage = (index: number) => {
    if (!erpConfig) return;
    const stageId = erpConfig.productionStages[index]?.id;
    setErpConfig({
      ...erpConfig,
      productionStages: erpConfig.productionStages.filter((_, i) => i !== index),
      productionFlow: erpConfig.productionFlow.filter(flow => flow.from !== stageId && flow.to !== stageId),
    });
  };

  const addVirtualCeoTag = () => {
    if (!erpConfig) return;
    setErpConfig({
      ...erpConfig,
      virtualCeoTags: [
        ...(erpConfig.virtualCeoTags ?? []),
        { id: `vceo_tag_${Date.now()}`, label: "New tag", color: TAG_COLORS[0] },
      ],
    });
  };

  const updateVirtualCeoTag = (index: number, patch: Partial<VirtualCeoTag>) => {
    if (!erpConfig) return;
    setErpConfig({
      ...erpConfig,
      virtualCeoTags: (erpConfig.virtualCeoTags ?? []).map((tag, i) => i === index ? { ...tag, ...patch } : tag),
    });
  };

  const removeVirtualCeoTag = (index: number) => {
    if (!erpConfig) return;
    const removed = erpConfig.virtualCeoTags?.[index];
    const nextCardTags = { ...(erpConfig.virtualCeoCardTags ?? {}) };
    if (removed) {
      for (const [cardId, tagId] of Object.entries(nextCardTags)) {
        if (tagId === removed.id) delete nextCardTags[cardId];
      }
    }
    setErpConfig({
      ...erpConfig,
      virtualCeoTags: (erpConfig.virtualCeoTags ?? []).filter((_, i) => i !== index),
      virtualCeoCardTags: nextCardTags,
    });
  };

  const toggleModule = (key: string) => {
    if (!erpConfig) return;
    setErpConfig({
      ...erpConfig,
      modules: erpConfig.modules.map(m => m.key === key ? { ...m, enabled: m.fixed ? true : !m.enabled } : m),
    });
  };

  const toggleRoleModule = (role: string, key: string) => {
    if (!erpConfig) return;
    const current = erpConfig.roleAccess[role] ?? [];
    const fixed = ["orders", "accounts", "production", "dispatch"].includes(key);
    const next = current.includes(key) && !fixed ? current.filter(k => k !== key) : Array.from(new Set([...current, key]));
    setErpConfig({ ...erpConfig, roleAccess: { ...erpConfig.roleAccess, [role]: next } });
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

        {erpConfig && (
          <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-base flex items-center gap-2">
                  <Settings2 size={18} className="text-indigo-500" /> SaaS ERP Configuration
                </h2>
                <p className="text-xs text-gray-500 mt-1">Customize fields, production flow, sidebar modules, and role access for each printer account.</p>
              </div>
              <button onClick={saveErpConfig} disabled={erpSaving} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-xs">
                {erpSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {erpSaving ? "Saving..." : "Save ERP Config"}
              </button>
            </div>
            {erpSaved && <div className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={15} /> ERP configuration saved.</div>}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ConfigPanel title="Order Fields" icon={<FileText size={16} />} action={<SmallButton onClick={() => addField("orderFields")}><Plus size={13} /> Add</SmallButton>}>
                <FieldConfigList fields={erpConfig.orderFields} onChange={(i, patch) => updateField("orderFields", i, patch)} onRemove={(i) => removeField("orderFields", i)} />
              </ConfigPanel>

              <ConfigPanel title="Item Fields" icon={<FileText size={16} />} action={<SmallButton onClick={() => addField("itemFields")}><Plus size={13} /> Add</SmallButton>}>
                <FieldConfigList fields={erpConfig.itemFields} onChange={(i, patch) => updateField("itemFields", i, patch)} onRemove={(i) => removeField("itemFields", i)} />
              </ConfigPanel>
            </div>

            <ConfigPanel title="Production Stages & Flow" icon={<Workflow size={16} />} action={<SmallButton onClick={addStage}><Plus size={13} /> Stage</SmallButton>}>
              <div className="space-y-3">
                {erpConfig.productionStages.map((stage, index) => (
                  <div key={stage.id} className="grid grid-cols-[1fr_1.2fr_32px] gap-2 items-center rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <input value={stage.label} onChange={e => updateStage(index, { label: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-xs" />
                    <input value={stage.substages.join(", ")} onChange={e => updateStage(index, { substages: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} placeholder="Sub stages: Cutting, Lamination" className="border border-gray-200 rounded-lg px-3 py-2 text-xs" />
                    <button onClick={() => removeStage(index)} className="text-red-500 hover:bg-red-50 rounded-lg p-2"><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
                  <p className="text-xs font-semibold text-indigo-800 mb-2">Flow maker</p>
                  <div className="flex flex-wrap gap-2">
                    {erpConfig.productionStages.map((stage, index) => {
                      const next = erpConfig.productionStages[index + 1];
                      return (
                        <span key={stage.id} className="text-xs text-indigo-800 bg-white border border-indigo-100 rounded-full px-3 py-1">
                          {stage.label}{next ? ` -> ${next.label}` : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ConfigPanel>

            <ConfigPanel title="Sidebar Modules" icon={<PanelLeft size={16} />}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {erpConfig.modules.map(module => (
                  <button key={module.key} onClick={() => toggleModule(module.key)} disabled={module.fixed} className={`text-left rounded-lg border px-3 py-2 text-xs ${module.enabled ? "border-green-200 bg-green-50 text-green-800" : "border-gray-200 bg-gray-50 text-gray-500"} ${module.fixed ? "cursor-not-allowed" : "hover:border-indigo-200"}`}>
                    <span className="font-semibold block">{module.label}</span>
                    <span>{module.fixed ? "Fixed" : module.enabled ? "Enabled" : "Hidden"}</span>
                  </button>
                ))}
              </div>
            </ConfigPanel>

            <ConfigPanel title="Virtual CEO Card Tags" icon={<Tag size={16} />} action={<SmallButton onClick={addVirtualCeoTag}><Plus size={13} /> Tag</SmallButton>}>
              <div className="space-y-2">
                {(erpConfig.virtualCeoTags ?? []).length === 0 && <p className="text-xs text-gray-400">No tags yet.</p>}
                {(erpConfig.virtualCeoTags ?? []).map((tag, index) => (
                  <div key={tag.id} className="grid grid-cols-[1fr_150px_32px] gap-2 items-center rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <input value={tag.label} onChange={e => updateVirtualCeoTag(index, { label: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-xs" />
                    <div className="flex items-center gap-1.5">
                      {TAG_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateVirtualCeoTag(index, { color })}
                          className={`h-6 w-6 rounded-full border ${tag.color === color ? "border-gray-900 ring-2 ring-gray-300" : "border-gray-200"}`}
                          style={{ background: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <button onClick={() => removeVirtualCeoTag(index)} className="text-red-500 hover:bg-red-50 rounded-lg p-2"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </ConfigPanel>

            <ConfigPanel title="Role Access" icon={<Shield size={16} />}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead><tr><th className="text-left py-2 pr-3 text-gray-500">Role</th>{erpConfig.modules.filter(m => m.enabled || m.fixed).map(m => <th key={m.key} className="px-2 py-2 text-gray-500 font-medium">{m.label}</th>)}</tr></thead>
                  <tbody>
                    {ROLES.map(role => (
                      <tr key={role} className="border-t border-gray-100">
                        <td className="py-2 pr-3 font-semibold text-gray-700">{role.replace("_", " ")}</td>
                        {erpConfig.modules.filter(m => m.enabled || m.fixed).map(m => {
                          const checked = (erpConfig.roleAccess[role] ?? []).includes(m.key);
                          const fixed = ["orders", "accounts", "production", "dispatch"].includes(m.key);
                          return (
                            <td key={m.key} className="text-center py-2">
                              <input type="checkbox" checked={checked || fixed} disabled={fixed} onChange={() => toggleRoleModule(role, m.key)} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ConfigPanel>
          </section>
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

        {/* ── BigShip Direct Credentials ──────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-base">Bigship Direct API Credentials</h2>
            {cfg?.bigship.isConfigured && (
              <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                <CheckCircle2 size={13} /> Configured
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Uses the <strong>Bigship Direct</strong> unified outbound API (<code className="bg-gray-100 px-1 rounded">api.bigship.direct</code>).
            For access key, contact <a href="mailto:support@bigship.in" className="underline">support@bigship.in</a>.
          </p>

          <div className="space-y-4">
            <Field label="Username (Email)" value={bsUsername} onChange={setBsUsername} placeholder="your@email.com" />
            <Field label="Password" value={bsPassword} onChange={setBsPassword} type="password"
              placeholder={cfg?.bigship.isConfigured ? "••••••••  (leave blank to keep current)" : "Bigship login password"} />
            <Field label="Access Key" value={bsAccessKey} onChange={setBsAccessKey} type="password"
              placeholder={cfg?.bigship.isConfigured ? "••••••••  (leave blank to keep current)" : "your_access_key"} />
          </div>

          {/* Token Status */}
          {cfg?.bigship.isConfigured && cfg.bigship.tokenExpiresAt && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
              <Wifi size={13} className="shrink-0" />
              <span>
                Active token · expires{" "}
                <strong>{new Date(cfg.bigship.tokenExpiresAt).toLocaleString("en-IN", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                })}</strong>
              </span>
            </div>
          )}

          {/* Test Connection Result */}
          {testResult && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs
              ${testResult.ok
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-700"}`}>
              {testResult.ok
                ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                : <WifiOff size={13} className="mt-0.5 shrink-0" />}
              <div className="space-y-0.5">
                <p className="font-medium">{testResult.message}</p>
                {testResult.walletBalance && (
                  <p className="flex items-center gap-1">
                    <Wallet size={11} /> Wallet balance: ₹{testResult.walletBalance}
                  </p>
                )}
                {testResult.tokenExpiresAt && (
                  <p>Token expires: {new Date(testResult.tokenExpiresAt).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                  })}</p>
                )}
              </div>
            </div>
          )}

          {/* Test Connection Button */}
          <div>
            <button
              onClick={handleTestBigship}
              disabled={testing || !cfg?.bigship.isConfigured}
              className="flex items-center gap-2 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium px-4 py-2 rounded-lg text-xs transition-colors"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
              {testing ? "Testing connection…" : "Test Connection"}
            </button>
            {!cfg?.bigship.isConfigured && (
              <p className="text-xs text-gray-400 mt-1.5">Save credentials first before testing.</p>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                <Warehouse size={13} /> Pickup Warehouses
              </p>
              <button
                onClick={handleLoadWarehouses}
                disabled={loadingWarehouses || !cfg?.bigship.isConfigured}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {loadingWarehouses
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RefreshCw size={12} />}
                {loadingWarehouses ? "Loading…" : "Load from Bigship"}
              </button>
            </div>

            {warehouseError && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} />{warehouseError}</p>
            )}

            {/* Live warehouse dropdown */}
            {bsWarehouses.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-600">Default Pickup Warehouse</label>
                  <select
                    value={bsPickupWH}
                    onChange={(e) => { setBsPickupWH(e.target.value); if (!bsReturnWH) setBsReturnWH(e.target.value); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  >
                    <option value="">— Select warehouse —</option>
                    {bsWarehouses.filter(w => w.isActive).map((w) => (
                      <option key={w.bigshipWarehouseId} value={String(w.bigshipWarehouseId)}>
                        {w.name} — {w.city} {w.pincode}
                      </option>
                    ))}
                  </select>
                  {bsPickupWH && (() => {
                    const wh = bsWarehouses.find(w => String(w.bigshipWarehouseId) === bsPickupWH);
                    return wh ? (
                      <p className="text-xs text-gray-400">{wh.address}, {wh.city}, {wh.state} · {wh.contactPerson} · {wh.phone}</p>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-600">Return Warehouse</label>
                  <select
                    value={bsReturnWH}
                    onChange={(e) => setBsReturnWH(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  >
                    <option value="">— Same as pickup —</option>
                    {bsWarehouses.filter(w => w.isActive).map((w) => (
                      <option key={w.bigshipWarehouseId} value={String(w.bigshipWarehouseId)}>
                        {w.name} — {w.city} {w.pincode}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* Fallback manual entry if warehouses not loaded yet */
              <div className="space-y-3">
                <p className="text-xs text-gray-400">
                  Click <strong>Load from Bigship</strong> above to see your warehouses, or enter IDs manually below.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Pickup Warehouse ID" value={bsPickupWH} onChange={setBsPickupWH} placeholder="e.g. 218" inputMode="numeric" />
                  <Field label="Return Warehouse ID" value={bsReturnWH} onChange={setBsReturnWH} placeholder="Same as pickup" inputMode="numeric" />
                </div>
              </div>
            )}
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

function ConfigPanel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">{icon}{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
      {children}
    </button>
  );
}

function FieldConfigList({ fields, onChange, onRemove }: { fields: CustomField[]; onChange: (index: number, patch: Partial<CustomField>) => void; onRemove: (index: number) => void }) {
  return (
    <div className="space-y-2">
      {fields.length === 0 && <p className="text-xs text-gray-400">No custom fields yet.</p>}
      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-2">
          <div className="grid grid-cols-[1fr_110px_72px_28px] gap-2 items-center">
            <input value={field.label} onChange={e => onChange(index, { label: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-xs" />
            <select value={field.type} onChange={e => onChange(index, { type: e.target.value as CustomField["type"] })} className="border border-gray-200 rounded-lg px-2 py-2 text-xs">
              {FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={!!field.required} onChange={e => onChange(index, { required: e.target.checked })} />
              Req
            </label>
            <button onClick={() => onRemove(index)} className="text-red-500 hover:bg-red-50 rounded-lg p-2"><Trash2 size={14} /></button>
          </div>
          {field.type === "select" && (
            <input value={(field.options ?? []).join(", ")} onChange={e => onChange(index, { options: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} placeholder="Options: Small, Medium, Large" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs" />
          )}
        </div>
      ))}
    </div>
  );
}
