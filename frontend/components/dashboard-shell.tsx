"use client";

import { useEffect, useState } from "react";
import { NotificationBell } from "./NotificationBell";
import { ServerErrorIndicator } from "./ServerErrorIndicator";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  Truck, DollarSign, LogOut, Printer, Layers, Database, BarChart2, BookOpen, Phone,
  Menu, CheckSquare, Archive, Megaphone, Grid, Palette, Users, Table2, Landmark, Settings, Bot, FileSpreadsheet,
  Lock, AlertTriangle, Activity, Shield, Wallet, PackageCheck, Briefcase, CalendarClock, Gift, MessageSquareWarning, PackagePlus,
  ChevronLeft, ChevronRight, PhoneCall, Gauge, Receipt, Award, PartyPopper, FileText, Calculator, ThumbsUp, TicketPercent, TrendingUp,
  PhoneOutgoing, ShoppingBag, ChevronDown, Folder,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";
import { DEFAULT_NAV_GROUPS, groupNavItems, type NavEntry, type NavGroupConfig } from "@/lib/navGroups";
import { useStoredValue } from "@/lib/useStoredValue";
import { useActivityTracker } from "@/lib/useActivityTracker";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { DialerDeskPopup } from "@/components/DialerDeskPopup";

type Role = "ADMIN" | "AGENT" | "SALES_AGENT" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH" | "DESIGNER";
interface NavItem { label: string; href: string; icon: React.ElementType; }
type NavGroupEntry = Extract<NavEntry<NavItem>, { kind: "group" }>;
interface StoredUser { id: string; fullName?: string; email: string; role: Role; }
type ErpConfig = {
  modules: Array<{ key: string; href: string; enabled: boolean; fixed?: boolean }>;
  roleAccess: Record<string, string[]>;
};

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard",  href: "/dashboard",       icon: LayoutDashboard },
    { label: "Orders",     href: "/orders",           icon: ShoppingCart },
    { label: "Shopify",    href: "/shopify",          icon: ShoppingBag },
    { label: "Parcel Booking", href: "/parcel-booking", icon: PackagePlus },
    { label: "Accounts",   href: "/accounts",         icon: DollarSign },
    { label: "Billing",    href: "/billing",          icon: Receipt },
    { label: "Production", href: "/production",       icon: Package },
    { label: "Dispatch",   href: "/dispatch",         icon: Truck },
    { label: "Tasks",      href: "/tasks",            icon: CheckSquare },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
    { label: "Paper Stock", href: "/paper-inventory", icon: Archive },
    { label: "Sticker",    href: "/sticker-sheet",    icon: Layers },
    { label: "Sheet Layout", href: "/sheet-layout",   icon: Grid },
    { label: "Certificates", href: "/certificate-generator", icon: Award },
    { label: "Events",      href: "/events",                 icon: PartyPopper },
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
    { label: "Web Analytics", href: "/web-analytics", icon: TrendingUp },
    { label: "Design",     href: "/design-studio",    icon: Palette },
    { label: "Reports",    href: "/reports",          icon: FileSpreadsheet },
    { label: "CRM",        href: "/crm",              icon: BarChart2 },
    { label: "Dialer",     href: "/dialer",           icon: PhoneOutgoing },
    { label: "Call Compliance", href: "/call-compliance", icon: PhoneCall },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
    { label: "Manage Academy", href: "/admin/sales-learning", icon: BookOpen },
    { label: "Loyalty",    href: "/loyalty",          icon: Gift },
    { label: "Complaints", href: "/complaints",       icon: MessageSquareWarning },
    { label: "Feedback",   href: "/feedback",         icon: ThumbsUp },
    { label: "Policies",   href: "/policies",         icon: FileText },
    { label: "Offers",     href: "/offers",           icon: TicketPercent },
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
    { label: "Parcel Booking", href: "/parcel-booking", icon: PackagePlus },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Customers", href: "/customer-directory", icon: Users },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Policies", href: "/policies", icon: FileText },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  SALES_AGENT: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Shopify",   href: "/shopify",   icon: ShoppingBag },
    { label: "Parcel Booking", href: "/parcel-booking", icon: PackagePlus },
    // Billing page shows sellers only its Estimates tab.
    { label: "Billing", href: "/billing", icon: Receipt },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
    { label: "Rate Calculator", href: "/rate-calculator", icon: Printer },
    { label: "Calls", href: "/call-analysis", icon: Phone },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Customers", href: "/customer-directory", icon: Users },
    { label: "Marketing", href: "/marketing", icon: Megaphone },
    { label: "Design", href: "/design-studio", icon: Palette },
    { label: "CRM", href: "/crm", icon: BarChart2 },
    { label: "Dialer", href: "/dialer", icon: PhoneOutgoing },
    { label: "Sales Academy", href: "/sales-learning", icon: BookOpen },
    { label: "Loyalty",    href: "/loyalty",          icon: Gift },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Feedback",   href: "/feedback",         icon: ThumbsUp },
    { label: "Policies", href: "/policies", icon: FileText },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  ACCOUNTS: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Orders",    href: "/orders",    icon: ShoppingCart },
    { label: "Shopify",   href: "/shopify",   icon: ShoppingBag },
    { label: "Accounts",  href: "/accounts",  icon: DollarSign },
    { label: "Billing",   href: "/billing",   icon: Receipt },
    { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
    { label: "Cost Table", href: "/cost-table", icon: Table2 },
    { label: "Machine Readings", href: "/machine-readings", icon: Gauge },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "COD Remittance", href: "/remittance-import", icon: PackageCheck },
    { label: "Bank Statement", href: "/bank-statement", icon: Landmark },
    { label: "Reports", href: "/reports", icon: FileSpreadsheet },
    { label: "Loyalty", href: "/loyalty", icon: Gift },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Policies", href: "/policies", icon: FileText },
    { label: "HR",         href: "/hr",               icon: Briefcase },
    { label: "Attendance", href: "/attendance",       icon: CalendarClock },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  PRODUCTION: [
    { label: "Dashboard",  href: "/dashboard",        icon: LayoutDashboard },
    { label: "Production", href: "/production",        icon: Package },
    { label: "Tasks",      href: "/tasks",             icon: CheckSquare },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
    { label: "Paper Stock", href: "/paper-inventory",  icon: Archive },
    { label: "Sticker",    href: "/sticker-sheet",     icon: Layers },
    { label: "Sheet Layout", href: "/sheet-layout",   icon: Grid },
    { label: "Storefront", href: "/storefront",         icon: Printer },
    { label: "Design",     href: "/design-studio",     icon: Palette },
    { label: "Complaints", href: "/complaints",         icon: MessageSquareWarning },
    { label: "Policies", href: "/policies", icon: FileText },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  DISPATCH: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Dispatch",  href: "/dispatch",  icon: Truck },
    { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
    { label: "Storefront", href: "/storefront", icon: Printer },
    { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
    { label: "Policies", href: "/policies", icon: FileText },
    { label: "Salary & Commission", href: "/salary-commission", icon: Wallet },
  ],
  DESIGNER: [
    { label: "Sheet Layout", href: "/sheet-layout", icon: Grid },
    { label: "Sticker",    href: "/sticker-sheet",  icon: Layers },
    { label: "Production", href: "/production",     icon: Package },
    { label: "Courier Calculator", href: "/courier-calculator", icon: Calculator },
  ],
};

// Every sidebar link across all roles, once each — the Settings > Sidebar
// Categories editor lists these.
export const ALL_NAV_LINKS: { label: string; href: string }[] = Array.from(
  new Map(Object.values(NAV_BY_ROLE).flat().map((item) => [item.href, { label: item.label, href: item.href }])).values(),
);

// Icons for the built-in categories; categories an admin adds get a folder.
const NAV_GROUP_ICONS: Record<string, React.ElementType> = {
  sales: Users, care: ThumbsUp, fulfilment: Truck, production: Package,
  finance: DollarSign, marketing: Megaphone, hr: Briefcase, admin: Settings,
};

function parseOpenGroups(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

// Window event Settings fires after saving categories, so the open
// sidebar updates without a reload.
export const NAV_GROUPS_UPDATED_EVENT = "rareprint:nav-groups-updated";

// Routes a DESIGNER account is allowed to open directly (by URL or nav).
// Anything else redirects back to Sheet Layout — nav-hiding alone doesn't
// stop direct navigation, so this is enforced here for this restricted role.
const DESIGNER_ALLOWED_PATHS = ["/sheet-layout", "/sticker-sheet", "/production", "/courier-calculator"];

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
  "/dialer": "dialer",
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
  // Start as null on both server and client's first (hydration) render, then
  // load from localStorage in an effect after mount. Reading localStorage
  // directly in the useState initializer (the old code) made the client's
  // very first render already show the real user while the server-rendered
  // HTML always shows null — a guaranteed hydration mismatch on every
  // authenticated page load. See CLAUDE.md history / team-history.md for
  // the incident this was fixed under (2026-09-19).
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Read via useStoredValue so the first render matches the server HTML —
  // reading localStorage in a useState initializer caused hydration error #418.
  const [collapsedValue, setCollapsedValue] = useStoredValue("rareprint_sidebar_collapsed", "0");
  const collapsed = collapsedValue === "1";
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
  // Shopify inbox: hidden until the backend says the integration is enabled
  // (SHOPIFY_WEBHOOK_SECRET set); badge = new orders + untouched abandoned carts.
  const [shopifyCounts, setShopifyCounts] = useState<{ enabled: boolean; waiting: number } | null>(null);
  const [webAnalyticsAllowed, setWebAnalyticsAllowed] = useState(false);
  // Sidebar categories: which ones are expanded is remembered per browser;
  // in the collapsed (icons-only) sidebar a category opens as a pop-out.
  const [navGroups, setNavGroups] = useState<NavGroupConfig[]>(DEFAULT_NAV_GROUPS);
  const [openGroupsValue, setOpenGroupsValue] = useStoredValue("rareprint_sidebar_open_groups", "[]");
  const [flyout, setFlyout] = useState<{ id: string; top: number; left: number } | null>(null);

  // Loads the stored user post-mount (client-only, see the state comment
  // above) and redirects if there isn't one — combined into one effect so
  // the redirect always sees the freshly-loaded value instead of racing a
  // separate effect against a still-null `user` on the first render.
  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    if (!stored) router.replace("/login");
  }, [router]);

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
    if (!user || !["ADMIN", "ACCOUNTS", "SALES_AGENT"].includes(user.role)) return;
    const load = () => fetch(`${API}/shopify/inbox/counts`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((data: { enabled?: boolean; newOrders?: number; waitingCarts?: number } | null) => {
        if (data) setShopifyCounts({ enabled: !!data.enabled, waiting: (data.newOrders ?? 0) + (data.waitingCarts ?? 0) });
      })
      .catch(() => {/* silent */});
    void load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, [user, pathname]);

  // Web Analytics is owner-only (OWNER_EMAIL). The backend enforces it; this
  // only hides the menu item from everyone else.
  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    fetch(`${API}/web-analytics/access`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((data: { allowed?: boolean } | null) => setWebAnalyticsAllowed(data?.allowed === true))
      .catch(() => {/* silent */});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/erp-config/nav-groups`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((data: { groups?: NavGroupConfig[] | null } | null) => {
        if (Array.isArray(data?.groups)) setNavGroups(data.groups);
      })
      .catch(() => {/* keep default categories */});
  }, [user]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const groups = (event as CustomEvent<NavGroupConfig[] | null>).detail;
      setNavGroups(Array.isArray(groups) ? groups : DEFAULT_NAV_GROUPS);
    };
    window.addEventListener(NAV_GROUPS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(NAV_GROUPS_UPDATED_EVENT, onUpdated);
  }, []);


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
  const navItems = (erpConfig
    ? baseNavItems.filter((item) => {
        const key = MODULE_KEY_BY_HREF[item.href];
        if (!key) return true;
        const module = Array.isArray(erpConfig.modules) ? erpConfig.modules.find((m) => m.key === key) : null;
        const roleKeys = Array.isArray(erpConfig.roleAccess?.[role]) ? erpConfig.roleAccess[role] : [];
        return Boolean(module?.enabled || module?.fixed) && roleKeys.includes(key);
      })
    : baseNavItems
  ).filter((item) => item.href !== "/shopify" || shopifyCounts?.enabled === true)
    .filter((item) => item.href !== "/web-analytics" || webAnalyticsAllowed);
  const name     = user?.fullName ?? "…";

  const isActiveHref = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const navEntries = groupNavItems(navItems, navGroups);
  const groupEntries = navEntries.filter((e): e is NavGroupEntry => e.kind === "group");
  const activeGroupId = groupEntries.find((e) => e.items.some((i) => isActiveHref(i.href)))?.group.id;
  const shopifyWaiting = (shopifyCounts?.waiting ?? 0) > 0;
  const openGroups = parseOpenGroups(openGroupsValue);

  // The category holding the current page is shown open even if the user
  // closed it earlier; clicking it closes it until the active category
  // changes. Updated during render (React's "adjust state when a value
  // changes" pattern) rather than in an effect.
  const [autoOpenId, setAutoOpenId] = useState<string | undefined>(activeGroupId);
  const [prevActiveGroupId, setPrevActiveGroupId] = useState(activeGroupId);
  if (prevActiveGroupId !== activeGroupId) {
    setPrevActiveGroupId(activeGroupId);
    setAutoOpenId(activeGroupId);
  }
  const isGroupOpen = (id: string) => openGroups.includes(id) || autoOpenId === id;

  // Close the collapsed-sidebar pop-out on navigation or expand/collapse.
  const flyoutKey = `${pathname}|${collapsed}`;
  const [prevFlyoutKey, setPrevFlyoutKey] = useState(flyoutKey);
  if (prevFlyoutKey !== flyoutKey) {
    setPrevFlyoutKey(flyoutKey);
    setFlyout(null);
  }

  useEffect(() => {
    if (!flyout) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFlyout(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flyout]);

  const toggleGroup = (id: string) => {
    if (isGroupOpen(id)) {
      if (autoOpenId === id) setAutoOpenId(undefined);
      setOpenGroupsValue(JSON.stringify(openGroups.filter((g) => g !== id)));
    } else {
      setOpenGroupsValue(JSON.stringify([...openGroups, id]));
    }
  };

  const renderSidebarLink = (item: NavItem, nested: boolean) => {
    const Icon   = item.icon;
    const active = isActiveHref(item.href);
    return (
      <Link key={item.href} href={item.href} className="erp-sidebar-link" title={collapsed ? item.label : undefined} style={{
        display: "flex", flexDirection: "row",
        alignItems: "center", gap: collapsed ? 0 : "10px",
        justifyContent: collapsed ? "center" : "flex-start",
        minHeight: nested ? "36px" : "40px", borderRadius: "8px",
        padding: collapsed ? "8px 0" : nested ? "5px 8px 5px 14px" : "6px 8px",
        background: "transparent",
        color: active ? "#0f172a" : "#64748b",
        textDecoration: "none",
        fontSize: "12px", fontWeight: active ? 600 : 500, lineHeight: "1.2",
        transition: "color 0.15s, background 0.15s",
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; if (!active) (e.currentTarget as HTMLElement).style.color = "#0f172a"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; if (!active) (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
      >
        <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
          <Icon size={nested ? 16 : 18} strokeWidth={1.75} />
          {item.href === "/shopify" && collapsed && shopifyWaiting && (
            <span style={{ position: "absolute", top: "-4px", right: "-6px", minWidth: "8px", height: "8px", borderRadius: "999px", background: "#ee1c25" }} />
          )}
        </span>
        {!collapsed && (
          <span style={{ overflowWrap: "normal", wordBreak: "normal", whiteSpace: "normal" }}>
            {item.label}
          </span>
        )}
        {!collapsed && item.href === "/shopify" && shopifyWaiting && (
          <span style={{
            marginLeft: "auto", minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "999px",
            background: "#ee1c25", color: "#fff", fontSize: "10.5px", fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            {shopifyCounts!.waiting > 99 ? "99+" : shopifyCounts!.waiting}
          </span>
        )}
      </Link>
    );
  };

  const renderSidebarGroup = (group: NavGroupConfig, items: NavItem[]) => {
    const GroupIcon = NAV_GROUP_ICONS[group.id] ?? Folder;
    const open = isGroupOpen(group.id);
    const containsActive = items.some((i) => isActiveHref(i.href));
    const showDot = shopifyWaiting && items.some((i) => i.href === "/shopify") && (collapsed || !open);
    return (
      <div key={group.id}>
        <button
          type="button"
          className="erp-sidebar-link"
          title={collapsed ? group.label : undefined}
          aria-expanded={collapsed ? flyout?.id === group.id : open}
          onClick={(e) => {
            if (!collapsed) { toggleGroup(group.id); return; }
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setFlyout((f) => (f?.id === group.id ? null : { id: group.id, top: rect.top, left: rect.right + 6 }));
          }}
          style={{
            display: "flex", flexDirection: "row", alignItems: "center", width: "100%",
            gap: collapsed ? 0 : "10px", justifyContent: collapsed ? "center" : "flex-start",
            minHeight: "40px", borderRadius: "8px", padding: collapsed ? "8px 0" : "6px 8px",
            background: collapsed && containsActive ? "#f1f5f9" : "transparent", border: "none", cursor: "pointer",
            color: containsActive ? "#0f172a" : "#64748b",
            fontSize: "12px", fontWeight: 600, lineHeight: "1.2", textAlign: "left",
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            <GroupIcon size={18} strokeWidth={1.75} />
            {showDot && (
              <span style={{ position: "absolute", top: "-4px", right: "-6px", minWidth: "8px", height: "8px", borderRadius: "999px", background: "#ee1c25" }} />
            )}
          </span>
          {!collapsed && <span style={{ flex: 1 }}>{group.label}</span>}
          {!collapsed && <ChevronDown size={14} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />}
        </button>
        {!collapsed && open && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "4px" }}>
            {items.map((item) => renderSidebarLink(item, true))}
          </div>
        )}
      </div>
    );
  };

  const flyoutEntry = flyout ? groupEntries.find((e) => e.group.id === flyout.id) : undefined;

  return (
    <div className="erp-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <ServerErrorIndicator />

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
          onClick={() => setCollapsedValue(collapsed ? "0" : "1")}
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
          {navEntries.map((entry) =>
            entry.kind === "link" ? renderSidebarLink(entry.item, false) : renderSidebarGroup(entry.group, entry.items),
          )}
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

      {/* Collapsed sidebar: a category's links open as a pop-out beside it. */}
      {flyout && flyoutEntry && (
        <div onClick={() => setFlyout(null)} style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <div
            role="menu"
            aria-label={flyoutEntry.group.label}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", top: Math.max(8, Math.min(flyout.top, window.innerHeight - 48 - flyoutEntry.items.length * 38)), left: flyout.left,
              minWidth: "180px", padding: "6px", borderRadius: "10px",
              background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
              display: "flex", flexDirection: "column", gap: "2px",
            }}
          >
            <p style={{ margin: 0, padding: "4px 8px 6px", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {flyoutEntry.group.label}
            </p>
            {flyoutEntry.items.map((item) => {
              const Icon = item.icon;
              const active = isActiveHref(item.href);
              return (
                <Link key={item.href} href={item.href} role="menuitem" onClick={() => setFlyout(null)} style={{
                  display: "flex", alignItems: "center", gap: "10px", minHeight: "36px", padding: "6px 8px", borderRadius: "8px",
                  color: active ? "#0f172a" : "#475569", background: active ? "#f1f5f9" : "transparent",
                  fontSize: "12.5px", fontWeight: active ? 600 : 500, textDecoration: "none",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? "#f1f5f9" : "transparent"; }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  <span>{item.label}</span>
                  {item.href === "/shopify" && shopifyWaiting && (
                    <span style={{ marginLeft: "auto", minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "999px", background: "#ee1c25", color: "#fff", fontSize: "10.5px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {shopifyCounts!.waiting > 99 ? "99+" : shopifyCounts!.waiting}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="erp-main" style={{ flex: 1, minWidth: 0, overflow: "auto", background: "#f8fafc" }}>
        {children}
      </main>

      {/* Website only: shows the customer the agent's phone (auto dialer) is calling right now. */}
      {!isNativeApp && (user?.role === "SALES_AGENT" || user?.role === "ADMIN") && <DialerDeskPopup />}

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
            {[
              { id: "", label: "", items: navEntries.flatMap((e) => (e.kind === "link" ? [e.item] : [])) },
              ...groupEntries.map((e) => ({ id: e.group.id, label: e.group.label, items: e.items })),
            ].filter((section) => section.items.length > 0).map((section) => (
              <div key={section.id || "pinned"}>
                {section.label && <p className="erp-mobile-menu-section">{section.label}</p>}
                <div className={`erp-mobile-menu-grid${section.label ? " is-section" : ""}`}>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActiveHref(item.href);
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
              </div>
            ))}
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
