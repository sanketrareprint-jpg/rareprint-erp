"use client";
import { useStackedTables } from "@/lib/useStackedTables";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";
import { paymentLabel } from "@/lib/shopify";
import { Loader2, MessageCircle, Search, ShoppingBag, UserPlus, Check, X } from "lucide-react";

// Shopify inbox — every Shopify order and abandoned cart lands here first
// (backend/src/shopify). An order becomes an ERP order only when Admin/Accounts
// approves it on the review screen; nothing here counts in sales/commission.

type InboxOrder = {
  id: string; shopifyName: string; status: string; isTest: boolean; orderDate: string;
  customerName: string | null; phone: string | null; city: string | null; state: string | null;
  address: string | null; itemsSummary: string | null; totalPrice: number; gateway: string | null; financialStatus: string | null;
  cancelledAt: string | null; erpOrderNumber: string | null; rejectReason: string | null;
};
type CartItem = { title: string; variantTitle: string | null; quantity: number; price: number };
type Cart = {
  id: string; status: string; customerName: string | null; phone: string | null; email: string | null;
  cartItems: CartItem[]; cartValue: number; recoveryUrl: string | null; lastActivityAt: string;
  leadId: string | null; contactedAt: string | null; contactedByName: string | null;
  dismissedAt: string | null; dismissedByName: string | null;
};
type Agent = { id: string; fullName: string };

const ORDER_FILTERS = [
  { key: "NEW", label: "New" }, { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" }, { key: "CANCELLED", label: "Cancelled on Shopify" }, { key: "", label: "All" },
];
const CART_FILTERS = [
  { key: "waiting", label: "Waiting" }, { key: "contacted", label: "Contacted" }, { key: "lead", label: "Lead created" },
  { key: "converted", label: "Converted" }, { key: "dismissed", label: "Dismissed" }, { key: "all", label: "All" },
];
const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-100",
  APPROVED: "bg-green-50 text-green-700 border-green-100",
  REJECTED: "bg-gray-100 text-gray-600 border-gray-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-100",
};
const STATUS_LABEL: Record<string, string> = { NEW: "New", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled on Shopify" };
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function whatsappLink(cart: Cart) {
  const phone = (cart.phone ?? "").replace(/\D/g, "").slice(-10);
  const name = cart.customerName ? ` ${cart.customerName}` : "";
  const text = `Hi${name}, this is RarePrint. You left some items in your cart — you can complete your order here: ${cart.recoveryUrl ?? "https://rareprint.in"}`;
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

export default function ShopifyInboxPage() {
  useStackedTables(); // phone card layout for tables marked mobile-stack
  const [role, setRole] = useState<string | null>(null);
  const [tab, setTab] = useState<"orders" | "carts">("orders");
  const [orderFilter, setOrderFilter] = useState("NEW");
  const [cartFilter, setCartFilter] = useState("waiting");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leadCart, setLeadCart] = useState<Cart | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");

  useEffect(() => { setRole(getStoredUser()?.role ?? null); }, []);
  const isReviewer = role === "ADMIN" || role === "ACCOUNTS";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (tab === "orders" && orderFilter) params.set("status", orderFilter);
    if (tab === "carts") params.set("view", cartFilter);
    if (search) params.set("q", search);
    const res = await fetch(`${API_BASE_URL}/shopify/inbox/${tab}?${params}`, { headers: getAuthHeaders() }).catch(() => null);
    if (!res) { setError("Could not reach the server"); setLoading(false); return; }
    const data = await res.json().catch(() => null);
    if (!res.ok) { setError(data?.message || "Could not load the Shopify inbox"); setLoading(false); return; }
    if (tab === "orders") setOrders(Array.isArray(data) ? data : []);
    else setCarts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [tab, orderFilter, cartFilter, search]);

  useEffect(() => { void load(); }, [load]);

  async function cartAction(cart: Cart, action: "contacted" | "dismiss") {
    setBusyId(cart.id);
    try { await post(`/shopify/inbox/carts/${cart.id}/${action}`); await load(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusyId(null); }
  }

  async function openLead(cart: Cart) {
    setLeadCart(cart);
    setAgentId("");
    const res = await fetch(`${API_BASE_URL}/shopify/inbox/carts/lead-agents`, { headers: getAuthHeaders() }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    setAgents(Array.isArray(data?.agents) ? data.agents : []);
    if (data?.defaultAgentId) setAgentId(data.defaultAgentId);
  }

  async function createLead() {
    if (!leadCart) return;
    setBusyId(leadCart.id);
    try {
      const data = await post(`/shopify/inbox/carts/${leadCart.id}/lead`, { agentId: agentId || undefined });
      alert(data.existing ? `Added to the existing open lead (${data.agentName})` : `Lead created and assigned to ${data.agentName}`);
      setLeadCart(null);
      await load();
    } catch (e) { alert((e as Error).message); }
    finally { setBusyId(null); }
  }

  const filters = tab === "orders" ? ORDER_FILTERS : CART_FILTERS;
  const activeFilter = tab === "orders" ? orderFilter : cartFilter;

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-gray-700" />
          <h1 className="text-xl font-bold text-gray-900">Shopify</h1>
          <span className="text-xs text-gray-500">Orders become ERP orders only after approval</span>
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          {(["orders", "carts"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
              {t === "orders" ? "Orders" : "Abandoned Carts"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <button key={f.key} onClick={() => (tab === "orders" ? setOrderFilter(f.key) : setCartFilter(f.key))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${activeFilter === f.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {f.label}
            </button>
          ))}
          <form className="ml-auto flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "orders" ? "Name, phone, order no." : "Name, phone, email"}
                className="border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <button className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm">Search</button>
          </form>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : tab === "orders" ? (
          orders.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-10">No Shopify orders here.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="mobile-stack w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Shipping address</th>
                    <th className="px-3 py-2 text-left">Items</th><th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-left">Payment</th><th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-3 py-2 font-semibold">
                        <Link href={`/shopify/review?id=${o.id}`} className="text-indigo-700 hover:underline">{o.shopifyName}</Link>
                        {o.isTest && <span className="ml-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1">TEST</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{when(o.orderDate)}</td>
                      <td className="px-3 py-2"><div className="font-medium text-gray-900">{o.customerName ?? "—"}</div><div className="text-xs text-gray-500">{o.phone ?? "no phone"}</div></td>
                      <td className="px-3 py-2 text-gray-600 max-w-[16rem] break-words">{o.address ?? ([o.city, o.state].filter(Boolean).join(", ") || "—")}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-xs">{o.itemsSummary ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{inr(o.totalPrice)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{paymentLabel(o.gateway, o.financialStatus)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[o.status] ?? ""}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                        {o.erpOrderNumber && <div className="text-xs text-gray-500 mt-1">ERP {o.erpOrderNumber}</div>}
                        {o.status === "REJECTED" && o.rejectReason && <div className="text-xs text-gray-500 mt-1 max-w-[12rem]">{o.rejectReason}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : carts.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-10">No abandoned carts here.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="mobile-stack w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Items</th>
                  <th className="px-3 py-2 text-right">Cart value</th><th className="px-3 py-2 text-left">Last activity</th>
                  <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {carts.map((c) => {
                  const actionable = c.status === "ABANDONED" && !c.dismissedAt && !c.leadId;
                  return (
                    <tr key={c.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{c.customerName ?? "—"}</div>
                        <div className="text-xs text-gray-500">{c.phone ?? "no phone"}</div>
                        {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-xs">
                        {c.cartItems.map((i, n) => <div key={n}>{i.quantity} × {i.title}{i.variantTitle ? ` (${i.variantTitle})` : ""}</div>)}
                        {c.recoveryUrl && <a href={c.recoveryUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Recovery link</a>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{inr(c.cartValue)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{when(c.lastActivityAt)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {c.status === "CONVERTED" ? <span className="font-semibold text-green-700">Converted</span>
                          : c.dismissedAt ? `Dismissed by ${c.dismissedByName ?? "—"}`
                          : c.leadId ? "Lead created"
                          : c.contactedAt ? `Contacted by ${c.contactedByName ?? "—"}`
                          : "Waiting"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {c.phone && (
                            <a href={whatsappLink(c)} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700">
                              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                            </a>
                          )}
                          {actionable && !c.contactedAt && (
                            <button disabled={busyId === c.id} onClick={() => cartAction(c, "contacted")}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                              <Check className="w-3.5 h-3.5" /> Mark Contacted
                            </button>
                          )}
                          {isReviewer && actionable && !c.leadId && c.phone && (
                            <button disabled={busyId === c.id} onClick={() => openLead(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                              <UserPlus className="w-3.5 h-3.5" /> Create Lead
                            </button>
                          )}
                          {isReviewer && actionable && (
                            <button disabled={busyId === c.id} onClick={() => cartAction(c, "dismiss")}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                              <X className="w-3.5 h-3.5" /> Dismiss
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {leadCart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 space-y-3 shadow-xl">
            <h2 className="text-base font-bold text-gray-900">Create lead</h2>
            <p className="text-sm text-gray-600">{leadCart.customerName ?? "Customer"} · {leadCart.phone} · {inr(leadCart.cartValue)}</p>
            <label className="block text-xs font-semibold text-gray-600">Assign to sales agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                            {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select>
            <p className="text-xs text-gray-500">Tagged “shopify-abandoned”. If this phone already has an open lead, the cart is added to it instead.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setLeadCart(null)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">Cancel</button>
              <button disabled={busyId === leadCart.id} onClick={createLead}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
                {busyId === leadCart.id ? "Creating…" : "Create Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
