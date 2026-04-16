"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  DollarSign,
  Users,
  LogOut,
  Menu,
  X,
  Printer,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "ADMIN" | "AGENT" | "SALES_AGENT" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

// ─── Role → nav items ─────────────────────────────────────────────────────────
const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
    { label: "Orders",     href: "/orders",     icon: ShoppingCart },
    { label: "Production", href: "/production", icon: Package },
    { label: "Accounts",   href: "/accounts",   icon: DollarSign },
    { label: "Dispatch",   href: "/dispatch",   icon: Truck },
    { label: "Users",      href: "/users",      icon: Users },
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

// ─── Read user from localStorage ─────────────────────────────────────────────
function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("rareprint_user");
    if (raw) return JSON.parse(raw) as StoredUser;

    // Fallback: decode from JWT
    const token = localStorage.getItem("rareprint_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      id:       payload.sub,
      email:    payload.email,
      role:     payload.role,
      fullName: payload.fullName ?? payload.email,
    };
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser]             = useState<StoredUser | null>(null);

  // Read user on mount (client-only)
  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("rareprint_user");
    localStorage.removeItem("rareprint_token");
    router.replace("/login");
  };

  const role     = user?.role ?? "AGENT";
  const navItems = NAV_BY_ROLE[role] ?? NAV_BY_ROLE["AGENT"];
  const name     = user?.fullName ?? user?.email ?? "…";

  // ── Sidebar content ──────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <Printer className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-gray-900 text-base">RarePrint</span>
      </div>

      {/* User badge */}
      {user && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2.5 bg-blue-50 rounded-xl">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
            {role}
          </p>
          <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">
            {name}
          </p>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon   = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-all",
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Printer className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-sm text-gray-900">RarePrint</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}