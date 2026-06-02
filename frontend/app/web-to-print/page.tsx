import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Clock,
  Home,
  Package,
  ShoppingBag,
  Star,
  Truck,
  User,
} from "lucide-react";
import { formatMoney, getAllCategories, getAllProducts, getFeaturedProducts, getProductsByCategory, type Product } from "./catalog";
import { HeroSliderClient } from "./components/HeroSliderClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "RarePrint Online Printing | Web To Print Storefront",
  description: "Order custom stickers, bill books, letterpads, packaging, and corporate gifts online with 50% advance.",
};

export default function WebToPrintHomePage() {
  const categories = getAllCategories();
  const allPriced = getAllProducts().filter((product) => product.rates.length > 0);
  const featured = [...getFeaturedProducts(6), ...allPriced].filter((product, index, rows) => rows.findIndex((row) => row.slug === product.slug) === index).slice(0, 6);
  const stickers = getProductsByCategory("prescription-stickers").slice(0, 4);
  const hotSelling = [...featured, ...stickers].filter(Boolean).slice(0, 4);
  const heroImages = featured.filter((product) => product.image).slice(0, 3);
  const storyItems = [
    { label: "Making", href: "/web-to-print/categories", image: heroImages[0]?.image },
    { label: "Stickers", href: "/web-to-print/category/prescription-stickers", image: stickers[0]?.image },
    { label: "Letterpad", href: "/web-to-print/category/letterhead", image: productImage(featured, "letter") },
    { label: "Bill Book", href: "/web-to-print/category/bill-book", image: productImage(featured, "bill") },
    { label: "Packaging", href: "/web-to-print/category/envelope", image: productImage(featured, "envelope") },
    { label: "Corporate Gifts", href: "/web-to-print/category/corporate-gifts", image: heroImages[1]?.image },
  ];

  return (
    <main className="bg-white text-slate-950">
      <StoryHighlights items={storyItems} />
      <HeroSlider products={heroImages} />
      <RoundCategoryCards categories={categories.slice(0, 6)} products={featured} />
      <PromoBanners products={featured} />
      <ProductRail title="Corporate Printing" products={featured.slice(0, 4)} />
      <ReelsSection products={hotSelling.slice(0, 4)} />
      <ProductRail title="Popular Products" products={stickers.length ? stickers : featured.slice(0, 4)} compact />
      <HotSelling products={hotSelling} />
      <ArticlesSection />
      <BrandStory />
      <InstagramProof />
      <MobileBottomNav />
    </main>
  );
}

function productImage(products: Product[], keyword: string) {
  return products.find((product) => product.image && product.name.toLowerCase().includes(keyword))?.image ?? products.find((product) => product.image)?.image;
}

function StoryHighlights({ items }: { items: { label: string; href: string; image?: string | null }[] }) {
  return (
    <section className="border-b border-slate-100 bg-white py-4">
      <div className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <Link key={item.label} href={item.href} className="w-20 flex-shrink-0 text-center">
            <div className="mx-auto rounded-full bg-gradient-to-br from-[#CC0000] via-slate-900 to-[#CC0000] p-[2px]">
              <div className="relative h-[70px] w-[70px] overflow-hidden rounded-full bg-white">
                {item.image ? (
                  <Image src={item.image} alt={item.label} fill sizes="70px" className="object-cover p-1" loading={index < 2 ? "eager" : "lazy"} unoptimized referrerPolicy="no-referrer" />
                ) : (
                  <div className="grid h-full place-items-center bg-slate-100 text-xs font-black text-slate-700">RP</div>
                )}
                {index === 0 && <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white bg-[#CC0000]" />}
              </div>
            </div>
            <span className="mt-2 block truncate text-xs font-bold text-slate-800">{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HeroSlider({ products }: { products: Product[] }) {
  const slides = [
    {
      title: "Custom Printing for Clinics",
      sub: "Prescription stickers, files, pouches, and healthcare stationery.",
      href: "/web-to-print/category/prescription-stickers",
      image: products[0]?.image,
    },
    {
      title: "Bulk Stickers and Labels",
      sub: "Glossy, paper, and product labels delivered across India.",
      href: "/web-to-print/categories",
      image: products[1]?.image ?? products[0]?.image,
    },
    {
      title: "Bill Books Delivered Fast",
      sub: "NCR books, letterheads, envelopes, and office print products.",
      href: "/web-to-print/category/bill-book",
      image: products[2]?.image ?? products[0]?.image,
    },
  ];

  return <HeroSliderClient slides={slides} />;
}

function RoundCategoryCards({ categories, products }: { categories: ReturnType<typeof getAllCategories>; products: Product[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-5">
      <h2 className="text-xl font-black">Shop By Category</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((category, index) => {
          const image = products[index % Math.max(1, products.length)]?.image;
          return (
            <Link key={category.slug} href={`/web-to-print/category/${category.slug}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-slate-50">
                {image && <Image src={image} alt={category.name} fill sizes="(max-width: 640px) 50vw, 220px" className="object-contain p-3" loading="lazy" unoptimized referrerPolicy="no-referrer" />}
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-black text-slate-900">{category.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{category.count} Products</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PromoBanners({ products }: { products: Product[] }) {
  const banners = [
    ["Custom Printing for Clinics", "Files, pouches, prescription stickers", "/web-to-print/category/prescription-stickers", products[0]?.image],
    ["Bulk Stickers and Labels", "High-volume label printing with GST invoice", "/web-to-print/categories", products[1]?.image ?? products[0]?.image],
    ["Bill Books Delivered Across India", "NCR, invoice books, receipt books", "/web-to-print/category/bill-book", products[2]?.image ?? products[0]?.image],
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-5">
      <div className="grid gap-4 md:grid-cols-3">
        {banners.map(([title, sub, href, image]) => (
          <Link key={title} href={href || "/web-to-print/categories"} className="relative min-h-40 overflow-hidden rounded-2xl bg-slate-900">
            {image && <Image src={image} alt={title || "RarePrint"} fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover opacity-55" loading="lazy" unoptimized referrerPolicy="no-referrer" />}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 to-transparent" />
            <div className="relative z-10 flex min-h-40 flex-col justify-end p-5 text-white">
              <h2 className="text-xl font-black">{title}</h2>
              <p className="mt-1 text-sm font-semibold text-white/85">{sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProductRail({ title, products, compact = false }: { title: string; products: Product[]; compact?: boolean }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-black">{title}</h2>
        <Link href="/web-to-print/categories" className="text-sm font-black text-slate-700">View All</Link>
      </div>
      <div className={compact ? "flex gap-4 overflow-x-auto pb-2" : "grid grid-cols-2 gap-4 md:grid-cols-4"}>
        {products.map((product, index) => (
          <div key={`${title}-${product.slug}`} className={compact ? "w-64 flex-shrink-0" : ""}>
            <HomeProductCard product={product} badge={index < 2 ? "Best Seller" : "Hot"} />
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeProductCard({ product, badge }: { product: Product; badge: string }) {
  const price = product.rates.length ? Math.min(...product.rates.map((rate) => rate.price)) : null;
  const mrp = price ? Math.ceil(price * 1.15) : null;
  return (
    <Link href={`/web-to-print/product/${product.slug}`} className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square bg-slate-50">
        <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-900 px-2 py-1 text-[11px] font-black text-white">{badge}</span>
        {product.image ? (
          <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 50vw, 260px" className="object-contain p-3" loading="lazy" unoptimized referrerPolicy="no-referrer" />
        ) : (
          <div className="grid h-full place-items-center text-3xl font-black text-slate-300">RP</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950">{product.name}</h3>
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-500">
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> ({Math.max(19, product.moq).toLocaleString("en-IN")})
        </p>
        <p className="mt-2 text-sm font-bold text-slate-400">
          {mrp && <span className="mr-2 line-through">{formatMoney(mrp)}</span>}
          <span className="font-black text-slate-950">{price ? `From ${formatMoney(price)}` : "Get Quote"}</span>
        </p>
      </div>
    </Link>
  );
}

function ReelsSection({ products }: { products: Product[] }) {
  return (
    <section className="bg-slate-50 py-7">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="text-xl font-black">Watch RarePrint In Action</h2>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {products.map((product, index) => (
            <Link key={`reel-${product.slug}`} href={`/web-to-print/product/${product.slug}`} className="relative aspect-[9/16] w-36 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
              {product.image && <Image src={product.image} alt={product.name} fill sizes="160px" className="object-cover opacity-75" loading="lazy" unoptimized referrerPolicy="no-referrer" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-black text-slate-900">Reel {index + 1}</div>
              <p className="absolute bottom-3 left-3 right-3 line-clamp-2 text-xs font-black text-white">{product.category}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HotSelling({ products }: { products: Product[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Hot Selling</h2>
          <p className="mt-1 flex items-center gap-1 text-sm font-bold text-slate-500">
            <Clock className="h-4 w-4" /> Order today for faster dispatch
          </p>
        </div>
        <span className="rounded-full bg-[#CC0000] px-3 py-2 text-xs font-black text-white">Trending</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {products.map((product) => (
          <div key={`hot-${product.slug}`} className="w-64 flex-shrink-0">
            <HomeProductCard product={product} badge="Hot Selling" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ArticlesSection() {
  const articles = [
    ["How to Prepare Print-Ready Artwork", "Use 300 DPI, bleed, safe margin, and CMYK for better print output."],
    ["Best Sticker Materials for Clinics", "Choose glossy paper stickers for dose labels and product packaging."],
    ["Why NCR Bill Books Still Matter", "A practical guide for shops, clinics, traders, and service businesses."],
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-7">
      <h2 className="text-xl font-black">Latest Articles</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {articles.map(([title, copy]) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Printing Guide</p>
            <h3 className="mt-2 text-lg font-black text-slate-950">{title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BrandStory() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-7">
      <div className="rounded-3xl bg-slate-950 p-6 text-white md:p-10">
        <p className="text-xs font-black uppercase tracking-widest text-white/60">RarePrint Story</p>
        <h2 className="mt-2 text-3xl font-black">Built for clinics, shops, teams, and growing brands.</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-white/75">
          RarePrint combines online ordering, design support, ERP-backed production, and tracked shipping so custom print jobs move from artwork to dispatch with fewer calls and faster confirmations.
        </p>
      </div>
    </section>
  );
}

function InstagramProof() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-7">
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-black">Follow us @rareprint.in on Instagram for latest work</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">See recent print jobs, product ideas, and finishing samples from RarePrint.</p>
        </div>
        <a href="https://www.instagram.com/rareprint.in" target="_blank" rel="noreferrer" className="rounded-lg bg-[#CC0000] px-4 py-2 text-sm font-black text-white">
          @rareprint.in on Instagram
        </a>
      </div>
    </section>
  );
}

function MobileBottomNav() {
  const nav = [
    { label: "Home", href: "/web-to-print", icon: Home },
    { label: "Products", href: "/web-to-print/categories", icon: Package },
    { label: "Track", href: "/web-to-print/track-order", icon: Truck },
    { label: "Cart", href: "/web-to-print/cart", icon: ShoppingBag },
    { label: "Account", href: "/web-to-print/account", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl md:hidden">
      {nav.map(({ label, href, icon: Icon }) => (
        <Link key={label} href={href} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-black text-slate-700">
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
