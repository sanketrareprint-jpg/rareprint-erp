"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Download, Search, Upload, Users } from "lucide-react";

type Product = { name: string; sku: string; category: string | null; quantity: number; amount: number };
type Order = {
  id: string;
  orderNo: string;
  invoiceNumber: string | null;
  orderDate: string;
  salesAgentName: string | null;
  status: string;
  total: number;
  products: Product[];
};
type CustomerRow = {
  id: string;
  businessName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  orderCount: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  lastSalesAgentName: string | null;
  lastProducts: string | null;
  orders: Order[];
};

const CSV_SAMPLE = `businessName,contactPerson,phone,email,city,state,pincode,gstNumber,address
Ahmedabad Pharma,Mehul Shah,9876543210,mehul@example.com,Ahmedabad,Gujarat,380001,24ABCDE1234F1Z5,Relief Road Ahmedabad
Surat Medical,Rina Patel,9123456780,rina@example.com,Surat,Gujarat,395003,,Ring Road Surat
Nagpur Clinic,Amit Deshmukh,9988776655,amit@example.com,Nagpur,Maharashtra,440001,,Sitabuldi Nagpur`;

function money(value: number) {
  return `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function CustomerDirectoryContent() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState({ customers: 0, orders: 0, revenue: 0 });
  const [cities, setCities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [product, setProduct] = useState("");
  const [loading, setLoading] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (city) params.set("city", city);
    if (state) params.set("state", state);
    if (product) params.set("product", product);
    try {
      const res = await fetch(`${API_BASE_URL}/customer-directory/search?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers ?? []);
        setSummary(data.summary ?? { customers: 0, orders: 0, revenue: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [search, city, state, product]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/customer-directory/filters`, { headers: getAuthHeaders() })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setCities(data?.cities ?? []);
        setStates(data?.states ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((customer) => customer.orders.forEach((order) => order.products.forEach((item) => set.add(item.name))));
    return Array.from(set).sort();
  }, [customers]);

  const downloadSample = () => {
    const blob = new Blob([CSV_SAMPLE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer_directory_sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCustomers = async () => {
    const rows = parseCsv(importText);
    if (!rows.length) return alert("Paste CSV data or upload a CSV file first");
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/customer-directory/import`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      setImportResult(data);
      await load();
    } finally {
      setImporting(false);
    }
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setImportText(String(e.target?.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customer Directory</h1>
          <p className="text-sm text-slate-500">Search customers by city/state and view what they bought, invoice, date, agent, and products.</p>
        </div>
        <button onClick={downloadSample} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Download size={16} /> Sample CSV
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          ["Customers", summary.customers.toLocaleString("en-IN")],
          ["Orders", summary.orders.toLocaleString("en-IN")],
          ["Revenue", money(summary.revenue)],
          ["Visible Cities", cities.length.toLocaleString("en-IN")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Ahmedabad, customer, phone..." className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
          </div>
          <select value={state} onChange={(e) => setState(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
            <option value="">All states</option>
            {states.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
            <option value="">All cities</option>
            {cities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input list="product-options" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Product filter" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <datalist id="product-options">
            {productOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <p className="text-sm font-bold text-slate-800">Import customer contacts from Excel CSV</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Upload size={14} /> Upload CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            <button onClick={importCustomers} disabled={importing || !importText.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {importing ? "Importing..." : "Import contacts"}
            </button>
          </div>
        </div>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={CSV_SAMPLE} rows={4} className="w-full rounded-lg border border-slate-200 p-3 font-mono text-xs outline-none focus:border-blue-500" />
        {importResult && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            Created: <strong>{importResult.created}</strong> · Updated: <strong>{importResult.updated}</strong> · Skipped: <strong>{importResult.skipped}</strong>
            {importResult.errors?.length > 0 && <p className="mt-1 text-red-600">{importResult.errors.slice(0, 3).join(" | ")}</p>}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">
          {loading ? "Loading..." : `${customers.length} customers found`}
        </div>
        <div className="divide-y divide-slate-100">
          {customers.map((customer) => (
            <div key={customer.id} className="p-3">
              <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] gap-3">
                <div>
                  <p className="font-bold text-slate-900">{customer.businessName}</p>
                  <p className="text-xs text-slate-500">{customer.contactPerson || "-"} · {customer.phone || "-"} · {customer.email || "-"}</p>
                  <p className="mt-1 text-xs text-slate-400">{[customer.city, customer.state, customer.pincode].filter(Boolean).join(", ") || "No location"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Orders</p>
                  <p className="font-bold text-slate-800">{customer.orderCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Total bought</p>
                  <p className="font-bold text-emerald-600">{money(customer.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Last agent</p>
                  <p className="font-semibold text-slate-800">{customer.lastSalesAgentName || "-"}</p>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {["Date", "Invoice", "Order", "Sales Agent", "Products", "Total"].map((head) => (
                        <th key={head} className="px-3 py-2 text-left font-semibold">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer.orders.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-3 text-center text-slate-400">No purchase history yet</td></tr>
                    ) : customer.orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-3 py-2 text-slate-600">{new Date(order.orderDate).toLocaleDateString("en-IN")}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{order.invoiceNumber || "-"}</td>
                        <td className="px-3 py-2 text-slate-600">{order.orderNo}</td>
                        <td className="px-3 py-2 text-slate-600">{order.salesAgentName || "-"}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {order.products.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-800">{money(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {!loading && customers.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">No customers found</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerDirectoryPage() {
  return (
    <DashboardShell>
      <CustomerDirectoryContent />
    </DashboardShell>
  );
}
