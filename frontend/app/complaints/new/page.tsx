"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Save, Search, X } from "lucide-react";
import {
  CATEGORY_LABELS, CHANNEL_LABELS, ComplaintCategory, ComplaintChannel, ComplaintPriority,
  PRIORITY_LABELS, complaintsApiFetch,
} from "../shared";

type CustomerOption = { id: string; businessName: string; phone: string | null; city?: string | null };
type OrderOption = { id: string; orderNo: string; orderDate: string; total: number };

export default function NewComplaintPage() {
  const router = useRouter();

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const [channel, setChannel] = useState<ComplaintChannel>("WHATSAPP");
  const [category, setCategory] = useState<ComplaintCategory>("PRODUCT_QUALITY");
  const [priority, setPriority] = useState<ComplaintPriority>("MEDIUM");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2) { setCustomerResults([]); return; }
    setCustomerSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/customer-directory/search?search=${encodeURIComponent(term)}&limit=20`, { headers: getAuthHeaders() });
        if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
        const data = res.ok ? await res.json() : { customers: [] };
        setCustomerResults(data.customers ?? []);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [customerSearch, router]);

  const loadOrders = useCallback(async (customerId: string) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/customer-directory/orders?customerId=${customerId}`, { headers: getAuthHeaders() });
      const data = res.ok ? await res.json() : { orders: [] };
      setOrders(data.orders ?? []);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  function selectCustomer(customer: CustomerOption) {
    setSelectedCustomer(customer);
    setCustomerResults([]);
    setCustomerSearch(customer.businessName);
    setSelectedOrderId("");
    void loadOrders(customer.id);
  }

  async function submit() {
    setError(null);
    if (!selectedCustomer) { setError("Select a customer first"); return; }
    if (!subject.trim()) { setError("Subject is required"); return; }
    if (!description.trim()) { setError("Description is required"); return; }

    setSaving(true);
    try {
      const res = await complaintsApiFetch("/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          orderId: selectedOrderId || undefined,
          channel,
          category,
          priority,
          subject: subject.trim(),
          description: description.trim(),
        }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || "Could not create ticket");
        return;
      }
      const created = await res.json();
      router.push(`/complaints/${created.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto flex h-full max-w-3xl min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Complaint Ticket</h1>
          <p className="text-sm text-slate-500">Log a customer complaint — a ticket number and SLA deadlines will be assigned automatically.</p>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Customer</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedCustomer.businessName}</p>
                  {selectedCustomer.phone && <p className="text-xs text-slate-500">{selectedCustomer.phone}</p>}
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); setOrders([]); setSelectedOrderId(""); }} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search by business name or phone..."
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
                />
                {customerSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
                {customerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {customerResults.map((c) => (
                      <button key={c.id} onClick={() => selectCustomer(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <p className="font-medium text-slate-800">{c.businessName}</p>
                        <p className="text-xs text-slate-400">{c.phone ?? "No phone"}{c.city ? ` · ${c.city}` : ""}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Related Order (optional)</label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                disabled={ordersLoading}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
              >
                <option value="">No specific order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNo} — {new Date(o.orderDate).toLocaleDateString("en-IN")} — ₹{o.total.toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as ComplaintChannel)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ComplaintPriority)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary, e.g. 'Wrong size printed on visiting cards'" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Full details of the complaint..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={() => router.push("/complaints")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Create Ticket
            </button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
