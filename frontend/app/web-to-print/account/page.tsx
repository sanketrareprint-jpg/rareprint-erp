import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Package, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "My Account | RarePrint",
  description: "Track your RarePrint order or get in touch with our team.",
};

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-12 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-3xl font-black">My Account</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">Track your order or get support from our team.</p>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          <Link href="/web-to-print/track-order"
            className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-8 text-center hover:border-[#CC0000] transition-colors">
            <Package className="h-10 w-10 text-[#CC0000]" />
            <p className="font-black">Track My Order</p>
            <p className="text-sm text-slate-600">Enter your order ID to check status and tracking</p>
          </Link>
          <a href="https://wa.me/918645614505?text=Hi%20RarePrint%2C%20I%20need%20help%20with%20my%20order"
            target="_blank" rel="noreferrer"
            className="flex flex-col items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-8 text-center hover:border-green-500 transition-colors">
            <MessageCircle className="h-10 w-10 text-green-600" />
            <p className="font-black">WhatsApp Support</p>
            <p className="text-sm text-slate-600">Chat with us on WhatsApp for fastest response</p>
          </a>
          <a href="tel:+919699349563"
            className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-8 text-center hover:border-[#CC0000] transition-colors">
            <Phone className="h-10 w-10 text-[#CC0000]" />
            <p className="font-black">Call Us</p>
            <p className="text-sm text-slate-600">+91 9699349563<br />Mon–Sat, 10:30 AM – 6:30 PM</p>
          </a>
        </div>
        <p className="mt-8 text-center text-sm font-semibold text-slate-500">
          Want to reorder or check a past invoice?{" "}
          <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">Email us at sales@rareprint.in</a>
        </p>
      </section>
    </main>
  );
}
