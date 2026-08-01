"use client";

import { useState } from "react";
import { CONTACT_EMAIL, BRAND_NAME } from "../lib/site-config";

// Same honesty constraint as the /about contact form: no signup backend
// exists yet (Phase E in docs/Marketing_Site_Roadmap.md — needs the Tenant
// model + auth to exist first). This builds a real mailto: instead of
// faking an account-created state.

export function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [shopName, setShopName] = useState("");

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
      <input
        type="text"
        required
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
      />
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
      />
      <input
        type="text"
        placeholder="Shop / business name"
        value={shopName}
        onChange={(e) => setShopName(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
      />
      <button
        type="submit"
        className="w-full rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-blue-800"
      >
        Request my trial
      </button>
      <p className="text-center text-xs text-slate-400">
        Opens your email app — trials are set up manually for now, not instant.
      </p>
    </form>
  );
}
