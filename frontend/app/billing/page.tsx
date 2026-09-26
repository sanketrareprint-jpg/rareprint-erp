"use client";
import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { PdfPreview } from "@/components/pdf-preview";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { sameState, stateFromGstin } from "@/lib/gst-states";
import {
  Receipt, Users, Settings2, BarChart2, Search, Loader2, Download, Send,
  Save, CheckCircle, Image as ImageIcon, Wallet, Pencil, Lock, FileText, Plus, Trash2, ArrowRight,
  Eye, X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Invoice = {
  id: string; orderId: string; customerId: string; invoiceNumber: string; issueDate: string;
  customerName: string; customerPhone: string | null; gstNumber: string | null; gstTreatment: string;
  subtotal: number; taxableAmount: number; taxAmount: number; totalAmount: number; paidAmount: number;
  balanceAmount: number; status: string; whatsappStatus: string; whatsappSentAt: string | null;
  salesAgentName: string | null;
};

type ReceiptVoucher = {
  orderId: string; invoiceId: string; receiptNumber: string; receiptDate: string; invoiceNumber: string;
  customerName: string; customerPhone: string | null; paymentCount: number;
  invoiceAmount: number; receivedAmount: number; balanceAmount: number;
};

type EstimateRow = {
  id: string; estimateNumber: string; estimateDate: string; validUntil: string | null;
  customerName: string; customerPhone: string | null; totalAmount: number; status: string;
  convertedOrderId: string | null; convertedOrderNumber: string | null; itemCount: number;
};
type EstimateLine = { productId: string; productSearch: string; quantity: string; unitPrice: string; notes: string };
type EstimateForm = {
  id?: string; estimateNumber?: string; customerId: string;
  name: string; phone: string; gstNumber: string; address: string; city: string; state: string; pincode: string;
  estimateDate: string; validUntil: string; notes: string; items: EstimateLine[];
};
type CatalogProduct = { id: string; name: string; sku: string; sizeInches?: string; gsm?: number; paperType?: string | null };
type PartyMatch = {
  id: string; businessName: string; phone?: string | null; gstNumber?: string | null;
  address?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
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
  customer: {
    id: string; businessName: string; phone: string | null; gstNumber: string | null; state: string | null;
    billingAddress: string | null; city: string | null; pincode: string | null;
  };
  entries: LedgerEntry[];
  totalBilled: number; totalReceived: number; balanceDue: number;
  // Server-decided: ADMIN/ACCOUNTS until any order is dispatched, then superadmin only.
  editLock?: { dispatchedOrders: string[]; canEdit: boolean };
};

type CompanyProfile = {
  companyName: string; companyAddress: string; companyPhone: string; companyEmail: string;
  companyGstin: string; companyState: string; bankName: string; bankAccountNumber: string;
  bankIfsc: string; bankAccountHolderName: string; defaultTermsAndConditions: string;
  logoUrl: string | null; signatureUrl: string | null; invoicePrefix: string;
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
  const router = useRouter();
  const focusInvoiceId = searchParams.get("invoiceId");

  const [tab, setTab] = useState<"invoices" | "receipts" | "estimates" | "parties" | "company_profile" | "gst_summary">(
    focusInvoiceId ? "invoices" : "invoices",
  );

  // ── Invoices ──────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  // Debounced (400ms, matches the same pattern in app/orders/page.tsx) so
  // fast typing doesn't fire a full request per keystroke.
  const [debouncedInvoiceSearch, setDebouncedInvoiceSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInvoiceSearch(invoiceSearch), 400);
    return () => clearTimeout(t);
  }, [invoiceSearch]);
  const [sharingId, setSharingId] = useState<string | null>(null);
  // Preview shows the same PDF the "PDF" button downloads (drawn by pdf.js
  // so it works on Android too). url backs the Download link, revoked on close.
  const [preview, setPreview] = useState<{ url: string; blob: Blob; invoiceNumber: string } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  async function openPreview(inv: Invoice) {
    setPreviewLoadingId(inv.id);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/invoices/${inv.id}/pdf`, { headers: getAuthHeaders() });
      if (!res.ok) { alert("Could not load invoice preview"); return; }
      const blob = await res.blob();
      setPreview({ url: URL.createObjectURL(blob), blob, invoiceNumber: inv.invoiceNumber });
    } finally {
      setPreviewLoadingId(null);
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  // requestSeq guards against out-of-order responses — root-caused
  // 2026-09-04: with no debounce/guard, every keystroke fired its own
  // request, and if an earlier (broader) search's response arrived AFTER a
  // later, more specific one, it would silently overwrite the correct
  // results with the stale, unrelated ones — the only fix was clicking
  // Refresh. Only the response for the most recently fired request is
  // applied now.
  const invoiceRequestSeq = useRef(0);

  const loadInvoices = useCallback(async () => {
    const seq = ++invoiceRequestSeq.current;
    setInvoicesLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedInvoiceSearch) params.set("search", debouncedInvoiceSearch);
      const res = await fetch(`${API_BASE_URL}/billing/invoices?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (seq === invoiceRequestSeq.current) setInvoices(data);
      }
    } finally {
      if (seq === invoiceRequestSeq.current) setInvoicesLoading(false);
    }
  }, [debouncedInvoiceSearch]);

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

  // ── Receipt Vouchers ──────────────────────────────────────────────────
  // Same debounce + requestSeq stale-response guard as Invoices above.
  const [receipts, setReceipts] = useState<ReceiptVoucher[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [debouncedReceiptSearch, setDebouncedReceiptSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedReceiptSearch(receiptSearch), 400);
    return () => clearTimeout(t);
  }, [receiptSearch]);
  const receiptRequestSeq = useRef(0);

  const loadReceipts = useCallback(async () => {
    const seq = ++receiptRequestSeq.current;
    setReceiptsLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedReceiptSearch) params.set("search", debouncedReceiptSearch);
      const res = await fetch(`${API_BASE_URL}/billing/receipts?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (seq === receiptRequestSeq.current) setReceipts(data);
      }
    } finally {
      if (seq === receiptRequestSeq.current) setReceiptsLoading(false);
    }
  }, [debouncedReceiptSearch]);

  useEffect(() => { void loadReceipts(); }, [loadReceipts]);

  // ── Estimates ─────────────────────────────────────────────────────────
  // Totals are plain quantity x rate — the same rule orders use (order lines
  // are saved at 0% GST), so an estimate's total equals the order it becomes.
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [estimatesLoading, setEstimatesLoading] = useState(true);
  const [estimateSearch, setEstimateSearch] = useState("");
  const [debouncedEstimateSearch, setDebouncedEstimateSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEstimateSearch(estimateSearch), 400);
    return () => clearTimeout(t);
  }, [estimateSearch]);
  const estimateRequestSeq = useRef(0);

  const loadEstimates = useCallback(async () => {
    const seq = ++estimateRequestSeq.current;
    setEstimatesLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedEstimateSearch) params.set("search", debouncedEstimateSearch);
      const res = await fetch(`${API_BASE_URL}/billing/estimates?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (seq === estimateRequestSeq.current) setEstimates(data);
      }
    } finally {
      if (seq === estimateRequestSeq.current) setEstimatesLoading(false);
    }
  }, [debouncedEstimateSearch]);

  useEffect(() => { void loadEstimates(); }, [loadEstimates]);

  const [estimateForm, setEstimateForm] = useState<EstimateForm | null>(null);
  const [estimateSaving, setEstimateSaving] = useState(false);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [partyMatches, setPartyMatches] = useState<PartyMatch[]>([]);

  async function ensureCatalog() {
    if (catalog.length > 0) return;
    const res = await fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() });
    if (res.ok) setCatalog(await res.json());
  }

  const emptyEstimateLine = (): EstimateLine => ({ productId: "", productSearch: "", quantity: "", unitPrice: "", notes: "" });

  async function openNewEstimate() {
    void ensureCatalog();
    setPartyMatches([]);
    setEstimateForm({
      customerId: "", name: "", phone: "", gstNumber: "", address: "", city: "", state: "", pincode: "",
      estimateDate: new Date().toISOString().slice(0, 10), validUntil: "", notes: "",
      items: [emptyEstimateLine()],
    });
  }

  async function openEditEstimate(id: string) {
    void ensureCatalog();
    setPartyMatches([]);
    const res = await fetch(`${API_BASE_URL}/billing/estimates/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) { alert("Could not load estimate"); return; }
    const e = await res.json();
    setEstimateForm({
      id: e.id, estimateNumber: e.estimateNumber,
      customerId: e.customerId ?? "", name: e.customerName ?? "", phone: e.customerPhone ?? "", gstNumber: e.customerGstin ?? "",
      address: e.customerAddress ?? "", city: e.customerCity ?? "", state: e.customerState ?? "", pincode: e.customerPincode ?? "",
      estimateDate: String(e.estimateDate).slice(0, 10), validUntil: e.validUntil ? String(e.validUntil).slice(0, 10) : "", notes: e.notes ?? "",
      items: (e.items ?? []).map((i: { productId: string; quantity: number; unitPrice: number; notes?: string | null }) => ({
        productId: i.productId, productSearch: "", quantity: String(i.quantity), unitPrice: String(i.unitPrice), notes: i.notes ?? "",
      })),
    });
  }

  // Party search — same /customer-directory/search the Create Order page uses.
  useEffect(() => {
    const name = estimateForm?.name.trim() ?? "";
    if (!estimateForm || estimateForm.customerId || name.length < 2) { setPartyMatches([]); return; }
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ search: name, limit: "8" });
      const res = await fetch(`${API_BASE_URL}/customer-directory/search?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) setPartyMatches((await res.json()).customers ?? []);
    }, 400);
    return () => clearTimeout(t);
  }, [estimateForm?.name, estimateForm?.customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickParty(p: PartyMatch) {
    if (!estimateForm) return;
    setEstimateForm({
      ...estimateForm,
      customerId: p.id, name: p.businessName ?? "", phone: (p.phone ?? "").replace(/\D/g, "").slice(-10),
      gstNumber: p.gstNumber ?? "", address: p.address ?? "", city: p.city ?? "", state: p.state ?? "", pincode: p.pincode ?? "",
    });
    setPartyMatches([]);
  }

  function updateEstimateLine(index: number, patch: Partial<EstimateLine>) {
    if (!estimateForm) return;
    setEstimateForm({ ...estimateForm, items: estimateForm.items.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  }

  const lineAmount = (l: EstimateLine) => Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * 100) / 100;
  const estimateFormTotal = estimateForm ? Math.round(estimateForm.items.reduce((s, l) => s + lineAmount(l), 0) * 100) / 100 : 0;

  async function saveEstimate() {
    if (!estimateForm || estimateSaving) return;
    if (!estimateForm.name.trim()) { alert("Party name is required"); return; }
    const bad = estimateForm.items.findIndex(l => !l.productId || !(Number(l.quantity) >= 1) || !(Number(l.unitPrice) >= 0) || l.unitPrice === "");
    if (bad !== -1) { alert(`Item ${bad + 1}: select a product and enter quantity and rate`); return; }
    setEstimateSaving(true);
    try {
      const body = {
        estimateDate: estimateForm.estimateDate || undefined,
        validUntil: estimateForm.validUntil || null,
        notes: estimateForm.notes,
        customer: {
          customerId: estimateForm.customerId || null, name: estimateForm.name, phone: estimateForm.phone, gstNumber: estimateForm.gstNumber,
          address: estimateForm.address, city: estimateForm.city, state: estimateForm.state, pincode: estimateForm.pincode,
        },
        items: estimateForm.items.map(l => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), notes: l.notes })),
      };
      const res = await fetch(`${API_BASE_URL}/billing/estimates${estimateForm.id ? `/${estimateForm.id}` : ""}`, {
        method: estimateForm.id ? "PUT" : "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.message || "Could not save estimate"); return; }
      setEstimateForm(null);
      void loadEstimates();
    } finally {
      setEstimateSaving(false);
    }
  }

  function convertEstimate(e: EstimateRow) {
    if (!confirm(`Create an order from ${e.estimateNumber}? The Create Order page will open pre-filled.`)) return;
    router.push(`/orders/create?estimateId=${e.id}`);
  }

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
    setPartyForm(null);
    setLedgerLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/parties/${customerId}/statement`, { headers: getAuthHeaders() });
      if (res.ok) setLedger(await res.json());
    } finally {
      setLedgerLoading(false);
    }
  }

  // Party edit — writes the Customer record itself, so a changed name/phone
  // shows on every order (past and present), invoice and receipt.
  const emptyPartyForm = { businessName: "", phone: "", gstNumber: "", billingAddress: "", city: "", state: "", pincode: "" };
  const [partyForm, setPartyForm] = useState<typeof emptyPartyForm | null>(null);
  const [partySaving, setPartySaving] = useState(false);

  function startPartyEdit() {
    if (!ledger) return;
    const c = ledger.customer;
    setPartyForm({
      businessName: c.businessName ?? "", phone: c.phone ?? "", gstNumber: c.gstNumber ?? "",
      billingAddress: c.billingAddress ?? "", city: c.city ?? "", state: c.state ?? "", pincode: c.pincode ?? "",
    });
  }

  async function savePartyEdit() {
    if (!partyForm || !ledger || partySaving) return;
    if (!partyForm.businessName.trim()) { alert("Party name cannot be empty"); return; }
    setPartySaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/parties/${ledger.customer.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(partyForm),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { alert(body.message || "Could not save party details"); return; }
      const updated = body as PartyLedger;
      setLedger(updated);
      setParties(prev => prev.map(p => p.customerId === updated.customer.id
        ? { ...p, customerName: updated.customer.businessName, phone: updated.customer.phone }
        : p));
      setPartyForm(null);
    } finally {
      setPartySaving(false);
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
      // Must NOT send Content-Type here — getAuthHeaders() always sets
      // "application/json", which overrides the multipart boundary the
      // browser would otherwise generate for FormData, so the backend
      // (multer's FileInterceptor) never receives a parseable file. Same
      // fix already used for the other file-upload flows in this app, e.g.
      // app/orders/page.tsx's design-file upload.
      const headers = getAuthHeaders();
      delete (headers as Record<string, string>)["Content-Type"];
      const res = await fetch(`${API_BASE_URL}/billing/company-profile/${kind}`, {
        method: "POST",
        headers,
        body: form,
      });
      if (res.ok) setProfile(await res.json());
      else {
        const body = await res.json().catch(() => ({}));
        alert(body.message || `Could not upload ${kind}`);
      }
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
              <button onClick={() => setTab("receipts")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "receipts" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Wallet className="h-3.5 w-3.5" /> Receipts
              </button>
              <button onClick={() => setTab("estimates")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "estimates" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <FileText className="h-3.5 w-3.5" /> Estimates
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
                                onClick={() => void openPreview(inv)}
                                disabled={previewLoadingId === inv.id}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                                title="Preview invoice"
                              >
                                <Eye className="h-3 w-3" /> {previewLoadingId === inv.id ? "…" : "Preview"}
                              </button>
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

          {/* ── RECEIPT VOUCHERS ── */}
          {tab === "receipts" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)}
                    placeholder="Search invoice #, customer, phone…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <button onClick={() => void loadReceipts()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${receiptsLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <span className="text-xs text-slate-400">{receipts.length} receipt{receipts.length !== 1 ? "s" : ""}</span>
              </div>
              <p className="text-[11px] text-slate-500">One receipt voucher per invoiced order, listing its verified payments. Orders appear here once Accounts has verified at least one payment.</p>

              {receiptsLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : receipts.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
                  <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No receipt vouchers found.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Receipt</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Invoice</th>
                        <th className="px-3 py-2 text-left">Customer</th>
                        <th className="px-3 py-2 text-center">Payments</th>
                        <th className="px-3 py-2 text-right">Invoice Amt</th>
                        <th className="px-3 py-2 text-right">Received</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receipts.map(r => (
                        <tr key={r.orderId}>
                          <td className="px-3 py-2 font-semibold text-blue-700">{r.receiptNumber}</td>
                          <td className="px-3 py-2 text-slate-500">{fmtDate(r.receiptDate)}</td>
                          <td className="px-3 py-2 text-slate-600">{r.invoiceNumber}</td>
                          <td className="px-3 py-2">{r.customerName}<div className="text-[10px] text-slate-400">{r.customerPhone}</div></td>
                          <td className="px-3 py-2 text-center">{r.paymentCount}</td>
                          <td className="px-3 py-2 text-right">{fmt(r.invoiceAmount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-600">{fmt(r.receivedAmount)}</td>
                          <td className={`px-3 py-2 text-right ${r.balanceAmount > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(r.balanceAmount)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center">
                              <button
                                onClick={() => void downloadBlob(`${API_BASE_URL}/billing/receipts/${r.orderId}/pdf`, `Receipt_${r.receiptNumber}.pdf`)}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                                title="Download Receipt Voucher PDF"
                              >
                                <Download className="h-3 w-3" /> PDF
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

          {/* ── ESTIMATES ── */}
          {tab === "estimates" && (
            <div className="space-y-3">
              {!estimateForm && (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input type="text" value={estimateSearch} onChange={e => setEstimateSearch(e.target.value)}
                        placeholder="Search estimate #, party, phone…"
                        className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <button onClick={() => void loadEstimates()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      <Loader2 className={`h-3 w-3 ${estimatesLoading ? "animate-spin" : ""}`} /> Refresh
                    </button>
                    <span className="text-xs text-slate-400">{estimates.length} estimate{estimates.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => void openNewEstimate()}
                      className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Create Estimate
                    </button>
                  </div>

                  {estimatesLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                  ) : estimates.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
                      <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>No estimates yet.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Estimate</th>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Party</th>
                            <th className="px-3 py-2 text-center">Items</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            <th className="px-3 py-2 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {estimates.map(e => (
                            <tr key={e.id}>
                              <td className="px-3 py-2 font-semibold text-blue-700">{e.estimateNumber}</td>
                              <td className="px-3 py-2 text-slate-500">{fmtDate(e.estimateDate)}</td>
                              <td className="px-3 py-2">{e.customerName}<div className="text-[10px] text-slate-400">{e.customerPhone}</div></td>
                              <td className="px-3 py-2 text-center">{e.itemCount}</td>
                              <td className="px-3 py-2 text-right font-semibold">{fmt(e.totalAmount)}</td>
                              <td className="px-3 py-2 text-center">
                                {e.status === "CONVERTED"
                                  ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Order {e.convertedOrderNumber}</span>
                                  : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Open</span>}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => void downloadBlob(`${API_BASE_URL}/billing/estimates/${e.id}/pdf`, `Estimate_${e.estimateNumber}.pdf`)}
                                    className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 flex items-center gap-1" title="Download PDF">
                                    <Download className="h-3 w-3" /> PDF
                                  </button>
                                  {e.status === "OPEN" && (
                                    <>
                                      <button onClick={() => void openEditEstimate(e.id)}
                                        className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 flex items-center gap-1" title="Edit estimate">
                                        <Pencil className="h-3 w-3" /> Edit
                                      </button>
                                      <button onClick={() => convertEstimate(e)}
                                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100 flex items-center gap-1" title="Create an order from this estimate">
                                        <ArrowRight className="h-3 w-3" /> Convert to Order
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {estimateForm && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">{estimateForm.id ? `Edit ${estimateForm.estimateNumber}` : "Create Estimate"}</p>
                    <button onClick={() => setEstimateForm(null)} className="text-xs text-slate-500 hover:underline">Back to list</button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="relative text-xs text-slate-600 space-y-1 sm:col-span-2">Party Name * <span className="text-slate-400">(type to search existing parties, or enter a new one)</span>
                      <input value={estimateForm.name}
                        onChange={e => setEstimateForm({ ...estimateForm, name: e.target.value.toUpperCase(), customerId: "" })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                      {partyMatches.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto">
                          {partyMatches.map(p => (
                            <button key={p.id} type="button" onClick={() => pickParty(p)}
                              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                              <span className="font-semibold text-slate-800">{p.businessName}</span>
                              <span className="text-slate-400"> · {p.phone ?? "no phone"}{p.city ? ` · ${p.city}` : ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Phone
                      <input value={estimateForm.phone} inputMode="numeric" maxLength={10}
                        onChange={e => setEstimateForm({ ...estimateForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">GSTIN
                      <input value={estimateForm.gstNumber} maxLength={15} placeholder="Optional"
                        onChange={e => {
                          const gstNumber = e.target.value.toUpperCase().replace(/\s/g, "");
                          const gstState = stateFromGstin(gstNumber);
                          setEstimateForm({ ...estimateForm, gstNumber, ...(gstState && !estimateForm.state.trim() ? { state: gstState.toUpperCase() } : {}) });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono" />
                      {stateFromGstin(estimateForm.gstNumber) && estimateForm.state.trim() && !sameState(stateFromGstin(estimateForm.gstNumber), estimateForm.state) && (
                        <span className="block text-[10px] font-semibold text-amber-700">GSTIN is registered in {stateFromGstin(estimateForm.gstNumber)}, but State is {estimateForm.state}.</span>
                      )}
                    </label>
                    <label className="text-xs text-slate-600 space-y-1 sm:col-span-2">Address
                      <input value={estimateForm.address} onChange={e => setEstimateForm({ ...estimateForm, address: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">City
                      <input value={estimateForm.city} onChange={e => setEstimateForm({ ...estimateForm, city: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">State
                      <input value={estimateForm.state} onChange={e => setEstimateForm({ ...estimateForm, state: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Pincode
                      <input value={estimateForm.pincode} inputMode="numeric" maxLength={6}
                        onChange={e => setEstimateForm({ ...estimateForm, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Estimate Date
                      <input type="date" value={estimateForm.estimateDate} onChange={e => setEstimateForm({ ...estimateForm, estimateDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">Valid Until
                      <input type="date" value={estimateForm.validUntil} onChange={e => setEstimateForm({ ...estimateForm, validUntil: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700">Items</p>
                    {estimateForm.items.map((line, idx) => {
                      const search = line.productSearch.trim().toLowerCase();
                      const options = catalog
                        .filter(p => !search || `${p.sku} ${p.name}`.toLowerCase().includes(search) || p.id === line.productId)
                        .slice(0, 100);
                      return (
                        <div key={idx} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 sm:grid-cols-12 items-end">
                          <label className="text-[11px] text-slate-500 space-y-1 sm:col-span-5">Product *
                            <input value={line.productSearch} placeholder="Search product / SKU…"
                              onChange={e => updateEstimateLine(idx, { productSearch: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400" />
                            <select value={line.productId} onChange={e => updateEstimateLine(idx, { productId: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400">
                              <option value="">{catalog.length === 0 ? "Loading products…" : "Select product…"}</option>
                              {options.map(p => (
                                <option key={p.id} value={p.id}>[{p.sku}] {p.name}{p.sizeInches ? ` | ${p.sizeInches}` : ""}{p.gsm ? ` | ${p.gsm} GSM` : ""}{p.paperType ? ` | ${p.paperType}` : ""}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[11px] text-slate-500 space-y-1 sm:col-span-2">Quantity *
                            <input type="number" min={1} step={1} value={line.quantity} onChange={e => updateEstimateLine(idx, { quantity: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                          </label>
                          <label className="text-[11px] text-slate-500 space-y-1 sm:col-span-2">Rate (₹) *
                            <input type="number" min={0} step="any" value={line.unitPrice} onChange={e => updateEstimateLine(idx, { unitPrice: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                          </label>
                          <div className="text-[11px] text-slate-500 sm:col-span-2">Amount
                            <p className="py-1.5 text-sm font-semibold text-slate-800">{fmt(lineAmount(line))}</p>
                          </div>
                          <div className="sm:col-span-1 flex justify-end">
                            <button type="button" disabled={estimateForm.items.length === 1}
                              onClick={() => setEstimateForm({ ...estimateForm, items: estimateForm.items.filter((_, i) => i !== idx) })}
                              className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Remove item">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <label className="text-[11px] text-slate-500 space-y-1 sm:col-span-12">Item note (optional)
                            <input value={line.notes} onChange={e => updateEstimateLine(idx, { notes: e.target.value })} placeholder="e.g. Matte lamination"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400" />
                          </label>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => setEstimateForm({ ...estimateForm, items: [...estimateForm.items, emptyEstimateLine()] })}
                      className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </button>
                  </div>

                  <label className="block text-xs text-slate-600 space-y-1">Notes (printed on the estimate)
                    <textarea rows={2} value={estimateForm.notes} onChange={e => setEstimateForm({ ...estimateForm, notes: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                  </label>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-sm text-slate-600">Total: <span className="text-base font-bold text-slate-900">{fmt(estimateFormTotal)}</span></p>
                    <div className="flex gap-2">
                      <button onClick={() => setEstimateForm(null)} disabled={estimateSaving}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                      <button onClick={() => void saveEstimate()} disabled={estimateSaving}
                        className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1">
                        {estimateSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Estimate
                      </button>
                    </div>
                  </div>
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
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-bold text-slate-900">{ledger.customer.businessName}</p>
                        <p className="text-xs text-slate-500">{ledger.customer.phone} · {ledger.customer.gstNumber || "No GSTIN"}</p>
                        {(ledger.customer.billingAddress || ledger.customer.city || ledger.customer.state || ledger.customer.pincode) && (
                          <p className="text-xs text-slate-500">
                            {[ledger.customer.billingAddress, ledger.customer.city, ledger.customer.state, ledger.customer.pincode].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={startPartyEdit}
                          disabled={partyForm !== null || !ledger.editLock?.canEdit}
                          title={ledger.editLock && !ledger.editLock.canEdit
                            ? (ledger.editLock.dispatchedOrders.length > 0
                              ? `Locked: order ${ledger.editLock.dispatchedOrders[0]} is already dispatched. Only an admin can edit.`
                              : "Only admin/accounts users can edit party details.")
                            : "Edit party details"}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {ledger.editLock && !ledger.editLock.canEdit ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />} Edit
                        </button>
                        <button
                          onClick={() => void downloadBlob(`${API_BASE_URL}/billing/parties/${selectedParty}/statement/pdf`, `Statement_${ledger.customer.businessName}.pdf`)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Download className="h-3.5 w-3.5" /> Download Statement PDF
                        </button>
                      </div>
                    </div>
                    {ledger.editLock && !ledger.editLock.canEdit && ledger.editLock.dispatchedOrders.length > 0 && (
                      <p className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Lock className="h-3 w-3" /> Details locked — order {ledger.editLock.dispatchedOrders[0]} is already dispatched. Only an admin can edit.
                      </p>
                    )}
                    {partyForm && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
                        <p className="text-xs font-semibold text-slate-700">Edit party details</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-slate-600 space-y-1 sm:col-span-2">Party Name *
                            <input value={partyForm.businessName} onChange={e => setPartyForm({ ...partyForm, businessName: e.target.value.toUpperCase() })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                          </label>
                          <label className="text-xs text-slate-600 space-y-1">Phone
                            <input value={partyForm.phone} inputMode="numeric" maxLength={10}
                              onChange={e => setPartyForm({ ...partyForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                          </label>
                          <label className="text-xs text-slate-600 space-y-1">GSTIN
                            <input value={partyForm.gstNumber} maxLength={15} placeholder="Leave blank if none"
                              onChange={e => {
                                const gstNumber = e.target.value.toUpperCase().replace(/\s/g, "");
                                const gstState = stateFromGstin(gstNumber);
                                setPartyForm({ ...partyForm, gstNumber, ...(gstState && !partyForm.state.trim() ? { state: gstState.toUpperCase() } : {}) });
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono" />
                            {stateFromGstin(partyForm.gstNumber) && partyForm.state.trim() && !sameState(stateFromGstin(partyForm.gstNumber), partyForm.state) && (
                              <span className="block text-[10px] font-semibold text-amber-700">GSTIN is registered in {stateFromGstin(partyForm.gstNumber)}, but State is {partyForm.state}.</span>
                            )}
                          </label>
                          <label className="text-xs text-slate-600 space-y-1 sm:col-span-2">Billing Address
                            <textarea rows={2} value={partyForm.billingAddress} onChange={e => setPartyForm({ ...partyForm, billingAddress: e.target.value.toUpperCase() })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                          </label>
                          <label className="text-xs text-slate-600 space-y-1">City
                            <input value={partyForm.city} onChange={e => setPartyForm({ ...partyForm, city: e.target.value.toUpperCase() })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                          </label>
                          <label className="text-xs text-slate-600 space-y-1">State
                            <input value={partyForm.state} onChange={e => setPartyForm({ ...partyForm, state: e.target.value.toUpperCase() })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                          </label>
                          <label className="text-xs text-slate-600 space-y-1">Pincode
                            <input value={partyForm.pincode} inputMode="numeric" maxLength={6}
                              onChange={e => setPartyForm({ ...partyForm, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                          </label>
                        </div>
                        <p className="text-[11px] text-slate-500">Changes apply to this party&apos;s record everywhere — all past and current orders, invoices and receipts. City, state and pincode are also used for dispatch.</p>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setPartyForm(null)} disabled={partySaving}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                          <button onClick={() => void savePartyEdit()} disabled={partySaving}
                            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1">
                            {partySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                          </button>
                        </div>
                      </div>
                    )}
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
                    <label className="text-xs text-slate-600 space-y-1">Invoice Number Prefix
                      <input value={profile.invoicePrefix} onChange={e => setProfile({ ...profile, invoicePrefix: e.target.value.toUpperCase() })}
                        placeholder="e.g. RP → RP/2026-27/1723"
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono" />
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
                  <textarea value={profile.defaultTermsAndConditions} onChange={e => setProfile({ ...profile, defaultTermsAndConditions: e.target.value })} rows={6}
                    placeholder={"One term per line, e.g.\n1. Goods once sold will not be taken back.\n2. Subject to Chandrapur jurisdiction."}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                  <p className="text-[11px] text-slate-400">Printed on every invoice, one line per term. The reverse-charge declaration is printed automatically.</p>
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

      {/* Invoice Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePreview}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-bold text-slate-900">Invoice {preview.invoiceNumber}</h2>
              <div className="flex items-center gap-2">
                <a
                  href={preview.url}
                  download={`Invoice_${preview.invoiceNumber}.pdf`}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                >
                  <Download className="h-3 w-3" /> Download
                </a>
                <button onClick={closePreview} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="Close">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-b-2xl overflow-hidden"><PdfPreview data={preview.blob} /></div>
          </div>
        </div>
      )}
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
