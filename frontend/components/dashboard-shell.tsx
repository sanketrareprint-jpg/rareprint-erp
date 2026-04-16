"use client";

import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  type AuthUser,
  clearAuth,
} from "@/lib/auth";
import {
  Calculator,
  Factory,
  LayoutDashboard,
  LogOut,
  Printer,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; icon: React.ElementType };

const ALL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/accounts", label: "Accounts", icon: Calculator },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/dispatch", label: "Dispatch", icon: Truck },
];

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  ADMIN: ALL_NAV,
  SALES_AGENT: [
    { href: "/orders", label: "Orders", icon: ShoppingCart },
  ],
  ACCOUNTS: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/accounts", label: "Accounts", icon: Calculator },
  ],
  PRODUCTION: [
    { href: "/production", label: "Production", icon: Factory },
  ],
  DISPATCH: [
    { href: "/dispatch", label: "Dispatch", icon: Truck },
  ],
};

function formatRole(role: string) {
  return role
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!token || !raw) { router.replace("/login"); return; }
    try { setUser(JSON.parse(raw) as AuthUser); }
    catch { clearAuth(); router.replace("/login"); return; }
    setReady(true);
  }, [router]);

  function logout() { clearAuth(); router.replace("/login"); }

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  const nav = NAV_BY_ROLE[user.role] ?? ALL_NAV;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f1f5f9" }}>

      {/* FIXED SIDEBAR */}
      <aside style={{
        width: "68px", minWidth: "68px", height: "100vh",
        position: "sticky", top: 0, left: 0, flexShrink: 0,
        background: "#1e293b", display: "flex", flexDirection: "column",
        alignItems: "center", borderRight: "1px solid #334155", zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: "14px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid #334155", width: "100%" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, #3b82f6, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Printer style={{ width: "18px", height: "18px", color: "white" }} strokeWidth={1.75} />
          </div>
          <span style={{ fontSize: "8px", color: "#94a3b8", marginTop: "5px", fontWeight: 700, letterSpacing: "0.06em", textAlign: "center", lineHeight: 1.2 }}>
            RARE<br />PRINT
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "8px 0", width: "100%" }}>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", width: "58px", padding: "8px 4px", borderRadius: "8px", textDecoration: "none", background: active ? "#3b82f6" : "transparent", transition: "background 0.15s" }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#334155"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <Icon style={{ width: "18px", height: "18px", color: active ? "white" : "#94a3b8", flexShrink: 0 }} />
                <span style={{ fontSize: "8px", fontWeight: 600, color: active ? "white" : "#94a3b8", textAlign: "center", lineHeight: 1.2, letterSpacing: "0.03em" }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div style={{ borderTop: "1px solid #334155", width: "100%", padding: "8px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "white" }}>
            {user.fullName?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <span style={{ fontSize: "7px", color: "#64748b", textAlign: "center", maxWidth: "60px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
            {formatRole(user.role)}
          </span>
          <button type="button" onClick={logout} title="Sign out"
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "4px", borderRadius: "6px", width: "50px" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#334155")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <LogOut style={{ width: "14px", height: "14px", color: "#64748b" }} />
            <span style={{ fontSize: "7px", color: "#64748b", fontWeight: 600 }}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, height: "100vh", overflowY: "auto", overflowX: "auto" }}>
        {children}
      </main>
    </div>
  );
}