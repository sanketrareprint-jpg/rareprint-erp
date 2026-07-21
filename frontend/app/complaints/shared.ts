// frontend/app/complaints/shared.ts
// Shared types, constants and API helper for the Complaints module pages
// (list/board, detail, new-ticket). Not a route — plain helper module.
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export type ComplaintStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "PENDING_CUSTOMER"
  | "PENDING_VENDOR"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";

export type ComplaintPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ComplaintChannel = "WHATSAPP" | "CALL" | "EMAIL" | "WEB_PORTAL" | "WALK_IN" | "SALES_AGENT";

export type ComplaintCategory =
  | "PRODUCT_QUALITY"
  | "DELIVERY_DELAY"
  | "WRONG_ITEM"
  | "DAMAGED_IN_TRANSIT"
  | "DESIGN_ERROR"
  | "PRODUCTION_DEFECT"
  | "BILLING_DISPUTE"
  | "PAYMENT_ISSUE"
  | "VENDOR_ISSUE"
  | "SERVICE_COMPLAINT"
  | "OTHER";

export type ComplaintResolutionType =
  | "REPRINT"
  | "REFUND"
  | "PARTIAL_REFUND"
  | "REPLACEMENT"
  | "DISCOUNT_CREDIT"
  | "APOLOGY_ONLY"
  | "NO_FAULT_FOUND"
  | "GOODWILL";

export type ComplaintCommentVisibility = "INTERNAL" | "CUSTOMER";

export interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface ComplaintListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  category: ComplaintCategory;
  channel: ComplaintChannel;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  customerId: string;
  orderId?: string | null;
  assignedToId?: string | null;
  slaResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  customer: { businessName: string; phone: string | null };
  order?: { orderNumber: string } | null;
  assignedTo?: { id: string; fullName: string } | null;
  raisedBy?: { id: string; fullName: string } | null;
}

export interface ComplaintComment {
  id: string;
  authorName: string;
  visibility: ComplaintCommentVisibility;
  message: string;
  createdAt: string;
}

export interface ComplaintAttachment {
  id: string;
  url: string;
  fileName: string;
  fileType?: string | null;
  createdAt: string;
}

export interface ComplaintStatusLogEntry {
  id: string;
  fromStatus?: ComplaintStatus | null;
  toStatus: ComplaintStatus;
  changedById?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface ComplaintDetail extends ComplaintListItem {
  description: string;
  orderItemId?: string | null;
  productId?: string | null;
  assignedTeam?: string | null;
  raisedById?: string | null;
  resolutionType?: ComplaintResolutionType | null;
  resolutionNotes?: string | null;
  rootCause?: string | null;
  vendorId?: string | null;
  reopenCount: number;
  escalatedToAdmin: boolean;
  escalatedAt?: string | null;
  csatRating?: number | null;
  csatFeedback?: string | null;
  customer: { businessName: string; phone: string | null; email?: string | null };
  vendor?: { id: string; name: string } | null;
  comments: ComplaintComment[];
  attachments: ComplaintAttachment[];
  statusLogs: ComplaintStatusLogEntry[];
}

// ── Status graph — mirrors backend/src/complaints/complaints.calc.ts ────────
export const STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS", "PENDING_CUSTOMER", "PENDING_VENDOR"],
  IN_PROGRESS: ["PENDING_CUSTOMER", "PENDING_VENDOR", "RESOLVED"],
  PENDING_CUSTOMER: ["IN_PROGRESS", "RESOLVED"],
  PENDING_VENDOR: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED"],
};

export const KANBAN_COLUMNS: { key: ComplaintStatus; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "PENDING_CUSTOMER", label: "Pending Customer" },
  { key: "PENDING_VENDOR", label: "Pending Vendor" },
  { key: "RESOLVED", label: "Resolved" },
];

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  PENDING_CUSTOMER: "Pending Customer",
  PENDING_VENDOR: "Pending Vendor",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export const STATUS_COLORS: Record<ComplaintStatus, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  ASSIGNED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  PENDING_CUSTOMER: "bg-purple-50 text-purple-700",
  PENDING_VENDOR: "bg-purple-50 text-purple-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-200 text-slate-600",
  REOPENED: "bg-red-50 text-red-700",
};

export const PRIORITY_LABELS: Record<ComplaintPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_COLORS: Record<ComplaintPriority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  URGENT: "bg-red-50 text-red-700",
};

export const CHANNEL_LABELS: Record<ComplaintChannel, string> = {
  WHATSAPP: "WhatsApp",
  CALL: "Phone Call",
  EMAIL: "Email",
  WEB_PORTAL: "Web Portal",
  WALK_IN: "Walk-in",
  SALES_AGENT: "Sales Agent",
};

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  PRODUCT_QUALITY: "Product Quality",
  DELIVERY_DELAY: "Delivery Delay",
  WRONG_ITEM: "Wrong Item",
  DAMAGED_IN_TRANSIT: "Damaged in Transit",
  DESIGN_ERROR: "Design Error",
  PRODUCTION_DEFECT: "Production Defect",
  BILLING_DISPUTE: "Billing Dispute",
  PAYMENT_ISSUE: "Payment Issue",
  VENDOR_ISSUE: "Vendor Issue",
  SERVICE_COMPLAINT: "Service Complaint",
  OTHER: "Other",
};

export const RESOLUTION_LABELS: Record<ComplaintResolutionType, string> = {
  REPRINT: "Reprint",
  REFUND: "Full Refund",
  PARTIAL_REFUND: "Partial Refund",
  REPLACEMENT: "Replacement",
  DISCOUNT_CREDIT: "Discount / Credit",
  APOLOGY_ONLY: "Apology Only",
  NO_FAULT_FOUND: "No Fault Found",
  GOODWILL: "Goodwill Gesture",
};

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function isOverdue(item: Pick<ComplaintListItem, "status" | "slaResolutionDueAt">): boolean {
  if (!item.slaResolutionDueAt) return false;
  if (item.status === "RESOLVED" || item.status === "CLOSED") return false;
  return new Date(item.slaResolutionDueAt).getTime() < Date.now();
}

export async function complaintsApiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers ?? {}) },
  });
}
