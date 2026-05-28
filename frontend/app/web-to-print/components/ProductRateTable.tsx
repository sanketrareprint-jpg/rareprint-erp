"use client";

import { MessageCircle } from "lucide-react";
import { formatMoney, type Product } from "../catalog";

export function ProductRateTable({
  product,
  selectedQty,
  onSelectQty,
}: {
  product: Product;
  selectedQty: number;
  onSelectQty: (qty: number) => void;
}) {
  if (product.hasVariableRatesToConfirm && product.rates.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          Rates confirmed on WhatsApp for your exact quantity and quality requirements.
        </p>
        <a
          href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919XXXXXXXXX"}?text=${encodeURIComponent(`Hi RarePrint, I need a quote for ${product.name}.`)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp for Quote
        </a>
      </div>
    );
  }

  const base = product.rates[0];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Quantity</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Total (GST incl.)</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Per Piece</th>
              <th className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 sm:table-cell">You Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {product.rates.map((rate, index) => {
              const isSelected = rate.qty === selectedQty;
              const saving = base && index > 0 ? (base.unitPrice - rate.unitPrice) * rate.qty : 0;
              return (
                <tr
                  key={`${rate.qty}-${rate.price}`}
                  onClick={() => onSelectQty(rate.qty)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? "border-l-4 border-l-[#CC0000] bg-white" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <span className="font-bold text-slate-900">{rate.qty.toLocaleString("en-IN")}</span>
                    {index === 1 && (
                      <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                        Popular
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-bold text-slate-900">{formatMoney(rate.price)}</span>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-700">₹{rate.unitPrice.toFixed(2)}</td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    {index === 0 || saving <= 0 ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      <span className="font-semibold text-green-600">Save {formatMoney(saving)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
