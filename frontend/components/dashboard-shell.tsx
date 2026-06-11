"use client";

import { useEffect, useState } from "react";
import { NotificationBell } from "./NotificationBell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  Truck, DollarSign, LogOut, Printer, Layers, Database, BarChart2, BookOpen, Phone,
  Menu, CheckSquare, Archive, Megaphone, Grid, Palette, Users, Table2, Landmark, Settings, Bot,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";

type Role = "ADMIN" | "AGENT" | "SALES_AGENT" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH";
interface NavItem { label: string; href: string; icon: React.ElementType; }
interface StoredUser { id: string; fullName: string; email: string; role: Role; }

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard",  href: "/dashboard",       icon: LayoutDashboard },
    { label: "Orders",     href: "/orders",           icon: ShoppingCart },
    { label: "Calls",      href: "/call-analysis",    icon: Phone },
    { label: "Tasks",      href: "/tasks",            icon: CheckSquare },
    { label: "Storefront", href: "/storefront",       icon: Printer },
    { label: "Marketing",  href: "/marketing",        icon: Megaphone },
    { label: "Customers",  href: "/customer-directory", icon: Users },
    { label: "Accounts",   href: "/accounts",         icon: DollarSign },
    { label: "Production", href: "/production",       icon: Package },
    { label: "Design",     href: "/design-studio",    icon: Palette },
    { label: "Paper Stock", href: "/paper-inventory", icon: Archive },
    { label: "Dispatch",   href: "/dispatch",         icon: Truck },
    { label: "CRM",        href: "/crm",              icon: BarChart2 },
    { label: "Sticker",    href: "/sticker-sheet",    icon: Layers },
    { label: "Sheet Layout", href: "/sheet-layout",   icon: Grid },
    { label: "Database",   href: "/admin/database",   icon: Database },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
    { label: "Manage Academy", href: "/admin/sales-learning", icon: BookOpen },
    { label: "Rate Calc",  href: "/rate-calculator",  icon: Printer },
    { label: "Cost Table", href: "/cost-table",       icon: Table2 },
    { label: "Bank Stmt",  href: "/bank-statement",   icon: Landmark },
    { label: "Settings",   href: "/settings",         icon: Settings },
    { label: "Virtual CEO", href: "/virtual-ceo",     icon: Bot },
  ],
  AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "Customers", href: "/customer-directory", icon: Users },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
  ],
  SALES_AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "Customers", href: "/customer-directory", icon: Users },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Design", href: "/design-studio", icon: Palette },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
  ],
  ACCOUNTS: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Accounts",  href: "/accounts",  icon: DollarSign },
    { label: "Cost Table", href: "/cost-table", icon: Table2 },
    { label: "Bank Statement", href: "/bank-statement", icon: Landmark },
  ],
  PRODUCTION: [
    { label: "Dashboard",  href: "/dashboard",        icon: LayoutDashboard },
    { label: "Production", href: "/production",        icon: Package },
    { label: "Design",     href: "/design-studio",     icon: Palette },
    { label: "Paper Stock", href: "/paper-inventory",  icon: Archive },
    { label: "Tasks",      href: "/tasks",             icon: CheckSquare },
    { label: "Storefront", href: "/storefront",         icon: Printer },
    { label: "Sticker",    href: "/sticker-sheet",     icon: Layers },
    { label: "Sheet Layout", href: "/sheet-layout",   icon: Grid },
  ],
  DISPATCH: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
    { label: "Storefront", href: "/storefront", icon: Printer },
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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user] = useState<StoredUser | null>(() => getStoredUser());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  // Fetch coin wallet for this user
  useEffect(() => {
    if (!user) return;
    const isPrajakta = user.fullName.toUpperCase().includes("PRAJAKTA");
    if (!isPrajakta) return; // Only fetch for Prajakta for now
    fetch(`${API}/rewards/wallet`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.coins !== undefined) setCoins(data.coins); })
      .catch(() => {/* silent */});
  }, [user]);

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
        width: "116px", minWidth: "116px",
        background: "#1e3a5f",
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: "12px", paddingBottom: "12px",
        height: "100vh", position: "sticky", top: 0,
        overflowY: "auto", overflowX: "hidden",
      }}>
        {/* Logo + Brand */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          marginBottom: "12px", paddingLeft: "6px", paddingRight: "6px", width: "100%",
        }}>
          <div style={{
            width: "32px", height: "32px", background: "#2563eb", flexShrink: 0,
            borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Printer size={16} color="white" />
          </div>
          <span style={{
            fontSize: "11px", fontWeight: 700, color: "#93c5fd",
            letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.1,
          }}>
            Rare<br />Print
          </span>
        </div>

        {/* Nav — 2-column grid */}
        <nav style={{
          flex: 1, display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "3px",
          width: "100%", padding: "0 4px",
          alignContent: "start",
        }}>
          {navItems.map((item) => {
            const Icon   = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className="erp-sidebar-link" style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "46px", borderRadius: "8px",
                background: active ? "#2563eb" : "transparent",
                color: active ? "#ffffff" : "#93c5fd",
                textDecoration: "none", gap: "3px",
                transition: "background 0.15s, color 0.15s",
              }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; (e.currentTarget as HTMLElement).style.color = "#fff"; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#93c5fd"; } }}
              >
                <Icon size={20} strokeWidth={2.2} />
                <span style={{ fontSize: "8px", fontWeight: 600, textAlign: "center", lineHeight: 1.1, maxWidth: "48px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginTop: "8px", width: "100%", paddingLeft: "6px", paddingRight: "6px" }}>
          {/* Coin wallet badge — shown for Prajakta */}
          {coins !== null && (
            <div title={`${coins} reward coins`} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              background: "#92400e", borderRadius: "8px",
              padding: "4px 6px", marginBottom: "2px",
              cursor: "default",
            }}>
              <span style={{ fontSize: "14px", lineHeight: 1 }}>🪙</span>
              <span style={{ fontSize: "9px", fontWeight: 700, color: "#fde68a", lineHeight: 1.2 }}>
                {coins}
              </span>
            </div>
          )}
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
            <LogOut size={18} strokeWidth={2.2} />
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
                {coins !== null && (
                  <span title={`${coins} reward coins`} style={{
                    marginLeft: "auto", background: "#92400e", borderRadius: "8px",
                    padding: "3px 8px", fontSize: "12px", fontWeight: 700, color: "#fde68a",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    🪙 {coins}
                  </span>
                )}
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





