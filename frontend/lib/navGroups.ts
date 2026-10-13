// Sidebar categories. The sidebar still decides WHICH links a user sees
// (per-role lists + Settings module access in dashboard-shell.tsx); these
// only decide how those links are grouped. A link in no category stays
// always visible at the top. Admins can change the categories in Settings
// (saved via the admin-only PUT /erp-config/nav-groups); until they do, these
// defaults apply.

export type NavGroupConfig = { id: string; label: string; hrefs: string[] };

export const DEFAULT_NAV_GROUPS: NavGroupConfig[] = [
  { id: "sales", label: "Sales & CRM", hrefs: ["/crm", "/dialer", "/call-analysis", "/call-compliance", "/customer-directory", "/sales-learning", "/admin/sales-learning"] },
  { id: "care", label: "Customer Care", hrefs: ["/complaints", "/feedback", "/loyalty", "/offers"] },
  { id: "fulfilment", label: "Fulfilment", hrefs: ["/parcel-booking", "/dispatch", "/courier-calculator", "/remittance-import"] },
  { id: "production", label: "Production", hrefs: ["/production", "/sheet-layout", "/sticker-sheet", "/paper-inventory", "/machine-readings", "/design-studio", "/certificate-generator"] },
  { id: "finance", label: "Finance", hrefs: ["/accounts", "/billing", "/bank-statement", "/cost-table", "/rate-calculator", "/reports"] },
  { id: "marketing", label: "Marketing", hrefs: ["/marketing", "/web-analytics", "/storefront", "/events"] },
  { id: "hr", label: "HR", hrefs: ["/hr", "/attendance", "/salary-commission", "/policies"] },
  { id: "admin", label: "Admin", hrefs: ["/settings", "/business-rules", "/admin/database", "/admin/activity", "/virtual-ceo"] },
];

export type NavEntry<T> =
  | { kind: "link"; item: T }
  | { kind: "group"; group: NavGroupConfig; items: T[] };

/**
 * Groups the user's already-filtered links. Uncategorised links come first,
 * in their original order; then each category in configured order. A
 * category the user has no links in is dropped, and one with a single link
 * shows that link directly instead of a one-item folder.
 */
export function groupNavItems<T extends { href: string }>(items: T[], groups: NavGroupConfig[]): NavEntry<T>[] {
  const groupOf = new Map<string, string>();
  for (const group of groups) for (const href of group.hrefs) if (!groupOf.has(href)) groupOf.set(href, group.id);

  const entries: NavEntry<T>[] = items.filter((item) => !groupOf.has(item.href)).map((item) => ({ kind: "link", item }));
  for (const group of groups) {
    const groupItems = items.filter((item) => groupOf.get(item.href) === group.id);
    if (groupItems.length === 1) entries.push({ kind: "link", item: groupItems[0] });
    else if (groupItems.length > 1) entries.push({ kind: "group", group, items: groupItems });
  }
  return entries;
}
