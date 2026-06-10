import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { ProductCard } from "../components/ProductCard";
import { searchProducts } from "../catalog";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Search Print Products | RarePrint",
  description: "Search RarePrint products, rates, categories, and web-to-print ordering options.",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const products = query ? searchProducts(query).slice(0, 48) : [];

  return (
    <main className="bg-white">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb items={[{ label: "Home", href: "/web-to-print" }, { label: "Search" }]} />
        <h1 className="text-3xl font-black text-slate-950">Search Products</h1>
        <form action="/web-to-print/search" className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search stickers, bill book, letterpad..."
              className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-base font-semibold outline-none focus:border-slate-500"
            />
          </div>
          <button className="min-h-12 rounded-xl bg-[#CC0000] px-5 text-sm font-black text-white" type="submit">
            Search
          </button>
        </form>

        {!query && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-bold text-slate-600">Try popular searches: stickers, bill book, envelope, letterpad.</p>
          </div>
        )}

        {query && (
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm font-bold text-slate-500">{products.length} result(s) for “{query}”</p>
              <Link href="/web-to-print/categories" className="text-sm font-black text-slate-700">Browse Categories</Link>
            </div>
            {products.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {products.map((product) => <ProductCard key={product.slug} product={product} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                <h2 className="text-xl font-black text-slate-950">No products found</h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">WhatsApp us for a custom print quotation.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
