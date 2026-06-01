"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Slide = {
  title: string;
  sub: string;
  href: string;
  image?: string | null;
};

export function HeroSliderClient({ slides }: { slides: Slide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const active = slides[activeIndex];

  return (
    <section className="bg-white py-4">
      <div className="mx-auto max-w-7xl px-4">
        <Link href={active.href} className="relative block min-h-[210px] overflow-hidden rounded-2xl bg-slate-950">
          {slides.map((slide, index) => (
            <div key={slide.title} className={`absolute inset-0 transition-opacity duration-700 ${index === activeIndex ? "opacity-100" : "opacity-0"}`}>
              {slide.image && <Image src={slide.image} alt={slide.title} fill sizes="100vw" className="object-cover opacity-75" priority={index === 0} unoptimized />}
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
          <div className="relative z-10 flex min-h-[210px] max-w-md flex-col justify-end p-5 text-white sm:p-8">
            <p className="text-xs font-black uppercase tracking-widest text-white/80">RarePrint Campaign</p>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">{active.title}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/90">{active.sub}</p>
          </div>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {slides.map((slide, index) => (
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
