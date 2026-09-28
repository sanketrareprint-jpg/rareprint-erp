"use client";

import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  getStoredUser,
} from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";
import { fetchWithRetry, describeFetchError } from "@/lib/apiFetch";
import { Loader2, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { MobileSelect } from "@/components/MobileSelect";

type RegisterResponse = {
  bootstrap: boolean;
  accessToken?: string;
  tokenType?: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
};

// Creating accounts is administrator-only, so ADMIN belongs in this list —
// an administrator adding another administrator is a legitimate thing to do.
// The gate is the backend's, not this dropdown's: AuthService.register
// verifies the caller's token and re-reads their role from the database.
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "SALES_AGENT", label: "Sales Agent" },
  { value: "ACCOUNTS", label: "Accounts" },
  { value: "PRODUCTION", label: "Production" },
  { value: "DISPATCH", label: "Dispatch" },
  { value: "DESIGNER", label: "Designer" },
  { value: "INHOUSE", label: "Inhouse" },
  { value: "ADMIN", label: "Admin" },
];

// Matches backend/src/common/super-admin.ts. Inlined the same way
// accounts/page.tsx and dashboard/page.tsx already do it in this codebase.
const OWNER_EMAIL = "sanket.rareprint@gmail.com";

// bootstrap — no users exist yet, so this form creates the first
//   administrator and signs them in, with no session required.
// admin — an administrator is signed in and is adding somebody.
// denied — everyone else.
type Mode = "loading" | "bootstrap" | "admin" | "denied";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SALES_AGENT");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("loading");

  // Note there is no "already signed in -> go to dashboard" redirect any
  // more. A signed-in administrator is exactly who this page is now for.
  useEffect(() => {
    let cancelled = false;

    async function resolveMode() {
      let open = false;
      try {
        const res = await fetch(`${API_BASE_URL}/auth/registration-status`);
        if (res.ok) open = (await res.json())?.open === true;
      } catch {
        // Treat an unreachable backend as "not open": better to show the
        // restricted screen than to offer a form that cannot work.
      }
      if (cancelled) return;

      if (open) {
        setMode("bootstrap");
        setRole("ADMIN");
        return;
      }

      const stored = getStoredUser();
      const isAdmin =
        stored?.role === "ADMIN" ||
        stored?.email?.toLowerCase() === OWNER_EMAIL;
      setMode(isAdmin ? "admin" : "denied");
    }

    resolveMode();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      // Sent whenever we have one: on the bootstrap path there is no session
      // and the backend expects none, but an administrator adding a user
      // must identify themselves or the request is refused.
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem(AUTH_TOKEN_KEY)
          : null;
      const res = await fetchWithRetry(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fullName, email, password, role }),
      });

      const data = (await res.json().catch(() => null)) as
        | RegisterResponse
        | { message?: string | string[]; statusCode?: number }
        | null;

      if (!res.ok) {
        const msg = data && "message" in data ? data.message : null;
        const text = Array.isArray(msg) ? msg.join(", ") : msg;
        setError(text || "Could not create account. Please try again.");
        return;
      }

      if (!data || !("user" in data) || !data.user) {
        setError("Unexpected response from server.");
        return;
      }

      // A token comes back only when this was the bootstrap account, in which
      // case the person who just created it should be signed in. When an
      // administrator creates somebody else's account there is deliberately
      // no token — signing in as the new user would end the admin's session.
      if (data.accessToken) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.accessToken);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        router.push("/dashboard");
        return;
      }

      setNotice(`Created ${data.user.fullName} (${data.user.email}) as ${data.user.role.replace(/_/g, " ").toLowerCase()}.`);
      setFullName("");
      setEmail("");
      setPassword("");
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
                {mode === "bootstrap"
                  ? "Create the first administrator account"
                  : mode === "admin"
                    ? "Add a user account"
                    : "Account creation"}
              </p>
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
          {mode === "loading" && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking…
            </div>
          )}

          {mode === "denied" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-700">
                Accounts can only be created by an administrator. Ask an
                administrator at your company to add you.
              </p>
              <Link
                href="/login"
                className="inline-block font-medium text-brand-600 hover:text-brand-700 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          )}

          {(mode === "bootstrap" || mode === "admin") && (
          <form onSubmit={onSubmit} className="space-y-5">
            {mode === "bootstrap" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This instance has no users yet, so this first account will be
                created as an <strong>administrator</strong> and signed in.
                After that, only administrators can add more accounts.
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
              >
                {notice}
              </div>
            )}

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
                htmlFor="fullName"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Full name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Your name"
                />
              </div>
            </div>

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

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            {/* No role picker while bootstrapping: the backend ignores any
                role on that path and forces ADMIN, so offering a choice here
                would be a lie. */}
            {mode === "admin" && (
              <div>
                <label
                  htmlFor="role"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Role
                </label>
                <MobileSelect
                  value={role}
                  onChange={setRole}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : mode === "bootstrap" ? (
                "Create administrator account"
              ) : (
                "Create user"
              )}
            </button>
          </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
