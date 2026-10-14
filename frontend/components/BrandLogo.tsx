"use client";
// The deployment's logo (see lib/branding.ts), or an initials badge when it
// has none, so a customer's app never falls back to RarePrint's logo.
import { brandInitials, type Branding } from "@/lib/branding";

export function BrandLogo({ branding, size }: { branding: Branding; size: number | string }) {
  if (branding.logoUrl) {
    return (
      <img
        src={branding.logoUrl}
        alt={branding.name}
        style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-label={branding.name}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "22%",
        background: "#1e293b",
        color: "#ffffff",
        fontWeight: 800,
        fontSize: typeof size === "number" ? Math.max(10, Math.round(size * 0.4)) : "0.8em",
        letterSpacing: "0.02em",
        lineHeight: 1,
      }}
    >
      {brandInitials(branding.name)}
    </span>
  );
}
