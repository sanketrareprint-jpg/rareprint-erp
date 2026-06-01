import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | RarePrint",
  description: "RarePrint terms and conditions for print orders, payments, and artwork.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-6">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="mt-3 text-sm font-semibold leading-7 text-slate-600">{children}</div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-10 text-white">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Legal</p>
          <h1 className="mt-2 text-3xl font-black">Terms & Conditions</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: May 2026</p>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Section title="1. Acceptance">
          By placing an order on RarePrint, you agree to these terms and conditions. Please read them carefully before ordering.
        </Section>
        <Section title="2. Payment Terms">
          All orders require 50% advance payment via Razorpay at the time of ordering. The remaining 50% balance is payable at the time of delivery (Cash on Delivery). Orders are confirmed only after successful advance payment.
        </Section>
        <Section title="3. Artwork & Design">
          Production begins only after you have approved the final artwork proof. No changes can be made once production has started. You are responsible for proofreading your artwork before approval — including spelling, logos, phone numbers, and colours. RarePrint is not liable for errors that were present in approved artwork.
        </Section>
        <Section title="4. Intellectual Property">
          You confirm that you own or have the rights to use all artwork, logos, and content you submit. RarePrint will not print content that infringes third-party intellectual property rights.
        </Section>
        <Section title="5. Colour Accuracy">
          Printed colours may vary slightly from what appears on your screen due to the nature of digital-to-print colour conversion. We follow standard CMYK printing processes and cannot guarantee exact colour matching unless a colour proof is separately requested and approved.
        </Section>
        <Section title="6. Delivery">
          Estimated delivery times are 3–7 business days from production completion. Delivery times are estimates and may vary due to courier delays. Shipping charges are extra and shown at checkout.
        </Section>
        <Section title="7. Pricing">
          All prices are inclusive of GST unless stated otherwise. Rates are subject to change without prior notice. The price applicable is the one confirmed at the time of your order.
        </Section>
        <Section title="8. Limitation of Liability">
          RarePrint&apos;s liability is limited to the value of the order placed. We are not liable for any indirect, incidental, or consequential damages arising from the use of our products.
        </Section>
        <Section title="9. Governing Law">
          These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Chandrapur, Maharashtra.
        </Section>
        <Section title="10. Contact">
          For any queries: <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">sales@rareprint.in</a> | +91 9699349563
        </Section>
      </div>
    </main>
  );
}
