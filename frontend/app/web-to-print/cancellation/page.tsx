import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy | RarePrint",
  description: "RarePrint cancellation and refund policy for custom print orders.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-6">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="mt-3 text-sm font-semibold leading-7 text-slate-600">{children}</div>
    </div>
  );
}

export default function CancellationPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-10 text-white">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Legal</p>
          <h1 className="mt-2 text-3xl font-black">Cancellation & Refund Policy</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: May 2026</p>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 rounded-2xl border border-[#CC0000]/20 bg-red-50 p-5">
          <p className="text-sm font-black text-[#CC0000]">Important: Custom print jobs cannot be cancelled once production has started, as materials are consumed and cannot be reused. Please review your artwork carefully before approval.</p>
        </div>
        <Section title="1. Cancellation Window">
          You may cancel your order within 1 hour of placing it, provided production has not yet started. To cancel, call or WhatsApp us immediately at +91 9699349563 or +91 8645614505. After 1 hour, or once production begins, cancellation is not possible.
        </Section>
        <Section title="2. No Refund After Production">
          Because all our products are custom-printed to your specifications, we do not offer refunds once printing has begun. This is standard practice in the custom print industry.
        </Section>
        <Section title="3. Damaged or Defective Products">
          If you receive a damaged or defective product, we will replace it at no cost. To claim a replacement:
          <ul className="mt-2 list-disc pl-5">
            <li>Record an unboxing video at the time of delivery — this is mandatory for all damage claims.</li>
            <li>Report the issue within 48 hours of delivery via WhatsApp (+91 8645614505) or email (sales@rareprint.in).</li>
            <li>Share the unboxing video and photos of the damaged product.</li>
            <li>We will arrange a replacement or reprint at our earliest.</li>
          </ul>
        </Section>
        <Section title="4. Refund Timeline (if applicable)">
          In rare cases where a refund is approved (e.g., cancellation within 1 hour before production), the amount will be credited to your original payment method within 5–7 business days.
        </Section>
        <Section title="5. Advance Payment">
          The 50% advance payment collected via Razorpay is non-refundable once production has started. If you cancel within the 1-hour window before production, the full advance will be refunded within 5–7 business days.
        </Section>
        <Section title="6. Contact for Cancellation/Refund">
          Phone/WhatsApp: +91 9699349563 | +91 8645614505<br />
          Email: <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">sales@rareprint.in</a><br />
          Hours: Monday to Saturday, 10:30 AM – 6:30 PM
        </Section>
      </div>
    </main>
  );
}
