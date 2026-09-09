"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

const VALID_COUPONS: Record<string, number> = { FIRSTORDER: 12 };

export function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => setItems(readCart()), []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);
  const discountPct = appliedCoupon ? (VALID_COUPONS[appliedCoupon] ?? 0) : 0;
  const discountAmt = Math.floor(subtotal * discountPct / 100);
  const total = subtotal - discountAmt;
  const advance = Math.ceil(total * 0.5);

  function remove(slug: string) {
    const next = items.filter((item) => item.slug !== slug);
    setItems(next);
    window.localStorage.setItem("rareprint.webCart", JSON.stringify(next));
    window.dispatchEvent(new Event("rareprint-cart"));
  }

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (VALID_COUPONS[code]) {
      setAppliedCoupon(code);
      setCouponMsg({ type: "success", text: `✓ Coupon "${code}" applied — ${VALID_COUPONS[code]}% discount!` });
    } else {
      setCouponMsg({ type: "error", text: "Invalid coupon code. Try FIRSTORDER." });
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponMsg(null);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-4xl font-black tracking-normal text-red-700">Cart</h1>
      <p className="mt-3 text-sm font-semibold text-slate-600">Review products before 50% Razorpay advance checkout.</p>
      {items.length === 0 ? (
        <div className="mt-8 rounded-lg border border-red-100 bg-white p-8 text-center">
          <p className="text-lg font-black">Your cart is empty.</p>
          <Link href="/web-to-print/categories" className="mt-4 inline-flex rounded-lg bg-red-600 px-5 py-3 text-sm font-black text-white">Browse categories</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.slug} className="grid gap-4 rounded-lg border border-red-100 bg-white p-4 shadow-sm sm:grid-cols-[120px_1fr_auto]">
                <div className="aspect-square rounded-lg bg-red-50">
                  {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-contain p-2" /> : null}
                </div>
                <div>
                  <p className="text-xs font-black text-red-700">{item.category}</p>
                  <h2 className="mt-1 text-lg font-black">{item.name}</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{item.rateLabel} | Qty {item.quantity.toLocaleString("en-IN")}</p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                  <p className="text-lg font-black">{formatMoney(item.subtotal)}</p>
                  <button onClick={() => remove(item.slug)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-red-100 px-3 py-2 text-xs font-black text-red-700">
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <aside className="h-fit space-y-4">
            {/* Coupon Box */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-black">Have a coupon code?</p>
              {appliedCoupon ? (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
                  <span>{appliedCoupon} &mdash; {discountPct}% off</span>
                  <button onClick={removeCoupon} className="text-xs font-black text-red-600 underline">Remove</button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    placeholder="e.g. FIRSTORDER"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold uppercase outline-none focus:border-[#CC0000]"
                  />
                  <button onClick={applyCoupon} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Apply</button>
                </div>
              )}
              {couponMsg && (
                <p className={`mt-2 text-xs font-bold ${couponMsg.type === "success" ? "text-green-700" : "text-red-600"}`}>{couponMsg.text}</p>
              )}
            </div>

            {/* Order Summary */}
            <div className="rounded-lg border border-red-100 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">Order Summary</h2>
              <div className="mt-4 space-y-3 text-sm font-bold">
                <Row label="Subtotal" value={formatMoney(subtotal)} />
                {discountAmt > 0 && <Row label={`Discount (${discountPct}%)`} value={`-${formatMoney(discountAmt)}`} highlight />}
                <Row label="Total" value={formatMoney(total)} bold />
                <div className="border-t border-slate-100 pt-3" />
                <Row label="Razorpay advance (50%)" value={formatMoney(advance)} />
                <Row label="COD balance" value={formatMoney(total - advance)} />
                <Row label="Shipping" value="Quoted at dispatch" />
              </div>
              <Link href="/web-to-print/checkout" className="mt-5 block rounded-lg bg-red-600 px-5 py-3 text-center text-sm font-black text-white">
                Proceed to Checkout
              </Link>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={highlight ? "text-green-700" : "text-slate-500"}>{label}</span>
      <span className={`${bold ? "font-black text-slate-900" : ""} ${highlight ? "text-green-700" : ""}`}>{value}</span>
    </div>
  );
}
