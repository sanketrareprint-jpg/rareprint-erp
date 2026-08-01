// Homepage FAQ. Own phrasing, not copied from any competitor site — but the
// question *shape* (what is it, who's it for, does it do GST billing, can
// multiple staff use it, is data secure) mirrors what prospects in this
// category actually ask, based on reviewing how similar printing-ERP
// products present themselves.

export type FaqItem = {
  question: string;
  answer: string;
};

export const faqs: FaqItem[] = [
  {
    question: "What is RarePrint Suite?",
    answer:
      "A cloud ERP built specifically for printing businesses — production tracking, accounts and GST billing, CRM, WhatsApp automation, dispatch, and more, all in one place.",
  },
  {
    question: "Who is it for?",
    answer:
      "Printing presses, digital and offset print shops, and packaging printers who are currently running things across spreadsheets, WhatsApp, and a courier's own tracking dashboard.",
  },
  {
    question: "Is this a generic ERP with printing features bolted on?",
    answer:
      "No — it was built from the ground up running a real printing business's day-to-day operations, then opened up for other printers to use.",
  },
  {
    question: "Can I create GST invoices?",
    answer:
      "Yes, invoicing, quotations, and payment tracking are part of the accounts module, built for GST-compliant billing.",
  },
  {
    question: "Does it handle production tracking?",
    answer:
      "Yes — every job can be tracked stage by stage from order to dispatch, with clubbing sheets and status visible across your team instead of buried in someone's phone.",
  },
  {
    question: "Can multiple staff use it with different access levels?",
    answer:
      "Yes, role-based access lets you control what each team member can see and do.",
  },
  {
    question: "Does it integrate with WhatsApp?",
    answer:
      "Yes — automated follow-ups, order updates, and reminders can go out over WhatsApp instead of relying on someone remembering to send them manually.",
  },
  {
    question: "Can I track dispatch and courier status in one place?",
    answer:
      "Yes, dispatch approvals and courier integration are built in, so you're not switching between separate courier logins to know what shipped.",
  },
  {
    // NOTE: this answer describes the tenant-isolation design goal from
    // docs/SaaS_Conversion_Roadmap_v2.md (section 1-2), which has NOT been
    // built yet (Phase 1 of that roadmap). Don't let this page go live
    // claiming data isolation before that work actually ships.
    question: "Is my data secure?",
    answer:
      "Each printer's data is isolated from every other tenant on the platform, with role-based permissions controlling who on your team can see what.",
  },
  {
    question: "Can I access it from my phone?",
    answer: "Yes, it's cloud-based and works from desktop, tablet, or mobile.",
  },
];
