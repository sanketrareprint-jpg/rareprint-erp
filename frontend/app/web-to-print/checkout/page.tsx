import type { Metadata } from "next";
import { CheckoutClient } from "./checkout-client";

export const metadata: Metadata = {
  title: "Checkout | RarePrint Online Printing",
  description: "Checkout with 50% Razorpay advance, COD balance, Shiprocket shipping, and ERP order creation.",
};

export default function CheckoutPage() {
  return (
    <main className="min-h-screen bg-red-50 text-slate-950">
      <CheckoutClient />
    </main>
  );
}
