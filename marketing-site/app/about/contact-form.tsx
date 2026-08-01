"use client";

import { useState } from "react";
import { CONTACT_EMAIL } from "../lib/site-config";

// No lead-capture backend exists yet (Phase D in
// docs/Marketing_Site_Roadmap.md). Rather than fake a "message sent"
// confirmation that goes nowhere, this builds a real mailto: link from
// what's typed and opens the visitor's own email client — genuinely
// functional without a backend, not a dead form.

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = [
      message,
      "",
      `Name: ${name}`,
      email ? `Email: ${email}` : null,
      mobile ? `Mobile: ${mobile}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `Enquiry from ${name || "website visitor"}`
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
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
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
      />
      <input
        type="tel"
        placeholder="Mobile"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
      />
      <textarea
        rows={4}
        placeholder="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
      />
      <button
        type="submit"
        className="w-full rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
      >
        Send message
      </button>
      <p className="text-center text-xs text-slate-400">
        Opens your email app — there&apos;s no lead-capture system wired up yet.
      </p>
    </form>
  );
}
