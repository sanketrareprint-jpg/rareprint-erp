"use client";

import { InputHTMLAttributes, useState } from "react";

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
 * Usage is identical to a native date input — pass value/defaultValue,
 * onChange, onBlur, className, style, etc. as normal.
 */
export default function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, value, defaultValue, onChange, onBlur, ...rest } = props;

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

  return (
    <div className="relative inline-block w-full">
      <input
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
        className={`pointer-events-none absolute inset-0 flex items-center overflow-hidden ${className}`}
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
