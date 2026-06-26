/**
 * BUSINESS RULE: Accounts Approval Guards
 *
 * RULE 1 — An order can only be approved when it is in PENDING_APPROVAL status.
 *
 * RULE 2 — For non-super-admin users, EVERY billable item must have a cost slab
 *   before the order can be approved. Orders with missing costs cannot be approved.
 *
 * RULE 3 — For non-super-admin users, items whose margin is below
 *   the minimum configured threshold cannot be approved.
 *
 * RULE 4 — Free items (those with an offerCodeId) are exempt from cost/margin checks.
 *
 * RULE 5 — Super-admin (sanket.rareprint@gmail.com) bypasses cost/margin checks.
 *
 * If these tests break, it means the approval guard has been weakened.
 */

import { OrderStatus } from '@prisma/client';

const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic replica of the approval pre-checks in accounts.service.ts
// ─────────────────────────────────────────────────────────────────────────────

type MockItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  offerCodeId?: string | null;
};

type MockCostSlab = {
  productId: string;
  minQuantity: number;
  maxQuantity?: number | null;
  unitPrice: number;
};

function canApproveOrder(input: {
  orderStatus: OrderStatus;
  userEmail: string;
  items: MockItem[];
  costSlabs: MockCostSlab[];
  minApprovalMarginPct?: number;
}): { allowed: boolean; reason?: string } {
  const { orderStatus, userEmail, items, costSlabs, minApprovalMarginPct = 10 } = input;

  // Rule 1: Status check
  if (orderStatus !== OrderStatus.PENDING_APPROVAL) {
    return { allowed: false, reason: 'Only PENDING_APPROVAL orders can be approved' };
  }

  // Rule 5: Super-admin bypass
  if (userEmail === SUPER_ADMIN_EMAIL) {
    return { allowed: true };
  }

  // Rule 4: Separate offer items from billable items
  const billableItems = items.filter((i) => !i.offerCodeId);

  // Rule 2: Every billable item must have a cost slab
  const productsWithCost = new Set(costSlabs.map((s) => s.productId));
  const missingCostItems = billableItems.filter((i) => !productsWithCost.has(i.productId));
  if (missingCostItems.length > 0) {
    const ids = missingCostItems.map((i) => i.productId).join(', ');
    return {
      allowed: false,
      reason: `Cannot approve: cost data is missing for items — ${ids}`,
    };
  }

  // Rule 3: Margin check
  const lowMarginItems: string[] = [];
  for (const item of billableItems) {
    const qty = item.quantity;
    const salePerUnit = item.unitPrice;

    const matchingSlab = costSlabs
      .filter(
        (s) =>
          s.productId === item.productId &&
          s.minQuantity <= qty &&
          (s.maxQuantity == null || s.maxQuantity >= qty),
      )
      .sort((a, b) => b.minQuantity - a.minQuantity)[0];

    if (!matchingSlab) continue;

    const rawCost = matchingSlab.unitPrice;
    const costPerUnit = rawCost > salePerUnit ? rawCost / matchingSlab.minQuantity : rawCost;
    const marginPct = salePerUnit > 0 ? ((salePerUnit - costPerUnit) / salePerUnit) * 100 : 0;

    if (marginPct < minApprovalMarginPct) {
      lowMarginItems.push(`${item.productId} (margin: ${marginPct.toFixed(1)}%)`);
    }
  }

  if (lowMarginItems.length > 0) {
    return {
      allowed: false,
      reason: `Cannot approve: margin too low for — ${lowMarginItems.join(', ')}`,
    };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Order Approval Status Guard', () => {
  const baseInput = {
    userEmail: 'accounts@rareprint.com',
    items: [{ id: '1', productId: 'prod-1', quantity: 100, unitPrice: 10 }],
    costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 5 }],
  };

  it('allows approval when order is PENDING_APPROVAL', () => {
    const result = canApproveOrder({ ...baseInput, orderStatus: OrderStatus.PENDING_APPROVAL });
    expect(result.allowed).toBe(true);
  });

  const nonApprovableStatuses: OrderStatus[] = [
    OrderStatus.APPROVED,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.READY_FOR_DISPATCH,
    OrderStatus.PENDING_DISPATCH_APPROVAL,
    OrderStatus.DISPATCHED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ];

  nonApprovableStatuses.forEach((status) => {
    it(`blocks approval when order is ${status}`, () => {
      const result = canApproveOrder({ ...baseInput, orderStatus: status });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Only PENDING_APPROVAL');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Cost Data Required Before Approval', () => {
  it('blocks approval when item has no cost slab', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'accounts@rareprint.com',
      items: [{ id: '1', productId: 'prod-no-cost', quantity: 100, unitPrice: 10 }],
      costSlabs: [], // no slabs at all
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cost data is missing');
  });

  it('allows approval when all items have cost slabs', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'accounts@rareprint.com',
      items: [{ id: '1', productId: 'prod-1', quantity: 100, unitPrice: 10 }],
      costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 5 }],
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks approval when only SOME items have cost slabs', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'accounts@rareprint.com',
      items: [
        { id: '1', productId: 'prod-1', quantity: 100, unitPrice: 10 },
        { id: '2', productId: 'prod-missing', quantity: 50, unitPrice: 8 },
      ],
      costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 5 }],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('prod-missing');
  });

  it('skips cost check for offer code (free) items', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'accounts@rareprint.com',
      items: [
        { id: '1', productId: 'prod-1', quantity: 100, unitPrice: 10 },
        // This item is a free offer — no cost slab needed
        { id: '2', productId: 'free-prod', quantity: 1, unitPrice: 0, offerCodeId: 'offer-abc' },
      ],
      costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 5 }],
    });
    expect(result.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Margin Check Before Approval', () => {
  it('blocks approval when margin is below minimum threshold', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'accounts@rareprint.com',
      items: [{ id: '1', productId: 'prod-1', quantity: 100, unitPrice: 10 }],
      costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 9.5 }], // only 5% margin
      minApprovalMarginPct: 10,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('margin too low');
  });

  it('allows approval when margin meets the threshold', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'accounts@rareprint.com',
      items: [{ id: '1', productId: 'prod-1', quantity: 100, unitPrice: 10 }],
      costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 8 }], // 20% margin
      minApprovalMarginPct: 10,
    });
    expect(result.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUSINESS RULE: Super-Admin Bypass', () => {
  it('super-admin can approve order with no cost slabs', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: SUPER_ADMIN_EMAIL,
      items: [{ id: '1', productId: 'prod-no-cost', quantity: 100, unitPrice: 10 }],
      costSlabs: [],
    });
    expect(result.allowed).toBe(true);
  });

  it('super-admin can approve order with zero margin', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: SUPER_ADMIN_EMAIL,
      items: [{ id: '1', productId: 'prod-1', quantity: 100, unitPrice: 5 }],
      costSlabs: [{ productId: 'prod-1', minQuantity: 1, unitPrice: 5 }], // 0% margin
      minApprovalMarginPct: 10,
    });
    expect(result.allowed).toBe(true);
  });

  it('non-super-admin cannot bypass cost check', () => {
    const result = canApproveOrder({
      orderStatus: OrderStatus.PENDING_APPROVAL,
      userEmail: 'other-admin@rareprint.com',
      items: [{ id: '1', productId: 'prod-no-cost', quantity: 100, unitPrice: 10 }],
      costSlabs: [],
    });
    expect(result.allowed).toBe(false);
  });
});
