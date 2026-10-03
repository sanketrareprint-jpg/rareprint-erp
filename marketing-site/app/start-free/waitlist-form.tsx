"use client";

import { useId, useState } from "react";
import { CONTACT_EMAIL, BRAND_NAME } from "../lib/site-config";

// Same honesty constraint as the /about contact form: no signup backend
// exists yet (Phase E in docs/Marketing_Site_Roadmap.md — needs the Tenant
// model + auth to exist first). This builds a real mailto: instead of
// faking an account-created state.

export function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [shopName, setShopName] = useState("");
  const idPrefix = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = [`Name: ${name}`, `Email: ${email}`, shopName ? `Shop name: ${shopName}` : null]
      .filter(Boolean)
      .join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `${BRAND_NAME} trial request`
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium text-slate-700">
          Your name
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-email`} className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-shop`} className="text-sm font-medium text-slate-700">
          Shop / business name
        </label>
        <input
          id={`${idPrefix}-shop`}
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-brand-800"
      >
        Request my trial
      </button>
      <p className="text-center text-xs text-slate-400">
        Opens your email app, trials are set up manually for now, not instant.
      </p>
    </form>
  );
}
