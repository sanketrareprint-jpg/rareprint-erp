"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Receipt, Users, Settings2, BarChart2, Search, Loader2, Download, Send,
  Save, CheckCircle, Image as ImageIcon,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Invoice = {
  id: string; orderId: string; customerId: string; invoiceNumber: string; issueDate: string;
  customerName: string; customerPhone: string | null; gstNumber: string | null; gstTreatment: string;
  subtotal: number; taxableAmount: number; taxAmount: number; totalAmount: number; paidAmount: number;
  balanceAmount: number; status: string; whatsappStatus: string; whatsappSentAt: string | null;
  salesAgentName: string | null;
};

type Party = {
  customerId: string; customerName: string; phone: string | null;
  totalBilled: number; totalReceived: number; balanceDue: number; invoiceCount: number;
};

type LedgerEntry = {
  invoiceId: string; invoiceNumber: string; issueDate: string; totalAmount: number;
  paidAmount: number; balanceAmount: number; status: string; runningBalance: number;
};

type PartyLedger = {
  customer: { id: string; businessName: string; phone: string | null; gstNumber: string | null; state: string | null };
  entries: LedgerEntry[];
  totalBilled: number; totalReceived: number; balanceDue: number;
};

type CompanyProfile = {
  companyName: string; companyAddress: string; companyPhone: string; companyEmail: string;
  companyGstin: string; companyState: string; bankName: string; bankAccountNumber: string;
  bankIfsc: string; bankAccountHolderName: string; defaultTermsAndConditions: string;
  logoUrl: string | null; signatureUrl: string | null;
};

type GstSummary = {
  invoiceCount: number; taxableAmount: number; cgstAmount: number; sgstAmount: number;
  igstAmount: number; totalTax: number;
  hsnWise: { hsnSac: string; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number }[];
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function downloadBlob(url: string, filename: string) {
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) { alert("Could not download PDF"); return; }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objUrl);
}

// ─── Page ───────────────────────────────────────────────────────────────────

function BillingPageInner() {
  const searchParams = useSearchParams();
  const focusInvoiceId = searchParams.get("invoiceId");

  const [tab, setTab] = useState<"invoices" | "parties" | "company_profile" | "gst_summary">(
    focusInvoiceId ? "invoices" : "invoices",
  );

  // ── Invoices ──────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const params = new URLSearchParams();
      if (invoiceSearch) params.set("search", invoiceSearch);
      const res = await fetch(`${API_BASE_URL}/billing/invoices?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) setInvoices(await res.json());
    } finally {
      setInvoicesLoading(false);
    }
  }, [invoiceSearch]);

  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  async function shareWhatsapp(id: string) {
    setSharingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/invoices/${id}/share-whatsapp`, { method: "POST", headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sent) {
        alert(data.withPdf ? "Invoice sent via WhatsApp with PDF attached." : "Invoice notification sent via WhatsApp (text only — PDF attachment isn't configured yet).");
        void loadInvoices();
      } else {
        alert("Could not send WhatsApp message. Check customer phone number.");
      }
    } finally {
      setSharingId(null);
    }
  }

  const filteredInvoices = focusInvoiceId ? invoices.filter(i => i.id === focusInvoiceId) : invoices;

  // ── Parties ───────────────────────────────────────────────────────────
  const [parties, setParties] = useState<Party[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(true);
  const [partySearch, setPartySearch] = useState("");
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [ledger, setLedger] = useState<PartyLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    setPartiesLoading(true);
    fetch(`${API_BASE_URL}/billing/parties`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setParties)
      .finally(() => setPartiesLoading(false));
  }, []);

  async function openParty(customerId: string) {
    setSelectedParty(customerId);
    setLedgerLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/parties/${customerId}/statement`, { headers: getAuthHeaders() });
      if (res.ok) setLedger(await res.json());
    } finally {
      setLedgerLoading(false);
    }
  }

  const displayedParties = parties.filter(p =>
    !partySearch || p.customerName.toLowerCase().includes(partySearch.toLowerCase()) || (p.phone ?? "").includes(partySearch),
  );

  // ── Company Profile ──────────────────────────────────────────────────
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/company-profile`, { headers: getAuthHeaders() });
      if (res.ok) setProfile(await res.json());
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  async function saveProfile() {
    if (!profile) return;
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const { logoUrl, signatureUrl, ...editable } = profile;
      const res = await fetch(`${API_BASE_URL}/billing/company-profile`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editable),
      });
      if (res.ok) {
        setProfile(await res.json());
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2500);
      } else {
        alert("Could not save Company Profile");
      }
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadImage(kind: "logo" | "signature", file: File) {
    const setBusy = kind === "logo" ? setLogoUploading : setSignatureUploading;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/billing/company-profile/${kind}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: form,
      });
      if (res.ok) setProfile(await res.json());
      else alert(`Could not upload ${kind}`);
    } finally {
      setBusy(false);
    }
  }

  // ── GST Summary ───────────────────────────────────────────────────────
  const [gstFrom, setGstFrom] = useState("");
  const [gstTo, setGstTo] = useState("");
  const [gstSummary, setGstSummary] = useState<GstSummary | null>(null);
  const [gstLoading, setGstLoading] = useState(false);

  const loadGstSummary = useCallback(async () => {
    setGstLoading(true);
    try {
      const params = new URLSearchParams();
      if (gstFrom) params.set("from", gstFrom);
      if (gstTo) params.set("to", gstTo);
      const res = await fetch(`${API_BASE_URL}/billing/gst-summary?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) setGstSummary(await res.json());
    } finally {
      setGstLoading(false);
    }
  }, [gstFrom, gstTo]);

  useEffect(() => { void loadGstSummary(); }, [loadGstSummary]);

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-full space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Billing</h1>
              <p className="mt-0.5 text-sm text-slate-600">Invoices, party ledgers, company profile, and GST reporting.</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setTab("invoices")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition ${tab === "invoices" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Receipt className="h-3.5 w-3.5" /> Invoices
              </button>
              <button onClick={() => setTab("parties")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "parties" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Users className="h-3.5 w-3.5" /> Parties
              </button>
              <button onClick={() => setTab("company_profile")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "company_profile" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Settings2 className="h-3.5 w-3.5" /> Company Profile
              </button>
              <button onClick={() => setTab("gst_summary")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "gst_summary" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <BarChart2 className="h-3.5 w-3.5" /> GST Summary
              </button>
            </div>
          </div>

          {!profileLoading && profile && !profile.companyAddress && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Company Profile isn't filled in yet — invoices will print with blank company details until you set it up in the <button onClick={() => setTab("company_profile")} className="underline font-semibold">Company Profile</button> tab.
            </div>
          )}

          {/* ── INVOICES ── */}
          {tab === "invoices" && (
            <div className="space-y-3">
              {focusInvoiceId && (
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span>Showing invoice linked from Accounts.</span>
                  <a href="/billing" className="underline font-semibold">Show all invoices</a>
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                    placeholder="Search invoice #, customer, phone…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <button onClick={() => void loadInvoices()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${invoicesLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <span className="text-xs text-slate-400">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}</span>
              </div>

              {invoicesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : filteredInvoices.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No invoices found.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Invoice</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Customer</th>
                        <th className="px-3 py-2 text-left">Agent</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 text-center">WhatsApp</th>
                        <th className="px-3 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInvoices.map(inv => (
                        <tr key={inv.id}>
                          <td className="px-3 py-2 font-semibold text-blue-700">{inv.invoiceNumber}</td>
                          <td className="px-3 py-2 text-slate-500">{fmtDate(inv.issueDate)}</td>
                          <td className="px-3 py-2">{inv.customerName}<div className="text-[10px] text-slate-400">{inv.customerPhone}</div></td>
                          <td className="px-3 py-2 text-slate-500">{inv.salesAgentName ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmt(inv.totalAmount)}</td>
                          <td className={`px-3 py-2 text-right ${inv.balanceAmount > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(inv.balanceAmount)}</td>
                          <td className="px-3 py-2 text-center">{inv.whatsappStatus}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => void downloadBlob(`${API_BASE_URL}/billing/invoices/${inv.id}/pdf`, `Invoice_${inv.invoiceNumber}.pdf`)}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                                title="Download PDF"
                              >
                                <Download className="h-3 w-3" /> PDF
                              </button>
                              <button
                                onClick={() => void shareWhatsapp(inv.id)}
                                disabled={sharingId === inv.id}
                                className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1"
                                title="Share via WhatsApp"
                              >
                                <Send className="h-3 w-3" /> {sharingId === inv.id ? "…" : "Share"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── PARTIES ── */}
          {tab === "parties" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" value={partySearch} onChange={e => setPartySearch(e.target.value)}
                    placeholder="Search party…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                {partiesLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr><th className="px-3 py-2 text-left">Party</th><th className="px-3 py-2 text-right">Billed</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Balance Due</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedParties.map(p => (
                          <tr key={p.customerId} onClick={() => void openParty(p.customerId)}
                            className={`cursor-pointer hover:bg-slate-50 ${selectedParty === p.customerId ? "bg-blue-50" : ""}`}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{p.customerName}<div className="text-[10px] text-slate-400">{p.phone}</div></td>
                            <td className="px-3 py-2 text-right">{fmt(p.totalBilled)}</td>
                            <td className="px-3 py-2 text-right text-emerald-600">{fmt(p.totalReceived)}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${p.balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(p.balanceDue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                {!selectedParty ? (
                  <div className="py-16 text-center text-slate-400"><Users className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Select a party to view their statement.</p></div>
                ) : ledgerLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                ) : ledger ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{ledger.customer.businessName}</p>
                        <p className="text-xs text-slate-500">{ledger.customer.phone} · {ledger.customer.gstNumber || "No GSTIN"}</p>
                      </div>
                      <button
                        onClick={() => void downloadBlob(`${API_BASE_URL}/billing/parties/${selectedParty}/statement/pdf`, `Statement_${ledger.customer.businessName}.pdf`)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Statement PDF
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Total Billed</p><p className="font-bold">{fmt(ledger.totalBilled)}</p></div>
                      <div className="rounded-lg bg-emerald-50 p-2"><p className="text-[10px] text-emerald-600">Total Received</p><p className="font-bold text-emerald-700">{fmt(ledger.totalReceived)}</p></div>
                      <div className="rounded-lg bg-red-50 p-2"><p className="text-[10px] text-red-600">Balance Due</p><p className="font-bold text-red-700">{fmt(ledger.balanceDue)}</p></div>
                    </div>
                    <div className="max-h-96 overflow-auto rounded-lg border border-slate-100">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0">
                          <tr><th className="px-2 py-1.5 text-left">Invoice</th><th className="px-2 py-1.5 text-left">Date</th><th className="px-2 py-1.5 text-right">Total</th><th className="px-2 py-1.5 text-right">Paid</th><th className="px-2 py-1.5 text-right">Running Bal.</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ledger.entries.map(e => (
                            <tr key={e.invoiceId}>
                              <td className="px-2 py-1.5 font-semibold text-blue-700">{e.invoiceNumber}</td>
                              <td className="px-2 py-1.5 text-slate-500">{fmtDate(e.issueDate)}</td>
                              <td className="px-2 py-1.5 text-right">{fmt(e.totalAmount)}</td>
                              <td className="px-2 py-1.5 text-right text-emerald-600">{fmt(e.paidAmount)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold">{fmt(e.runningBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* ── COMPANY PROFILE ── */}
          {tab === "company_profile" && (
            profileLoading || !profile ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
            ) : (
              <div className="max-w-3xl space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800">Company Details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-600 space-y-1">Business Name
                      <input value={profile.companyName} onChange={e => setProfile({ ...profile, companyName: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">GSTIN
                      <input value={profile.companyGstin} onChange={e => setProfile({ ...profile, companyGstin: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1 sm:col-span-2">Address
                      <textarea value={profile.companyAddress} onChange={e => setProfile({ ...profile, companyAddress: e.target.value })} rows={2}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Phone
                      <input value={profile.companyPhone} onChange={e => setProfile({ ...profile, companyPhone: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Email
                      <input value={profile.companyEmail} onChange={e => setProfile({ ...profile, companyEmail: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">State
                      <input value={profile.companyState} onChange={e => setProfile({ ...profile, companyState: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800">Bank Details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-600 space-y-1">Bank Name
                      <input value={profile.bankName} onChange={e => setProfile({ ...profile, bankName: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Account Holder's Name
                      <input value={profile.bankAccountHolderName} onChange={e => setProfile({ ...profile, bankAccountHolderName: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Account Number
                      <input value={profile.bankAccountNumber} onChange={e => setProfile({ ...profile, bankAccountNumber: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">IFSC Code
                      <input value={profile.bankIfsc} onChange={e => setProfile({ ...profile, bankIfsc: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono" />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800">Terms & Conditions (default, editable per invoice)</p>
                  <textarea value={profile.defaultTermsAndConditions} onChange={e => setProfile({ ...profile, defaultTermsAndConditions: e.target.value })} rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800">Logo & Signature</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600">Logo</p>
                      {profile.logoUrl && <img src={profile.logoUrl} alt="Logo" className="h-16 w-16 rounded-full object-contain border border-slate-200" />}
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <ImageIcon className="h-3.5 w-3.5" /> {logoUploading ? "Uploading…" : "Upload logo"}
                        <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage("logo", f); }} />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600">Signature</p>
                      {profile.signatureUrl && <img src={profile.signatureUrl} alt="Signature" className="h-16 w-32 object-contain border border-slate-200 rounded" />}
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <ImageIcon className="h-3.5 w-3.5" /> {signatureUploading ? "Uploading…" : "Upload signature"}
                        <input type="file" accept="image/*" className="hidden" disabled={signatureUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage("signature", f); }} />
                      </label>
                    </div>
                  </div>
                </div>

                <button onClick={() => void saveProfile()} disabled={profileSaving}
                  className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2">
                  {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : profileSaved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {profileSaved ? "Saved" : "Save Company Profile"}
                </button>
              </div>
            )
          )}

          {/* ── GST SUMMARY ── */}
          {tab === "gst_summary" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-600 space-y-1">From
                  <input type="date" value={gstFrom} onChange={e => setGstFrom(e.target.value)}
                    className="block rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </label>
                <label className="text-xs text-slate-600 space-y-1">To
                  <input type="date" value={gstTo} onChange={e => setGstTo(e.target.value)}
                    className="block rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </label>
                <button onClick={() => void loadGstSummary()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${gstLoading ? "animate-spin" : ""}`} /> Apply
                </button>
              </div>

              {gstLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : gstSummary ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Invoices</p><p className="font-bold">{gstSummary.invoiceCount}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Taxable</p><p className="font-bold">{fmt(gstSummary.taxableAmount)}</p></div>
                    <div className="rounded-lg bg-blue-50 p-3"><p className="text-[10px] text-blue-600">CGST</p><p className="font-bold text-blue-700">{fmt(gstSummary.cgstAmount)}</p></div>
                    <div className="rounded-lg bg-blue-50 p-3"><p className="text-[10px] text-blue-600">SGST</p><p className="font-bold text-blue-700">{fmt(gstSummary.sgstAmount)}</p></div>
                    <div className="rounded-lg bg-purple-50 p-3"><p className="text-[10px] text-purple-600">IGST</p><p className="font-bold text-purple-700">{fmt(gstSummary.igstAmount)}</p></div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">HSN/SAC-wise Breakdown</div>
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr><th className="px-3 py-2 text-left">HSN/SAC</th><th className="px-3 py-2 text-right">Taxable</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th><th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">Total Tax</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {gstSummary.hsnWise.map(row => (
                          <tr key={row.hsnSac}>
                            <td className="px-3 py-2">{row.hsnSac}</td>
                            <td className="px-3 py-2 text-right">{fmt(row.taxable)}</td>
                            <td className="px-3 py-2 text-right">{fmt(row.cgst)}</td>
                            <td className="px-3 py-2 text-right">{fmt(row.sgst)}</td>
                            <td className="px-3 py-2 text-right">{fmt(row.igst)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{fmt(row.totalTax)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<DashboardShell><div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div></DashboardShell>}>
      <BillingPageInner />
    </Suspense>
  );
}
