import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | RarePrint",
  description: "RarePrint privacy policy — how we collect, use and protect your personal information.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-6">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <div className="mt-3 text-sm font-semibold leading-7 text-slate-600">{children}</div>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="bg-slate-950 py-10 text-white">
        <div className="mx-auto max-w-4xl px-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#CC0000]">Legal</p>
          <h1 className="mt-2 text-3xl font-black">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: May 2026</p>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Section title="1. Who We Are">
          RarePrint is a custom print-on-demand business based in Chandrapur, Maharashtra, India. We operate the web-to-print storefront at rareprint.in. For any privacy-related queries, contact us at <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">sales@rareprint.in</a>.
        </Section>
        <Section title="2. Information We Collect">
          When you place an order, we collect: your name, phone number, email address, and delivery address. We do not collect payment card details — all payments are processed securely by Razorpay, which has its own privacy policy.
        </Section>
        <Section title="3. How We Use Your Information">
          We use your information solely to: process and fulfil your print order, contact you regarding your order status, send your GST invoice, and arrange delivery via our courier partners (Shiprocket). We do not use your data for unrelated marketing without your consent.
        </Section>
        <Section title="4. Payment Data">
          RarePrint does not store any credit card, debit card, UPI, or net banking information. All payment processing is handled by Razorpay. Please refer to Razorpay&apos;s privacy policy at razorpay.com for details on how they handle payment data.
        </Section>
        <Section title="5. Data Sharing">
          We do not sell, trade, or rent your personal information to third parties. We may share your name, phone, and address with our courier partner (Shiprocket) solely for the purpose of delivering your order.
        </Section>
        <Section title="6. Cookies">
          Our storefront uses cookies to maintain your shopping cart session. These cookies are stored locally in your browser and do not contain sensitive information. You can disable cookies in your browser settings, but this may affect cart functionality.
        </Section>
        <Section title="7. Data Retention">
          We retain your order information for up to 3 years for GST compliance and business records as required under Indian law. You may request deletion of your personal data by emailing us, subject to legal retention requirements.
        </Section>
        <Section title="8. Your Rights">
          You have the right to access, correct, or request deletion of your personal data. To exercise these rights, email us at <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">sales@rareprint.in</a>.
        </Section>
        <Section title="9. Governing Law">
          This policy is governed by the Information Technology Act, 2000 and applicable Indian laws. Any disputes shall be subject to the jurisdiction of courts in Chandrapur, Maharashtra.
        </Section>
        <Section title="10. Contact">
          For any privacy concerns: <a href="mailto:sales@rareprint.in" className="text-[#CC0000] underline">sales@rareprint.in</a> | Phone: +91 9699349563
        </Section>
      </div>
    </main>
  );
}
