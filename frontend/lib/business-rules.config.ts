/**
 * ═══════════════════════════════════════════════════════════════
 *  RAREPRINT ERP — BUSINESS RULES MASTER CONFIG
 * ═══════════════════════════════════════════════════════════════
 *
 *  This is the ONE file where all business rules are defined.
 *  Add, remove, or edit rules here — the dashboard page at
 *  /business-rules will show the updated list automatically.
 *
 *  HOW TO ADD A RULE:
 *  1. Copy any existing rule block below
 *  2. Change the id, title, description, and module
 *  3. Save the file — it will appear on the dashboard
 *
 *  FIELDS:
 *  - id          : unique code (e.g. "DISPATCH-004")
 *  - module      : which department owns this rule
 *  - title       : short name of the rule (shown as heading)
 *  - description : plain English explanation of the rule
 *  - example     : real example of what happens if rule is broken
 *  - severity    : CRITICAL / HIGH / MEDIUM
 *  - testedBy    : filename of the test that enforces this rule
 * ═══════════════════════════════════════════════════════════════
 */

export type RuleSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
export type RuleModule = "ORDERS" | "ACCOUNTS" | "PRODUCTION" | "DISPATCH" | "SYSTEM";

export interface BusinessRule {
  id: string;
  module: RuleModule;
  title: string;
  description: string;
  example: string;
  severity: RuleSeverity;
  testedBy: string;
  active: boolean;
}

export const BUSINESS_RULES: BusinessRule[] = [

  // ── ORDERS MODULE ───────────────────────────────────────────────────────────

  {
    id: "ORDERS-001",
    module: "ORDERS",
    title: "Non-sample order must start as PENDING APPROVAL",
    description:
      "When a sales agent creates a new order, it must go to accounts for approval first. It cannot jump directly to production or dispatch.",
    example:
      "Agent creates order for Monu Paan → order goes to accounts. Accounts checks cost and approves. Only then production begins.",
    severity: "CRITICAL",
    testedBy: "orders.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ORDERS-002",
    module: "ORDERS",
    title: "Sample order bypasses approval and goes directly to dispatch",
    description:
      "Sample kit orders (isSample = true) skip accounts and production approval entirely. They are created directly in READY_FOR_DISPATCH status.",
    example:
      "Agent creates a sample kit → immediately appears in dispatch queue. No accounts or agent approval needed.",
    severity: "HIGH",
    testedBy: "orders.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ORDERS-003",
    module: "ORDERS",
    title: "At least one product item required to create an order",
    description:
      "An order cannot be saved with zero items. Every order must have at least one product line.",
    example:
      "If agent tries to submit an empty order, the system must reject it with an error.",
    severity: "HIGH",
    testedBy: "orders.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ORDERS-004",
    module: "ORDERS",
    title: "Agent can only submit dispatch approval when order is READY FOR DISPATCH",
    description:
      "The agent's 'Submit for Dispatch' button only works when the order is in READY_FOR_DISPATCH status AND at least one item has completed production.",
    example:
      "Agent tries to submit dispatch for an IN_PRODUCTION order → system blocks it.",
    severity: "CRITICAL",
    testedBy: "orders.business-rules.spec.ts",
    active: true,
  },

  // ── ACCOUNTS MODULE ─────────────────────────────────────────────────────────

  {
    id: "ACCOUNTS-001",
    module: "ACCOUNTS",
    title: "Only PENDING APPROVAL orders can be approved by accounts",
    description:
      "Accounts can only approve orders that are waiting for approval. Orders already approved, in production, or dispatched cannot be re-approved.",
    example:
      "Accounts tries to approve an APPROVED order again → system blocks it.",
    severity: "CRITICAL",
    testedBy: "accounts.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ACCOUNTS-002",
    module: "ACCOUNTS",
    title: "Cost slab required for every item before accounts can approve",
    description:
      "If any product in the order does not have a cost defined in the Cost Table, accounts cannot approve the order. Cost data must be added first.",
    example:
      "Order has 3 items. One product has no cost slab → accounts sees error 'cost data missing' and cannot approve.",
    severity: "CRITICAL",
    testedBy: "accounts.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ACCOUNTS-003",
    module: "ACCOUNTS",
    title: "Item margin must meet minimum threshold before approval",
    description:
      "If the profit margin of any item is below the configured minimum percentage, accounts cannot approve the order. The sale price must be increased or cost reduced.",
    example:
      "Item selling at ₹10, cost is ₹9.5 → only 5% margin. Minimum is 10% → accounts blocked from approving.",
    severity: "HIGH",
    testedBy: "accounts.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ACCOUNTS-004",
    module: "ACCOUNTS",
    title: "Free items (offer code) skip cost and margin check",
    description:
      "Items added using an offer code are free promotional items. They have no cost/margin requirement and are excluded from approval checks.",
    example:
      "Order has 2 regular items + 1 free item from offer code → only the 2 regular items need cost slabs.",
    severity: "MEDIUM",
    testedBy: "accounts.business-rules.spec.ts",
    active: true,
  },

  {
    id: "ACCOUNTS-005",
    module: "ACCOUNTS",
    title: "Super-admin can approve any order without restrictions",
    description:
      "The super-admin account (sanket.rareprint@gmail.com) bypasses cost and margin checks and can approve any order in PENDING_APPROVAL status.",
    example:
      "Sanket approves order with no cost slabs → allowed. Regular accounts user tries same → blocked.",
    severity: "MEDIUM",
    testedBy: "accounts.business-rules.spec.ts",
    active: true,
  },

  // ── DISPATCH MODULE ─────────────────────────────────────────────────────────

  {
    id: "DISPATCH-001",
    module: "DISPATCH",
    title: "Non-sample orders must have dispatch approval log to appear in queue",
    description:
      "The dispatch queue must only show non-sample orders that have a status log entry showing: PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH. Orders that went directly to READY_FOR_DISPATCH via production (without agent + accounts dispatch approval) must NOT appear.",
    example:
      "Monu Paan order: production marks all items done → order becomes READY_FOR_DISPATCH but agent never submitted for dispatch → must NOT appear in dispatch queue.",
    severity: "CRITICAL",
    testedBy: "dispatch.business-rules.spec.ts",
    active: true,
  },

  {
    id: "DISPATCH-002",
    module: "DISPATCH",
    title: "Sample orders appear in dispatch queue without approval",
    description:
      "Sample kit orders bypass the entire agent + accounts dispatch approval flow by design. They appear in the dispatch queue immediately after creation.",
    example:
      "Sample kit for client demo created → immediately visible in dispatch queue for courier booking.",
    severity: "HIGH",
    testedBy: "dispatch.business-rules.spec.ts",
    active: true,
  },

  {
    id: "DISPATCH-003",
    module: "DISPATCH",
    title: "Shipment booking requires dispatch approval log (non-sample)",
    description:
      "Even if an order appears in the dispatch queue, the actual shipment booking (courier/transport/hand delivery) is blocked unless there is a proof that accounts approved the dispatch.",
    example:
      "Dispatch team tries to book Shiprocket for an unapproved order → system throws error 'Sales must submit payment details and accounts must approve first'.",
    severity: "CRITICAL",
    testedBy: "dispatch.business-rules.spec.ts",
    active: true,
  },

  {
    id: "DISPATCH-004",
    module: "DISPATCH",
    title: "Only READY_FOR_DISPATCH or PARTIALLY_DISPATCHED orders can be booked",
    description:
      "Dispatch team cannot book shipment for orders in any other status like APPROVED, IN_PRODUCTION, or PENDING_APPROVAL.",
    example:
      "Order is IN_PRODUCTION → dispatch team cannot see or book it even if they try directly.",
    severity: "CRITICAL",
    testedBy: "dispatch.business-rules.spec.ts",
    active: true,
  },

  {
    id: "DISPATCH-005",
    module: "DISPATCH",
    title: "Order must have at least one READY_FOR_DISPATCH item to appear in queue",
    description:
      "Even if the order status is READY_FOR_DISPATCH, it must have at least one item whose production stage is also READY_FOR_DISPATCH.",
    example:
      "Order with 3 items: all still in PRINTING stage → does not appear in dispatch queue despite order status.",
    severity: "HIGH",
    testedBy: "dispatch.business-rules.spec.ts",
    active: true,
  },

];

// ─── Helper: group rules by module ───────────────────────────────────────────
export function getRulesByModule(): Record<RuleModule, BusinessRule[]> {
  const grouped: Record<RuleModule, BusinessRule[]> = {
    ORDERS: [],
    ACCOUNTS: [],
    PRODUCTION: [],
    DISPATCH: [],
    SYSTEM: [],
  };
  for (const rule of BUSINESS_RULES) {
    grouped[rule.module].push(rule);
  }
  return grouped;
}

export function getRuleStats() {
  const active = BUSINESS_RULES.filter((r) => r.active);
  return {
    total: BUSINESS_RULES.length,
    active: active.length,
    critical: active.filter((r) => r.severity === "CRITICAL").length,
    high: active.filter((r) => r.severity === "HIGH").length,
    medium: active.filter((r) => r.severity === "MEDIUM").length,
  };
}
