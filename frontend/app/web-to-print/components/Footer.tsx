import Link from "next/link";
import { Camera, MessageCircle, Play, Users, type LucideIcon } from "lucide-react";

const contact = {
  phone: "+91 9699349563 | +91 9637318960",
  tel: "tel:+919699349563",
  email: "sales@rareprint.in",
  mailto: "mailto:sales@rareprint.in",
  address: "F-401, Tirupati Home Apartment-3, Near Medicine Complex, Behind Manwatkar Hospital, Ekori Ward, Chandrapur, Maharashtra – 442401",
  gstin: "Available on invoice",
  company: "RarePrint",
  whatsapp: "https://wa.me/918645614505?text=Hi%20RarePrint%2C%20I%20want%20to%20place%20a%20print%20order",
  instagram: "https://www.instagram.com/rareprint.in",
  facebook: "https://www.facebook.com/share/1XyC9R4kKp/",
  youtube: "https://youtube.com/@rareprint",
};

const footerLinks = [
  ["About Us", "/web-to-print/about"],
  ["Contact Us", "/web-to-print/contact"],
  ["Privacy Policy", "/web-to-print/privacy-policy"],
  ["Terms & Conditions", "/web-to-print/terms"],
  ["Cancellation & Refund Policy", "/web-to-print/cancellation"],
  ["Shipping Policy", "/web-to-print/shipping"],
];

const socialLinks: { label: string; href: string; Icon: LucideIcon }[] = [
  { label: "WhatsApp", href: contact.whatsapp, Icon: MessageCircle },
  { label: "Instagram", href: contact.instagram, Icon: Camera },
  { label: "Facebook", href: contact.facebook, Icon: Users },
  { label: "YouTube", href: contact.youtube, Icon: Play },
];

export function Footer() {
  return (
    <footer className="bg-[#1A1A1A] pb-20 text-white md:pb-0">
      <div className="mx-auto hidden max-w-7xl gap-8 px-4 py-10 md:grid md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#CC0000] text-sm font-black text-white">RP</span>
            <strong className="text-lg font-black">RarePrint</strong>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">Custom printing, design support, and tracked delivery across India.</p>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase">Quick Links</h3>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-300">
            <Link href="/web-to-print/categories">All Categories</Link>
            <Link href="/web-to-print/category/bill-book">Bill Books</Link>
            <Link href="/web-to-print/category/prescription-stickers">Stickers & Labels</Link>
            <Link href="/web-to-print/category/corporate-gifts">Corporate Gifts</Link>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase">Company</h3>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-300">
            {footerLinks.map(([label, href]) => (
              <Link key={label} href={href}>{label}</Link>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase">Contact</h3>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-300">
            <Link href={contact.tel}>Phone: {contact.phone}</Link>
            <Link href={contact.mailto}>Email: {contact.email}</Link>
            <span>Address: {contact.address}</span>
            <span>GSTIN: {contact.gstin}</span>
            <span>Company: {contact.company}</span>
          </div>
          <div className="mt-4 flex gap-2">
            {socialLinks.map(({ label, href, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white hover:bg-[#CC0000]">
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-2 px-4 py-6 md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#CC0000] text-sm font-black text-white">RP</span>
          <strong className="text-lg font-black">RarePrint</strong>
        </div>
        {[
          ["Shop", [["All Categories", "/web-to-print/categories"], ["Bill Books", "/web-to-print/category/bill-book"], ["Stickers", "/web-to-print/category/prescription-stickers"]]],
          ["Company", footerLinks],
          ["Contact", [[contact.email, contact.mailto], [contact.phone, contact.tel], [`Address: ${contact.address}`, "#"], [`GSTIN: ${contact.gstin}`, "#"], [`Company: ${contact.company}`, "#"]]],
        ].map(([title, links]) => (
          <details key={title as string} className="border-b border-white/10 py-2">
            <summary className="cursor-pointer py-3 text-sm font-black uppercase">{title as string}</summary>
            <div className="grid gap-2 pb-3 text-sm font-semibold text-slate-300">
              {(links as string[][]).map(([label, href]) => (
                <Link key={label} href={href}>{label}</Link>
              ))}
            </div>
          </details>
        ))}
        <div className="flex gap-2 py-4">
          {socialLinks.map(({ label, href, Icon }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white">
              <Icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-sm font-semibold text-slate-400">
        © 2026 RarePrint. All rights reserved.
      </div>
    </footer>
  );
}
