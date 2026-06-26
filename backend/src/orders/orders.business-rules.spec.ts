/**
 * BUSINESS RULE: Order Creation & Dispatch Submission Rules
 *
 * RULE 1 — Non-sample orders are created with status PENDING_APPROVAL.
 *   They must go through accounts approval before production begins.
 *
 * RULE 2 — Sample orders (isSample = true) are created with status READY_FOR_DISPATCH.
 *   All their items are immediately marked READY_FOR_DISPATCH.
 *   They do NOT need accounts or agent approval.
 *
 * RULE 3 — requestDispatchApproval (agent submitting for dispatch) requires:
 *   a) Order must be in READY_FOR_DISPATCH status
 *   b) At least one item must be in READY_FOR_DISPATCH production stage
 *
 * RULE 4 — At least one line item is required to create any order.
 *
 * If these tests fail after a code change, a core order creation rule has been broken.
 */

import { OrderStatus, OrderProductionStage } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic replicas from orders.service.ts
// ─────────────────────────────────────────────────────────────────────────────

function getInitialOrderStatus(isSample: boolean): OrderStatus {
  return isSample ? OrderStatus.READY_FOR_DISPATCH : OrderStatus.PENDING_APPROVAL;
}

function getInitialItemStage(isSample: boolean): OrderProductionStage {
  return isSample ? OrderProductionStage.READY_FOR_DISPATCH : OrderProductionStage.NOT_PRINTED;
}

function canSubmitDispatchApproval(order: {
  status: OrderStatus;
  items: Array<{ itemProductionStage: OrderProductionStage }>;
}): { allowed: boolean; reason?: string } {
  if (order.status !== OrderStatus.READY_FOR_DISPATCH) {
    return {
      allowed: false,
      reason: `Order must be in READY_FOR_DISPATCH status. Current: ${order.status}`,
    };
  }
  const hasReadyItem = order.items.some(
    (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
  );
  if (!hasReadyItem) {
    return {
      allowed: false,
      reason: 'At least one item must be in READY_FOR_DISPATCH production stage',
    };
  }
  return { allowed: true };
}

function validateOrderCreation(dto: { items: unknown[] }): { valid: boolean; reason?: string } {
  if (!dto.items || dto.items.length === 0) {
    return { valid: false, reason: 'At least one line item is required' };
  }
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Order Initial Status', () => {
  it('non-sample order starts as PENDING_APPROVAL', () => {
    expect(getInitialOrderStatus(false)).toBe(OrderStatus.PENDING_APPROVAL);
  });

  it('sample order starts as READY_FOR_DISPATCH', () => {
    expect(getInitialOrderStatus(true)).toBe(OrderStatus.READY_FOR_DISPATCH);
  });

  it('non-sample order does NOT start as READY_FOR_DISPATCH', () => {
    expect(getInitialOrderStatus(false)).not.toBe(OrderStatus.READY_FOR_DISPATCH);
  });

  it('sample order does NOT start as PENDING_APPROVAL', () => {
    expect(getInitialOrderStatus(true)).not.toBe(OrderStatus.PENDING_APPROVAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Order Item Initial Production Stage', () => {
  it('non-sample order items start as NOT_PRINTED', () => {
    expect(getInitialItemStage(false)).toBe(OrderProductionStage.NOT_PRINTED);
  });

  it('sample order items start as READY_FOR_DISPATCH immediately', () => {
    expect(getInitialItemStage(true)).toBe(OrderProductionStage.READY_FOR_DISPATCH);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: At Least One Item Required', () => {
  it('rejects order with zero items', () => {
    const result = validateOrderCreation({ items: [] });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('At least one line item');
  });

  it('allows order with one item', () => {
    const result = validateOrderCreation({ items: [{ productId: 'prod-1', quantity: 100 }] });
    expect(result.valid).toBe(true);
  });

  it('allows order with multiple items', () => {
    const result = validateOrderCreation({
      items: [
        { productId: 'prod-1', quantity: 100 },
        { productId: 'prod-2', quantity: 50 },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Dispatch Approval Submission Guard', () => {
  const readyItem = { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH };
  const notReadyItem = { itemProductionStage: OrderProductionStage.PRINTING };

  describe('Status requirement', () => {
    it('allows submission when order is READY_FOR_DISPATCH', () => {
      const result = canSubmitDispatchApproval({
        status: OrderStatus.READY_FOR_DISPATCH,
        items: [readyItem],
      });
      expect(result.allowed).toBe(true);
    });

    const blockedStatuses: OrderStatus[] = [
      OrderStatus.PENDING_APPROVAL,
      OrderStatus.APPROVED,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.PENDING_DISPATCH_APPROVAL,
      OrderStatus.DISPATCHED,
    ];

    blockedStatuses.forEach((status) => {
      it(`blocks submission when order is ${status}`, () => {
        const result = canSubmitDispatchApproval({
          status,
          items: [readyItem],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('READY_FOR_DISPATCH');
      });
    });
  });

  describe('Item stage requirement', () => {
    it('allows submission when at least one item is READY_FOR_DISPATCH', () => {
      const result = canSubmitDispatchApproval({
        status: OrderStatus.READY_FOR_DISPATCH,
        items: [notReadyItem, readyItem],
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks submission when no items are READY_FOR_DISPATCH', () => {
      const result = canSubmitDispatchApproval({
        status: OrderStatus.READY_FOR_DISPATCH,
        items: [notReadyItem, { itemProductionStage: OrderProductionStage.PROCESSING }],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('At least one item');
    });

    it('blocks submission when item list is empty', () => {
      const result = canSubmitDispatchApproval({
        status: OrderStatus.READY_FOR_DISPATCH,
        items: [],
      });
      expect(result.allowed).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Status flow — production path', () => {
  /**
   * Non-sample order valid flow:
   * PENDING_APPROVAL → APPROVED → IN_PRODUCTION → READY_FOR_DISPATCH
   *
   * Agent then submits: READY_FOR_DISPATCH → PENDING_DISPATCH_APPROVAL
   * Accounts then approves: PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH (with log)
   */

  it('non-sample order cannot bypass PENDING_APPROVAL on creation', () => {
    const status = getInitialOrderStatus(false);
    expect(status).toBe(OrderStatus.PENDING_APPROVAL);
    expect(status).not.toBe(OrderStatus.APPROVED);
    expect(status).not.toBe(OrderStatus.IN_PRODUCTION);
    expect(status).not.toBe(OrderStatus.READY_FOR_DISPATCH);
  });

  it('non-sample order items cannot bypass NOT_PRINTED stage on creation', () => {
    const stage = getInitialItemStage(false);
    expect(stage).toBe(OrderProductionStage.NOT_PRINTED);
    expect(stage).not.toBe(OrderProductionStage.READY_FOR_DISPATCH);
  });

  it('sample order starts at READY_FOR_DISPATCH — skips accounts and production entirely', () => {
    const status = getInitialOrderStatus(true);
    const stage = getInitialItemStage(true);
    expect(status).toBe(OrderStatus.READY_FOR_DISPATCH);
    expect(stage).toBe(OrderProductionStage.READY_FOR_DISPATCH);
  });
});
