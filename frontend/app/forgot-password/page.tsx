"use client";

import { API_BASE_URL } from "@/lib/api";
import { fetchWithRetry, describeFetchError } from "@/lib/apiFetch";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const msg = data?.message;
        const text = Array.isArray(msg) ? msg.join(", ") : msg;
        setError(text || "Something went wrong. Please try again.");
        return;
      }

      // Backend always reports success (even for unknown emails) to avoid
      // leaking which addresses have accounts.
      setSent(true);
    } catch (err) {
      setError(`Could not reach the server after retrying (${describeFetchError(err)}). Check your internet connection.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-brand-50/80 to-brand-100/60 px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(238,28,37,0.15),transparent)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex flex-col items-center gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full shadow-lg shadow-brand-600/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/rareprint-icon.png" alt="RarePrint" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                RarePrint ERP
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Reset your password
              </p>
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
          {sent ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <MailCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Check your inbox
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  If an account exists for <span className="font-medium text-slate-900">{email}</span>,
                  we&apos;ve sent a link to reset your password. The link expires in 1 hour.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <p className="text-sm text-slate-600">
                Enter the email address on your account and we&apos;ll send you a link to reset your password.
              </p>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset link"
                )}
              </button>

              <Link
                href="/login"
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Printing operations management · Secure access
        </p>
      </div>
    </div>
  );
}
