"use client";

import { useState } from "react";
import { API_BASE_URL } from "@/lib/api";

type TrackResult = {
  found?: boolean;
  message?: string;
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  productionStage?: string;
  shipment?: { status?: string; carrierName?: string; trackingNumber?: string; awbNumber?: string } | null;
  items?: Array<{ name: string; quantity: number }>;
};

export function TrackOrderClient() {
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);

  async function track() {
    setStatus("Checking order...");
    setResult(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("orderNo", query.trim());
      if (phone.trim()) params.set("phone", phone.trim());
      const res = await fetch(`${API_BASE_URL}/storefront/orders/track?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Could not track order");
      setResult(data);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not track order.");
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-8">
      <p className="text-sm font-black uppercase tracking-wide text-slate-500">Order Tracking</p>
      <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-5xl">Track Your Print Order</h1>
      <p className="mt-3 text-base font-medium leading-7 text-slate-700">
        Enter your ERP order number and phone number to see order, production, payment, and shipment status.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-slate-500"
          placeholder="Order number"
          type="text"
        />
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-slate-500"
          placeholder="Phone"
          type="tel"
        />
        <button className="h-12 rounded-xl bg-[#CC0000] px-6 text-base font-black text-white" type="button" onClick={track}>
          Check Status
        </button>
      </div>

      {status && <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">{status}</p>}

      {result && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          {result.found === false ? (
            <p className="text-sm font-bold text-slate-700">{result.message}</p>
          ) : (
            <div className="grid gap-3 text-sm font-semibold text-slate-700">
              <p><strong className="text-slate-950">Order:</strong> {result.orderNumber}</p>
              <p><strong className="text-slate-950">Status:</strong> {result.status}</p>
              <p><strong className="text-slate-950">Payment:</strong> {result.paymentStatus}</p>
              <p><strong className="text-slate-950">Production:</strong> {result.productionStage}</p>
              <p><strong className="text-slate-950">Shipping:</strong> {result.shipment?.trackingNumber || result.shipment?.awbNumber || "Not dispatched yet"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
