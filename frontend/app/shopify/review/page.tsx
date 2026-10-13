"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";
import { paymentLabel } from "@/lib/shopify";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

// Review one Shopify order before it becomes an ERP order. Approve calls
// POST /shopify/inbox/orders/:id/approve, which creates the order exactly as
// the backend's Shopify rules say (SH-number, GST from the ERP product,
// shipping as courier charge, Razorpay payment pending verification) with
// the customer / products / specs / agent chosen here. Specs edited here are
// saved on that order item only — never on the catalogue product.

type Product = { id: string; name: string; sku: string; sizeInches: string; gsm: number; paperType: string | null; sides: string };
type Line = {
  shopifyProductId: string | null; title: string; variantTitle: string | null; sku: string | null; quantity: number; unitPrice: number;
  lineDiscount: number; lineTotal: number; grams: number | null; properties: { name: string; value: string }[];
  // matchedBy: "link" = a saved Shopify product → ERP product link, "sku" = SKU match.
  suggestedProduct: (Product & { matchedBy: "link" | "sku" }) | null;
};
type Address = { name?: string; company?: string; address1?: string; address2?: string; city?: string; province?: string; zip?: string; phone?: string } | null;
type SuggestedCustomer = { id: string; customerCode: string; businessName: string; contactPerson: string | null; phone: string | null; email: string | null; city: string | null; state: string | null; gstNumber: string | null; matchedBy: string };
type Detail = {
  id: string; status: string; isTest: boolean; shopifyName: string; orderNumberIfApproved: string; shopifyUrl: string | null; orderDate: string;
  customer: { name: string; company: string | null; phone: string | null; email: string | null; gstin: string | null; state: string | null; pincode: string | null };
  shippingAddress: Address; billingAddress: Address; lines: Line[];
  itemsTotal: number; shippingCharge: number; totalPrice: number; totalsMismatch: number;
  gateway: string; gatewayNames: string[]; financialStatus: string | null; fulfillmentStatus: string | null;
  cancelledAt: string | null; cancelReason: string | null; discountCodes: { code: string; amount: number }[];
  note: string | null; noteAttributes: { name: string; value: string }[]; tags: string | null; sourceName: string | null;
  taxesIncluded: boolean | null; suggestedCustomers: SuggestedCustomer[]; genericProductId: string | null;
  agents: { id: string; fullName: string; role: string }[];
  approvedByName: string | null; approvedAt: string | null; rejectedByName: string | null; rejectedAt: string | null; rejectReason: string | null;
  erpOrder: { id: string; orderNumber: string; status: string } | null;
};
// remember: save this Shopify product → ERP product link on approve, so the
// next order for the same Shopify product is pre-filled with it.
type LineForm = { productId: string; size: string; gsm: string; paper: string; sides: string; remember: boolean };

const INPUT = "w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300";
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const isLink = (v: string) => /^https?:\/\//i.test(v);
const SIDES = ["SINGLE_SIDE", "DOUBLE_SIDE"];

function AddressBlock({ title, a }: { title: string; a: Address }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</div>
      {a ? (
        <div className="text-sm text-gray-800 leading-5">
          {a.name && <div>{a.name}</div>}
          {a.company && <div>{a.company}</div>}
          <div>{[a.address1, a.address2].filter(Boolean).join(", ")}</div>
          <div>{[a.city, a.province, a.zip].filter(Boolean).join(", ")}</div>
          {a.phone && <div className="text-gray-500">{a.phone}</div>}
        </div>
      ) : <div className="text-sm text-gray-400">Not given</div>}
    </div>
  );
}

function ReviewInner() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customerChoice, setCustomerChoice] = useState<string>("new"); // customer id or "new"
  const [lines, setLines] = useState<LineForm[]>([]);
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRole(getStoredUser()?.role ?? null); }, []);
  const canReview = role === "ADMIN" || role === "ACCOUNTS";

  const load = useCallback(async () => {
    if (!id) { setError("No order selected"); return; }
    const [res, prodRes] = await Promise.all([
      fetch(`${API_BASE_URL}/shopify/inbox/orders/${id}`, { headers: getAuthHeaders() }).catch(() => null),
      fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() }).catch(() => null),
    ]);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) { setError(data?.message || "Could not load this Shopify order"); return; }
    const list: Product[] = prodRes?.ok ? await prodRes.json().catch(() => []) : [];
    setProducts(Array.isArray(list) ? list : []);
    const detail = data as Detail;
    setD(detail);
    setCustomerChoice(detail.suggestedCustomers[0]?.id ?? "new");
    // Only a real (SKU-matched) product pre-fills specs — the generic
    // "Shopify Item" has placeholder catalogue values, so its lines start blank.
    setLines(detail.lines.map((l) => {
      const p = l.suggestedProduct;
      return {
        productId: l.suggestedProduct?.id ?? "",
        size: p?.sizeInches ?? "", gsm: p && p.gsm ? String(p.gsm) : "", paper: p?.paperType ?? "", sides: p?.sides ?? "",
        // A SKU match isn't saved yet — offer to remember it. A link already is.
        remember: !!p && p.matchedBy === "sku" && !!l.shopifyProductId,
      };
    }));
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, productId: string) {
    const p = productById.get(productId);
    // Picking a product pre-fills its catalogue specs; edits stay on this line.
    // Choosing a product by hand defaults to remembering it for next time.
    setLine(i, p
      ? { productId, size: p.sizeInches ?? "", gsm: p.gsm ? String(p.gsm) : "", paper: p.paperType ?? "", sides: p.sides ?? "", remember: !!d?.lines[i]?.shopifyProductId }
      : { productId: "", size: "", gsm: "", paper: "", sides: "", remember: false });
  }

  async function approve() {
    if (!d) return;
    if (!window.confirm(`Create ERP order ${d.orderNumberIfApproved} from Shopify ${d.shopifyName}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/inbox/orders/${d.id}/approve`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerChoice === "new" ? { mode: "new" } : { mode: "existing", customerId: customerChoice },
          lines,
          salesAgentId: agentId || null,
          note: note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.message || "Could not approve"); return; }
      alert(`ERP order ${data.orderNumber} created — now pending accounts approval.`);
      await load();
    } finally { setBusy(false); }
  }

  async function reject() {
    if (!d) return;
    if (!reason.trim()) { alert("A reason is required"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/shopify/inbox/orders/${d.id}/reject`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.message || "Could not reject"); return; }
      setRejecting(false);
      await load();
    } finally { setBusy(false); }
  }

  if (error) return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div></div>;
  if (!d) return <div className="flex items-center gap-2 text-sm text-gray-500 p-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const editable = canReview && d.status === "NEW";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/shopify")} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Shopify inbox
        </button>
        <h1 className="text-xl font-bold text-gray-900">Shopify {d.shopifyName}</h1>
        {d.isTest && <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5">TEST</span>}
        <span className="text-sm text-gray-500">{new Date(d.orderDate).toLocaleString("en-IN")}</span>
        {d.shopifyUrl && (
          <a href={d.shopifyUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Open in Shopify <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {d.status === "APPROVED" && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Approved by {d.approvedByName ?? "—"} on {d.approvedAt ? new Date(d.approvedAt).toLocaleString("en-IN") : "—"} —
          ERP order <strong>{d.erpOrder?.orderNumber}</strong> ({d.erpOrder?.status}).{" "}
          <Link href="/orders" className="underline">Go to Orders</Link>
        </div>
      )}
      {d.status === "REJECTED" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          Rejected by {d.rejectedByName ?? "—"}{d.rejectedAt ? ` on ${new Date(d.rejectedAt).toLocaleString("en-IN")}` : ""}: {d.rejectReason}
        </div>
      )}
      {d.status === "CANCELLED" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Cancelled on Shopify{d.cancelReason ? ` (${d.cancelReason})` : ""} — this order can't be approved.
        </div>
      )}
      {Math.abs(d.totalsMismatch) > 0.01 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Shopify total {inr(d.totalPrice)} doesn't equal items + shipping {inr(d.itemsTotal + d.shippingCharge)} — check before approving.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase">Customer</div>
          <div className="text-sm"><div className="font-semibold text-gray-900">{d.customer.name}</div>
            {d.customer.company && <div className="text-gray-700">{d.customer.company}</div>}
            <div className="text-gray-700">{d.customer.phone ?? "no phone"}</div>
            <div className="text-gray-700">{d.customer.email ?? "no email"}</div>
            <div className="text-gray-700">GSTIN: {d.customer.gstin ?? "—"}</div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><AddressBlock title="Shipping address" a={d.shippingAddress} /></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><AddressBlock title="Billing address" a={d.billingAddress} /></div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Shopify item</th><th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Discount</th>
              <th className="px-3 py-2 text-right">Line total</th><th className="px-3 py-2 text-left w-[22rem]">ERP product &amp; specs</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => {
              const form = lines[i];
              return (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{l.title}</div>
                    {l.variantTitle && <div className="text-gray-700">{l.variantTitle}</div>}
                    <div className="text-xs text-gray-500">SKU {l.sku ?? "—"}{l.grams ? ` · ${l.grams} g` : ""}</div>
                    {l.properties.length > 0 && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-0.5">
                        <div className="text-[11px] font-bold text-amber-800 uppercase">Customisation (for production)</div>
                        {l.properties.map((p, n) => (
                          <div key={n} className="text-xs text-gray-800 break-words">
                            <span className="font-semibold">{p.name}:</span>{" "}
                            {isLink(p.value) ? <a href={p.value} target="_blank" rel="noreferrer" className="text-indigo-700 underline">{p.value}</a> : p.value}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{l.quantity}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{inr(l.unitPrice)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{l.lineDiscount ? inr(l.lineDiscount) : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{inr(l.lineTotal)}</td>
                  <td className="px-3 py-2">
                    {form && (
                      <div className="space-y-1.5">
                        <select disabled={!editable} value={form.productId} onChange={(e) => pickProduct(i, e.target.value)} className={INPUT}>
                          <option value="">Shopify Item (generic, 18% GST)</option>
                          {products.filter((p) => p.id !== d.genericProductId).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                        {l.suggestedProduct && form.productId === l.suggestedProduct.id && (
                          <div className="text-[11px] text-green-700">
                            {l.suggestedProduct.matchedBy === "link" ? `Linked — ERP product ${l.suggestedProduct.sku}` : "Matched by SKU"}
                          </div>
                        )}
                        {!form.productId && editable && <div className="text-[11px] text-amber-700">Not linked — pick the ERP product (product code) for this Shopify item.</div>}
                        {form.productId && l.shopifyProductId && !(l.suggestedProduct?.matchedBy === "link" && form.productId === l.suggestedProduct.id) && (
                          <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
                            <input type="checkbox" disabled={!editable} checked={form.remember} onChange={(e) => setLine(i, { remember: e.target.checked })} />
                            Always use this ERP product for this Shopify product
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                          <input disabled={!editable} placeholder="Size" value={form.size} onChange={(e) => setLine(i, { size: e.target.value })} className={INPUT} />
                          <input disabled={!editable} placeholder="GSM" value={form.gsm} onChange={(e) => setLine(i, { gsm: e.target.value })} className={INPUT} />
                          <input disabled={!editable} placeholder="Paper" value={form.paper} onChange={(e) => setLine(i, { paper: e.target.value })} className={INPUT} />
                          <select disabled={!editable} value={SIDES.includes(form.sides) || !form.sides ? form.sides : ""} onChange={(e) => setLine(i, { sides: e.target.value })} className={INPUT}>
                            <option value="">Sides —</option>
                            <option value="SINGLE_SIDE">Single side</option>
                            <option value="DOUBLE_SIDE">Double side</option>
                          </select>
                        </div>
                        <div className="text-[11px] text-gray-400">Specs are saved on this order item only.</div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-600">Items (GST incl.)</span><span>{inr(d.itemsTotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Shipping (not taxed, goes to courier charge)</span><span>{inr(d.shippingCharge)}</span></div>
          <div className="flex justify-between font-bold border-t border-gray-100 pt-1"><span>Shopify total</span><span>{inr(d.totalPrice)}</span></div>
          <div className="pt-2 text-gray-700">Payment: <strong>{paymentLabel(d.gateway, d.financialStatus)}</strong> <span className="text-gray-500">({d.gatewayNames.join(", ") || "unknown gateway"})</span></div>
          {d.discountCodes.length > 0 && <div className="text-gray-700">Discount codes: {d.discountCodes.map((c) => `${c.code} (${inr(c.amount)})`).join(", ")}</div>}
          {d.note && <div className="text-gray-700">Customer note: {d.note}</div>}
          {d.noteAttributes.length > 0 && <div className="text-gray-700">Attributes: {d.noteAttributes.map((a) => `${a.name}: ${a.value}`).join("; ")}</div>}
          {d.tags && <div className="text-gray-700">Tags: {d.tags}</div>}
          {d.sourceName && <div className="text-gray-500 text-xs">Source: {d.sourceName}</div>}
          <div className="text-gray-500 text-xs pt-1">GST is worked out on the invoice from each ERP product's rate; CGST+SGST or IGST from the shipping state.</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">ERP customer</label>
            <select disabled={!editable} value={customerChoice} onChange={(e) => setCustomerChoice(e.target.value)} className={INPUT}>
              {d.suggestedCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName} · {c.phone ?? c.email ?? "—"} · {c.customerCode} (matched by {c.matchedBy})
                </option>
              ))}
              <option value="new">Create new customer — {d.customer.company ?? d.customer.name}</option>
            </select>
            {d.suggestedCustomers.length === 0 && <div className="text-[11px] text-gray-500 mt-1">No existing customer with this phone/email.</div>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sales agent (optional — commission applies only if set)</label>
            <select disabled={!editable} value={agentId} onChange={(e) => setAgentId(e.target.value)} className={INPUT}>
              <option value="">No sales agent (no commission)</option>
              {d.agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}{a.role === "ADMIN" ? " (admin)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note (added to the ERP order)</label>
            <textarea disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={INPUT} />
          </div>

          {editable ? (
            rejecting ? (
              <div className="space-y-2">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason for rejecting (required)" className={INPUT} />
                <div className="flex gap-2">
                  <button disabled={busy} onClick={reject} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm Reject</button>
                  <button onClick={() => setRejecting(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button disabled={busy} onClick={approve} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
                  {busy ? "Working…" : "Approve & Create Order"}
                </button>
                <button disabled={busy} onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-semibold">Reject</button>
              </div>
            )
          ) : canReview && d.status === "CANCELLED" ? (
            rejecting ? (
              <div className="space-y-2">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (required)" className={INPUT} />
                <button disabled={busy} onClick={reject} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm Reject</button>
              </div>
            ) : (
              <button onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-semibold">Reject (move out of inbox)</button>
            )
          ) : !canReview && d.status === "NEW" ? (
            <div className="text-xs text-gray-500">Only Admin and Accounts can approve or reject.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ShopifyReviewPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<div className="p-10 text-sm text-gray-500">Loading…</div>}>
        <ReviewInner />
      </Suspense>
    </DashboardShell>
  );
}
