"use client";

import { formatMoney, type Product, type Rate } from "../catalog";

function closestRate(product: Product, qty: number): Rate | undefined {
  return [...product.rates].reverse().find((rate) => qty >= rate.qty) ?? product.rates[0];
}

export function ProductConfigurator({
  product,
  selectedQty,
  setSelectedQty,
  selectedFinish,
  setSelectedFinish,
  selectedSides,
  setSelectedSides,
}: {
  product: Product;
  selectedQty: number;
  setSelectedQty: (qty: number) => void;
  selectedFinish: string;
  setSelectedFinish: (finish: string) => void;
  selectedSides: string;
  setSelectedSides: (side: string) => void;
}) {
  const finishOptions = product.attributes.find((attr) => /lamination|quality|finish|gsm|thickness/i.test(attr.name))?.terms.map((term) => term.name) ?? [];
  const sideOptions = product.attributes.find((attr) => /side/i.test(attr.name))?.terms.map((term) => term.name) ?? [];
  const rate = closestRate(product, selectedQty);
  const price = rate?.price ?? 0;
  const advance = Math.ceil(price * 0.5);
  const balance = Math.max(0, price - advance);
  const belowMoq = selectedQty < product.moq;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-black text-slate-700">Quantity</p>
        <div className="flex flex-wrap gap-2">
          {product.rates.map((rateOption) => (
            <button
              key={`${rateOption.qty}-${rateOption.price}`}
              type="button"
              onClick={() => setSelectedQty(rateOption.qty)}
              className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-black ${selectedQty === rateOption.qty ? "border-[#CC0000] bg-[#CC0000] text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              {rateOption.qty.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={selectedQty}
          onChange={(event) => setSelectedQty(Number(event.target.value))}
          className="mt-3 h-12 w-full rounded-lg border border-slate-200 px-3 text-base font-bold outline-none focus:border-slate-400"
          min={product.moq}
        />
        {belowMoq && <p className="mt-2 text-sm font-bold text-orange-600">Minimum order quantity is {product.moq.toLocaleString("en-IN")}.</p>}
      </div>

      {finishOptions.length > 0 && (
        <OptionGroup label="Finish / Quality" options={finishOptions} value={selectedFinish || finishOptions[0]} onChange={setSelectedFinish} />
      )}
      {sideOptions.length > 0 && (
        <OptionGroup label="Print Sides" options={sideOptions} value={selectedSides || sideOptions[0]} onChange={setSelectedSides} />
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-black text-slate-700">Live Price</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Metric label="Total" value={formatMoney(price)} />
          <Metric label="Per Piece" value={rate ? `₹${rate.unitPrice.toFixed(2)}` : "Get Quote"} />
          <Metric label="50% Advance" value={formatMoney(advance)} />
          <Metric label="COD Balance" value={formatMoney(balance)} />
        </div>
      </div>
    </div>
  );
}

function OptionGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-black text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-black ${value === option ? "border-[#CC0000] bg-[#CC0000] text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="text-base font-black text-slate-950">{value}</p>
    </div>
  );
}
