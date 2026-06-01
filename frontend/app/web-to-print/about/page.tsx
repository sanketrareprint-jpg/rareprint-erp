import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Package, Phone, Star, Truck, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us | RarePrint",
  description: "RarePrint is India's trusted B2B print partner for clinics, businesses and corporates.",
};

const products = [
  "Visiting Cards", "Prescription Stickers & Labels", "Bill Books & NCR Books",
  "Letterheads & Letterpads", "Carry Bags & Packaging", "Doctor Files & X-Ray Bags",
  "Envelopes", "Calendars", "Corporate Gifts & Keychains", "Pamphlets & Flyers",
];

const reasons = [
  { icon: CheckCircle, title: "50% Advance, 50% on Delivery", desc: "Pay only half upfront via Razorpay. Balance is COD — zero risk for you." },
  { icon: Star, title: "Free Design Support", desc: "Our team helps you finalize artwork at no extra cost. Just share your logo and we handle the rest." },
  { icon: Package, title: "GST Invoice on Every Order", desc: "Get a proper GST invoice with every order — perfect for business expense claims." },
  { icon: Truck, title: "Pan-India Delivery", desc: "We ship to every pin code across India via Shiprocket and top courier partners." },
  { icon: Users, title: "Bulk Order Specialists", desc: "From 100 pieces to 1,00,000 — we handle bulk corporate print orders with consistent quality." },
  { icon: Phone, title: "Dedicated Support", desc: "Call or WhatsApp us directly. Real people, real responses, Mon–Sat 10:30 AM to 6:30 PM." },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">About RarePrint</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
            We Are RarePrint —<br className="hidden sm:block" /> India&apos;s B2B Print Partner
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-300">
            Based in Chandrapur, Maharashtra, RarePrint serves clinics, businesses, and corporates across India
            with high-quality custom printing, fast turnaround, and end-to-end design support.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/web-to-print/categories" className="rounded-lg bg-[#CC0000] px-6 py-3 text-sm font-black text-white">Browse Products</Link>
            <Link href="/web-to-print/contact" className="rounded-lg border border-white/30 px-6 py-3 text-sm font-black text-white hover:bg-white/10">Contact Us</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Our Story</p>
            <h2 className="mt-2 text-3xl font-black">Built for Businesses That Print</h2>
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
              RarePrint was founded with one goal — make professional printing accessible, affordable, and hassle-free for Indian businesses.
              From a single doctor ordering prescription stickers to a corporate ordering 10,000 branded carry bags, every order gets the same
              attention to quality and detail.
            </p>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
              We operate out of Chandrapur, Maharashtra, and deliver across every state in India. Share your requirements and artwork —
              we handle printing, quality check, packing, and doorstep delivery with a GST invoice every time.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[["593+", "Products in Catalogue"], ["Pan-India", "Delivery Coverage"], ["50%", "Advance Only"], ["Free", "Design Support"]].map(([val, label]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center">
                <p className="text-3xl font-black text-[#CC0000]">{val}</p>
                <p className="mt-1 text-xs font-black text-slate-700">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12">
        <div className="mx-auto max-w-7xl px-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Our Products</p>
          <h2 className="mt-2 text-2xl font-black">What We Print</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {products.map((p) => (
              <div key={p} className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm font-bold text-slate-800">{p}</div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/web-to-print/categories" className="inline-block rounded-lg bg-[#CC0000] px-6 py-3 text-sm font-black text-white">View Full Catalogue</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Why RarePrint</p>
        <h2 className="mt-2 text-2xl font-black">Why Businesses Choose Us</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
          {reasons.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-slate-100 p-6">
              <Icon className="h-7 w-7 text-[#CC0000]" />
              <h3 className="mt-3 text-sm font-black">{title}</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#CC0000] py-14 text-white">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="text-2xl font-black">Ready to Place Your Print Order?</h2>
          <p className="mt-2 text-sm font-semibold text-white/90">Browse our catalogue or get in touch — we&apos;ll quote you within hours.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link href="/web-to-print/categories" className="rounded-lg bg-white px-6 py-3 text-sm font-black text-[#CC0000]">Browse Products</Link>
            <Link href="/web-to-print/contact" className="rounded-lg border border-white/40 px-6 py-3 text-sm font-black text-white hover:bg-white/10">Get in Touch</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
