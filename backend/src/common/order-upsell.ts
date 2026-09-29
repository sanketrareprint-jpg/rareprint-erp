import { OrderStatus } from '@prisma/client';

// Shared by OrdersService.requestUpsell (seller submits) and
// AccountsService.approveUpsell (re-checked at approval time, since the
// order can move on while the request waits).

// Only orders Accounts has already approved and that haven't entered the
// dispatch pipeline. PENDING_APPROVAL orders use the normal Edit Order page;
// PENDING_DISPATCH_APPROVAL / PARTIALLY_DISPATCHED and later would mean
// raising an order that is already (partly) on its way out.
export const UPSELL_ELIGIBLE_STATUSES: OrderStatus[] = [
  OrderStatus.APPROVED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY_FOR_DISPATCH,
];

// Existing item whose qty and/or rate is raised. from* is the item as it was
// when the seller submitted — approval refuses if the item changed since.
export type UpsellItemChange = {
  itemId: string;
  productName: string;
  fromQuantity: number;
  fromUnitPrice: number;
  fromLineTotal: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type UpsellNewItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productionNotes: string;
  artworkNotes: string | null;
};

// Stored in Order.pendingUpsell while the request waits for Accounts.
export type PendingUpsell = {
  requestedById: string;
  oldGrandTotal: number;
  addedAmount: number;
  itemChanges: UpsellItemChange[];
  newItems: UpsellNewItem[];
};

// Why this order can't take an upsell right now, or null if it can.
export function upsellBlockReason(order: {
  status: OrderStatus;
  isSample: boolean;
  isParcelBooking: boolean;
  cancellationRequestedAt?: Date | null;
  items: { dispatchedAt?: Date | null }[];
}): string | null {
  if (order.isSample || order.isParcelBooking) return 'Sample and parcel-booking orders cannot be upsold';
  if (!UPSELL_ELIGIBLE_STATUSES.includes(order.status)) {
    return `Order status is ${order.status} — only Approved, In Production or Ready for Dispatch orders can be upsold`;
  }
  if (order.items.some((i) => i.dispatchedAt)) return 'Some items on this order have already been dispatched';
  if (order.cancellationRequestedAt) return 'A cancellation request is pending on this order';
  return null;
}
