"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { ProductVisual } from "./ProductVisual";

type Slide = {
  title: string;
  sub: string;
  href: string;
  image?: string | null;
};

export function HeroSliderClient({ slides }: { slides: Slide[] }) {
  const [managedSlides, setManagedSlides] = useState<Slide[]>(slides);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE_URL}/storefront/content`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.heroBanners) ? data.heroBanners : [];
        const activeRows = rows
          .filter((row: any) => row.active !== false)
          .sort((a: any, b: any) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
          .map((row: any) => ({
            title: String(row.title ?? ""),
            sub: String(row.subtitle ?? ""),
            href: String(row.href ?? "/web-to-print/categories"),
            image: row.image ?? null,
          }))
          .filter((row: Slide) => row.title);
        if (activeRows.length) setManagedSlides(activeRows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (managedSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % managedSlides.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [managedSlides.length]);

  const active = managedSlides[activeIndex] ?? managedSlides[0] ?? slides[0];

  return (
    <section className="bg-white py-4">
      <div className="mx-auto max-w-7xl px-4">
        <Link href={active.href} className="relative block min-h-[210px] overflow-hidden rounded-2xl bg-slate-950">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 opacity-40 sm:block">
            {active.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={active.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <ProductVisual label={active.title} />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
          <div className="relative z-10 flex min-h-[210px] max-w-md flex-col justify-end p-5 text-white sm:p-8">
            <p className="text-xs font-black uppercase tracking-widest text-white/80">RarePrint Campaign</p>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">{active.title}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/90">{active.sub}</p>
          </div>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {managedSlides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  setActiveIndex(index);
                }}
                className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
                aria-label={`Show slide ${index + 1}`}
              />
            ))}
          </div>
        </Link>
      </div>
    </section>
  );
}
