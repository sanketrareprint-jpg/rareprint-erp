import type { Metadata } from "next";
import { CartClient } from "./cart-client";

export const metadata: Metadata = {
  title: "Cart | RarePrint Online Printing",
  description: "Review RarePrint web-to-print products before checkout.",
};

export default function CartPage() {
  return (
    <main className="min-h-screen bg-red-50 text-slate-950">
      <CartClient />
    </main>
  );
}
