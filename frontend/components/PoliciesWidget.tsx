"use client";
// frontend/components/PoliciesWidget.tsx
//
// Embeddable "Policies & SOPs" banner for module pages. Fetches only the
// policies tagged for `moduleTag` (plus any untagged/global ones) and shows
// nothing if there are none, so it never adds empty clutter to a page.
import { useEffect, useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

type Policy = {
  id: string;
  title: string;
  content: string;
  createdBy?: { fullName: string } | null;
  updatedAt: string;
};

export function PoliciesWidget({ moduleTag }: { moduleTag: string }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/policies?module=${encodeURIComponent(moduleTag)}`, {
      headers: getAuthHeaders(),
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setPolicies(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setPolicies([]); });
    return () => { cancelled = true; };
  }, [moduleTag]);

  if (policies.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 text-amber-900">
          <FileText size={16} />
          <span className="text-sm font-medium">Policies & SOPs</span>
          <span className="text-xs bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">{policies.length}</span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-amber-700" /> : <ChevronDown size={16} className="text-amber-700" />}
      </button>
      {expanded && (
        <div className="border-t border-amber-200 divide-y divide-amber-200">
          {policies.map((p) => (
            <div key={p.id} className="px-4 py-2">
              <button
                type="button"
                onClick={() => setOpenId((id) => (id === p.id ? null : p.id))}
                className="w-full flex items-center justify-between text-left text-sm text-amber-900 font-medium py-1"
              >
                {p.title}
                {openId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {openId === p.id && (
                <div className="text-sm text-gray-700 whitespace-pre-wrap pb-2 pt-1">{p.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
