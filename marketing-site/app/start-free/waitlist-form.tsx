"use client";

import { useId, useState } from "react";
import { CONTACT_EMAIL, BRAND_NAME } from "../lib/site-config";

// Saves the trial request through /api/signup. It is NOT instant signup:
// RarePrint reviews each request and sets the account up with
// `node saas-ops/signups.js approve`, then sends the login details. If the
// endpoint isn't configured on this deployment (503), the form falls back to
// the original mailto: link so a request is never silently lost.

type PlanOption = { id: string; name: string };

const inputClass =
  "w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-600 focus:outline-none";

export function WaitlistForm({ plans }: { plans: PlanOption[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [plan, setPlan] = useState(plans[0]?.id ?? "");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const idPrefix = useId();

  function openMailtoFallback() {
    const planName = plans.find((p) => p.id === plan)?.name ?? plan;
    const body = [`Name: ${name}`, `Email: ${email}`, `Mobile: ${phone}`, `Shop name: ${shopName}`, `Plan: ${planName}`].join(
      "\n"
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `${BRAND_NAME} trial request`
    )}&body=${encodeURIComponent(body)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, email, phone, companyName: shopName, plan, website }),
      });
      if (res.status === 503) {
        openMailtoFallback();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg bg-brand-50 p-6 text-center">
        <p className="font-semibold text-slate-900">Request received, thank you!</p>
        <p className="mt-2 text-sm text-slate-600">
          We&apos;ll set up your account and send your login details to {email}, usually the same day.
        </p>
      </div>
    );
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
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
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
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-phone`} className="text-sm font-medium text-slate-700">
          Mobile number
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-shop`} className="text-sm font-medium text-slate-700">
          Shop / business name
        </label>
        <input
          id={`${idPrefix}-shop`}
          type="text"
          required
          minLength={2}
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-plan`} className="text-sm font-medium text-slate-700">
          Plan
        </label>
        <select
          id={`${idPrefix}-plan`}
          required
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className={inputClass}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {/* Honeypot — off-screen and skipped by keyboard/screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {submitting ? "Sending…" : "Request my trial"}
      </button>
      <p className="text-center text-xs text-slate-400">
        Trials are set up by our team, not instantly. We&apos;ll email your login details.
      </p>
    </form>
  );
}
