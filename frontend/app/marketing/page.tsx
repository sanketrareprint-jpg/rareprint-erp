"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  BarChart3,
  FileUp,
  Copy,
  Trash2,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";

type Template = {
  id: string;
  name: string;
  aisensyCampaignName: string;
  templateType: string;
  language: string;
  body: string;
  mediaUrl?: string;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  dailyLimit: number;
  cooldownDays: number;
  priority: number;
  steps: { id: string; stepOrder: number; delayHours: number; template: Template }[];
  _count?: { jobs: number; events: number };
};

type Contact = {
  id: string;
  mobile: string;
  shopName?: string;
  ownerName?: string;
  city?: string;
  state?: string;
  productCategory?: string;
  engagementScore: number;
  leadTemperature: string;
  isBlacklisted: boolean;
  optedOutAt?: string;
};

type Overview = {
  contacts: number;
  activeCampaigns: number;
  queued: number;
  sentToday: number;
  repliesToday: number;
  hotLeads: number;
};

const emptyTemplate = {
  name: "",
  aisensyCampaignName: "",
  templateType: "TEXT",
  language: "en",
  body: "",
  mediaUrl: "",
  variables: "ownerName,shopName",
};

const contactCsvSample = `mobile,shopName,ownerName,city,state,productCategory,tags
9876543210,Raju Medical,Raju,Nashik,Maharashtra,Paper Bags,chemist`;

function authHeaders() {
  return { ...getAuthHeaders(), "Content-Type": "application/json" };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <Icon size={18} className="text-blue-600" />
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function MarketingPageContent() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"campaigns" | "contacts" | "templates" | "analytics">("campaigns");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importingContacts, setImportingContacts] = useState(false);
  const [importResult, setImportResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const [campaignMessage, setCampaignMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [queueMessage, setQueueMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedCsvName, setSelectedCsvName] = useState("");
  const csvFileRef = useRef<HTMLInputElement | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    dailyLimit: "10000",
    cooldownDays: "30",
    priority: "0",
    city: "",
    state: "",
    productCategory: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const [overviewRes, campaignsRes, templatesRes, contactsRes, analyticsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/marketing/overview`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/marketing/campaigns`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/marketing/templates`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/marketing/contacts?${params}`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/marketing/analytics`, { headers: getAuthHeaders() }),
    ]);
    if (overviewRes.ok) setOverview(await overviewRes.json());
    if (campaignsRes.ok) setCampaigns(await campaignsRes.json());
    if (templatesRes.ok) setTemplates(await templatesRes.json());
    if (contactsRes.ok) setContacts((await contactsRes.json()).items ?? []);
    if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    setLoading(false);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!campaignForm.templateId && templates[0]) {
      setCampaignForm((form) => ({ ...form, templateId: templates[0].id }));
    }
  }, [campaignForm.templateId, templates]);

  const hotContacts = useMemo(() => contacts.filter((contact) => contact.leadTemperature === "HOT"), [contacts]);

  const createTemplate = async () => {
    if (!templateForm.name || !templateForm.aisensyCampaignName || !templateForm.body) return;
    await fetch(`${API_BASE_URL}/marketing/templates`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...templateForm,
        variables: templateForm.variables.split(",").map((item) => item.trim()).filter(Boolean),
      }),
    });
    setTemplateForm(emptyTemplate);
    load();
  };

  const createCampaign = async () => {
    if (!campaignForm.name || !campaignForm.templateId) return;
    let segmentId: string | undefined;
    const filters = {
      city: campaignForm.city || undefined,
      state: campaignForm.state || undefined,
      productCategory: campaignForm.productCategory || undefined,
    };
    if (filters.city || filters.state || filters.productCategory) {
      const segmentRes = await fetch(`${API_BASE_URL}/marketing/segments`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: `${campaignForm.name} Audience`, filters }),
      });
      if (segmentRes.ok) segmentId = (await segmentRes.json()).id;
    }

    await fetch(`${API_BASE_URL}/marketing/campaigns`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: campaignForm.name,
        dailyLimit: Number(campaignForm.dailyLimit),
        cooldownDays: Number(campaignForm.cooldownDays),
        priority: Number(campaignForm.priority),
        segmentId,
        steps: [{ templateId: campaignForm.templateId, stepOrder: 1, delayHours: 0 }],
      }),
    });
    setCampaignForm({ name: "", templateId: templates[0]?.id ?? "", dailyLimit: "10000", cooldownDays: "30", priority: "0", city: "", state: "", productCategory: "" });
    load();
  };

  const importContacts = async () => {
    setImportResult(null);
    setImportProgress("");
    const lines = csvText.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      setImportResult({ type: "error", message: "Paste your CSV contacts first, or click Use sample to test the import." });
      return;
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, "").trim());
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });

    if (!headers.includes("mobile") && !headers.includes("phone")) {
      setImportResult({ type: "error", message: "CSV must include a mobile or phone column." });
      return;
    }

    setImportingContacts(true);
    try {
      const batchSize = 1000;
      const totals = { success: 0, updated: 0, skipped: 0 };

      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        const done = Math.min(start + batch.length, rows.length);
        setImportProgress(`Importing ${done.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")} contacts...`);

        const response = await fetch(`${API_BASE_URL}/marketing/contacts/import`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ rows: batch }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || `Import failed with status ${response.status}`);
        }

        totals.success += data?.success ?? 0;
        totals.updated += data?.updated ?? 0;
        totals.skipped += data?.skipped ?? 0;
      }

      setCsvText("");
      setSelectedCsvName("");
      setImportResult({
        type: "success",
        message: `Imported ${totals.success.toLocaleString("en-IN")}, updated ${totals.updated.toLocaleString("en-IN")}, skipped ${totals.skipped.toLocaleString("en-IN")}.`,
      });
      await load();
    } catch (error) {
      setImportResult({ type: "error", message: error instanceof Error ? error.message : "Import failed. Please try again." });
    } finally {
      setImportingContacts(false);
      setImportProgress("");
    }
  };

  const uploadCsvFile = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportResult({ type: "error", message: "Please choose a .csv file." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setSelectedCsvName(file.name);
      setImportProgress("");
      setImportResult({ type: "success", message: `${file.name} loaded. Click Import Contacts to save it.` });
    };
    reader.onerror = () => {
      setImportResult({ type: "error", message: "Could not read this CSV file. Please try again." });
    };
    reader.readAsText(file);
  };

  const scheduleCampaign = async (id: string) => {
    setCampaignMessage(null);
    setBusyCampaignId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/marketing/campaigns/${id}/schedule`, { method: "POST", headers: authHeaders() });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || `Schedule failed with status ${response.status}`);
      setCampaignMessage({
        type: "success",
        message: `Scheduled ${Number(data?.queued ?? 0).toLocaleString("en-IN")} messages for ${Number(data?.contacts ?? 0).toLocaleString("en-IN")} contacts.`,
      });
      await load();
    } catch (error) {
      setCampaignMessage({ type: "error", message: error instanceof Error ? error.message : "Schedule failed. Please try again." });
    } finally {
      setBusyCampaignId(null);
    }
  };

  const setCampaignStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE_URL}/marketing/campaigns/${id}/status`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    load();
  };

  const cloneCampaign = async (id: string) => {
    await fetch(`${API_BASE_URL}/marketing/campaigns/${id}/clone`, { method: "POST", headers: authHeaders() });
    load();
  };

  const deleteCampaign = async (campaign: Campaign) => {
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"? Queued jobs for this campaign will also be removed.`);
    if (!confirmed) return;
    setCampaignMessage(null);
    setBusyCampaignId(campaign.id);
    try {
      const response = await fetch(`${API_BASE_URL}/marketing/campaigns/${campaign.id}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || `Delete failed with status ${response.status}`);
      setCampaignMessage({ type: "success", message: `Deleted "${campaign.name}".` });
      await load();
    } catch (error) {
      setCampaignMessage({ type: "error", message: error instanceof Error ? error.message : "Delete failed. Please try again." });
    } finally {
      setBusyCampaignId(null);
    }
  };

  const processNow = async () => {
    setQueueMessage(null);
    setProcessingQueue(true);
    try {
      const response = await fetch(`${API_BASE_URL}/marketing/broadcasts/process`, { method: "POST", headers: authHeaders() });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || `Queue run failed with status ${response.status}`);
      setQueueMessage({
        type: data?.failed ? "error" : "success",
        message: `Processed ${Number(data?.processed ?? 0).toLocaleString("en-IN")}. Sent ${Number(data?.sent ?? 0).toLocaleString("en-IN")}, failed ${Number(data?.failed ?? 0).toLocaleString("en-IN")}, skipped ${Number(data?.skipped ?? 0).toLocaleString("en-IN")}. Auto-run is daily at 11:00 AM IST.`,
      });
      await load();
    } catch (error) {
      setQueueMessage({ type: "error", message: error instanceof Error ? error.message : "Queue run failed. Please check AiSensy API key/server logs." });
    } finally {
      setProcessingQueue(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">WhatsApp Marketing</h1>
            <p className="text-sm text-slate-500">Campaign broadcasting, contact segmentation, and AiSensy tracking</p>
          </div>
          <button disabled={processingQueue} onClick={processNow} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
            <Send size={16} />
            {processingQueue ? "Running..." : "Run Queue Now"}
          </button>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">Automatic sending runs daily at 11:00 AM IST. Use the button only for testing or urgent manual runs.</p>
      </div>

      <div className="p-6">
        {queueMessage && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold ${queueMessage.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {queueMessage.message}
          </div>
        )}
        {overview && (
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Metric label="Contacts" value={overview.contacts} icon={Users} />
            <Metric label="Active" value={overview.activeCampaigns} icon={Megaphone} />
            <Metric label="Queued" value={overview.queued} icon={RefreshCw} />
            <Metric label="Sent Today" value={overview.sentToday} icon={Send} />
            <Metric label="Replies" value={overview.repliesToday} icon={BarChart3} />
            <Metric label="Hot Leads" value={overview.hotLeads} icon={Users} />
          </div>
        )}

        <div className="mt-5 flex gap-2 overflow-x-auto">
          {[
            ["campaigns", "Campaigns"],
            ["contacts", "Contacts"],
            ["templates", "Templates"],
            ["analytics", "Analytics"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === key ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">Loading marketing system...</div>
        ) : activeTab === "campaigns" ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-bold">Create Campaign</h2>
              <div className="mt-3 space-y-3">
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Campaign name" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={campaignForm.templateId} onChange={(e) => setCampaignForm({ ...campaignForm, templateId: e.target.value })}>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Daily limit" value={campaignForm.dailyLimit} onChange={(e) => setCampaignForm({ ...campaignForm, dailyLimit: e.target.value })} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cooldown" value={campaignForm.cooldownDays} onChange={(e) => setCampaignForm({ ...campaignForm, cooldownDays: e.target.value })} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Priority" value={campaignForm.priority} onChange={(e) => setCampaignForm({ ...campaignForm, priority: e.target.value })} />
                </div>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="City filter" value={campaignForm.city} onChange={(e) => setCampaignForm({ ...campaignForm, city: e.target.value })} />
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="State filter" value={campaignForm.state} onChange={(e) => setCampaignForm({ ...campaignForm, state: e.target.value })} />
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Product category filter" value={campaignForm.productCategory} onChange={(e) => setCampaignForm({ ...campaignForm, productCategory: e.target.value })} />
                <button onClick={createCampaign} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  <Plus size={16} />
                  Save Campaign
                </button>
              </div>
            </section>

            <section className="space-y-3">
              {campaignMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${campaignMessage.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {campaignMessage.message}
                </div>
              )}
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{campaign.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${campaign.status === "ACTIVE" ? "bg-green-100 text-green-700" : campaign.status === "PAUSED" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{campaign.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {campaign.steps?.[0]?.template?.name ?? "No template"} · {campaign.dailyLimit.toLocaleString("en-IN")} daily · {campaign.cooldownDays} day cooldown
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busyCampaignId === campaign.id} onClick={() => scheduleCampaign(campaign.id)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"><Play size={14} /> {busyCampaignId === campaign.id ? "Working" : "Schedule"}</button>
                      <button disabled={busyCampaignId === campaign.id} onClick={() => setCampaignStatus(campaign.id, campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"><Pause size={14} /> {campaign.status === "ACTIVE" ? "Pause" : "Activate"}</button>
                      <button disabled={busyCampaignId === campaign.id} onClick={() => cloneCampaign(campaign.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"><Copy size={14} /> Clone</button>
                      <button disabled={busyCampaignId === campaign.id} onClick={() => deleteCampaign(campaign)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"><Trash2 size={14} /> Delete</button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Jobs</p><p className="font-bold">{campaign._count?.jobs ?? 0}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Events</p><p className="font-bold">{campaign._count?.events ?? 0}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Priority</p><p className="font-bold">{campaign.priority}</p></div>
                  </div>
                </div>
              ))}
              {!campaigns.length && <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">No campaigns yet.</div>}
            </section>
          </div>
        ) : activeTab === "contacts" ? (
          <div className="mt-5 grid min-h-0 gap-4 lg:h-[calc(100vh-330px)] lg:min-h-[420px] lg:grid-cols-[360px_1fr] lg:overflow-hidden">
            <section className="self-start rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">Import Contacts</h2>
                  <p className="mt-1 text-xs text-slate-500">Paste CSV with headers: mobile, shopName, ownerName, city, state, productCategory, tags</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCsvText(contactCsvSample);
                    setSelectedCsvName("");
                    setImportResult(null);
                  }}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Use sample
                </button>
              </div>
              <input
                ref={csvFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => uploadCsvFile(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => csvFileRef.current?.click()}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <FileUp size={16} />
                Upload CSV File
              </button>
              {selectedCsvName && (
                <p className="mt-2 truncate text-xs font-semibold text-slate-500">
                  Selected: {selectedCsvName}
                </p>
              )}
              <textarea className="mt-3 h-44 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={`Paste contacts here...\n\n${contactCsvSample}`} />
              {importResult && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${importResult.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {importResult.message}
                </div>
              )}
              {importProgress && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  {importProgress}
                </div>
              )}
              <button
                type="button"
                onClick={importContacts}
                disabled={importingContacts}
                className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
              >
                {importingContacts ? "Importing..." : "Import Contacts"}
              </button>
            </section>
            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="shrink-0 border-b border-slate-200 p-4">
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Search contact or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {contacts.map((contact) => (
                  <div key={contact.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold">{contact.shopName || contact.ownerName || contact.mobile}</p>
                      <p className="text-sm text-slate-500">{contact.mobile} · {[contact.city, contact.state].filter(Boolean).join(", ") || "No location"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{contact.leadTemperature}</span>
                      <span className="text-sm font-bold text-blue-700">{contact.engagementScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : activeTab === "templates" ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-bold">Add AiSensy Template</h2>
              <div className="mt-3 space-y-3">
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Template display name" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="AiSensy campaign name" value={templateForm.aisensyCampaignName} onChange={(e) => setTemplateForm({ ...templateForm, aisensyCampaignName: e.target.value })} />
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={templateForm.templateType} onChange={(e) => setTemplateForm({ ...templateForm, templateType: e.target.value })}>
                  <option>TEXT</option>
                  <option>IMAGE</option>
                  <option>VIDEO</option>
                  <option>DOCUMENT</option>
                </select>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Variables, comma separated" value={templateForm.variables} onChange={(e) => setTemplateForm({ ...templateForm, variables: e.target.value })} />
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Media URL optional" value={templateForm.mediaUrl} onChange={(e) => setTemplateForm({ ...templateForm, mediaUrl: e.target.value })} />
                <textarea className="h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Template body reference" value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} />
                <button onClick={createTemplate} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save Template</button>
              </div>
            </section>
            <section className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => (
                <div key={template.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold">{template.name}</h3>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{template.templateType}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{template.aisensyCampaignName}</p>
                  <p className="mt-3 text-sm text-slate-700">{template.body}</p>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-bold">Event Analytics</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Object.entries(analytics?.events ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">{key}</p>
                    <p className="text-xl font-bold">{Number(value).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-bold">Hot Contacts Loaded</h2>
              <div className="mt-3 space-y-2">
                {hotContacts.slice(0, 8).map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{contact.shopName || contact.mobile}</span>
                    <strong>{contact.engagementScore}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketingPage() {
  return (
    <DashboardShell>
      <MarketingPageContent />
    </DashboardShell>
  );
}
