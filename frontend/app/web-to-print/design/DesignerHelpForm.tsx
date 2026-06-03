"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";

export function DesignerHelpForm() {
  const [form, setForm] = useState({ name: "", phone: "", requirement: "" });
  const [status, setStatus] = useState("");

  async function submit() {
    setStatus("Sending request...");
    try {
      await fetch("/api/storefront/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type: "DESIGNER_HELP" }),
      });
      setStatus("Request sent. Our designer will contact you.");
    } catch {
      setStatus("Request saved on screen. Please WhatsApp us if API is not connected.");
    }
  }

  return (
    <div className="rounded-lg border border-red-100 bg-white p-5 shadow-sm">
      <MessageCircle className="h-7 w-7 text-[#CC0000]" />
      <h2 className="mt-4 text-xl font-black">Ask Our Designer for Help</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Not sure how to design? Tell us what you want. Share reference images, your logo, and preferences. Our designer will send you a proof within 2-4 hours.</p>
      <div className="mt-4 grid gap-3">
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" className="h-12 rounded-lg border border-red-100 px-3 text-base font-bold outline-none focus:border-[#CC0000]" />
        <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Phone" className="h-12 rounded-lg border border-red-100 px-3 text-base font-bold outline-none focus:border-[#CC0000]" />
        <textarea value={form.requirement} onChange={(event) => setForm({ ...form, requirement: event.target.value })} placeholder="Requirement" rows={3} className="rounded-lg border border-red-100 px-3 py-3 text-base font-bold outline-none focus:border-[#CC0000]" />
        <button type="button" onClick={submit} className="min-h-11 rounded-lg bg-[#CC0000] px-4 py-3 text-sm font-black text-white">Submit Request</button>
        {status && <p className="text-sm font-bold text-[#CC0000]">{status}</p>}
      </div>
    </div>
  );
}
