"use client";

import { useEffect, useState } from "react";
import { NotificationBell } from "./NotificationBell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  Truck, DollarSign, LogOut, Printer, Layers, Database, BarChart2, BookOpen, Phone,
  Menu, CheckSquare, Archive, Megaphone, Grid, Palette, Users, Table2, Landmark, Settings, Bot, FileSpreadsheet,
  Lock, AlertTriangle, Activity, Shield, Wallet, PackageCheck, Briefcase, CalendarClock, Gift, MessageSquareWarning,
  ChevronLeft, ChevronRight, PhoneCall, Gauge, Receipt,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";
import { useActivityTracker } from "@/lib/useActivityTracker";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

type Role = "ADMIN" | "AGENT" | "SALES_AGENT" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH" | "DESIGNER";
interface NavItem { label: string; href: string; icon: React.ElementType; }
interface StoredUser { id: string; fullName?: string; email: string; role: Role; }
type ErpConfig = {
  modules: Array<{ key: string; href: string; enabled: boolean; fixed?: boolean }>;
  roleAccess: Record<string, string[]>;
};

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard",  href: "/dashboard",       icon: LayoutDashboard },
    { label: "Orders",     href: "/orders",           icon: ShoppingCart },
    { label: "Accounts",   href: "/accounts",         icon: DollarSign },
    { label: "Billing",    href: "/billing",          icon: Receipt },
    { label: "Production", href: "/production",       icon: Package },
    { label: "Dispatch",   href: "/dispatch",         icon: Truck },
    { label: "Tasks",      href: "/tasks",            icon: CheckSquare },
    { label: "Paper Stock", href: "/paper-inventory", icon: Archive },
    { label: "Sticker",    href: "/sticker-sheet",    icon: Layers },
    { label: "Sheet Layout", href: "/sheet-layout",   icon: Grid },
    { label: "Machine Readings", href: "/machine-readings", icon: Gauge },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Cost Table", href: "/cost-table",       icon: Table2 },
    { label: "Database",   href: "/admin/database",   icon: Database },
    { label: "CEO Report", href: "/virtual-ceo",      icon: Bot },
    { label: "Calls",      href: "/call-analysis",    icon: Phone },
    { label: "Storefront", href: "/storefront",       icon: Printer },
    { label: "Customers",  href: "/customer-directory", icon: Users },
    { label: "COD Remittance", href: "/remittance-import", icon: PackageCheck },
    { label: "Bank Statement", href: "/bank-statement", icon: Landmark },
    { label: "Marketing",  href: "/marketing",        icon: Megaphone },
    { label: "Design",     href: "/design-studio",    icon: Palette },
    { label: "Reports",    href: "/reports",          icon: FileSpreadsheet },
    { label: "CRM",        href: "/crm",              icon: BarChart2 },
    { label: "Call Compliance", href: "/call-compliance", icon: PhoneCall },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
    { label: "Manage Academy", href: "/admin/sales-learning", icon: BookOpen },
    { label: "Loyalty",    href: "/loyalty",          icon: Gift },
    { label: "Complaints", href: "/complaints",       icon: MessageSquareWarning },
    { label: "Settings",   href: "/settings",         icon: Settings },
    { label: "Activity",   href: "/admin/activity",   icon: Activity },
    { label: "Biz Rules",  href: "/business-rules",   icon: Shield },
    { label: "HR",         href: "/hr",               icon: Briefcase },
    { label: "Attendance", href: "/attendance",       icon: CalendarClock },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Customers", href: "/customer-directory", icon: Users },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  SALES_AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Customers", href: "/customer-directory", icon: Users },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "Design", href: "/design-studio", icon: Palette },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
    { label: "Loyalty",    href: "/loyalty",          icon: Gift },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  ACCOUNTS: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Accounts",  href: "/accounts",  icon: DollarSign },
    { label: "Billing",   href: "/billing",   icon: Receipt },
    { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
    { label: "Cost Table", href: "/cost-table", icon: Table2 },
    { label: "Machine Readings", href: "/machine-readings", icon: Gauge },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "COD Remittance", href: "/remittance-import", icon: PackageCheck },
    { label: "Bank Statement", href: "/bank-statement", icon: Landmark },
    { label: "Reports", href: "/reports", icon: FileSpreadsheet },
    { label: "Loyalty", href: "/loyalty", icon: Gift },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "HR",         href: "/hr",               icon: Briefcase },
    { label: "Attendance", href: "/attendance",       icon: CalendarClock },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  PRODUCTION: [
    { label: "Dashboard",  href: "/dashboard",        icon: LayoutDashboard },
    { label: "Production", href: "/production",        icon: Package },
    { label: "Tasks",      href: "/tasks",             icon: CheckSquare },
    { label: "Paper Stock", href: "/paper-inventory",  icon: Archive },
    { label: "Sticker",    href: "/sticker-sheet",     icon: Layers },
    { label: "Sheet Layout", href: "/sheet-layout",   icon: Grid },
    { label: "Storefront", href: "/storefront",         icon: Printer },
    { label: "Design",     href: "/design-studio",     icon: Palette },
    { label: "Complaints", href: "/complaints",         icon: MessageSquareWarning },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  DISPATCH: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Dispatch",  href: "/dispatch",  icon: Truck },
    { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  DESIGNER: [
    { label: "Sheet Layout", href: "/sheet-layout", icon: Grid },
    { label: "Sticker",    href: "/sticker-sheet",  icon: Layers },
    { label: "Production", href: "/production",     icon: Package },
  ],
};

// Routes a DESIGNER account is allowed to open directly (by URL or nav).
// Anything else redirects back to Sheet Layout — nav-hiding alone doesn't
// stop direct navigation, so this is enforced here for this restricted role.
const DESIGNER_ALLOWED_PATHS = ["/sheet-layout", "/sticker-sheet", "/production"];

function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("rareprint_user");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredUser>;
      if (parsed.email && parsed.role) return parsed as StoredUser;
    }
    const token = localStorage.getItem("rareprint_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { id: payload.sub, email: payload.email, role: payload.role, fullName: payload.fullName ?? payload.email };
  } catch { return null; }
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MODULE_KEY_BY_HREF: Record<string, string> = {
  "/dashboard": "dashboard",
  "/orders": "orders",
  "/accounts": "accounts",
  "/production": "production",
  "/dispatch": "dispatch",
  "/reports": "reports",
  "/crm": "crm",
  "/tasks": "tasks",
  "/storefront": "storefront",
  "/marketing": "marketing",
  "/customer-directory": "customers",
  "/design-studio": "design",
  "/paper-inventory": "paper-stock",
  "/sticker-sheet": "sticker",
  "/sheet-layout": "sheet-layout",
  "/admin/database": "database",
  "/sales-learning": "sales-learning",
  "/admin/sales-learning": "manage-academy",
  "/rate-calculator": "rate-calculator",
  "/cost-table": "cost-table",
  "/bank-statement": "bank-statement",
  "/remittance-import": "remittance-import",
  "/loyalty": "loyalty",
  "/settings": "settings",
  "/virtual-ceo": "virtual-ceo",
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user] = useState<StoredUser | null>(() => getStoredUser());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("rareprint_sidebar_collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("rareprint_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  useActivityTracker(); // Track active time when cursor is moving

  // Reflect "running inside the native Android app" as a class on <html>,
  // so globals.css can scope compact-UI rules to the app only, never the
  // website (including the website viewed on a phone).
  const isNativeApp = useIsNativeApp();
  useEffect(() => {
    document.documentElement.classList.toggle("is-native-app", isNativeApp);
  }, [isNativeApp]);
  const [coins, setCoins] = useState<number | null>(null);
  const [erpConfig, setErpConfig] = useState<ErpConfig | null>(null);
  const [vceoLocked, setVceoLocked] = useState(false);
  const [vceoReviewRequired, setVceoReviewRequired] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  // DESIGNER is a single-purpose role — block direct navigation to any
  // page outside its allowed set, since hiding the nav link alone doesn't
  // stop someone from typing the URL.
  useEffect(() => {
    if (user?.role === "DESIGNER" && !DESIGNER_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      router.replace("/sheet-layout");
    }
  }, [router, user, pathname]);

  // Check Virtual CEO review / lock status for required reviewers
  useEffect(() => {
    if (!user) return;
    fetch(`${API}/virtual-ceo/review-status`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((data: { status?: string } | null) => {
        if (!data) return;
        if (data.status === "LOCKED") setVceoLocked(true);
        if (data.status === "REVIEW_REQUIRED" || data.status === "REVIEW_PENDING") setVceoReviewRequired(true);
      })
      .catch(() => {/* silent */});
  }, [user]);

  // Fetch coin wallet for this user
  useEffect(() => {
    if (!user) return;
    fetch(`${API}/rewards/wallet`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.coins !== undefined) setCoins(data.coins); })
      .catch(() => {/* silent */});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/erp-config`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data?.modules) && data?.roleAccess && typeof data.roleAccess === "object") setErpConfig(data);
      })
      .catch(() => {/* keep built-in nav if config cannot load */});
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem("rareprint_user");
    localStorage.removeItem("rareprint_token");
    router.replace("/login");
  };

  const role     = user?.role ?? "SALES_AGENT";
  const baseNavItems = NAV_BY_ROLE[role] ?? NAV_BY_ROLE["SALES_AGENT"];
  const navItems = erpConfig
    ? baseNavItems.filter((item) => {
        const key = MODULE_KEY_BY_HREF[item.href];
        if (!key) return true;
        const module = Array.isArray(erpConfig.modules) ? erpConfig.modules.find((m) => m.key === key) : null;
        const roleKeys = Array.isArray(erpConfig.roleAccess?.[role]) ? erpConfig.roleAccess[role] : [];
        return Boolean(module?.enabled || module?.fixed) && roleKeys.includes(key);
      })
    : baseNavItems;
  const name     = user?.fullName ?? "…";

  return (
    <div className="erp-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* ── Virtual CEO: Account Locked overlay ── */}
      {vceoLocked && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.92)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "40px 48px",
            maxWidth: 480, width: "90%", textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Lock size={32} color="#ef4444" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>Account Temporarily Locked</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
              Your daily CEO review was not completed within the required 2-hour window.
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>What to do?</div>
              <div style={{ fontSize: 12, color: "#991b1b" }}>
                Contact <strong>Sanket (Admin)</strong> to unlock your account from <strong>Virtual CEO → CEO Settings</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Virtual CEO: Review Required banner ── */}
      {vceoReviewRequired && !vceoLocked && pathname !== "/virtual-ceo" && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
          background: "#dc2626", color: "#fff",
          padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={16} />
            ⚠️ Daily CEO review required — please complete it now to avoid account lock
          </div>
          <a href="/virtual-ceo" style={{ background: "#fff", color: "#dc2626", padding: "6px 16px", borderRadius: 8, fontWeight: 800, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>
            Go to Virtual CEO →
          </a>
        </div>
      )}

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
          <span className="erp-mobile-logo"><img src="/rareprint-icon.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
          <span>
            <strong>RarePrint</strong>
            <small>{role.replace("_", " ")}</small>
          </span>
        </Link>
        <NotificationBell userRole={role} />
      </header>

      {/* ── White list-style sidebar ── */}
      <aside className="erp-sidebar" style={{
        width: collapsed ? "60px" : "148px", minWidth: collapsed ? "60px" : "148px", flexShrink: 0,
        background: "#ffffff",
        borderRight: "1px solid #eef1f5",
        display: "flex", flexDirection: "column",
        paddingTop: "18px", paddingBottom: "12px",
        height: "100vh", position: "sticky", top: 0,
        overflowY: "auto", overflowX: "hidden",
        transition: "width 0.15s ease, min-width 0.15s ease",
      }}>
        {/* Collapse/expand toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            position: "absolute", top: "18px", right: "-11px", zIndex: 5,
            width: "22px", height: "22px", borderRadius: "50%",
            background: "#ffffff", border: "1px solid #e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#64748b", boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#0f172a"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* Logo + Brand — stacked vertically */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
          marginBottom: "16px", paddingLeft: "8px", paddingRight: "8px", width: "100%",
        }}>
          <img src="/rareprint-icon.png" alt="RarePrint" style={{ width: "30px", height: "30px", objectFit: "contain", flexShrink: 0 }} />
          {!collapsed && (
            <span style={{
              fontSize: "15px", fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap",
              fontFamily: "'Arial Black', Arial, Helvetica, sans-serif",
              color: "#ee1c25", letterSpacing: "0.2px",
              textShadow: "0 1px 0 rgba(0,0,0,0.12)",
            }}>
              RarePrint
            </span>
          )}
        </div>

        {/* Bonus points / reward coins — right below the logo */}
        {coins !== null && (
          <Link href="/loyalty" title={`${coins} reward coins — go to Bonus Points`} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
            margin: collapsed ? "0 auto 14px" : "0 8px 14px",
            padding: collapsed ? "4px 0" : "4px 8px",
            borderRadius: "8px",
            background: "#fef3c7",
            color: "#92400e",
            fontSize: "12px", fontWeight: 700,
            textDecoration: "none",
            width: collapsed ? "30px" : "calc(100% - 16px)",
          }}>
            🪙 {!collapsed && <span>{coins} pts</span>}
          </Link>
        )}

        {/* Nav — single column list */}
        <nav style={{
          flex: 1, display: "flex", flexDirection: "column",
          gap: "2px",
          width: "100%", padding: collapsed ? "0 6px" : "0 6px",
        }}>
          {navItems.map((item) => {
            const Icon   = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className="erp-sidebar-link" title={collapsed ? item.label : undefined} style={{
                display: "flex", flexDirection: "row",
                alignItems: "center", gap: collapsed ? 0 : "10px",
                justifyContent: collapsed ? "center" : "flex-start",
                minHeight: "40px", borderRadius: "8px",
                padding: collapsed ? "8px 0" : "6px 8px",
                background: "transparent",
                color: active ? "#0f172a" : "#64748b",
                textDecoration: "none",
                fontSize: "12px", fontWeight: active ? 600 : 500, lineHeight: "1.2",
                transition: "color 0.15s, background 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; if (!active) (e.currentTarget as HTMLElement).style.color = "#0f172a"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; if (!active) (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
              >
                <Icon size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                {!collapsed && (
                  <span style={{ overflowWrap: "normal", wordBreak: "normal", whiteSpace: "normal" }}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
          {/* Notification Bell */}
          <div className="erp-desktop-notifications" style={{ padding: "8px 8px 0", display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
            <NotificationBell userRole={role} />
          </div>

        {/* User + logout */}
        <div style={{
          display: "flex", alignItems: "center", gap: collapsed ? 0 : "8px",
          justifyContent: collapsed ? "center" : "flex-start",
          flexWrap: "wrap",
          marginTop: "12px", paddingTop: "12px", width: "100%",
          paddingLeft: "8px", paddingRight: "8px",
          borderTop: "1px solid #eef1f5",
        }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "50%",
            background: "#ee1c25", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "white",
            flexShrink: 0,
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </div>
                <div style={{ fontSize: "10.5px", color: "#94a3b8" }}>
                  {role.replace("_", " ")}
                </div>
                {coins !== null && (
                  <div title={`${coins} reward coins`} style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    marginTop: "2px", fontSize: "11px", fontWeight: 700, color: "#b45309",
                  }}>
                    🪙 {coins}
                  </div>
                )}
              </div>
              <button onClick={handleLogout} title="Sign out" style={{
                background: "transparent", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#94a3b8", padding: "6px", borderRadius: "8px", flexShrink: 0,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
              >
                <LogOut size={16} strokeWidth={2} />
              </button>
            </>
          )}
          {collapsed && (
            <button onClick={handleLogout} title="Sign out" style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#94a3b8", padding: "4px", borderRadius: "8px", flexShrink: 0,
              width: "100%", marginTop: "4px",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
            >
              <LogOut size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="erp-main" style={{ flex: 1, minWidth: 0, overflow: "auto", background: "#f8fafc" }}>
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
                <span className="erp-mobile-logo"><img src="/rareprint-icon.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
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
