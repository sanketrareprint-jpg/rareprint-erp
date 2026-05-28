"use client";

import Link from "next/link";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useState } from "react";

export function Header({ categories }: { categories: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[48px_1fr_96px] items-center gap-2 px-3 md:h-16 md:grid-cols-[180px_1fr_180px] md:px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid h-11 w-11 place-items-center rounded-lg text-slate-900"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link href="/web-to-print" className="mx-auto flex min-w-0 items-center justify-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#CC0000] text-sm font-black text-white md:h-10 md:w-10">RP</span>
          <strong className="truncate text-lg font-black text-slate-950 md:text-xl">RarePrint</strong>
        </Link>

        <div className="ml-auto flex items-center justify-end gap-1">
          <Link href="/web-to-print/categories" className="grid h-11 w-11 place-items-center rounded-lg text-slate-900" aria-label="Search products">
            <Search className="h-5 w-5" />
          </Link>
          <Link href="/web-to-print/cart" className="relative grid h-11 w-11 place-items-center rounded-lg text-slate-900" aria-label="Cart">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#CC0000] text-[10px] font-black text-white">0</span>
          </Link>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
            <Link href="/web-to-print" onClick={() => setOpen(false)} className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#CC0000] text-sm font-black text-white">RP</span>
              <strong className="text-base font-black">RarePrint</strong>
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-700" aria-label="Close menu">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="grid gap-1 p-4 text-base font-black">
            <Link onClick={() => setOpen(false)} href="/web-to-print/categories" className="rounded-lg px-3 py-4 text-slate-950">Products</Link>
            <Link onClick={() => setOpen(false)} href="/web-to-print/design" className="rounded-lg px-3 py-4 text-slate-950">Design Studio</Link>
            <Link onClick={() => setOpen(false)} href="/web-to-print/track-order" className="rounded-lg px-3 py-4 text-slate-950">Track Order</Link>
            <div className="my-2 border-t border-slate-200" />
            {categories.map((category) => (
              <Link key={category.slug} onClick={() => setOpen(false)} href={`/web-to-print/category/${category.slug}`} className="rounded-lg px-3 py-3 text-sm font-bold text-slate-700">
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
