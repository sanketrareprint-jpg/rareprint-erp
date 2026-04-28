"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  Truck, DollarSign, Users, LogOut, Printer, Database,
} from "lucide-react";

type Role = "ADMIN" | "AGENT" | "SALES_AGENT" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH";
interface NavItem { label: string; href: string; icon: React.ElementType; }
interface StoredUser { id: string; fullName: string; email: string; role: Role; }

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
    { label: "Orders",     href: "/orders",     icon: ShoppingCart },
    { label: "Accounts",   href: "/accounts",   icon: DollarSign },
    { label: "Production", href: "/production", icon: Package },
    { label: "Dispatch",   href: "/dispatch",   icon: Truck },
    { label: "Users",      href: "/users",      icon: Users },
    { label: "Database",   href: "/admin/database", icon: Database },
  ],
  AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
  ],
  SALES_AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
  ],
  ACCOUNTS: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Accounts",  href: "/accounts",  icon: DollarSign },
  ],
  PRODUCTION: [
    { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
    { label: "Production", href: "/production", icon: Package },
  ],
  DISPATCH: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Dispatch",  href: "/dispatch",  icon: Truck },
  ],
};

function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("rareprint_user");
    if (raw) return JSON.parse(raw) as StoredUser;
    const token = localStorage.getItem("rareprint_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { id: payload.sub, email: payload.email, role: payload.role, fullName: payload.fullName ?? payload.email };
  } catch { return null; }
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    setUser(u);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("rareprint_user");
    localStorage.removeItem("rareprint_token");
    router.replace("/login");
  };

  const role     = user?.role ?? "SALES_AGENT";
  const navItems = NAV_BY_ROLE[role] ?? NAV_BY_ROLE["SALES_AGENT"];
  const name     = user?.fullName ?? "…";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* ── Dark navy icon sidebar ── */}
      <aside style={{
        width: "72px", minWidth: "72px",
        background: "#1e3a5f",
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: "12px", paddingBottom: "12px",
        height: "100vh", position: "sticky", top: 0,
        overflowY: "auto", overflowX: "hidden",
      }}>
        {/* Logo */}
        <div style={{
          width: "44px", height: "44px", background: "#2563eb",
          borderRadius: "10px", display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: "6px", flexShrink: 0,
        }}>
          <Printer size={20} color="white" />
        </div>

        {/* Brand */}
        <div style={{
          fontSize: "7px", fontWeight: 700, color: "#93c5fd",
          letterSpacing: "0.05em", textTransform: "uppercase",
          marginBottom: "14px", textAlign: "center", lineHeight: 1.2,
        }}>
          RARE<br />PRINT
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", width: "100%" }}>
          {navItems.map((item) => {
            const Icon   = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                width: "56px", height: "50px", borderRadius: "10px",
                background: active ? "#2563eb" : "transparent",
                color: active ? "#ffffff" : "#93c5fd",
                textDecoration: "none", gap: "3px",
                transition: "background 0.15s, color 0.15s",
              }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; (e.currentTarget as HTMLElement).style.color = "#fff"; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#93c5fd"; } }}
              >
                <Icon size={17} />
                <span style={{ fontSize: "9px", fontWeight: 600, textAlign: "center", lineHeight: 1 }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginTop: "8px" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "50%",
            background: "#2563eb", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "white",
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: "8px", color: "#93c5fd", textAlign: "center", maxWidth: "64px", wordBreak: "break-word", lineHeight: 1.2 }}>
            {role.replace("_", " ")}
          </span>
          <button onClick={handleLogout} title="Sign out" style={{
            marginTop: "2px", background: "transparent", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
            color: "#64748b", padding: "5px", borderRadius: "8px",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
          >
            <LogOut size={15} />
            <span style={{ fontSize: "9px", fontWeight: 600 }}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
        {children}
      </main>
    </div>
  );
}

