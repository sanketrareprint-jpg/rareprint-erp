import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { Breadcrumb } from "../../components/Breadcrumb";
import { ProductCard } from "../../components/ProductCard";
import { formatMoney, getAllCategories, getProductsByCategory } from "../../catalog";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllCategories().map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = getAllCategories().find((item) => item.slug === slug);
  return {
    title: category ? `${category.name} Printing | RarePrint` : "Print Category | RarePrint",
    description: category ? `Order ${category.name} products online with rates, design upload, 50% advance and delivery tracking.` : undefined,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getAllCategories().find((item) => item.slug === slug);
  if (!category) notFound();
  const products = getProductsByCategory(slug);
  const prices = products.flatMap((product) => product.rates.map((rate) => rate.price));
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;

  return (
    <main className="bg-white text-slate-950">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb items={[{ label: "Home", href: "/web-to-print" }, { label: "All Categories", href: "/web-to-print/categories" }, { label: category.name }]} />
        <h1 className="text-3xl font-black tracking-normal text-[#CC0000] md:text-4xl">{category.name}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {category.count} products {min ? `starting from ${formatMoney(min)}` : "available for custom quote"}{max && max !== min ? ` up to ${formatMoney(max)}` : ""}.
        </p>

        {slug === "corporate-gifts" ? (
          <div className="mt-6 rounded-lg border border-red-100 bg-red-50 p-5">
            <h2 className="text-2xl font-black text-slate-950">Corporate Gifts Need Bulk Quote</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Pens, keychains, stands, bottles, and other gifting products vary by stock, branding area, and quantity. Send your requirement and we will quote quickly.</p>
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "91[YOUR NUMBER]"}?text=${encodeURIComponent("Hi RarePrint, I need a bulk quote for corporate gifts.")}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-black text-white"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp Us for Bulk Quote →
            </a>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            {products.map((product) => <ProductCard key={product.slug} product={product} />)}
          </div>
        )}

        <div className="mt-8 rounded-lg bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
          RarePrint {category.name} products are prepared for business-ready printing with GST-inclusive pricing, design support, and tracked delivery. Select a product to view its rate list, artwork requirements, and order options.
        </div>
      </section>
    </main>
  );
}
