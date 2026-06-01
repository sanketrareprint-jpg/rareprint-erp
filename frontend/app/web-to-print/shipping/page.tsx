import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy | RarePrint",
  description: "RarePrint shipping policy — pan-India delivery via Shiprocket, estimated 3–7 business days.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-6">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="mt-3 text-sm font-semibold leading-7 text-slate-600">{children}</div>
    </div>
  );
}

export default function ShippingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-10 text-white">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Legal</p>
          <h1 className="mt-2 text-3xl font-black">Shipping & Delivery Policy</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: May 2026</p>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Section title="1. Shipping Partners">
          We ship via Shiprocket and their partner courier networks including Delhivery, BlueDart, DTDC, and others depending on your pin code and order weight.
        </Section>
        <Section title="2. Delivery Timeline">
          Standard delivery takes 3–7 business days from the date your order is dispatched. Production typically takes 1–3 business days after artwork approval, so total turnaround is approximately 4–10 business days.
          <br /><br />
          Chandrapur (Maharashtra) and nearby districts may receive orders faster via local delivery arrangements.
        </Section>
        <Section title="3. Shipping Charges">
          Shipping charges are calculated at checkout based on your delivery pin code, package weight, and dimensions. Charges are extra and not included in the product price.
        </Section>
        <Section title="4. Tracking Your Order">
          Once your order is dispatched, you will receive a tracking number via WhatsApp or SMS. You can also track your order at:{" "}
          <Link href="/web-to-print/track-order" className="text-[#CC0000] underline">Track My Order</Link>
        </Section>
        <Section title="5. Delivery Coverage">
          We currently ship to all serviceable pin codes within India. We do not offer international shipping at this time.
        </Section>
        <Section title="6. Failed Delivery">
          If delivery fails due to incorrect address or recipient unavailability, the courier will attempt re-delivery. After 2 failed attempts, the package is returned to us. Re-shipping charges will apply for re-dispatch.
        </Section>
        <Section title="7. Packaging">
          All products are securely packed to prevent damage during transit. Bulk orders are packed in corrugated boxes with adequate padding.
        </Section>
        <Section title="8. Contact">
          For shipping queries: <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">sales@rareprint.in</a> | WhatsApp: <a href="https://wa.me/918645614505" className="text-[#CC0000] underline">+91 8645614505</a>
        </Section>
      </div>
    </main>
  );
}
