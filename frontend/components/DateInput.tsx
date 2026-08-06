"use client";

import { InputHTMLAttributes, useRef, useState } from "react";

/**
 * Drop-in replacement for <input type="date">.
 *
 * Chrome/Edge render the native date input's closed-state text using the
 * OS/browser locale (usually MM/DD/YYYY for en-US), and there is no HTML
 * attribute (not even `lang`) that can override this — it's a browser-level
 * setting. To guarantee DD/MM/YYYY everywhere regardless of the viewer's
 * browser locale, this component keeps the real native <input type="date">
 * (so the calendar picker, keyboard input, and value format ("yyyy-mm-dd")
 * all behave exactly as before) but makes its text invisible and overlays a
 * custom-formatted "DD/MM/YYYY" label on top of it.
 *
 * The overlay used to be pointer-events:none, relying on clicks "passing
 * through" it to the invisible input underneath. That pass-through is
 * generally reliable, but in some table/layout contexts (nested absolute
 * positioning, stacking contexts from parent elements, etc.) clicks on the
 * overlay stop reaching the input and the field goes completely dead — no
 * picker, no focus, nothing. To make this robust regardless of surrounding
 * layout, the overlay is now the actual click target: clicking it explicitly
 * focuses the real input and calls the native showPicker() API, instead of
 * hoping the click passes through.
 *
 * Usage is identical to a native date input — pass value/defaultValue,
 * onChange, onBlur, className, style, etc. as normal.
 */
export default function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, value, defaultValue, onChange, onBlur, ...rest } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  const [internal, setInternal] = useState<string>(
    (value as string) ?? (defaultValue as string) ?? ""
  );

  // Keep internal display in sync for controlled usage.
  const current = value !== undefined ? (value as string) : internal;

  const display = formatDMY(current);

  const valueProp =
    value !== undefined
      ? { value: value as string }
      : defaultValue !== undefined
      ? { defaultValue: defaultValue as string }
      : {};

  function openPicker() {
    const el = inputRef.current;
    if (!el || (rest as any).disabled) return;
    el.focus();
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === "function") {
      try {
        withPicker.showPicker();
      } catch {
        // Some contexts (e.g. cross-origin iframes) throw on showPicker()
        // even when the method exists — focus() above still lets the user
        // type a date or use the keyboard to open it.
      }
    }
  }

  return (
    <div className="relative inline-block w-full">
      <input
        ref={inputRef}
        type="date"
        {...rest}
        {...valueProp}
        onChange={(e) => {
          setInternal(e.target.value);
          onChange?.(e);
        }}
        onBlur={onBlur}
        className={className}
        style={{ ...style, color: "transparent", caretColor: "transparent" }}
      />
      <span
        onClick={openPicker}
        className={`absolute inset-0 flex items-center overflow-hidden cursor-pointer ${className}`}
        style={{ ...style, color: "#0f172a", caretColor: "transparent" }}
      >
        {display || <span style={{ color: "#94a3b8" }}>dd/mm/yyyy</span>}
      </span>
    </div>
  );
}

function formatDMY(iso?: string | null): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts;
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}
