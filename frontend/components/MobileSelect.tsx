"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

export type MobileSelectOption = { value: string; label: string };

/**
 * Drop-in replacement for a plain <select> that only changes anything
 * inside the native Android app. A browser's <select> is rendered by the
 * OS/WebView, not the page, so it can never be restyled with CSS — that's
 * why it looks like a bare system list there. This renders a normal
 * <select> on the website (unchanged), and a custom brand-styled
 * button + bottom sheet on native.
 *
 * Usage mirrors a native <select>:
 *   <MobileSelect value={x} onChange={setX} options={[{value:"",label:"All"}, ...]} className="..." />
 */
export function MobileSelect({
  value,
  onChange,
  options,
  className = "",
  style,
  disabled,
  placeholder,
  onClick,
  title,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: MobileSelectOption[];
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  onClick?: (e: MouseEvent<HTMLSelectElement | HTMLButtonElement>) => void;
  title?: string;
  ariaLabel?: string;
}) {
  const isNativeApp = useIsNativeApp();
  const [open, setOpen] = useState(false);

  if (!isNativeApp) {
    return (
      <select value={value} onClick={onClick} onChange={(e) => onChange(e.target.value)} className={className} style={style} disabled={disabled} title={title} aria-label={ariaLabel}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { onClick?.(e); setOpen(true); }}
        style={style}
        title={title}
        aria-label={ariaLabel}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:opacity-60`}
      >
        <span className="truncate">{current?.label ?? placeholder ?? "Select"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <span className="text-sm font-bold text-slate-900">{placeholder ?? "Select"}</span>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-slate-400">×</button>
            </div>
            <div className="py-1">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${o.value === value ? "font-bold text-brand-700" : "text-slate-700"}`}
                >
                  {o.label}
                  {o.value === value && <Check className="h-4 w-4 text-brand-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
