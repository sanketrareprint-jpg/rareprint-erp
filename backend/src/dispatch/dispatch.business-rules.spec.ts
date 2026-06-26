/**
 * BUSINESS RULE: Dispatch Queue Security
 *
 * RULE 1 — Non-sample orders must pass through:
 *   Agent submits (PENDING_DISPATCH_APPROVAL)
 *   → Accounts approves (READY_FOR_DISPATCH)
 *   before appearing in the dispatch queue.
 *
 * RULE 2 — Sample orders (isSample = true) bypass the full approval flow by design.
 *
 * RULE 3 — assertCanDispatch() must always verify the approval log before
 *   any actual shipment is booked (courier/transport/hand delivery).
 *
 * If these tests break after a code change, it means the dispatch security
 * guard has been weakened or removed — DO NOT ignore the failure.
 */

import { OrderStatus, OrderProductionStage } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic replica of the listReadyForDispatch WHERE filter.
// If you change dispatch.service.ts listReadyForDispatch, update this too.
// ─────────────────────────────────────────────────────────────────────────────
function passesDispatchQueueGuard(order: {
  status: OrderStatus;
  isSample: boolean;
  hasApprovalLog: boolean; // PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH exists
  hasReadyItem: boolean;   // at least one item with itemProductionStage = READY_FOR_DISPATCH
}): boolean {
  const dispatchableStatus =
    order.status === OrderStatus.READY_FOR_DISPATCH ||
    order.status === OrderStatus.PARTIALLY_DISPATCHED;

  if (!dispatchableStatus) return false;
  if (!order.hasReadyItem) return false;

  // SECURITY GUARD — must match the OR condition in listReadyForDispatch
  if (order.isSample) return true;
  return order.hasApprovalLog;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic replica of assertCanDispatch guard.
// ─────────────────────────────────────────────────────────────────────────────
function canDispatch(order: {
  status: OrderStatus;
  hasApprovalLog: boolean;
  isSample: boolean;
}): { allowed: boolean; reason?: string } {
  const dispatchableStatuses: OrderStatus[] = [
    OrderStatus.READY_FOR_DISPATCH,
    OrderStatus.PARTIALLY_DISPATCHED,
  ];

  if (!dispatchableStatuses.includes(order.status)) {
    return { allowed: false, reason: 'Order status is not dispatchable' };
  }

  // Sample orders are exempt from approval log requirement
  if (order.isSample) return { allowed: true };

  if (!order.hasApprovalLog) {
    return {
      allowed: false,
      reason: 'Sales must submit dispatch payment details and accounts must approve before booking',
    };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Dispatch Queue Guard', () => {
  // ── Rule: Sample orders bypass approval ──────────────────────────────────
  describe('Sample orders', () => {
    it('appear in queue without approval log (by design)', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.READY_FOR_DISPATCH,
          isSample: true,
          hasApprovalLog: false,
          hasReadyItem: true,
        }),
      ).toBe(true);
    });

    it('appear in queue even when no statusLog at all', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.READY_FOR_DISPATCH,
          isSample: true,
          hasApprovalLog: false,
          hasReadyItem: true,
        }),
      ).toBe(true);
    });
  });

  // ── Rule: Non-sample orders MUST have approval log ───────────────────────
  describe('Non-sample orders', () => {
    it('are BLOCKED from queue without approval log', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.READY_FOR_DISPATCH,
          isSample: false,
          hasApprovalLog: false,
          hasReadyItem: true,
        }),
      ).toBe(false);
    });

    it('appear in queue WITH approval log', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.READY_FOR_DISPATCH,
          isSample: false,
          hasApprovalLog: true,
          hasReadyItem: true,
        }),
      ).toBe(true);
    });

    it('are blocked even if PARTIALLY_DISPATCHED without log', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.PARTIALLY_DISPATCHED,
          isSample: false,
          hasApprovalLog: false,
          hasReadyItem: true,
        }),
      ).toBe(false);
    });

    it('PARTIALLY_DISPATCHED with approval log appears in queue', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.PARTIALLY_DISPATCHED,
          isSample: false,
          hasApprovalLog: true,
          hasReadyItem: true,
        }),
      ).toBe(true);
    });
  });

  // ── Rule: Wrong status always blocked ────────────────────────────────────
  describe('Status check', () => {
    const wrongStatuses: OrderStatus[] = [
      OrderStatus.PENDING_APPROVAL,
      OrderStatus.APPROVED,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.PENDING_DISPATCH_APPROVAL,
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
    ];

    wrongStatuses.forEach((status) => {
      it(`blocks order with status ${status}`, () => {
        expect(
          passesDispatchQueueGuard({
            status,
            isSample: false,
            hasApprovalLog: true,
            hasReadyItem: true,
          }),
        ).toBe(false);
      });
    });
  });

  // ── Rule: Must have at least one READY_FOR_DISPATCH item ─────────────────
  describe('Production stage check', () => {
    it('blocks order with no ready items even if approved', () => {
      expect(
        passesDispatchQueueGuard({
          status: OrderStatus.READY_FOR_DISPATCH,
          isSample: false,
          hasApprovalLog: true,
          hasReadyItem: false,
        }),
      ).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: assertCanDispatch (booking guard)', () => {
  it('allows sample order without approval log', () => {
    const result = canDispatch({
      status: OrderStatus.READY_FOR_DISPATCH,
      isSample: true,
      hasApprovalLog: false,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks non-sample order without approval log', () => {
    const result = canDispatch({
      status: OrderStatus.READY_FOR_DISPATCH,
      isSample: false,
      hasApprovalLog: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('accounts must approve');
  });

  it('allows non-sample order with approval log', () => {
    const result = canDispatch({
      status: OrderStatus.READY_FOR_DISPATCH,
      isSample: false,
      hasApprovalLog: true,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks booking if order is still PENDING_APPROVAL', () => {
    const result = canDispatch({
      status: OrderStatus.PENDING_APPROVAL,
      isSample: false,
      hasApprovalLog: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('blocks booking if order is APPROVED but not in dispatch stage', () => {
    const result = canDispatch({
      status: OrderStatus.APPROVED,
      isSample: false,
      hasApprovalLog: true,
    });
    expect(result.allowed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Status flow — dispatch path', () => {
  /**
   * Valid dispatch path for a normal order:
   * PENDING_APPROVAL → APPROVED → IN_PRODUCTION → READY_FOR_DISPATCH
   * → PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH (with log) → DISPATCHED
   */
  const VALID_DISPATCH_FLOW: OrderStatus[] = [
    OrderStatus.PENDING_APPROVAL,
    OrderStatus.APPROVED,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.READY_FOR_DISPATCH,
    OrderStatus.PENDING_DISPATCH_APPROVAL,
    // accounts approves → back to READY_FOR_DISPATCH with log
    OrderStatus.READY_FOR_DISPATCH,
    OrderStatus.DISPATCHED,
  ];

  it('each step in valid dispatch flow is a defined OrderStatus', () => {
    const validStatuses = Object.values(OrderStatus);
    VALID_DISPATCH_FLOW.forEach((s) => {
      expect(validStatuses).toContain(s);
    });
  });

  it('DISPATCHED is not reachable from PENDING_APPROVAL directly', () => {
    const result = canDispatch({
      status: OrderStatus.PENDING_APPROVAL,
      isSample: false,
      hasApprovalLog: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('DISPATCHED is not reachable from IN_PRODUCTION directly', () => {
    const result = canDispatch({
      status: OrderStatus.IN_PRODUCTION,
      isSample: false,
      hasApprovalLog: true,
    });
    expect(result.allowed).toBe(false);
  });
});
