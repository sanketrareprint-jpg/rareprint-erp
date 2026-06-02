import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Breadcrumb } from "../../components/Breadcrumb";
import { ProductCard } from "../../components/ProductCard";
import { getAllProducts, getGsmFromName, getProductBySlug, parseSpecLines } from "../../catalog";
import { ProductPageClient } from "./ProductPageClient";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllProducts().map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Product | RarePrint" };
  return {
    title: `${product.name} | RarePrint`,
    description: `${product.name}. MOQ ${product.moq}. Order online with 50% Razorpay advance and COD balance. Fast delivery across India.`,
    openGraph: { images: product.image ? [product.image] : [] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const rawCatalog = (await import("../../rareprint-catalog.json")).default;
  const rawProduct = (rawCatalog.products as any[]).find((item) => item.slug === slug);
  const specLines = parseSpecLines(rawProduct?.shortDescription ?? "");
  const gsm = getGsmFromName(product.name);
  const related = getAllProducts()
    .filter((item) => item.categorySlug === product.categorySlug && item.slug !== product.slug)
    .slice(0, 8);

  const gallery = product.image ? [product.image] : [];

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: "Home", href: "/web-to-print" },
            { label: "Products", href: "/web-to-print/categories" },
            { label: product.category, href: `/web-to-print/category/${product.categorySlug}` },
            { label: product.name },
          ]}
        />

        <section className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <div className="grid gap-3 sm:grid-cols-[76px_1fr]">
              {gallery.length > 0 && (
                <div className="order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col sm:overflow-visible">
                  {gallery.map((image, index) => (
                    <div
                      key={`${image}-${index}`}
                      className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                    >
                      <Image
                        src={image}
                        alt={`${product.name} preview ${index + 1}`}
                        fill
                        sizes="64px"
                        className="object-contain p-1"
                        loading="lazy"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="order-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:order-2">
                <div className="relative aspect-square">
                  <span className="absolute left-3 top-3 z-10 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                    Click to enlarge
                  </span>
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(max-width: 1024px) 100vw, 640px"
                      className="object-contain p-6"
                      priority
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-6xl font-black text-slate-300">
                      RP
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ProductPageClient
            product={product}
            specs={[
              ...(gsm ? [{ label: "Paper", value: gsm }] : []),
              ...specLines,
            ].slice(0, 6)}
          />
        </section>

        <section className="mt-10 border-t border-slate-100 pt-8">
          <details open className="rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer px-4 py-4 text-sm font-extrabold uppercase tracking-wide text-slate-900">
              More Information
            </summary>
            <div className="grid gap-6 border-t border-slate-100 px-4 py-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{product.name}</h2>
                <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-600">
                  {product.summary || "Premium custom printing with print-ready artwork checking, ERP order tracking, and delivery across India."}
                </p>
              </div>
              <div className="grid divide-y divide-slate-100 rounded-xl border border-slate-200">
                {[
                  ["Artwork", "300 DPI, CMYK preferred, PDF/AI/PSD/PNG/JPG accepted"],
                  ["Payment", "50% Razorpay advance, remaining balance by COD"],
                  ["Delivery", "Most products dispatch in 2-5 working days via tracked shipping"],
                  ["Quality", "Print quality guarantee with artwork confirmation before production"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-3">
                    <span className="text-sm font-bold text-slate-500">{label}</span>
                    <span className="text-sm font-semibold text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Corporate Gift Collection</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Related Products</h2>
              </div>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3">
              {related.map((item) => (
                <div key={item.slug} className="w-64 flex-shrink-0">
                  <ProductCard product={item} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
