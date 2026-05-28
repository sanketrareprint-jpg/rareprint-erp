import Link from "next/link";

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
          <h3 className="text-sm font-black uppercase">Services</h3>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-300">
            <Link href="/web-to-print/design">Design Studio</Link>
            <Link href="/web-to-print/track-order">Track Order</Link>
            <Link href="/web-to-print/checkout">Bulk Order</Link>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase">Contact</h3>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-300">
            <span>Phone: +91 9XXXXXXXXX</span>
            <span>Email: sales@rareprint.in</span>
            <span>Address: RarePrint, India</span>
            <span>GST: Available on invoice</span>
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
          ["Services", [["Design Studio", "/web-to-print/design"], ["Track Order", "/web-to-print/track-order"], ["Bulk Order", "/web-to-print/checkout"]]],
          ["Contact", [["sales@rareprint.in", "mailto:sales@rareprint.in"], ["+91 9XXXXXXXXX", "tel:+919XXXXXXXXX"]]],
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
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-sm font-semibold text-slate-400">
        © 2026 RarePrint. All rights reserved.
      </div>
    </footer>
  );
}
