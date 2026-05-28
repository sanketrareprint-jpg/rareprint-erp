"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { formatMoney } from "../catalog";

type CartItem = {
  slug: string;
  name: string;
  image: string | null;
  category: string;
  quantity: number;
  rateLabel: string;
  unitPrice: number;
  subtotal: number;
};

function readCart(): CartItem[] {
  try {
    return JSON.parse(window.localStorage.getItem("rareprint.webCart") || "[]");
  } catch {
    return [];
  }
}

function readArtworkUpload() {
  try {
    return JSON.parse(window.localStorage.getItem("rareprint.artworkUpload") || "null");
  } catch {
    return null;
  }
}

export function CheckoutClient() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [designMode, setDesignMode] = useState("Upload own design");
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setItems(readCart()), []);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);
  const advance = Math.ceil(total * 0.5);
  const balanceCod = Math.max(0, total - advance);

  async function submit() {
    if (!items.length) {
      setStatus("Please add at least one product to cart.");
      return;
    }
    setStatus("Creating ERP order...");
    try {
      const first = items[0];
      const artworkUpload = readArtworkUpload();
      const uploadNote = artworkUpload?.name ? ` Artwork file: ${artworkUpload.name}.` : "";
      const response = await fetch(`${API_BASE_URL}/storefront/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          items: items.map((item) => ({
            productSlug: item.slug,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            artworkNotes: `${designMode}. Selected rate: ${item.rateLabel}.${uploadNote}`,
          })),
          item: {
            productSlug: first.slug,
            productName: items.length === 1 ? first.name : `${first.name} + ${items.length - 1} more item(s)`,
            quantity: first.quantity,
            unitPrice: first.unitPrice,
            artworkNotes: `${designMode}. Cart contains: ${items.map((item) => `${item.name} (${item.rateLabel})`).join("; ")}.${uploadNote}`,
          },
          quote: { subtotal: total, advance, balanceCod, paymentMode: "RAZORPAY_50_ADVANCE_COD_BALANCE", shippingProvider: "SHIPROCKET" },
        }),
      });
      if (!response.ok) throw new Error("Order failed");
      const data = await response.json();
      const erpOrderId = data.orderId;
      if (!erpOrderId) throw new Error("ERP order id missing");

      setStatus("Opening Razorpay for 50% advance...");
      const razorpayResponse = await fetch(`${API_BASE_URL}/storefront/create-razorpay-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: erpOrderId, amount: advance }),
      });
      if (!razorpayResponse.ok) throw new Error("Razorpay order failed");
      const { razorpay_order_id, key_id } = await razorpayResponse.json();

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        const rzp = new (window as any).Razorpay({
          key: key_id,
          amount: advance * 100,
          currency: "INR",
          name: "RarePrint",
          description: `50% Advance - Order #${data.orderNumber ?? erpOrderId}`,
          order_id: razorpay_order_id,
          prefill: { name: customer.name, contact: customer.phone, email: customer.email },
          theme: { color: "#CC0000" },
          handler: async (paymentResponse: any) => {
            await fetch(`${API_BASE_URL}/storefront/orders/${erpOrderId}/confirm-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });
            window.localStorage.removeItem("rareprint.webCart");
            router.push(`/web-to-print/order/${erpOrderId}`);
          },
        });
        rzp.open();
      };
      script.onerror = () => setStatus("Could not load Razorpay checkout. Please try again.");
      document.body.appendChild(script);
    } catch {
      setStatus("Could not submit to ERP from this browser. Please check backend API connection.");
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-4xl font-black tracking-normal text-slate-900">Checkout</h1>
        <p className="mt-3 text-sm font-semibold text-slate-600">50% advance through Razorpay, remaining balance by COD. Shipping provider: Shiprocket.</p>
        <div className="mt-8 grid gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2">
          {[
            ["name", "Business / customer name"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["city", "City"],
            ["state", "State"],
            ["pincode", "Pincode"],
          ].map(([key, label]) => (
            <input key={key} value={(customer as any)[key]} onChange={(e) => setCustomer({ ...customer, [key]: e.target.value })} placeholder={label} className="h-12 rounded-lg border border-slate-200 px-3 text-base font-bold outline-none focus:border-slate-400" />
          ))}
          <textarea value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Full shipping address" className="min-h-24 rounded-lg border border-slate-200 px-3 py-3 text-base font-bold outline-none focus:border-slate-400 sm:col-span-2" />
          <select value={designMode} onChange={(e) => setDesignMode(e.target.value)} className="h-12 rounded-lg border border-slate-200 px-3 text-base font-bold outline-none focus:border-slate-400 sm:col-span-2">
            <option>Upload own design</option>
            <option>Design online in RarePrint Studio</option>
            <option>Use Canva design option</option>
            <option>Request RarePrint designer help</option>
          </select>
        </div>
        <button onClick={submit} className="mt-5 min-h-12 rounded-lg bg-[#CC0000] px-5 py-3 text-sm font-black text-white">Pay 50% Advance</button>
        {status && <p className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">{status}</p>}
      </div>
      <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Payment Summary</h2>
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.slug} className="border-b border-slate-100 py-2">
              <p className="text-sm font-black">{item.name}</p>
              <p className="text-xs font-bold text-slate-500">{item.rateLabel} | {formatMoney(item.subtotal)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3 text-sm font-bold">
          <Row label="Subtotal" value={formatMoney(total)} />
          <Row label="Razorpay advance" value={formatMoney(advance)} />
          <Row label="COD balance" value={formatMoney(balanceCod)} />
        </div>
        {!items.length && <Link href="/web-to-print/categories" className="mt-5 block rounded-lg bg-slate-100 px-4 py-3 text-center text-sm font-black text-slate-700">Add products</Link>}
      </aside>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><span>{value}</span></div>;
}
