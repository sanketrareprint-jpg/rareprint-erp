// Shared feature copy for the homepage (top picks) and the full /features
// page. Module names map loosely to what already exists in backend/src —
// this is marketing copy, not a 1:1 module list.
//
// Default lead order (open question #2 in docs/Marketing_Site_Roadmap.md —
// change freely, this was a reasonable-default pick, not a locked decision):
// production tracking, accounts/cashflow, CRM+WhatsApp automation, and
// dispatch/courier are the four led with on the homepage because they're the
// most immediately relatable pain points for a printing-business owner.
// Everything else (rewards, sales-learning, virtual-CEO, call compliance,
// paper inventory, etc.) is "buried" on /features under an "Also included"
// section rather than the homepage hero.

import {
  Factory,
  Wallet,
  MessageCircle,
  Truck,
  Gift,
  GraduationCap,
  Gauge,
  PhoneCall,
  Boxes,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Feature = {
  slug: string;
  title: string;
  blurb: string;
  detail: string;
  icon: LucideIcon;
};

export const leadFeatures: Feature[] = [
  {
    slug: "production",
    title: "Production tracking",
    blurb: "Every job, every stage, one screen.",
    detail:
      "Track jobs from order to dispatch across every production stage, with clubbing sheets and status visible to your whole floor — no more chasing a job on WhatsApp to find out where it is.",
    icon: Factory,
  },
  {
    slug: "accounts",
    title: "Accounts & cashflow",
    blurb: "Know your real profit, not just your sales.",
    detail:
      "Invoicing, payments, vendor bills, and a dashboard that shows real profit and cash-in/cash-out — including cash payments — instead of a sales number that hides your margins.",
    icon: Wallet,
  },
  {
    slug: "crm-whatsapp",
    title: "CRM + WhatsApp automation",
    blurb: "Leads followed up automatically, not forgotten.",
    detail:
      "A CRM built around how printing businesses actually sell, with WhatsApp automation for follow-ups so a lead doesn't go cold because someone got busy on the floor.",
    icon: MessageCircle,
  },
  {
    slug: "dispatch",
    title: "Dispatch & courier",
    blurb: "One dashboard for every shipment.",
    detail:
      "Dispatch approvals and courier integration in one place, so you're not juggling separate courier logins to know what shipped and what's stuck.",
    icon: Truck,
  },
];

export const moreFeatures: Feature[] = [
  {
    slug: "rewards",
    title: "Loyalty & rewards",
    blurb: "Points-based rewards for repeat customers.",
    detail: "An activity/claim/approval points system to keep repeat customers coming back.",
    icon: Gift,
  },
  {
    slug: "sales-learning",
    title: "Sales team learning",
    blurb: "Keep your sales team sharp with streaks and structured learning.",
    detail: "A built-in learning module to onboard and continuously train your sales team.",
    icon: GraduationCap,
  },
  {
    slug: "virtual-ceo",
    title: "Virtual CEO insights",
    blurb: "A daily read on how the business is actually doing.",
    detail: "Rolled-up insights across production, accounts, and sales for a fast daily check-in.",
    icon: Gauge,
  },
  {
    slug: "call-compliance",
    title: "Call compliance",
    blurb: "Cross-check call logs against customer tags automatically.",
    detail: "Automated call-log and tag cross-checks so nothing falls through on customer calls.",
    icon: PhoneCall,
  },
  {
    slug: "paper-inventory",
    title: "Paper & material inventory",
    blurb: "Know what's in stock before you promise a delivery date.",
    detail: "Inventory tracking for paper and print materials, tied into production planning.",
    icon: Boxes,
  },
  {
    slug: "hr",
    title: "HR & attendance",
    blurb: "Agreements, ID verification, attendance — handled.",
    detail: "Staff onboarding with ID-proof upload, attendance, and HR workflows built in.",
    icon: Users,
  },
];
