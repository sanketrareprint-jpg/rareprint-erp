import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatMoney, getGsmFromName, type Product } from "../catalog";
import { ProductImage } from "./ProductImage";

function lowestPrice(product: Product) {
  return product.rates.length ? Math.min(...product.rates.map((rate) => rate.price)) : null;
}

export function ProductCard({ product }: { product: Product }) {
  const gsm = getGsmFromName(product.name);
  const price = lowestPrice(product);
  const quoteOnly = product.hasVariableRatesToConfirm && product.rates.length === 0;

  return (
    <Link
      href={`/web-to-print/product/${product.slug}`}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full bg-white p-2">
        <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{product.category}</span>
        <ProductImage
          src={product.image}
          alt={product.name}
          label={product.name}
          sizes="(max-width: 768px) 50vw, 280px"
          className="object-contain p-2"
        />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 min-h-12 text-sm font-black leading-6 text-slate-950">{product.name}</h3>
        <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold text-slate-500">
          {gsm && <span>{gsm}</span>}
          <span>MOQ: {product.moq.toLocaleString("en-IN")}</span>
        </div>
        <div className="mt-3 text-base font-black">
          {quoteOnly ? <span className="text-orange-600">Get Quote</span> : <span className="text-slate-900">From {formatMoney(price)}</span>}
        </div>
        <span className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#CC0000] px-3 py-3 text-sm font-black text-white">
          Order Now <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
