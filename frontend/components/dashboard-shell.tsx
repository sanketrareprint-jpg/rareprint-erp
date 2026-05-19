"use client";

import { useEffect, useState } from "react";
import { NotificationBell } from "./NotificationBell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  Truck, DollarSign, LogOut, Printer, Layers, Database, BarChart2, BookOpen, Phone,
  Menu,
} from "lucide-react";

type Role = "ADMIN" | "AGENT" | "SALES_AGENT" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH";
interface NavItem { label: string; href: string; icon: React.ElementType; }
interface StoredUser { id: string; fullName: string; email: string; role: Role; }

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard",  href: "/dashboard",       icon: LayoutDashboard },
    { label: "Orders",     href: "/orders",           icon: ShoppingCart },
    { label: "Calls",      href: "/call-analysis",    icon: Phone },
    { label: "Accounts",   href: "/accounts",         icon: DollarSign },
    { label: "Production", href: "/production",       icon: Package },
    { label: "Dispatch",   href: "/dispatch",         icon: Truck },
        { label: "CRM",     href: "/crm",           icon: BarChart2 },
    { label: "Sticker",    href: "/sticker-sheet",    icon: Layers },
    { label: "Database",   href: "/admin/database",   icon: Database },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
    { label: "Manage Academy", href: "/admin/sales-learning", icon: BookOpen },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
  ],
  AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
  ],
  SALES_AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
  ],
  ACCOUNTS: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Accounts",  href: "/accounts",  icon: DollarSign },
  ],
  PRODUCTION: [
    { label: "Dashboard",  href: "/dashboard",     icon: LayoutDashboard },
    { label: "Production", href: "/production",     icon: Package },
    { label: "Sticker",    href: "/sticker-sheet",  icon: Layers },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="erp-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      <header className="erp-mobile-topbar">
        <button
          type="button"
          className="erp-mobile-icon-button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <Link href="/dashboard" className="erp-mobile-brand" aria-label="RarePrint dashboard">
          <span className="erp-mobile-logo"><Printer size={18} /></span>
          <span>
            <strong>RarePrint</strong>
            <small>{role.replace("_", " ")}</small>
          </span>
        </Link>
        <NotificationBell userRole={role} />
      </header>

      {/* ── Dark navy icon sidebar ── */}
      <aside className="erp-sidebar" style={{
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
              <Link key={item.href} href={item.href} className="erp-sidebar-link" style={{
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
          {/* Notification Bell */}
          <div className="erp-desktop-notifications">
            <NotificationBell userRole={role} />
          </div>

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
      <main className="erp-main" style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
        {children}
      </main>

      <nav className="erp-bottom-nav" aria-label="Primary navigation">
        {navItems.slice(0, 6).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`erp-bottom-nav-item${active ? " is-active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {mobileMenuOpen && (
        <div className="erp-mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <div className="erp-mobile-menu" onClick={(event) => event.stopPropagation()}>
            <div className="erp-mobile-menu-head">
              <div className="erp-mobile-brand">
                <span className="erp-mobile-logo"><Printer size={18} /></span>
                <span>
                  <strong>RarePrint ERP</strong>
                  <small>{name}</small>
                </span>
              </div>
              <button
                type="button"
                className="erp-mobile-icon-button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <div className="erp-mobile-menu-grid">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`erp-mobile-menu-item${active ? " is-active" : ""}`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <button onClick={handleLogout} className="erp-mobile-logout">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}








