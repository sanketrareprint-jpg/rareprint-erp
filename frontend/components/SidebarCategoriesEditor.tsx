"use client";
// Settings > Sidebar Categories — admins choose which category each sidebar
// link sits in, and add / rename / reorder / remove categories. It only
// changes grouping; who can see a link is still Module Access above.
// Rendered for ADMIN only; the backend (PUT /erp-config/nav-groups) also
// rejects everyone else.
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, PanelLeft, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";
import { DEFAULT_NAV_GROUPS, type NavGroupConfig } from "@/lib/navGroups";
import { ALL_NAV_LINKS, NAV_GROUPS_UPDATED_EVENT } from "@/components/dashboard-shell";

const ALWAYS_VISIBLE = "";

export function SidebarCategoriesEditor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [groups, setGroups] = useState<NavGroupConfig[]>(DEFAULT_NAV_GROUPS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (getStoredUser()?.role !== "ADMIN") { setLoading(false); return; }
    setIsAdmin(true);
    fetch(`${API_BASE_URL}/erp-config/nav-groups`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { groups?: NavGroupConfig[] | null } | null) => { if (Array.isArray(data?.groups)) setGroups(data.groups); })
      .catch(() => setMessage({ ok: false, text: "Could not load the saved categories — showing the defaults." }))
      .finally(() => setLoading(false));
  }, []);

  if (!isAdmin) return null;

  const groupOf = (href: string) => groups.find((g) => g.hrefs.includes(href))?.id ?? ALWAYS_VISIBLE;

  const edit = (next: NavGroupConfig[]) => { setGroups(next); setMessage(null); };

  const moveLink = (href: string, groupId: string) =>
    edit(groups.map((g) => ({
      ...g,
      hrefs: g.id === groupId ? [...g.hrefs.filter((h) => h !== href), href] : g.hrefs.filter((h) => h !== href),
    })));

  const moveGroup = (index: number, delta: number) => {
    const next = [...groups];
    const [g] = next.splice(index, 1);
    next.splice(index + delta, 0, g);
    edit(next);
  };

  // Its links go back to "Always visible"; nothing is hidden by removing a category.
  const removeGroup = (id: string) => edit(groups.filter((g) => g.id !== id));

  const addGroup = () => edit([...groups, { id: `custom-${Date.now().toString(36)}`, label: "New category", hrefs: [] }]);

  const save = async (body: { groups: NavGroupConfig[] | null }) => {
    if (body.groups?.some((g) => !g.label.trim())) { setMessage({ ok: false, text: "Every category needs a name." }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/erp-config/nav-groups`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body.groups ? { groups: body.groups.map((g) => ({ ...g, label: g.label.trim() })) } : body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
      const saved: NavGroupConfig[] | null = Array.isArray(data?.groups) ? data.groups : null;
      setGroups(saved ?? DEFAULT_NAV_GROUPS);
      window.dispatchEvent(new CustomEvent(NAV_GROUPS_UPDATED_EVENT, { detail: saved }));
      setMessage({ ok: true, text: saved ? "Sidebar categories saved for everyone." : "Sidebar reset to the default categories." });
    } catch (err) {
      setMessage({ ok: false, text: `Could not save: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 space-y-5 shadow-sm">
      <div className="flex items-start gap-3">
        <PanelLeft className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
        <div>
          <h2 className="font-semibold text-gray-900 text-base">Sidebar Categories</h2>
          <p className="text-xs text-gray-500 mt-1">
            Group sidebar links into categories for everyone. This only changes grouping — who can see each link is still set in Module Access.
            Links set to &ldquo;Always visible&rdquo; stay at the top.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Categories (in sidebar order)</p>
            {groups.map((g, i) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2">
                <input
                  value={g.label}
                  maxLength={40}
                  onChange={(e) => edit(groups.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)))}
                  aria-label="Category name"
                  className="min-h-[44px] flex-1 min-w-[160px] rounded-lg border border-gray-200 bg-white px-3 text-sm md:min-h-[36px]"
                />
                <span className="text-xs text-gray-500">{g.hrefs.length} link{g.hrefs.length === 1 ? "" : "s"}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveGroup(i, -1)} disabled={i === 0} aria-label="Move up"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 md:min-h-[36px] md:min-w-[36px]">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => moveGroup(i, 1)} disabled={i === groups.length - 1} aria-label="Move down"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 md:min-h-[36px] md:min-w-[36px]">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => removeGroup(g.id)} aria-label={`Remove ${g.label}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 md:min-h-[36px] md:min-w-[36px]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addGroup}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 md:min-h-[36px]">
              <Plus className="h-4 w-4" /> Add category
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Links</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {ALL_NAV_LINKS.map((link) => (
                <label key={link.href} className="flex flex-col gap-1.5 rounded-xl border border-gray-100 px-3 py-2">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-800">{link.label}</span>
                    <span className="truncate text-xs text-gray-400">{link.href}</span>
                  </span>
                  <select
                    value={groupOf(link.href)}
                    onChange={(e) => moveLink(link.href, e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-gray-200 bg-white px-2 text-sm md:min-h-[36px]"
                  >
                    <option value={ALWAYS_VISIBLE}>Always visible</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.label || "(unnamed)"}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"} flex items-center gap-1.5`}>
              {message.ok && <CheckCircle2 className="h-4 w-4" />}{message.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => save({ groups })} disabled={saving}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 md:min-h-[38px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save categories
            </button>
            <button type="button" onClick={() => save({ groups: null })} disabled={saving}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 md:min-h-[38px]">
              <RotateCcw className="h-4 w-4" /> Reset to default
            </button>
          </div>
        </>
      )}
    </section>
  );
}
