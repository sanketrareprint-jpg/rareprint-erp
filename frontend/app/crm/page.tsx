"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  makeCall as nativeMakeCall,
  showCallOverlay,
  hideCallOverlay,
  startCallMonitoring,
  stopCallMonitoring,
  getLastCallForNumber,
  type CallStateEvent,
} from "@/lib/plugins/CallManager";

const API = process.env.NEXT_PUBLIC_API_URL || "https://rareprint-erp-production.up.railway.app";
const getAuth = () => ({ Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("rareprint_token") : ""}` });

// ─── TYPES ────────────────────────────────────────────────────────────────────
type LeadStatus = "NEW" | "CONTACTED" | "INTERESTED" | "QUOTED" | "WON" | "LOST" | "RECYCLED";
interface FollowUp { id: string; scheduledAt: string; status: string; note?: string; }
interface Activity { id: string; type: string; description: string; createdAt: string; createdBy: { fullName: string }; }
interface Lead {
  id: string; name: string; phone: string; email?: string; businessName?: string;
  city?: string; productInterest?: string; estimatedQty?: number; estimatedValue?: number;
  notes?: string; tags?: string[]; source: string; status: LeadStatus; score: number; isHot: boolean;
  agentId: string; agent: { fullName: string };
  nextFollowUp?: FollowUp; activityCount: number; isDuplicate?: boolean;
  activities?: Activity[]; followUps?: FollowUp[]; sharedWith?: any[];
  createdAt: string; updatedAt: string;
}
interface Stats { total: number; byStatus: Record<string, number>; hotLeads: number; todayFollowUps: number; }
// A contact flagged "not contacted" (AiSensy tag with no matching call-log
// record). Managed like a normal lead: status + follow-up. If leadId is set,
// it's linked to a real Lead row and status/follow-up actions go through the
// usual /crm/leads endpoints instead of the call-compliance ones.
interface NotContactedContact {
  id: string; name: string | null; phone: string; tagRaw: string | null;
  lastActiveAt: string | null; createdOnAt: string | null;
  agentId: string; agentName: string | null;
  status: LeadStatus; leadId: string | null;
  nextFollowUp?: { id: string; scheduledAt: string; note?: string } | null;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New", CONTACTED: "Contacted", INTERESTED: "Interested",
  QUOTED: "Quoted", WON: "Won", LOST: "Lost", RECYCLED: "Recycled",
};
const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: "bg-slate-100 text-slate-700", CONTACTED: "bg-blue-100 text-blue-700",
  INTERESTED: "bg-amber-100 text-amber-700", QUOTED: "bg-purple-100 text-purple-700",
  WON: "bg-green-100 text-green-700", LOST: "bg-red-100 text-red-700",
  RECYCLED: "bg-gray-100 text-gray-600",
};
const ACTIVITY_ICONS: Record<string, string> = {
  CALL_MADE: "📞", CALL_MISSED: "📵", CALL_BUSY: "🔄",
  WHATSAPP_SENT: "💬", NOTE_ADDED: "📝", STATUS_CHANGED: "🔁",
  QUOTE_SENT: "📄", FOLLOW_UP_SCHEDULED: "📅",
};
const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "INTERESTED", "QUOTED", "WON", "LOST"];
const CSV_SAMPLE = `name,phone,email,businessName,city,productInterest,tags,estimatedQty,estimatedValue,notes
Raju Medical Store,9876543210,raju@gmail.com,Raju Medical,Nashik,ENVELOPE,hot;wholesale,5000,2500,needs letterhead too
Priya Pharma,9123456780,,Priya Pharma,Pune,BOX,repeat,10000,8000,
City Hospital,9988776655,city@hospital.com,City Hospital,Mumbai,FILE,urgent,2000,3000,urgent`;

// ─── DISPLAY NAME HELPER (always shows something) ─────────────────────────────
const displayName = (lead: { name?: string; businessName?: string; phone?: string }) =>
  lead.name?.trim() || lead.businessName?.trim() || (lead.phone ? `📞 ${lead.phone}` : "Unknown");

// ─── SCORE BADGE ──────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-xs text-slate-500">{score}</span>
    </div>
  );
}

// ─── LEAD CARD (Kanban) ────────────────────────────────────────────────────────
function LeadCard({ lead, onClick, onCall }: { lead: Lead; onClick: () => void; onCall: () => void }) {
  const overdue = lead.nextFollowUp && new Date(lead.nextFollowUp.scheduledAt) < new Date();
  return (
    <div onClick={onClick} className={`bg-white border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${lead.isHot ? "border-orange-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {lead.isHot && <span title="Hot lead">🔥</span>}
          <span className="font-semibold text-slate-800 text-sm truncate">{displayName(lead)}</span>
        </div>
        <ScoreBadge score={lead.score} />
      </div>
      {lead.businessName && lead.name?.trim() && <p className="text-xs text-slate-500 truncate mb-1">{lead.businessName}</p>}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-slate-500 font-mono">{lead.phone}</span>
        {lead.isDuplicate && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium">⚠ Shared</span>}
      </div>
      {lead.productInterest && (
        <span className="inline-block mt-1.5 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{lead.productInterest}</span>
      )}
      {lead.tags && lead.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((tag) => <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{tag}</span>)}
        </div>
      )}
      {lead.nextFollowUp && (
        <div className={`mt-2 text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>
          📅 {overdue ? "Overdue: " : ""}{new Date(lead.nextFollowUp.scheduledAt).toLocaleDateString("en-IN")}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-slate-400">{lead.activityCount} activities</span>
        <button
          onClick={(e) => { e.stopPropagation(); onCall(); }}
          className="inline-flex items-center gap-1 bg-green-600 text-white text-xs px-2 py-1 rounded-lg hover:bg-green-700 font-semibold"
        >
          📞 Call
        </button>
      </div>
    </div>
  );
}

// ─── MOBILE LEAD ROW ──────────────────────────────────────────────────────────
function MobileLeadRow({ lead, onOpen, onCall, onLog }: {
  lead: Lead; onOpen: () => void; onCall: () => void; onLog: () => void;
}) {
  const overdue = lead.nextFollowUp && new Date(lead.nextFollowUp.scheduledAt) < new Date();
  return (
    <div className="bg-white border-b border-slate-100 px-4 py-3 active:bg-slate-50" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {lead.isHot && <span>🔥</span>}
            <span className="font-semibold text-slate-800 text-sm">{displayName(lead)}</span>
            {lead.isDuplicate && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">⚠</span>}
          </div>
          {/* Show business name only if different from display name */}
          {lead.businessName && lead.name?.trim() && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{lead.businessName}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-mono text-slate-500">{lead.phone}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status]}`}>{STATUS_LABELS[lead.status]}</span>
            {lead.productInterest && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">{lead.productInterest}</span>}
            {lead.tags?.slice(0, 2).map((tag) => <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{tag}</span>)}
          </div>
          {lead.nextFollowUp && (
            <p className={`text-xs mt-1 ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>
              📅 {overdue ? "Overdue: " : ""}{new Date(lead.nextFollowUp.scheduledAt).toLocaleDateString("en-IN")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {/* Button — NOT an anchor tag, so it won't navigate away */}
          <button
            onClick={(e) => { e.stopPropagation(); onCall(); }}
            className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold text-center min-w-[48px]"
          >📞</button>
          <button
            onClick={(e) => { e.stopPropagation(); onLog(); }}
            className="border border-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-lg text-center"
          >Log</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
function CrmPageContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [todayFollowUps, setTodayFollowUps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list" | "dialer" | "followups" | "notcontacted">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [myLeadsOnly, setMyLeadsOnly] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState<Lead | null>(null);
  const [callNote, setCallNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [newLeadForm, setNewLeadForm] = useState({ name: "", phone: "", email: "", businessName: "", city: "", productInterest: "", tags: "", estimatedQty: "", estimatedValue: "", notes: "" });
  const [duplicateAlert, setDuplicateAlert] = useState<any>(null);
  const [dialerLead, setDialerLead] = useState<Lead | null>(null);
  const [dialerActive, setDialerActive] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sendingAisensy, setSendingAisensy] = useState<string | null>(null);
  const [deletingLead, setDeletingLead] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Not-contacted tab (AiSensy tag with no matching call-log record) ───────
  const [notContactedList, setNotContactedList] = useState<NotContactedContact[]>([]);
  const [notContactedLoading, setNotContactedLoading] = useState(false);
  const [notContactedError, setNotContactedError] = useState<string | null>(null);
  const [showContactCallModal, setShowContactCallModal] = useState<NotContactedContact | null>(null);
  const [contactCallNote, setContactCallNote] = useState("");
  const [notContactedSearch, setNotContactedSearch] = useState("");
  const [notContactedMonth, setNotContactedMonth] = useState(""); // "" = all time
  const [notContactedMonths, setNotContactedMonths] = useState<{ month: string; label: string }[]>([]);

  // ── Smart call state ──────────────────────────────────────────────────────
  const [callInProgress, setCallInProgress] = useState<Lead | null>(null);
  const callStartedAt = useRef<number>(0);

  const visibleLeadIds = leads.map((lead) => lead.id);
  const allVisibleSelected = visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selectedLeadIds.includes(id));
  const someVisibleSelected = selectedLeadIds.some((id) => visibleLeadIds.includes(id));

  // ── Prev / next lead navigation ───────────────────────────────────────────
  const currentLeadIndex = selectedLead ? leads.findIndex(l => l.id === selectedLead.id) : -1;
  const canNavPrev = currentLeadIndex > 0;
  const canNavNext = currentLeadIndex >= 0 && currentLeadIndex < leads.length - 1;

  // ── Native call monitoring (Capacitor) + web visibilitychange fallback ─────
  useEffect(() => {
    let mounted = true;

    const handleCallEnded = async (event: CallStateEvent) => {
      if (!mounted || !callInProgress) return;

      // Hide the overlay that was showing during the call
      hideCallOverlay().catch(() => {});

      // Try to read the actual outcome from the system call log
      let autoOutcome: string | undefined;
      try {
        const log = await getLastCallForNumber(callInProgress.phone);
        if (log && Date.now() - log.date < 60_000) {
          if (log.type === "OUTGOING") autoOutcome = "ANSWERED";
          else if (log.type === "MISSED") autoOutcome = "NO_ANSWER";
        }
      } catch { /* call log unavailable — user will pick manually */ }

      if (autoOutcome) {
        // Auto-log with detected outcome — no modal needed
        setCallNote(event.duration ? `Duration: ${event.duration}s` : "");
        // Small delay so state settles before submit
        setTimeout(() => {
          setShowCallModal((prev) => prev ?? callInProgress);
        }, 300);
      } else {
        setShowCallModal(callInProgress);
      }
      setCallInProgress(null);
    };

    // Start native Capacitor listener
    startCallMonitoring(handleCallEnded).catch(() => {});

    // Web / PWA fallback — visibilitychange fires when user returns from dialer
    const handleVisibility = () => {
      if (!document.hidden && callInProgress && Date.now() - callStartedAt.current > 1500) {
        hideCallOverlay().catch(() => {});
        setShowCallModal(callInProgress);
        setCallInProgress(null);
      }
    };
    const handlePageShow = (e: PageTransitionEvent) => { if (e.persisted) handleVisibility(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      mounted = false;
      stopCallMonitoring(handleCallEnded).catch(() => {});
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [callInProgress]);

  // ── initiateCall: uses native ACTION_CALL on Android, tel: on web ──────────
  const initiateCall = useCallback((lead: Lead) => {
    setCallInProgress(lead);
    callStartedAt.current = Date.now();
    // Show the overlay card on top of the phone dialer (Android APK only)
    showCallOverlay(displayName(lead), lead.phone).catch(() => {});
    // Make the call — native on Android, tel: href on web
    nativeMakeCall(lead.phone).catch(() => {
      window.location.href = `tel:${lead.phone}`;
    });
  }, []);

  const sendToAisensy = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sendingAisensy === lead.id) return;
    setSendingAisensy(lead.id);
    try {
      const res = await fetch(`${API}/crm/leads/${lead.id}/send-to-aisensy`, {
        method: "POST",
        headers: { ...getAuth(), "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(` WhatsApp sent to ${displayName(lead)} via AiSensy!\nAgent: ${data.agentName}`);
        load();
      } else {
        alert(` Failed: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      alert(" Network error");
    } finally {
      setSendingAisensy(null);
    }
  };

  const deleteLead = async (lead: Lead, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (deletingLead === lead.id) return;
    const ok = window.confirm(`Delete lead "${displayName(lead)}"?\n\nThis will remove its follow-ups and activity history too.`);
    if (!ok) return;
    setDeletingLead(lead.id);
    try {
      const res = await fetch(`${API}/crm/leads/${lead.id}`, {
        method: "DELETE",
        headers: getAuth(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to delete lead");
        return;
      }
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      if (selectedLead?.id === lead.id) setSelectedLead(null);
      load();
    } catch {
      alert("Network error");
    } finally {
      setDeletingLead(null);
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]);
  };

  const toggleAllVisible = () => {
    setSelectedLeadIds(prev => {
      const visible = new Set(visibleLeadIds);
      if (allVisibleSelected) return prev.filter(id => !visible.has(id));
      return Array.from(new Set([...prev, ...visibleLeadIds]));
    });
  };

  const deleteSelectedLeads = async () => {
    const ids = selectedLeadIds.filter(id => visibleLeadIds.includes(id));
    if (!ids.length) return;
    const ok = window.confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"}?\n\nThis will remove their follow-ups and activity history too.`);
    if (!ok) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API}/crm/leads/bulk-delete`, {
        method: "POST",
        headers: { ...getAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || "Failed to delete selected leads");
        return;
      }
      setSelectedLeadIds(prev => prev.filter(id => !ids.includes(id)));
      if (selectedLead && ids.includes(selectedLead.id)) setSelectedLead(null);
      alert(`Deleted ${data.deleted ?? ids.length} lead${(data.deleted ?? ids.length) === 1 ? "" : "s"}.`);
      load();
    } catch {
      alert("Network error");
    } finally {
      setBulkDeleting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (myLeadsOnly) params.set("myOnly", "true");
    if (search) params.set("search", search);
    const [leadsRes, statsRes, fuRes] = await Promise.all([
      fetch(`${API}/crm/leads?${params}`, { headers: getAuth() }),
      fetch(`${API}/crm/leads/stats`, { headers: getAuth() }),
      fetch(`${API}/crm/leads/today-followups`, { headers: getAuth() }),
    ]);
    if (leadsRes.ok) setLeads(await leadsRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
    if (fuRes.ok) setTodayFollowUps(await fuRes.json());
    setLoading(false);
  }, [search, statusFilter, myLeadsOnly]);

  useEffect(() => { load(); }, [load]);

  // Old /crm/not-contacted bookmarks/links redirect here with #notcontacted.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#notcontacted") setView("notcontacted");
  }, []);

  const loadNotContacted = useCallback(async (month: string) => {
    setNotContactedLoading(true); setNotContactedError(null);
    try {
      const qs = month ? `?month=${month}` : "";
      const res = await fetch(`${API}/call-compliance/not-contacted${qs}`, { headers: getAuth() });
      if (!res.ok) { setNotContactedError("Could not load not-contacted leads"); return; }
      setNotContactedList(await res.json());
    } catch { setNotContactedError("Network error"); }
    finally { setNotContactedLoading(false); }
  }, []);

  useEffect(() => { if (view === "notcontacted") loadNotContacted(notContactedMonth); }, [view, notContactedMonth, loadNotContacted]);

  useEffect(() => {
    if (view !== "notcontacted" || notContactedMonths.length) return;
    (async () => {
      try {
        const res = await fetch(`${API}/call-compliance/months`, { headers: getAuth() });
        if (res.ok) setNotContactedMonths(await res.json());
      } catch { /* ignore */ }
    })();
  }, [view, notContactedMonths.length]);

  const filteredNotContacted = notContactedList.filter((c) => {
    if (!notContactedSearch) return true;
    const q = notContactedSearch.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.phone.includes(q) || c.tagRaw?.toLowerCase().includes(q) || c.agentName?.toLowerCase().includes(q);
  });

  // Not-contacted status change: routed to the linked Lead if one exists,
  // otherwise tracked on the contact itself.
  const updateContactStatus = async (contact: NotContactedContact, status: LeadStatus) => {
    const url = contact.leadId ? `${API}/crm/leads/${contact.leadId}/status` : `${API}/call-compliance/contacts/${contact.id}/status`;
    await fetch(url, {
      method: contact.leadId ? "PATCH" : "PUT",
      headers: { ...getAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setNotContactedList(prev => prev.map(c => c.id === contact.id ? { ...c, status } : c));
  };

  const submitContactCall = async (outcome: string) => {
    if (!showContactCallModal) return;
    const contact = showContactCallModal;
    const url = contact.leadId ? `${API}/crm/leads/${contact.leadId}/call` : `${API}/call-compliance/contacts/${contact.id}/call`;
    await fetch(url, {
      method: "POST", headers: { ...getAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, note: contactCallNote }),
    });
    setShowContactCallModal(null);
    setContactCallNote("");
    loadNotContacted(notContactedMonth);
  };

  const openLead = async (lead: Lead) => {
    const res = await fetch(`${API}/crm/leads/${lead.id}`, { headers: getAuth() });
    if (res.ok) setSelectedLead(await res.json());
  };

  const openLeadById = async (id: string) => {
    const res = await fetch(`${API}/crm/leads/${id}`, { headers: getAuth() });
    if (res.ok) setSelectedLead(await res.json());
  };

  const navigateLead = async (dir: "prev" | "next") => {
    const idx = dir === "next" ? currentLeadIndex + 1 : currentLeadIndex - 1;
    if (idx >= 0 && idx < leads.length) await openLead(leads[idx]);
  };

  const updateStatus = async (leadId: string, status: LeadStatus) => {
    await fetch(`${API}/crm/leads/${leadId}/status`, {
      method: "PATCH", headers: { ...getAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    if (selectedLead?.id === leadId) {
      const res = await fetch(`${API}/crm/leads/${leadId}`, { headers: getAuth() });
      if (res.ok) setSelectedLead(await res.json());
    }
  };

  const submitCall = async (outcome: string) => {
    if (!showCallModal) return;
    await fetch(`${API}/crm/leads/${showCallModal.id}/call`, {
      method: "POST", headers: { ...getAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, note: callNote }),
    });
    const justLogged = showCallModal;
    setShowCallModal(null);
    setCallNote("");
    if (dialerActive) {
      loadNextDialer(justLogged.id);
    } else {
      load();
      // Refresh selected lead detail if open
      if (selectedLead?.id === justLogged.id) {
        const res = await fetch(`${API}/crm/leads/${justLogged.id}`, { headers: getAuth() });
        if (res.ok) setSelectedLead(await res.json());
      }
    }
  };

  const submitNote = async () => {
    if (!selectedLead || !noteText.trim()) return;
    await fetch(`${API}/crm/leads/${selectedLead.id}/note`, {
      method: "POST", headers: { ...getAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText }),
    });
    setNoteText("");
    const res = await fetch(`${API}/crm/leads/${selectedLead.id}`, { headers: getAuth() });
    if (res.ok) setSelectedLead(await res.json());
  };

  const createLead = async () => {
    if (!newLeadForm.name || !newLeadForm.phone) return alert("Name and phone required");
    const res = await fetch(`${API}/crm/leads`, {
      method: "POST", headers: { ...getAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(newLeadForm),
    });
    if (res.ok) {
      setShowAddModal(false);
      setNewLeadForm({ name: "", phone: "", email: "", businessName: "", city: "", productInterest: "", tags: "", estimatedQty: "", estimatedValue: "", notes: "" });
      load();
    } else alert("Failed to create lead");
  };

  const checkDuplicate = async (phone: string) => {
    if (phone.length < 10) return;
    const res = await fetch(`${API}/crm/leads/duplicate-check?phone=${phone}`, { headers: getAuth() });
    if (res.ok) { const d = await res.json(); setDuplicateAlert(d); }
  };

  // ── Power Dialer: auto-dials next lead after call log ─────────────────────
  const loadNextDialer = async (currentId?: string) => {
    const params = currentId ? `?currentLeadId=${currentId}` : "";
    const res = await fetch(`${API}/crm/leads/dialer/next${params}`, { headers: getAuth() });
    if (res.ok) {
      const next = await res.json();
      setDialerLead(next);
      if (next) {
        // Short pause so the UI updates before the dialer fires
        setTimeout(() => initiateCall(next), 400);
      } else {
        setDialerActive(false);
        alert("🎉 All leads dialed! Great work.");
      }
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) || "");
    reader.readAsText(file);
  };

  const runImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true); setImportResult(null);
    try {
      const lines = csvText.trim().split("\n").filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return obj;
      });
      const res = await fetch(`${API}/crm/leads/bulk-import`, {
        method: "POST", headers: { ...getAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const result = await res.json();
      setImportResult(result);
      load();
    } finally { setImporting(false); }
  };

  const kanbanStatuses: LeadStatus[] = ["NEW", "CONTACTED", "INTERESTED", "QUOTED", "WON", "LOST"];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── CALLING OVERLAY — shown while the phone dialer is open ── */}
      {callInProgress && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex flex-col items-center justify-center text-white text-center px-6">
          <div className="text-5xl mb-4 animate-pulse">📞</div>
          <p className="text-xl font-bold mb-1">{displayName(callInProgress)}</p>
          <p className="text-2xl font-mono font-bold text-green-400 mb-2">{callInProgress.phone}</p>
          <p className="text-sm text-white/70 mb-6">Calling… return here when done to log the call.</p>
          <button
            onClick={() => { setShowCallModal(callInProgress); setCallInProgress(null); }}
            className="bg-white text-slate-800 font-bold px-6 py-3 rounded-xl text-sm hover:bg-slate-100"
          >
            ✅ Log this call now
          </button>
          <button
            onClick={() => setCallInProgress(null)}
            className="mt-3 text-white/50 text-xs hover:text-white/80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">CRM — Leads</h1>
            <p className="text-xs sm:text-sm text-slate-500">Manage your sales pipeline</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button onClick={() => setShowImportModal(true)} className="inline-flex items-center gap-1 border border-slate-300 text-slate-700 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-50 font-medium">
              📥 <span className="hidden sm:inline">Import</span>
            </button>
            <button onClick={() => { setDialerActive(true); setView("dialer"); loadNextDialer(); }}
              className="inline-flex items-center gap-1 bg-orange-600 text-white text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg hover:bg-orange-700 font-semibold">
              ⚡ <span className="hidden sm:inline">Dialer</span>
            </button>
            <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">
              + <span className="hidden sm:inline">Add Lead</span><span className="sm:hidden">Lead</span>
            </button>
          </div>
        </div>

        {/* STATS ROW */}
        {stats && (
          <div className="flex gap-3 sm:gap-6 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
            {[
              { label: "Total", value: stats.total, color: "text-slate-700" },
              { label: "🔥 Hot", value: stats.hotLeads, color: "text-orange-600" },
              { label: "Follow-ups", value: stats.todayFollowUps, color: "text-red-600" },
              { label: "Won", value: stats.byStatus["WON"] ?? 0, color: "text-green-600" },
              { label: "Pipeline", value: (stats.byStatus["NEW"] ?? 0) + (stats.byStatus["CONTACTED"] ?? 0) + (stats.byStatus["INTERESTED"] ?? 0), color: "text-blue-600" },
            ].map((s) => (
              <div key={s.label} className="text-center flex-shrink-0">
                <p className={`text-base sm:text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400 whitespace-nowrap">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* SEARCH + FILTER */}
        <div className="flex gap-2 mt-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone…"
            className="flex-1 border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-blue-400 min-w-0" />
          <button onClick={() => setMyLeadsOnly(p => !p)} className={`text-xs px-3 py-2 rounded-lg font-medium border ${myLeadsOnly ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-600"}`}>{myLeadsOnly ? "👤 My" : "All"}</button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg text-xs sm:text-sm px-2 py-2 focus:outline-none bg-white flex-shrink-0">
            <option value="ALL">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>

        {/* TABS */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
          {(["list", "kanban", "followups", "notcontacted"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium whitespace-nowrap flex-shrink-0 ${view === v ? "bg-blue-600 text-white" : v === "notcontacted" ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100"}`}>
              {v === "followups" ? `📅 Follow-ups (${todayFollowUps.length})` : v === "list" ? "📋 List" : v === "kanban" ? "🗂 Kanban" : `📵 Not Contacted${notContactedList.length ? ` (${notContactedList.length})` : ""}`}
            </button>
          ))}
        </div>

        {view === "list" && (
          <div className="flex items-center justify-between gap-2 mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 rounded border-slate-300" />
              {someVisibleSelected ? `${selectedLeadIds.filter(id => visibleLeadIds.includes(id)).length} selected` : "Select visible leads"}
            </label>
            <button onClick={deleteSelectedLeads} disabled={!someVisibleSelected || bulkDeleting} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 font-semibold">
              {bulkDeleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className={view === "list" ? "" : "p-4"}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">Loading leads…</div>

        ) : view === "kanban" ? (
          /* ── KANBAN ── */
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
            {kanbanStatuses.map((status) => {
              const colLeads = leads.filter((l) => l.status === status);
              return (
                <div key={status} className="flex-shrink-0 w-64">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                    <span className="text-xs text-slate-400">{colLeads.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} onClick={() => openLead(lead)} onCall={() => initiateCall(lead)} />
                    ))}
                    {colLeads.length === 0 && (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">Empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        ) : view === "list" ? (
          /* ── LIST ── */
          <>
            {/* Mobile card list */}
            <div className="sm:hidden bg-white rounded-none border-t border-slate-100 divide-y divide-slate-100">
              {leads.map((lead) => (
                <div key={lead.id} className="flex items-start gap-2 px-3">
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.includes(lead.id)}
                    onChange={() => toggleLeadSelection(lead.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-5 h-4 w-4 rounded border-slate-300"
                  />
                  <div className="flex-1">
                    <MobileLeadRow
                      lead={lead}
                      onOpen={() => openLead(lead)}
                      onCall={() => initiateCall(lead)}
                      onLog={() => setShowCallModal(lead)}
                    />
                  </div>
                </div>
              ))}
              {leads.length === 0 && (
                <div className="px-4 py-10 text-center text-slate-400">No leads found</div>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden m-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 rounded border-slate-300" />
                    </th>
                    {["Name / Business", "Phone", "Created", "Assigned Agent", "Score", "Status", "Next Follow-up", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((lead) => {
                    const overdue = lead.nextFollowUp && new Date(lead.nextFollowUp.scheduledAt) < new Date();
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openLead(lead)}>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLeadSelection(lead.id)} className="h-4 w-4 rounded border-slate-300" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {lead.isHot && <span>🔥</span>}
                            {lead.isDuplicate && <span title="Shared lead" className="text-red-500">⚠</span>}
                            <div>
                              <p className="font-semibold text-slate-800">{displayName(lead)}</p>
                              {lead.businessName && lead.name?.trim() && <p className="text-xs text-slate-400">{lead.businessName}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{lead.phone}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {new Date(lead.createdAt).toLocaleDateString("en-IN")}
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(lead.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{lead.agent?.fullName ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3"><ScoreBadge score={lead.score} /></td>
                        <td className="px-4 py-3">
                          <select value={lead.status} onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateStatus(lead.id, e.target.value as LeadStatus)}
                            className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[lead.status]}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {lead.nextFollowUp ? (
                            <span className={`text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                              {overdue ? "⚠ " : ""}{new Date(lead.nextFollowUp.scheduledAt).toLocaleDateString("en-IN")}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => initiateCall(lead)} className="inline-flex items-center gap-1 bg-green-600 text-white text-xs px-2 py-1 rounded-lg hover:bg-green-700 font-semibold mr-1">📞</button>
                          <button onClick={() => setShowCallModal(lead)} className="text-xs border border-slate-200 text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 mr-1">Log</button>
                          <button onClick={(e) => sendToAisensy(lead, e)} disabled={sendingAisensy === lead.id} className="text-xs bg-green-500 text-white px-2 py-1 rounded-lg hover:bg-green-600 disabled:opacity-50 font-semibold mr-1">{sendingAisensy === lead.id ? "..." : "💬 WA"}</button>
                          <button onClick={(e) => deleteLead(lead, e)} disabled={deletingLead === lead.id} className="text-xs border border-red-200 text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 font-semibold">{deletingLead === lead.id ? "..." : "Delete"}</button>
                        </td>
                      </tr>
                    );
                  })}
                  {leads.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No leads found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>

        ) : view === "dialer" ? (
          /* ── POWER DIALER ── */
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 text-center border-b border-slate-200">
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">⚡ Power Dialer</p>
                <p className="text-slate-500 text-sm">Auto-advances to next lead after you log each call</p>
              </div>
              {dialerLead ? (
                <div className="p-6">
                  {dialerLead.isHot && <div className="text-center mb-3"><span className="bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full">🔥 Hot Lead</span></div>}
                  <div className="text-center mb-6">
                    <p className="text-2xl font-bold text-slate-900 mb-1">{displayName(dialerLead)}</p>
                    {dialerLead.businessName && dialerLead.name?.trim() && <p className="text-slate-500">{dialerLead.businessName}</p>}
                    <p className="text-3xl font-mono font-bold text-blue-600 mt-3">{dialerLead.phone}</p>
                    {dialerLead.city && <p className="text-slate-400 text-sm mt-1">{dialerLead.city}</p>}
                  </div>
                  {dialerLead.productInterest && (
                    <div className="bg-blue-50 rounded-xl p-3 mb-4 text-center">
                      <p className="text-xs text-slate-500">Interested in</p>
                      <p className="font-bold text-blue-700">{dialerLead.productInterest}</p>
                      {dialerLead.estimatedQty && <p className="text-xs text-slate-500">~{dialerLead.estimatedQty.toLocaleString()} pcs</p>}
                    </div>
                  )}
                  {dialerLead.notes && <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 mb-4 italic">"{dialerLead.notes}"</p>}
                  {/* Dialer Call button — uses initiateCall so app returns to CRM after call */}
                  <button
                    onClick={() => initiateCall(dialerLead)}
                    className="block w-full text-center bg-green-600 text-white font-bold text-lg py-4 rounded-xl hover:bg-green-700 mb-4"
                  >
                    📞 Call Now
                  </button>
                  <textarea value={callNote} onChange={(e) => setCallNote(e.target.value)}
                    placeholder="Add call note (optional)…" rows={2}
                    className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 mb-3 focus:outline-none focus:border-blue-400 resize-none" />
                  <p className="text-xs text-slate-400 text-center mb-2">Call outcome — tap after the call</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[["ANSWERED", "✅ Answered", "bg-green-600"], ["BUSY", "🔄 Busy", "bg-amber-500"], ["NO_ANSWER", "📵 No answer", "bg-red-500"]].map(([o, label, color]) => (
                      <button key={o} onClick={() => submitCall(o)} className={`${color} text-white text-xs font-semibold py-2 rounded-lg hover:opacity-90`}>{label}</button>
                    ))}
                  </div>
                  <button onClick={() => { setDialerActive(false); setDialerLead(null); setView("list"); }} className="w-full mt-4 text-xs text-slate-400 hover:text-slate-600">
                    Stop dialer
                  </button>
                </div>
              ) : (
                <div className="p-10 text-center text-slate-400">
                  <p className="text-4xl mb-3">🎉</p>
                  <p className="font-semibold text-slate-700">All leads dialed!</p>
                  <p className="text-sm mt-1">Great work. Check back tomorrow.</p>
                </div>
              )}
            </div>
          </div>

        ) : view === "followups" ? (
          /* ── FOLLOW-UPS ── */
          <div className="max-w-2xl mx-auto space-y-3">
            <p className="text-sm font-semibold text-slate-600 mb-2">Today's follow-ups ({todayFollowUps.length})</p>
            {todayFollowUps.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">🎉 No follow-ups due today!</div>
            )}
            {todayFollowUps.map((fu: any) => {
              const overdue = new Date(fu.scheduledAt) < new Date();
              return (
                <div key={fu.id} className={`bg-white rounded-xl border p-4 flex items-start justify-between gap-3 ${overdue ? "border-red-200" : "border-slate-200"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{displayName(fu.lead)}</span>
                      {overdue && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Overdue</span>}
                    </div>
                    {fu.lead.businessName && fu.lead.name?.trim() && <p className="text-xs text-slate-400">{fu.lead.businessName}</p>}
                    <p className="text-xs text-slate-500 mt-1">{fu.note}</p>
                    <p className="text-xs text-blue-600 font-medium mt-1">Agent: {fu.lead.agent.fullName}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => initiateCall(fu.lead)}
                      className="inline-flex items-center gap-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 font-semibold whitespace-nowrap"
                    >📞 Call</button>
                    <button onClick={() => openLead(fu.lead)} className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50">View</button>
                  </div>
                </div>
              );
            })}
          </div>

        ) : (
          /* ── NOT CONTACTED ── */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {notContactedError && (
              <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700">{notContactedError}</div>
            )}
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-600 flex-1 min-w-[220px]">
                AiSensy-tagged contacts with no logged call — {filteredNotContacted.length}{notContactedSearch ? ` of ${notContactedList.length}` : ""}
              </p>
              {notContactedLoading && <span className="text-xs text-slate-400">Refreshing…</span>}
              <div className="relative">
                <input
                  value={notContactedSearch}
                  onChange={(e) => setNotContactedSearch(e.target.value)}
                  placeholder="Search name, phone, tag, agent…"
                  className="border border-slate-200 rounded-lg text-xs px-3 py-1.5 w-56 focus:outline-none focus:border-blue-400"
                />
              </div>
              <select
                value={notContactedMonth}
                onChange={(e) => setNotContactedMonth(e.target.value)}
                className="border border-slate-200 rounded-lg text-xs px-2 py-1.5 bg-white"
                title="Filter by month the contact was tagged (createdOnAt) — call history checked is always full history"
              >
                <option value="">All time</option>
                {notContactedMonths.map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Name", "Phone", "Agent", "Tag", "Last Active", "Status", "Next Follow-up", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredNotContacted.map((c) => {
                    const overdue = c.nextFollowUp && new Date(c.nextFollowUp.scheduledAt) < new Date();
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{c.name?.trim() || `📞 ${c.phone}`}</p>
                          {c.leadId && (
                            <button onClick={() => openLeadById(c.leadId as string)} className="text-xs text-blue-500 hover:underline">Linked lead — view</button>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">{c.phone}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{c.agentName ?? "—"}</span></td>
                        <td className="px-4 py-3 text-xs text-slate-500">{c.tagRaw || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{c.lastActiveAt ? new Date(c.lastActiveAt).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="px-4 py-3">
                          <select value={c.status} onChange={(e) => updateContactStatus(c, e.target.value as LeadStatus)}
                            className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[c.status]}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {c.nextFollowUp ? (
                            <span className={`text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                              {overdue ? "⚠ " : ""}{new Date(c.nextFollowUp.scheduledAt).toLocaleDateString("en-IN")}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => { nativeMakeCall(c.phone).catch(() => { window.location.href = `tel:${c.phone}`; }); }}
                            className="inline-flex items-center gap-1 bg-green-600 text-white text-xs px-2 py-1 rounded-lg hover:bg-green-700 font-semibold mr-1"
                          >📞</button>
                          <button onClick={() => setShowContactCallModal(c)} className="text-xs border border-slate-200 text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 mr-1">Log</button>
                          <a href={`https://wa.me/91${c.phone}`} target="_blank" rel="noreferrer" className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-lg hover:bg-emerald-600 font-semibold">WA</a>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredNotContacted.length === 0 && !notContactedLoading && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      {notContactedError ? "" : notContactedList.length === 0 ? "Nothing to show — either no data has been imported yet, or everyone's been called 🎉" : "No matches for this filter"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── LEAD DETAIL DRAWER ── */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedLead(null)}>
          <div className="hidden sm:block flex-1 bg-black/40" />
          <div className="w-full sm:max-w-lg bg-white overflow-y-auto h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>

            {/* Sticky header with name + prev/next navigation */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-2 z-10">
              {/* Prev button */}
              <button
                onClick={() => navigateLead("prev")}
                disabled={!canNavPrev}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous lead"
              >‹</button>

              {/* Name + business */}
              <div className="flex-1 min-w-0 text-center">
                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                  {selectedLead.isHot && <span>🔥</span>}
                  <h2 className="text-base font-bold text-slate-900 truncate">{displayName(selectedLead)}</h2>
                </div>
                {selectedLead.businessName && selectedLead.name?.trim() && (
                  <p className="text-slate-500 text-xs truncate">{selectedLead.businessName}</p>
                )}
                {/* Lead position indicator */}
                {currentLeadIndex >= 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">{currentLeadIndex + 1} of {leads.length}</p>
                )}
              </div>

              {/* Next button */}
              <button
                onClick={() => navigateLead("next")}
                disabled={!canNavNext}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next lead"
              >›</button>

              {/* Close */}
              <button onClick={() => setSelectedLead(null)} className="flex-shrink-0 text-slate-400 hover:text-slate-600 text-xl font-bold p-1 ml-1">✕</button>
            </div>

            <div className="px-4 sm:px-6 py-5 space-y-5">
              {selectedLead.sharedWith && selectedLead.sharedWith.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm font-bold text-red-700 mb-1">⚠ Shared lead — other agents have this contact:</p>
                  {selectedLead.sharedWith.map((s: any) => (
                    <p key={s.id} className="text-xs text-red-600">• {s.agent.fullName} — {STATUS_LABELS[s.status as LeadStatus]}</p>
                  ))}
                </div>
              )}

              {/* Info grid — NOW INCLUDES NAME */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Name", selectedLead.name?.trim() || "—"],
                  ["Phone", selectedLead.phone],
                  ["Email", selectedLead.email ?? "—"],
                  ["City", selectedLead.city ?? "—"],
                  ["Product", selectedLead.productInterest ?? "—"],
                  ["Tags", selectedLead.tags?.length ? selectedLead.tags.join(", ") : "—"],
                  ["Est. Qty", selectedLead.estimatedQty ? selectedLead.estimatedQty.toLocaleString() : "—"],
                  ["Est. Value", selectedLead.estimatedValue ? `₹${selectedLead.estimatedValue.toLocaleString()}` : "—"],
                  ["Source", selectedLead.source],
                  ["Agent", selectedLead.agent.fullName],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-slate-400">{k}</p>
                    <p className="font-medium text-slate-800 break-all">{v}</p>
                  </div>
                ))}
              </div>

              {/* Score + status */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-1">Lead score</p>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${selectedLead.score >= 70 ? "bg-green-500" : selectedLead.score >= 40 ? "bg-amber-500" : "bg-slate-400"}`} style={{ width: `${selectedLead.score}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedLead.score}/100</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Status</p>
                  <select value={selectedLead.status} onChange={(e) => updateStatus(selectedLead.id, e.target.value as LeadStatus)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${STATUS_COLORS[selectedLead.status]}`}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>

              {/* Actions — big touch targets, Call uses initiateCall */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => initiateCall(selectedLead)}
                  className="text-center bg-green-600 text-white text-sm py-3 rounded-xl font-semibold hover:bg-green-700 active:bg-green-800"
                >📞 Call</button>
                <a href={`https://wa.me/91${selectedLead.phone}`} target="_blank" rel="noreferrer"
                  className="text-center bg-emerald-500 text-white text-sm py-3 rounded-xl font-semibold hover:bg-emerald-600">💬 WA</a>
                <button onClick={() => setShowCallModal(selectedLead)} className="border border-slate-200 text-slate-700 text-sm py-3 rounded-xl font-semibold hover:bg-slate-50">📋 Log</button>
              </div>
              <button onClick={(e) => deleteLead(selectedLead, e)} disabled={deletingLead === selectedLead.id} className="w-full border border-red-200 text-red-600 text-sm py-3 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-50">
                {deletingLead === selectedLead.id ? "Deleting..." : "Delete lead"}
              </button>

              {/* Add note */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Add note</p>
                <div className="flex gap-2">
                  <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type note…"
                    className="flex-1 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-blue-400"
                    onKeyDown={(e) => e.key === "Enter" && submitNote()} />
                  <button onClick={submitNote} className="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700 font-semibold">Add</button>
                </div>
              </div>

              {/* Follow-ups */}
              {selectedLead.followUps && selectedLead.followUps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Follow-up schedule</p>
                  <div className="space-y-1.5">
                    {selectedLead.followUps.map((fu) => (
                      <div key={fu.id} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${fu.status === "DONE" ? "bg-green-50 text-green-700" : new Date(fu.scheduledAt) < new Date() ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
                        <span>{fu.note ?? "Follow-up"}</span>
                        <span>{new Date(fu.scheduledAt).toLocaleDateString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity timeline */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Activity timeline</p>
                <div className="space-y-2">
                  {(selectedLead.activities ?? []).map((act) => (
                    <div key={act.id} className="flex gap-2.5 text-sm">
                      <span className="text-base flex-shrink-0">{ACTIVITY_ICONS[act.type] ?? "•"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-700">{act.description}</p>
                        <p className="text-xs text-slate-400">{act.createdBy.fullName} · {new Date(act.createdAt).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  ))}
                  {(selectedLead.activities ?? []).length === 0 && <p className="text-xs text-slate-400">No activity yet</p>}
                </div>
              </div>

              {/* Bottom nav for easy swiping through leads */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  onClick={() => navigateLead("prev")}
                  disabled={!canNavPrev}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed py-2 px-3 rounded-lg hover:bg-slate-50"
                >
                  ‹ Prev lead
                </button>
                <span className="text-xs text-slate-400">
                  {currentLeadIndex >= 0 ? `${currentLeadIndex + 1} / ${leads.length}` : ""}
                </span>
                <button
                  onClick={() => navigateLead("next")}
                  disabled={!canNavNext}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed py-2 px-3 rounded-lg hover:bg-slate-50"
                >
                  Next lead ›
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD LEAD MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Add new lead</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl p-1">✕</button>
            </div>
            <div className="p-4 sm:p-6 space-y-3">
              {[
                ["Name *", "name", "text", "Customer name"],
                ["Phone *", "phone", "tel", "10-digit mobile"],
                ["Email", "email", "email", "email@example.com"],
                ["Business name", "businessName", "text", "Shop / company"],
                ["City", "city", "text", "Nashik, Pune…"],
                ["Product interest", "productInterest", "text", "ENVELOPE, BOX, FILE…"],
                ["Tags", "tags", "text", "hot, urgent, repeat…"],
                ["Est. quantity", "estimatedQty", "number", "5000"],
                ["Est. value (₹)", "estimatedValue", "number", "2500"],
              ].map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">{label}</label>
                  <input type={type} placeholder={placeholder as string} value={(newLeadForm as any)[key]}
                    onChange={(e) => { setNewLeadForm((f) => ({ ...f, [key]: e.target.value })); if (key === "phone") checkDuplicate(e.target.value); }}
                    className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2.5 focus:outline-none focus:border-blue-400" />
                </div>
              ))}
              {duplicateAlert && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm font-bold text-red-700">This phone already exists!</p>
                  {duplicateAlert.agents.map((a: any, i: number) => (
                    <p key={i} className="text-xs text-red-600 mt-1">- {a.agentName} has this lead ({a.status})</p>
                  ))}
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Notes</label>
                <textarea rows={2} value={newLeadForm.notes} onChange={(e) => setNewLeadForm((f) => ({ ...f, notes: e.target.value }))} className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-blue-400 resize-none" />
              </div>
            </div>
            <div className="p-4 sm:p-6 border-t border-slate-200 flex gap-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
              <button onClick={createLead} className="flex-1 py-3 text-sm bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">Add lead</button>
            </div>
          </div>
        </div>
      )}

      {/* LOG CALL MODAL */}
      {showCallModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-0.5">Log call</h2>
            <p className="text-slate-800 font-semibold">{displayName(showCallModal)}</p>
            <p className="text-slate-500 text-sm mb-4">{showCallModal.phone}</p>
            <textarea value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="Call notes (optional)..." rows={3} className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 mb-4 focus:outline-none resize-none" />
            <p className="text-xs font-semibold text-slate-600 mb-2">Call outcome</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[["ANSWERED", "Answered", "bg-green-600"], ["BUSY", "Busy", "bg-amber-500"], ["NO_ANSWER", "No answer", "bg-red-500"]].map(([o, label, color]) => (
                <button key={o} onClick={() => submitCall(o)} className={`${color} text-white text-xs font-semibold py-3 rounded-xl hover:opacity-90`}>{label}</button>
              ))}
            </div>
            {dialerActive && (
              <p className="text-xs text-center text-orange-600 font-medium mb-2">Next lead will auto-dial after logging</p>
            )}
            <button onClick={() => setShowCallModal(null)} className="w-full text-sm text-slate-400 hover:text-slate-600 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* LOG CALL MODAL — not-contacted tab */}
      {showContactCallModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-0.5">Log call</h2>
            <p className="text-slate-800 font-semibold">{showContactCallModal.name?.trim() || showContactCallModal.phone}</p>
            <p className="text-slate-500 text-sm mb-4">{showContactCallModal.phone}</p>
            <textarea value={contactCallNote} onChange={(e) => setContactCallNote(e.target.value)} placeholder="Call notes (optional)..." rows={3} className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 mb-4 focus:outline-none resize-none" />
            <p className="text-xs font-semibold text-slate-600 mb-2">Call outcome</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[["ANSWERED", "Answered", "bg-green-600"], ["BUSY", "Busy", "bg-amber-500"], ["NO_ANSWER", "No answer", "bg-red-500"]].map(([o, label, color]) => (
                <button key={o} onClick={() => submitContactCall(o)} className={`${color} text-white text-xs font-semibold py-3 rounded-xl hover:opacity-90`}>{label}</button>
              ))}
            </div>
            <button onClick={() => { setShowContactCallModal(null); setContactCallNote(""); }} className="w-full text-sm text-slate-400 hover:text-slate-600 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Import leads from CSV</h2>
              <button onClick={() => { setShowImportModal(false); setImportResult(null); setCsvText(""); }} className="text-slate-400 hover:text-slate-600 font-bold text-xl p-1">X</button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-600">Required: name, phone</p>
                  <button onClick={() => { const blob = new Blob([CSV_SAMPLE], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads_sample.csv"; a.click(); }} className="text-xs text-blue-600 hover:underline font-medium">Download Sample</button>
                </div>
                <pre className="text-xs text-slate-500 overflow-x-auto">{CSV_SAMPLE.split("\n")[0]}</pre>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Upload CSV file</label>
                <div className="flex gap-2">
                  <button onClick={() => fileRef.current?.click()} className="border border-slate-300 rounded-lg text-sm px-4 py-2.5 text-slate-600 hover:bg-slate-50 font-medium">Choose file</button>
                  {csvText && <span className="text-xs text-green-600 self-center">Loaded</span>}
                </div>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Or paste CSV content</label>
                <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={CSV_SAMPLE} rows={5}
                  className="w-full border border-slate-200 rounded-lg text-xs px-3 py-2 font-mono focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                Duplicate detection is automatic. Agents will be notified of shared contacts.
              </div>
              {importResult && (
                <div className={`rounded-xl p-4 border text-sm ${importResult.errors?.length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                  <p className="font-bold mb-1">Import complete</p>
                  <p>Imported: <strong>{importResult.success}</strong></p>
                  {importResult.duplicates > 0 && <p>Duplicates: <strong>{importResult.duplicates}</strong></p>}
                  {importResult.skipped > 0 && <p>Skipped: <strong>{importResult.skipped}</strong></p>}
                  {importResult.errors?.slice(0, 5).map((e: string, i: number) => <p key={i} className="text-red-600 text-xs mt-1">{e}</p>)}
                </div>
              )}
            </div>
            <div className="p-4 sm:p-6 border-t border-slate-200 flex gap-2">
              <button onClick={() => { setShowImportModal(false); setImportResult(null); setCsvText(""); }} className="flex-1 py-3 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Close</button>
              <button onClick={runImport} disabled={importing || !csvText.trim()} className="flex-1 py-3 text-sm bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                {importing ? "Importing..." : "Import leads"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrmPage() {
  return (
    <DashboardShell>
      <CrmPageContent />
    </DashboardShell>
  );
}
