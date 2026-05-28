"use client";

import { CheckCircle2, ChevronRight, MapPin, ShoppingCart, Upload, Wand2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ProductRateTable } from "../../components/ProductRateTable";
import { formatMoney, type Product, type Rate } from "../../catalog";

function closestRate(product: Product, qty: number): Rate | undefined {
  return [...product.rates].reverse().find((rate) => qty >= rate.qty) ?? product.rates[0];
}

function comparePrice(price: number) {
  return price > 0 ? Math.ceil(price * 1.1) : 0;
}

export function ProductPageClient({
  product,
  specs,
}: {
  product: Product;
  specs: { label: string; value: string }[];
}) {
  const [selectedQty, setSelectedQty] = useState(product.rates[0]?.qty ?? product.moq);
  const [selectedFinish, setSelectedFinish] = useState("");
  const [selectedSides, setSelectedSides] = useState("");
  const [customQty, setCustomQty] = useState("");
  const [uploadedFile, setUploadedFile] = useState("");
  const [pincode, setPincode] = useState("");
  const [added, setAdded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rate = useMemo(() => closestRate(product, selectedQty), [product, selectedQty]);
  const price = rate?.price ?? 0;
  const mrp = comparePrice(price);
  const advance = Math.ceil(price * 0.5);
  const balance = Math.max(0, price - advance);
  const quoteOnly = product.hasVariableRatesToConfirm && product.rates.length === 0;

  const finishAttr = product.attributes.find((attr) => /lamination|quality|finish|gsm|thickness|shape/i.test(attr.name));
  const sidesAttr = product.attributes.find((attr) => /side/i.test(attr.name));
  const finishOptions = finishAttr?.terms.map((term) => term.name) ?? [];
  const sidesOptions = sidesAttr?.terms.map((term) => term.name) ?? [];

  const whatsappHref = `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919XXXXXXXXX"}?text=${encodeURIComponent(`Hi RarePrint, I need a quote for ${product.name}, quantity ${selectedQty}.`)}`;

  function handleAddToCart() {
    const cart = JSON.parse(window.localStorage.getItem("rareprint.webCart") ?? "[]");
    const item = {
      slug: product.slug,
      name: product.name,
      image: product.image,
      category: product.category,
      quantity: selectedQty,
      rateLabel: rate?.label ?? "Quote required",
      unitPrice: rate?.unitPrice ?? 0,
      subtotal: price,
      selectedFinish,
      selectedSides,
      artworkFile: uploadedFile,
    };
    window.localStorage.setItem("rareprint.webCart", JSON.stringify([...cart.filter((row: any) => row.slug !== product.slug), item]));
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <div className="pb-28 lg:pb-0">
      <div>
        <h1 className="text-[22px] font-extrabold leading-snug text-slate-900 sm:text-3xl">
          {product.name}
        </h1>

        {specs.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {specs.slice(0, 5).map((spec) => (
              <li key={`${spec.label}-${spec.value}`} className="text-sm font-semibold leading-6 text-slate-700">
                <span className="font-bold">{spec.label}</span>
                <span className="mx-1 text-slate-400">-</span>
                {spec.value}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-slate-700">
          <span className="inline-flex items-center gap-1 text-amber-500">
            ★★★★★ <span className="text-slate-700">4.5 ({Math.max(85, product.moq).toLocaleString("en-IN")} Reviews)</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>{Math.max(2880, product.moq * 6).toLocaleString("en-IN")}+ Orders Delivered</span>
        </div>

        <div className="mt-5">
          {quoteOnly ? (
            <p className="text-3xl font-extrabold text-slate-900">Get Quote</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              {mrp > 0 && <span className="text-lg font-bold text-slate-400 line-through">{formatMoney(mrp)}</span>}
              <span className="text-3xl font-extrabold text-slate-900">{formatMoney(price)}</span>
              <span className="rounded bg-slate-900 px-2 py-1 text-xs font-extrabold text-white">SAVE 9%</span>
            </div>
          )}
          <p className="mt-1 text-sm font-semibold text-slate-500">Inclusive of All Taxes</p>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
          We will share your design proof for confirmation within 24 hours of placing your order.
        </div>
      </div>

      <div className="my-5 border-t border-slate-100" />

      {finishOptions.length > 0 && (
        <OptionGroup
          label={(finishAttr?.name ?? "Option").toUpperCase()}
          value={selectedFinish || finishOptions[0]}
          options={finishOptions}
          onChange={setSelectedFinish}
        />
      )}

      {sidesOptions.length > 0 && (
        <div className="mt-5">
          <OptionGroup
            label="PRINT SIDE"
            value={selectedSides || sidesOptions[0]}
            options={sidesOptions}
            onChange={setSelectedSides}
          />
        </div>
      )}

      {!quoteOnly && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-900">
            Quantity: {selectedQty.toLocaleString("en-IN")} PCS
          </p>
          <div className="flex flex-wrap gap-2">
            {product.rates.map((rateOption) => (
              <button
                key={`${rateOption.qty}-${rateOption.price}`}
                type="button"
                onClick={() => {
                  setSelectedQty(rateOption.qty);
                  setCustomQty(String(rateOption.qty));
                }}
                className={`min-h-11 rounded-md border px-4 py-2 text-sm font-extrabold ${
                  selectedQty === rateOption.qty
                    ? "border-[#CC0000] bg-[#CC0000] text-white"
                    : "border-slate-300 bg-white text-slate-900 hover:border-slate-500"
                }`}
              >
                {rateOption.qty.toLocaleString("en-IN")} Pcs
              </button>
            ))}
          </div>
          <input
            type="number"
            value={customQty}
            placeholder={`Custom qty (min ${product.moq})`}
            onChange={(event) => {
              setCustomQty(event.target.value);
              if (event.target.value) setSelectedQty(Number(event.target.value));
            }}
            className="mt-3 h-12 w-full rounded-md border border-slate-300 px-3 text-base font-semibold text-slate-900 outline-none focus:border-slate-500"
            min={product.moq}
          />
          {Number(customQty) > 0 && Number(customQty) < product.moq && (
            <p className="mt-2 text-sm font-bold text-orange-600">Minimum order quantity is {product.moq.toLocaleString("en-IN")}.</p>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 hover:border-slate-500"
        >
          <Upload className="h-4 w-4" />
          {uploadedFile ? "Artwork Selected" : "Upload Design"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.tiff"
          className="hidden"
          onChange={(event) => setUploadedFile(event.target.files?.[0]?.name ?? "")}
        />
        <a
          href={`/web-to-print/studio/${product.slug}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 hover:border-slate-500"
        >
          <Wand2 className="h-4 w-4" />
          Design Online
        </a>
      </div>

      {uploadedFile && (
        <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
          Selected file: {uploadedFile}
        </p>
      )}

      <div className="mt-4">
        {quoteOnly ? (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex min-h-12 w-full items-center justify-center rounded-md bg-green-600 px-5 py-3 text-sm font-extrabold text-white">
            WhatsApp for Quote
          </a>
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#CC0000] px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white hover:bg-red-800"
          >
            <ShoppingCart className="h-4 w-4" />
            Add To Cart
          </button>
        )}
      </div>

      {added && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-green-800">Added to cart successfully.</span>
        </div>
      )}

      {!quoteOnly && (
        <>
          <div className="my-5 border-t border-slate-100" />
          <div className="rounded-xl border border-slate-200">
            <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-extrabold text-slate-900">
              Rate Table <ChevronRight className="h-4 w-4" />
            </button>
            <div className="border-t border-slate-100 p-3">
              <ProductRateTable
                product={product}
                selectedQty={selectedQty}
                onSelectQty={(qty) => {
                  setSelectedQty(qty);
                  setCustomQty(String(qty));
                }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <PriceMetric label="Pay Now" value={formatMoney(advance)} />
            <PriceMetric label="COD" value={formatMoney(balance)} />
            <PriceMetric label="Per Piece" value={rate ? `₹${rate.unitPrice.toFixed(2)}` : "-"} />
          </div>
        </>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-extrabold text-slate-900">Check Estimated Delivery</p>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={pincode}
              onChange={(event) => setPincode(event.target.value)}
              placeholder="Enter Pincode"
              className="h-12 w-full rounded-md border border-slate-300 pl-9 pr-3 text-base font-semibold outline-none focus:border-slate-500"
            />
          </div>
          <button type="button" className="min-h-12 rounded-md bg-slate-900 px-4 py-3 text-sm font-extrabold text-white">
            Check Now
          </button>
        </div>
        <p className="mt-3 text-sm font-bold text-slate-600">
          {pincode.length >= 6 ? "Estimated delivery: 2-5 working days after artwork approval." : "15 orders in last 4 hours"}
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-2xl lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-500">{product.name}</p>
            <p className="text-base font-extrabold text-slate-900">{quoteOnly ? "Get Quote" : formatMoney(price)}</p>
          </div>
          {quoteOnly ? (
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="min-h-11 rounded-md bg-green-600 px-4 py-2.5 text-sm font-bold text-white">
              Get Quote
            </a>
          ) : (
            <button type="button" onClick={handleAddToCart} className="min-h-11 rounded-md bg-[#CC0000] px-5 py-2.5 text-sm font-extrabold text-white">
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-900">
        {label}: {value}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`min-h-11 rounded-md border px-4 py-2 text-sm font-extrabold ${
              value === option ? "border-[#CC0000] bg-[#CC0000] text-white" : "border-slate-300 bg-white text-slate-900 hover:border-slate-500"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function PriceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
