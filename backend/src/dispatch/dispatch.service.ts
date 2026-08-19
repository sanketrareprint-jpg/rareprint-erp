// backend/src/dispatch/dispatch.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderProductionStage, OrderStatus, PaymentVerificationStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShiprocketService, type ShiprocketPickupLocation } from '../shiprocket/shiprocket.service';
import { BigshipService, bigshipTotalBoxCount, type BigshipPackageBox } from '../bigship/bigship.service';
import { CarrierConfigService } from '../carrier-config/carrier-config.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
// Reuse the already-proven Bigship "Delivered Orders Report" parsing/matching
// helpers from the remittance importer instead of re-deriving them — same
// file format (see remittance.service.ts header comment), same courier
// quirks (RP-prefixed channel ids, stray leading zeros, .0 suffix on
// numeric-looking AWBs pulled from Excel, etc.).
import { sheetToObjects, normalizeAwb, deriveOrderNumberCandidates, normalizeMobile, parseFlexibleDate } from '../remittance/remittance.service';

type LocalRateQuote = {
  rateId: string;
  carrierName: string;
  amount: number;
  currency: string;
  estimatedDays: number;
};
type SelectedRateQuote = Partial<LocalRateQuote> & { rateId: string };
type DispatchPackageBox = {
  noOfBoxes?: number;
  length?: number;
  breadth?: number;
  height?: number;
  weight?: number;
};
type TransportDispatchInput = {
  orderId: string;
  itemIds: string[];
  transportName?: string;
  lrNumber?: string;
  transportChargesType?: string;
  transportBy?: string;
  totalTransportCharges?: number;
  notes?: string;
};
type DirectDispatchInput = {
  orderId: string;
  itemIds: string[];
  dispatchType: 'BY_HAND' | 'SELF_COLLECTED';
  deliveryBoyName?: string;
  collectedByName?: string;
  collectedByPhone?: string;
  otp?: string;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function extractPincode(address?: string | null): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

/** A valid Indian PIN code is exactly 6 digits — nothing more, nothing less. */
function isValidIndianPincode(pin?: string | null): pin is string {
  return !!pin && /^\d{6}$/.test(pin.trim());
}

function splitAddressForShiprocket(customer: {
  shippingAddress: string | null;
  billingAddress: string | null;
  businessName: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): { line: string; city: string; state: string; pincode: string } {
  const raw = customer.shippingAddress?.trim() || customer.billingAddress?.trim() || customer.businessName;
  // The stored customer.pincode field is trusted blindly here previously — if it
  // held anything truthy but malformed (wrong digit count, stray characters, a
  // half-entered value, etc.) it went straight to the courier API as-is, which is
  // exactly what produces "MasterOrderShippingZipCode ... is invalid" from Bigship
  // after burning through all retry attempts. Now it's validated as a real 6-digit
  // PIN before being trusted; a bad stored value falls through to extracting one
  // from the free-text address, then to the Delhi default, same as an empty field
  // always did.
  const storedPin = customer.pincode?.trim();
  const pin = (isValidIndianPincode(storedPin) ? storedPin : null) ?? extractPincode(raw) ?? '110001';
  const city = customer.city?.trim() || '';
  const state = customer.state?.trim() || '';
  // Use the raw address as the line (strip pincode if present)
  const line = raw.replace(/\b\d{6}\b/, '').replace(/,\s*$/, '').trim() || 'Address';
  return { line, city, state, pincode: pin };
}

function parseProductionNotes(notes?: string | null) {
  if (!notes) return { size: null, gsm: null, sides: null };
  const size  = notes.match(/Size:\s*([^,|]+)/)?.[1]?.trim() ?? null;
  const gsm   = notes.match(/GSM:\s*([^,|]+)/)?.[1]?.trim() ?? null;
  const sides = notes.match(/Sides:\s*([^,|]+)/)?.[1]?.trim() ?? null;
  return { size, gsm, sides };
}

function parseDispatchType(notes?: string | null): 'COURIER' | 'TRANSPORT' | 'BY_HAND' | 'SELF_COLLECTED' {
  const text = notes ?? '';
  if (/Self\s+Collected/i.test(text)) return 'SELF_COLLECTED';
  if (/By\s+Hand/i.test(text)) return 'BY_HAND';
  if (/Transport:/i.test(text)) return 'TRANSPORT';
  if (/Courier:/i.test(text) || /Courier\s+charges/i.test(text)) return 'COURIER';
  return 'COURIER';
}

/** Maps Bigship's free-text status/tag strings (e.g. "In-Transit", "Rider Assigned",
 *  "RTO", "Delivered") onto our own ShipmentStatus enum. Bigship doesn't document a
 *  fixed enum of status strings across segments, so this matches on keywords rather
 *  than an exact list. Returns null (no change) for anything unrecognized rather than
 *  guessing wrong and overwriting a status we can't confidently map. */
function mapBigshipStatusToShipmentStatus(rawStatus?: string): ShipmentStatus | null {
  if (!rawStatus) return null;
  const s = rawStatus.toLowerCase();
  if (/cancel/.test(s)) return ShipmentStatus.CANCELLED;
  if (/rto|return/.test(s)) return ShipmentStatus.RETURNED;
  if (/deliver/.test(s)) return ShipmentStatus.DELIVERED;
  if (/transit|pickup|rider|shipped|manifest|dispatch|out for/.test(s)) return ShipmentStatus.IN_TRANSIT;
  return null;
}

function parseBigshipRateId(rateId: string): { masterCustomOrderId: string; courierId: number } | null {
  if (rateId.startsWith('bs:')) {
    const [, encodedOrderId, courierIdText] = rateId.split(':');
    const courierId = Number(courierIdText);
    if (encodedOrderId && Number.isFinite(courierId) && courierId > 0) {
      return { masterCustomOrderId: decodeURIComponent(encodedOrderId), courierId };
    }
  }

  if (rateId.startsWith('bs-')) {
    const courierId = Number(rateId.replace(/^bs-/, ''));
    if (Number.isFinite(courierId) && courierId > 0) {
      return { masterCustomOrderId: '', courierId };
    }
  }

  return null;
}

function sanitizeSelectedRateQuote(rateId: string, quote?: SelectedRateQuote): LocalRateQuote | null {
  if (!quote || quote.rateId !== rateId) return null;
  const amount = Number(quote.amount);
  const estimatedDays = Number(quote.estimatedDays ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return {
    rateId,
    carrierName: String(quote.carrierName ?? 'Bigship Courier'),
    amount: Math.round(amount * 100) / 100,
    currency: String(quote.currency ?? 'INR'),
    estimatedDays: Number.isFinite(estimatedDays) && estimatedDays > 0 ? estimatedDays : 3,
  };
}

function normalizeDispatchPackageBoxes(boxes?: DispatchPackageBox[]): BigshipPackageBox[] | undefined {
  if (!Array.isArray(boxes)) return undefined;
  const normalized = boxes
    .map((box) => ({
      noOfBoxes: Math.max(1, Math.floor(Number(box.noOfBoxes) || 1)),
      length: Number(box.length),
      breadth: Number(box.breadth),
      height: Number(box.height),
      weight: Number(box.weight),
    }))
    .filter((box) =>
      Number.isFinite(box.length) && box.length > 0 &&
      Number.isFinite(box.breadth) && box.breadth > 0 &&
      Number.isFinite(box.height) && box.height > 0 &&
      Number.isFinite(box.weight) && box.weight > 0,
    );
  return normalized.length > 0 ? normalized : undefined;
}

function packageSummary(boxes?: DispatchPackageBox[]): string | null {
  const normalized = normalizeDispatchPackageBoxes(boxes);
  if (!normalized) return null;
  const totalBoxes = normalized.reduce((sum, box) => sum + box.noOfBoxes, 0);
  const totalWeight = normalized.reduce((sum, box) => sum + box.noOfBoxes * box.weight, 0);
  const rows = normalized
    .map((box, index) => `Box ${index + 1}: ${box.noOfBoxes} x ${box.length}x${box.breadth}x${box.height}cm, ${box.weight}kg`)
    .join('; ');
  return `Packages: ${totalBoxes} box(es), ${Math.round(totalWeight * 100) / 100}kg total | ${rows}`;
}

// ── Warehouse helpers ─────────────────────────────────────────────────────
export type Warehouse = { id: string; name: string; pincode: string; location: string; address?: string; city?: string; state?: string; source?: string };
type PickupOverride = { name?: string; pincode?: string; location?: string };

function loadWarehouses(): Warehouse[] {
  const raw = process.env.SHIPROCKET_WAREHOUSES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Warehouse[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through */ }
  }
  // Fallback to single warehouse from legacy env vars
  return [{
    id: 'default',
    name: process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || 'Office',
    pincode: process.env.SHIPROCKET_PICKUP_PINCODE?.trim() || '110001',
    location: process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || 'Office',
  }];
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiprocket: ShiprocketService,
    private readonly bigship: BigshipService,
    private readonly carrierConfig: CarrierConfigService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** Debug: returns the raw Bigship warehouse API response for the first segment type */
  async getWarehousesDebugRaw(): Promise<unknown> {
    return this.bigship.getWarehouseList();
  }

  async getWarehouses(): Promise<Warehouse[]> {
    const activeCarrier = this.carrierConfig.getActiveCarrier();

    // ── Bigship: return all warehouses from cache (fast, no blocking) ──────────
    if (activeCarrier === 'bigship' && this.bigship.isConfigured()) {
      const cfg = this.carrierConfig.getConfig().bigship;
      const defaultPickupId = cfg.pickupWarehouseId;

      // Try to get from cache first (instant), trigger refresh in background
      const cached = await this.bigship.getCachedWarehouses();

      if (cached.length > 0) {
        // Return all usable warehouses with real names from Bigship. Some Bigship
        // responses omit or vary the active flag, so only hide explicit inactive rows.
        return cached
          .filter(w => w.isActive !== false)
          .map(w => ({
            id:                 String(w.bigshipWarehouseId),
            name:               w.name,
            pincode:            w.pincode || process.env.BIGSHIP_PICKUP_PINCODE?.trim() || '440032',
            location:           `${w.city}, ${w.state}`,
            address:            `${w.address}, ${w.city}, ${w.state}`,
            city:               w.city,
            state:              w.state,
            source:             'bigship',
            bigshipWarehouseId: w.bigshipWarehouseId,
          } as Warehouse & { bigshipWarehouseId: number }));
      }

      // Cache miss — return saved default warehouse immediately, refresh in background
      if (defaultPickupId) {
        void this.bigship.refreshWarehouseCache();
        return [{
          id:                 String(defaultPickupId),
          name:               `Bigship Warehouse ${defaultPickupId}`,
          pincode:            process.env.BIGSHIP_PICKUP_PINCODE?.trim() || '440032',
          location:           `Bigship #${defaultPickupId}`,
          source:             'bigship',
          bigshipWarehouseId: defaultPickupId,
        } as Warehouse & { bigshipWarehouseId: number }];
      }
    }

    // ── Shiprocket / local fallback ────────────────────────────────────────
    const localWarehouses = loadWarehouses().map((warehouse) => ({ ...warehouse, source: 'local' }));
    let shiprocketPickups: ShiprocketPickupLocation[] = [];
    try {
      shiprocketPickups = await this.shiprocket.fetchPickupLocations();
    } catch (e) {
      this.logger.warn(`Shiprocket pickup locations failed: ${e instanceof Error ? e.message : e}`);
    }

    const byNameAndPin = new Map<string, Warehouse>();
    for (const pickup of shiprocketPickups) {
      byNameAndPin.set(`${pickup.location.toLowerCase()}|${pickup.pincode}`, {
        ...pickup,
        source: 'shiprocket',
      });
    }
    for (const warehouse of localWarehouses) {
      const key = `${warehouse.location.toLowerCase()}|${warehouse.pincode}`;
      if (!byNameAndPin.has(key)) byNameAndPin.set(key, warehouse);
    }

    return Array.from(byNameAndPin.values());
  }

  private resolveWarehouse(warehouseId?: string, pickupOverride?: PickupOverride): Warehouse {
    if (pickupOverride?.pincode?.trim()) {
      const name = pickupOverride.name?.trim() || pickupOverride.location?.trim() || 'Custom Pickup';
      return {
        id: 'custom',
        name,
        pincode: pickupOverride.pincode.trim(),
        location: pickupOverride.location?.trim() || name,
      };
    }

    // For Bigship, warehouseId is the numeric bigshipWarehouseId sent as a string (e.g. "111821").
    // loadWarehouses() only knows about Shiprocket warehouses, so we must handle Bigship separately.
    const activeCarrier = this.carrierConfig.getActiveCarrier();
    if (activeCarrier === 'bigship') {
      const cfg = this.carrierConfig.getConfig().bigship;
      const resolvedId = (warehouseId && /^\d+$/.test(warehouseId))
        ? parseInt(warehouseId, 10)
        : cfg.pickupWarehouseId ?? null;
      if (resolvedId) {
        // Try to get real name/pincode from cache
        const cached = this.bigship.warehouseCache.find(w => w.bigshipWarehouseId === resolvedId);
        const pincode = cached?.pincode || process.env.BIGSHIP_PICKUP_PINCODE?.trim() || '440032';
        const name    = cached?.name    || `Bigship Warehouse ${resolvedId}`;
        return {
          id:                 String(resolvedId),
          name,
          pincode,
          location:           cached ? `${cached.city}, ${cached.state}` : `Bigship #${resolvedId}`,
          address:            cached?.address,
          city:               cached?.city,
          state:              cached?.state,
          source:             'bigship',
          bigshipWarehouseId: resolvedId,
        } as Warehouse & { bigshipWarehouseId: number };
      }
    }

    const warehouses = loadWarehouses();
    return warehouses.find(w => w.id === warehouseId) ?? warehouses[0]!;
  }

  private computeLocalRates(weightKg: number): LocalRateQuote[] {
    const base = 120 + weightKg * 18;
    return [
      { rateId: 'local-economy',  carrierName: 'Economy Ground (offline)',  amount: Math.round(base * 0.85), currency: 'INR', estimatedDays: 7 },
      { rateId: 'local-standard', carrierName: 'Standard Freight (offline)', amount: Math.round(base),        currency: 'INR', estimatedDays: 4 },
      { rateId: 'local-express',  carrierName: 'Express (offline)',          amount: Math.round(base * 1.55), currency: 'INR', estimatedDays: 2 },
    ];
  }

  private weightKgFromItems(items: Array<{ quantity: number; product: { weightPerUnitGrams: Prisma.Decimal } }>): number {
    let grams = 0;
    for (const i of items) grams += Number(i.product.weightPerUnitGrams) * i.quantity;
    return Math.max(0.5, grams / 1000);
  }

  private nextOrderStatusAfterDispatch(order: { items: Array<{ id: string; itemProductionStage: OrderProductionStage; dispatchedAt?: Date | null }> }, itemIds: string[]): OrderStatus {
    const selected = new Set(itemIds);
    const readyItems = order.items.filter((i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH);
    // An item counts as "handled" once it's either part of THIS dispatch
    // batch, or was already physically dispatched in an earlier batch —
    // without the dispatchedAt check, a second partial-dispatch round on
    // the same order always came back PARTIALLY_DISPATCHED even once every
    // ready item had genuinely shipped, because only the current
    // selection was considered, not earlier ones.
    const allReadyItemsHandled = readyItems.length > 0 && readyItems.every((i) => selected.has(i.id) || !!i.dispatchedAt);
    const everyOrderItemWasReady = order.items.every((i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH);
    return allReadyItemsHandled && everyOrderItemWasReady
      ? OrderStatus.DISPATCHED
      : OrderStatus.PARTIALLY_DISPATCHED;
  }

  private paymentCredit(order: { grandTotal: Prisma.Decimal; payments?: Array<{ amount: Prisma.Decimal }> }): number {
    const paid = (order.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    return Math.max(0, paid - Number(order.grandTotal));
  }

  private paymentBalanceDue(order: { grandTotal: Prisma.Decimal; payments?: Array<{ amount: Prisma.Decimal }> }): number {
    const paid = (order.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    return Math.max(0, Number(order.grandTotal) - paid);
  }

  private dispatchPaymentInfo(order: { notes?: string | null; grandTotal: Prisma.Decimal; payments?: Array<{ amount: Prisma.Decimal }> }) {
    const notes = order.notes ?? '';
    const notesIsCod = /\bCOD[:\s]/i.test(notes);
    const notesCodAmountMatch = notes.match(/COD(?:\s+amount)?:\s*₹?(\d+(?:\.\d+)?)/i);
    const notesCodAmount = notesCodAmountMatch ? Number(notesCodAmountMatch[1]) : null;
    const balanceDue = this.paymentBalanceDue(order);
    const balanceAmount = balanceDue > 0.5 ? Math.ceil(balanceDue) : 0;
    const isCod = notesIsCod;
    const codAmount = isCod ? notesCodAmount : null;
    return { isCod, codAmount, balanceDue: balanceAmount };
  }

  private async assertCanDispatch(order: { id: string; status: OrderStatus }) {
    const dispatchableStatuses: OrderStatus[] = [OrderStatus.READY_FOR_DISPATCH, OrderStatus.PARTIALLY_DISPATCHED];
    if (!dispatchableStatuses.includes(order.status)) {
      throw new BadRequestException('Order must be approved by accounts before dispatch');
    }
    const approval = await this.prisma.statusLog.findFirst({
      where: {
        orderId: order.id,
        fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
        toStatus: OrderStatus.READY_FOR_DISPATCH,
      },
      select: { id: true },
    });
    if (!approval) {
      throw new BadRequestException('Sales must submit dispatch payment details and accounts must approve before booking');
    }
  }

  async listReadyForDispatch() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.PARTIALLY_DISPATCHED],
        },
        items: {
          some: {
            itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH,
          },
        },
        // SECURITY GUARD: Only show orders that have been approved by accounts for dispatch.
        // Sample orders (isSample=true) are exempt — they bypass the approval flow by design.
        // Normal orders MUST have a status log entry: PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH.
        OR: [
          {
            isSample: true,
          },
          {
            isSample: false,
            statusLogs: {
              some: {
                fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
                toStatus: OrderStatus.READY_FOR_DISPATCH,
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
        payments: {
          where: { verificationStatus: PaymentVerificationStatus.VERIFIED },
          select: { amount: true },
        },
        shipments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { awbNumber: true, carrierName: true, trackingNumber: true, notes: true },
        },
      },
    });

    const result: Array<{
      id: string; orderNo: string; customerName: string;
      customerPhone: string | null; salesAgentName: string | null;
      shipTo: string; weightKg: number; orderDate: string;
      totalItems: number; readyItemsCount: number;
      dispatchType: 'COURIER' | 'TRANSPORT' | 'BY_HAND' | 'SELF_COLLECTED';
      paymentType: 'COD' | 'PREPAID';
      isCod: boolean; codAmount: number | null; balanceDue: number;
      isSample: boolean; samplePaymentType: string | null;
      latestShipment: { awbNumber: string | null; carrierName: string | null; trackingNumber: string | null; notes: string | null } | null;
      readyItems: Array<{
        id: string; productName: string; sku: string; quantity: number;
        productionNotes: string | null; weightKg: number;
        size: string | null; gsm: string | null; sides: string | null;
      }>;
    }> = [];

    for (const o of orders) {
      const isSample = (o as any).isSample ?? false;
      // Only show items that were actually submitted (and, for real orders,
      // approved by accounts) in the CURRENT batch — not every item on the
      // order that happens to be production-ready. Before this fix, an
      // order with e.g. 3 ready items where only 1 was submitted+approved
      // showed all 3 here, letting Dispatch book items nobody from Accounts
      // had actually signed off on. Confirmed via a real order, 2026-08-10.
      // Sample orders skip the submit/approve flow entirely (see
      // dispatchSampleOrder in accounts.service.ts), so
      // pendingDispatchItemIds is never populated for them — keep showing
      // all their ready items.
      //
      // pendingDispatchItemIds only started being recorded on 2026-08-10
      // (see resolveLockedItemIds in orders.service.ts) — any order that
      // was already approved to READY_FOR_DISPATCH/PARTIALLY_DISPATCHED
      // before that has an empty list forever, even though it genuinely
      // went through accounts approval the old whole-order way. Unlike
      // orders.service.ts's fallback (which only fires while status is
      // still PENDING_DISPATCH_APPROVAL), by the time an order is in THIS
      // list its status has already moved past that, so that fallback
      // never applies here — every item silently failed lockedIds.has()
      // and the whole order disappeared from the Dispatch tab, approved or
      // not. The `where` clause above already proves approval (isSample OR
      // a PENDING_DISPATCH_APPROVAL→READY_FOR_DISPATCH statusLog exists),
      // so an empty pendingDispatchItemIds here is unambiguous: treat it as
      // "no per-item record kept, show every ready item" instead of "zero
      // items approved."
      const submittedIds: string[] = (o as any).pendingDispatchItemIds ?? [];
      const lockedIds = submittedIds.length > 0 ? new Set(submittedIds) : null;
      const readyItems = o.items.filter((i) => {
        if (i.itemProductionStage !== OrderProductionStage.READY_FOR_DISPATCH) return false;
        // itemProductionStage never changes away from READY_FOR_DISPATCH
        // even after the item is actually shipped -- without this check, an
        // already-dispatched item (e.g. one half of a PARTIALLY_DISPATCHED
        // order) kept showing up here forever, even after it appeared as
        // shipped in Bigship. Confirmed via a real order, 2026-08-10.
        if ((i as any).dispatchedAt) return false;
        if (isSample || lockedIds === null) return true;
        return lockedIds.has(i.id);
      });
      if (readyItems.length === 0) continue;

      const paymentInfo = this.dispatchPaymentInfo(o);
      const samplePaymentType = (o as any).samplePaymentType ?? null;
      // For sample orders, COD/PREPAID is decided by accounts; override notes-based detection
      const effectiveIsCod = isSample ? samplePaymentType === 'COD' : paymentInfo.isCod;

      result.push({
        id: o.id,
        orderNo: o.orderNumber,
        customerName: o.customer.businessName,
        customerPhone: o.customer.phone,
        salesAgentName: o.salesAgent?.fullName ?? null,
        shipTo: o.customer.shippingAddress ?? o.customer.billingAddress ?? '—',
        weightKg: this.weightKgFromItems(readyItems),
        orderDate: o.orderDate.toISOString(),
        totalItems: o.items.length,
        readyItemsCount: readyItems.length,
        dispatchType: parseDispatchType(o.notes),
        paymentType: effectiveIsCod ? 'COD' : 'PREPAID',
        isCod: effectiveIsCod,
        codAmount: effectiveIsCod ? paymentInfo.codAmount : null,
        balanceDue: paymentInfo.balanceDue,
        isSample,
        samplePaymentType,
        latestShipment: o.shipments[0] ?? null,
        readyItems: readyItems.map((i) => {
          const { size, gsm, sides } = parseProductionNotes(i.productionNotes);
          return {
            id: i.id, productName: i.product.name, sku: i.product.sku,
            quantity: i.quantity, productionNotes: i.productionNotes,
            weightKg: this.weightKgFromItems([i]), size, gsm, sides,
          };
        }),
      });
    }

    return result;
  }

  async getRates(orderId: string, warehouseId?: string, weightKgOverride?: number, pickupOverride?: PickupOverride, packageBoxes?: DispatchPackageBox[]) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: {
          where: { verificationStatus: PaymentVerificationStatus.VERIFIED },
          select: { amount: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Excludes items already physically dispatched (e.g. the other half of
    // a PARTIALLY_DISPATCHED order) -- itemProductionStage alone doesn't
    // change after real dispatch, so without this check a rate quote could
    // include an item that's already been shipped.
    const readyItems = order.items.filter(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH && !(i as any).dispatchedAt,
    );
    // Rate fetching only needs a valid dispatchable status — skip the approval
    // log check here (that's enforced on actual booking in bookItems via
    // assertCanDispatch).
    //
    // This used to require order.status itself to already be
    // READY_FOR_DISPATCH/PARTIALLY_DISPATCHED. That's wrong for partial
    // dispatch booking: an order can have some items ready
    // (itemProductionStage READY_FOR_DISPATCH) while order.status is still
    // APPROVED/IN_PRODUCTION, because the rest of production isn't done yet
    // — that's the normal state the Orders page's "book what's ready" flow
    // operates in (see hasReadyItem/readyItemsCount on the frontend, and
    // getOrdersWithReadyItems on the backend, which both key off item
    // readiness, not order.status). This function was stricter than the
    // list it's called from, so any order with partial-but-not-all items
    // ready always failed here with "Order must be in a dispatchable status
    // to fetch rates" — confirmed via a real order, 2026-08-10.
    //
    // Now: allowed whenever there's at least one ready item, as long as the
    // order isn't already submitted/approved/finished (those states aren't
    // reachable from this pre-submission helper anyway, but guarded for
    // safety/correctness if hit directly).
    const blockedStatuses: OrderStatus[] = [
      OrderStatus.PENDING_DISPATCH_APPROVAL,
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];
    const dispatchableStatuses: OrderStatus[] = [OrderStatus.READY_FOR_DISPATCH, OrderStatus.PARTIALLY_DISPATCHED];
    const canFetchRates = !blockedStatuses.includes(order.status)
      && (readyItems.length > 0 || dispatchableStatuses.includes(order.status));
    if (!canFetchRates) {
      throw new BadRequestException('Order must be in a dispatchable status to fetch rates');
    }
    const normalizedBoxes = normalizeDispatchPackageBoxes(packageBoxes);
    const packageWeightKg = normalizedBoxes?.reduce((sum, box) => sum + box.noOfBoxes * box.weight, 0);
    const weightKg = weightKgOverride && weightKgOverride > 0
      ? weightKgOverride
      : packageWeightKg && packageWeightKg > 0
      ? packageWeightKg
      : this.weightKgFromItems(readyItems.length > 0 ? readyItems : order.items);

    const warehouse  = this.resolveWarehouse(warehouseId, pickupOverride);
    const pickup     = warehouse.pincode;
    const delivery   = extractPincode(order.customer.shippingAddress) ||
                       extractPincode(order.customer.billingAddress)  ||
                       pickup ||
                       process.env.SHIPROCKET_DEFAULT_DELIVERY_PINCODE?.trim() || '110001';
    const addr = splitAddressForShiprocket(order.customer);
    const paymentInfo = this.dispatchPaymentInfo(order);
    const orderIsCod = paymentInfo.isCod;
    const orderCodAmt = paymentInfo.codAmount ?? undefined;
    // Declared shipment value: was order.grandTotal (the WHOLE order's
    // total) even when only some of the order's items are actually ready to
    // ship — a 4-item, ₹22,000 order with only ₹20,000 of it actually ready
    // would still declare ₹22,000 to the courier. This is a pre-submission
    // estimate (no specific item selection is known yet at this point, only
    // which items are production-ready), so it uses the ready items' total;
    // the real, precise per-selection value is set at actual booking time,
    // in bookItems below. Confirmed via a real order (1473), 2026-08-10.
    const readyItemsValue = readyItems.reduce((sum, i) => sum + Number(i.lineTotal), 0);
    const dispatchInvoiceAmount = readyItemsValue > 0 ? readyItemsValue : Number(order.grandTotal);

    const activeCarrier = this.carrierConfig.getActiveCarrier();

    // ── BigShip ───────────────────────────────────────────────────────────
    if (activeCarrier === 'bigship' && this.bigship.isConfigured()) {
      try {
        // Pass bigshipWarehouseId if the selected warehouse came from Bigship
        const bsPickupWHId = (warehouse as Record<string, unknown>).bigshipWarehouseId as number | undefined
          ?? (warehouseId && /^\d+$/.test(warehouseId) ? parseInt(warehouseId, 10) : undefined);
        // 2+ physical boxes declared → Bigship's B2C API hard-rejects it, route
        // through domestic_b2b instead (real multi-parcel consignment support).
        const isB2B = bigshipTotalBoxCount(normalizedBoxes) > 1;
        const bs = isB2B
          ? await this.bigship.fetchB2BCourierRates({
              pickupPostcode: pickup,
              deliveryPostcode: delivery,
              weightKg,
              orderNumber: order.orderNumber,
              invoiceAmount: dispatchInvoiceAmount,
              shippingName: order.customer.businessName,
              shippingMobile: order.customer.phone ?? undefined,
              shippingEmail: order.customer.email ?? undefined,
              shippingAddress: addr.line,
              isCod: orderIsCod,
              codAmount: orderCodAmt,
              pickupWarehouseId: bsPickupWHId,
              packageBoxes: normalizedBoxes,
            })
          : await this.bigship.fetchCourierRates({
          pickupPostcode: pickup,
          deliveryPostcode: delivery,
          weightKg,
          orderNumber: order.orderNumber,
          invoiceAmount: Number(order.grandTotal),
          shippingName: order.customer.businessName,
          shippingMobile: order.customer.phone ?? undefined,
          shippingEmail: order.customer.email ?? undefined,
          shippingAddress: addr.line,
          shippingCity: addr.city,
          shippingState: addr.state,
          isCod: orderIsCod,
          codAmount: orderCodAmt,
          pickupWarehouseId: bsPickupWHId,
          packageBoxes: normalizedBoxes,
        });
        if (bs.length) {
          return {
            orderId: order.id, orderNo: order.orderNumber,
            destination: order.customer.businessName,
            weightKg, deliveryPincode: delivery, pickupPincode: pickup,
            warehouseId: warehouse.id, warehouseName: warehouse.name,
            source: 'bigship',
            rates: bs.map(({ rateId, carrierName, amount, currency, estimatedDays }) => ({
              rateId, carrierName, amount, currency, estimatedDays,
            })),
          };
        }
        throw new BadRequestException('Bigship did not return any live courier rates.');
      } catch (e) {
        this.logger.warn(`BigShip rates failed: ${e instanceof Error ? e.message : e}`);
        if (this.shiprocket.isConfigured()) {
          try {
            const sr = await this.shiprocket.fetchCourierRates({ pickupPostcode: pickup, deliveryPostcode: delivery, weightKg });
            if (sr.length) {
              return {
                orderId: order.id, orderNo: order.orderNumber,
                destination: order.customer.businessName,
                weightKg, deliveryPincode: delivery, pickupPincode: pickup,
                warehouseId: warehouse.id, warehouseName: warehouse.name,
                source: 'shiprocket',
                rates: sr.map(({ rateId, carrierName, amount, currency, estimatedDays }) => ({
                  rateId, carrierName, amount, currency, estimatedDays,
                })),
              };
            }
          } catch (srError) {
            this.logger.warn(`Shiprocket fallback rates failed: ${srError instanceof Error ? srError.message : srError}`);
          }
        }
      }
    }

    // ── Shiprocket ────────────────────────────────────────────────────────
    if (activeCarrier === 'shiprocket' && this.shiprocket.isConfigured()) {
      try {
        const sr = await this.shiprocket.fetchCourierRates({ pickupPostcode: pickup, deliveryPostcode: delivery, weightKg });
        if (sr.length) {
          return {
            orderId: order.id, orderNo: order.orderNumber,
            destination: order.customer.businessName,
            weightKg, deliveryPincode: delivery, pickupPincode: pickup,
            warehouseId: warehouse.id, warehouseName: warehouse.name,
            source: 'shiprocket',
            rates: sr.map(({ rateId, carrierName, amount, currency, estimatedDays }) => ({
              rateId, carrierName, amount, currency, estimatedDays,
            })),
          };
        }
      } catch (e) {
        this.logger.warn(`Shiprocket rates failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    return {
      orderId: order.id, orderNo: order.orderNumber,
      destination: order.customer.businessName,
      weightKg, deliveryPincode: delivery, pickupPincode: pickup,
      warehouseId: warehouse.id, warehouseName: warehouse.name,
      source: 'local',
      rates: this.computeLocalRates(weightKg),
    };
  }

  async bookItems(orderId: string, itemIds: string[], rateId: string, userId: string, isCod?: boolean, codAmount?: number, warehouseId?: string, weightKgOverride?: number, pickupOverride?: PickupOverride, selectedQuote?: SelectedRateQuote, packageBoxes?: DispatchPackageBox[], manualShippingCity?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
        payments: {
          where: { verificationStatus: PaymentVerificationStatus.VERIFIED },
          select: { amount: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    await this.assertCanDispatch(order);

    const itemsToDispatch = order.items.filter(
      (i) => itemIds.includes(i.id) &&
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH &&
        !(i as any).dispatchedAt,
    );
    if (itemsToDispatch.length === 0) {
      throw new BadRequestException('No ready items selected for dispatch');
    }
    // Declared shipment value for the courier: was order.grandTotal (the
    // WHOLE order's total), regardless of how many of the order's items
    // were actually in THIS shipment — e.g. a 4-item, ₹22,000 order where
    // only 1 item (worth much less) was booked still declared ₹22,000 to
    // Bigship/Shiprocket. itemsToDispatch is exactly the item(s) selected
    // for this specific booking, so use their real combined value instead.
    // Confirmed via a real order (1473), 2026-08-10.
    const dispatchItemsValue = itemsToDispatch.reduce((sum, i) => sum + Number(i.lineTotal), 0);

    const bigshipRate = parseBigshipRateId(rateId);
    let picked: LocalRateQuote | undefined | null;
    if (bigshipRate?.masterCustomOrderId) {
      // Try to validate the quote passed from the frontend. If it's missing or
      // malformed (e.g. forwarded without the amount field), fall back to a
      // minimal valid quote built from data encoded in the rateId itself so the
      // booking can still proceed.
      picked = sanitizeSelectedRateQuote(rateId, selectedQuote);
      if (!picked) {
        const fallbackAmount = Number(selectedQuote?.amount ?? 0);
        picked = {
          rateId,
          carrierName: String(selectedQuote?.carrierName ?? 'Bigship Courier'),
          amount: Number.isFinite(fallbackAmount) && fallbackAmount >= 0 ? fallbackAmount : 0,
          currency: String(selectedQuote?.currency ?? 'INR'),
          estimatedDays: Number(selectedQuote?.estimatedDays ?? 3) || 3,
        };
        this.logger.warn(`bookItems: selectedQuote validation failed for rateId=${rateId}, using fallback quote`);
      }
    } else {
      // For non-BigShip rates: trust the selectedQuote the frontend already has.
      // Re-fetching at dispatch time uses different params and often can't match the
      // original rateId, causing false "Invalid shipping rate selection" errors.
      picked = sanitizeSelectedRateQuote(rateId, selectedQuote);
      if (!picked) {
        const fallbackAmount = Number(selectedQuote?.amount ?? 0);
        if (selectedQuote?.carrierName && Number.isFinite(fallbackAmount) && fallbackAmount >= 0) {
          picked = {
            rateId,
            carrierName: String(selectedQuote.carrierName),
            amount: fallbackAmount,
            currency: String(selectedQuote.currency ?? 'INR'),
            estimatedDays: Number(selectedQuote.estimatedDays ?? 3) || 3,
          };
          this.logger.warn(`bookItems: using fallback quote for rateId=${rateId} carrier=${selectedQuote.carrierName}`);
        } else {
          picked = (await this.getRates(orderId, warehouseId, weightKgOverride, pickupOverride)).rates.find((r) => r.rateId === rateId);
        }
      }
    }
    if (!picked) throw new BadRequestException('Invalid shipping rate selection');

    const normalizedBoxes = normalizeDispatchPackageBoxes(packageBoxes);
    const packageWeightKg = normalizedBoxes?.reduce((sum, box) => sum + box.noOfBoxes * box.weight, 0);
    const weightKg = weightKgOverride && weightKgOverride > 0
      ? weightKgOverride
      : packageWeightKg && packageWeightKg > 0
      ? packageWeightKg
      : this.weightKgFromItems(itemsToDispatch);
    const packageNote = packageSummary(packageBoxes);

    // Resolve warehouse for this booking
    const warehouse   = this.resolveWarehouse(warehouseId, pickupOverride);
    const shipmentNumber = `SHP-${Date.now()}-${randomSuffix()}`;
    let trackingRef    = '';
    let shiprocketNote = '';
    let awbNumber: string | null = null;
    let bigshipOrderId: string | null = null;
    let bigshipStatus: string | null = null;
    let shipmentStatus: ShipmentStatus = ShipmentStatus.PACKED;

    const addr = splitAddressForShiprocket(order.customer);
    const paymentInfo = this.dispatchPaymentInfo(order);
    const orderIsCod = isCod ?? paymentInfo.isCod;
    const orderCodAmt = codAmount ?? paymentInfo.codAmount ?? undefined;

    if (bigshipRate && this.bigship.isConfigured()) {
      // ── BigShip booking ─────────────────────────────────────────────────
      const courierId = bigshipRate.courierId;
      // resolveWarehouse now always returns bigshipWarehouseId for Bigship carrier
      const bsPickupWHId =
        (warehouse as Record<string, unknown>).bigshipWarehouseId as number | undefined
        ?? (warehouseId && /^\d+$/.test(warehouseId) ? parseInt(warehouseId, 10) : undefined);
      let bs: { bigshipOrderId?: string; awbNumber?: string; message?: string } = {};
      if (Number.isFinite(courierId) && courierId > 0) {
        // Always create a fresh order at dispatch time and immediately manifest it.
        // The rate-fetch step creates a draft in Bigship only to get pricing; that draft
        // is NOT reused here because Bigship rejects place-order on stale/placeholder drafts.
        // This mirrors how Shiprocket works: create + assign AWB in one shot at dispatch.
        bs = await this.bigship.tryCreateAdhocOrder({
          orderNumber: order.orderNumber,
          customerName: order.customer.businessName,
          customerPhone: order.customer.phone ?? '9999999999',
          customerEmail: order.customer.email ?? 'noreply@example.com',
          billingAddress: addr.line, billingCity: addr.city,
          billingPincode: addr.pincode, billingState: addr.state,
          weightKg, subTotal: dispatchItemsValue,
          courierId,
          isCod: orderIsCod,
          codAmount: orderCodAmt,
          pickupWarehouseId: bsPickupWHId,
          packageBoxes: normalizedBoxes,
          manualShippingCity,
        });
      }

      if (!bs.bigshipOrderId) {
        const message = bs.message ?? 'no Bigship order ID returned';
        throw new BadRequestException(`Bigship booking failed: ${message}`);
      }

      // ── Auto-manifest (Place/Manifest API) ──────────────────────────────
      // Reversal of the 2026-08-04 "manual Ship Now" decision that used to live
      // here: the draft order is now placed/manifested immediately so the user
      // never has to leave the ERP to click "Ship Now" in Bigship's dashboard.
      // Order Rate Calculation (courier-wise-shipment-cost) already ran inside
      // tryCreateAdhocOrder() just above, satisfying Bigship's precondition for
      // place-order. If manifesting fails, fall back to the old "pending manual
      // Ship Now" behavior rather than losing the dispatch — the draft already
      // exists in Bigship either way, and we must not retry place-order on it.
      bigshipOrderId = bs.bigshipOrderId;
      const placeResult = await this.bigship.placeExistingOrder({
        masterCustomOrderId: bs.bigshipOrderId,
        courierId,
        invoiceData: {
          orderNumber: order.orderNumber,
          customerName: order.customer.businessName,
          amount: dispatchItemsValue,
          notes: order.notes ?? undefined,
        },
      });

      if (!placeResult.bigshipOrderId) {
        // Place/Manifest failed — do NOT retry it, and do NOT show a fake AWB.
        // The draft still exists in Bigship for manual "Ship Now", same as the
        // pre-existing fallback behavior.
        trackingRef    = '';
        awbNumber      = null;
        shiprocketNote = ` BigShip Order: ${bs.bigshipOrderId} — draft created but auto-manifest failed (${placeResult.message ?? 'unknown error'}); needs manual "Ship Now" in Bigship (Unshipped tab).`;
      } else {
        // Manifested. Place-order's own response doesn't reliably carry the real
        // AWB ("awb_assigned" there is a count, not a tracking number) — pull the
        // authoritative AWB/status via the same order-shipment-details lookup the
        // manual "Sync Bigship" button already uses, instead of standing up a
        // second, duplicate Bigship endpoint integration for Track Order.
        const shipDetails = await this.bigship.getOrderShipmentDetails(bigshipOrderId);
        awbNumber      = shipDetails.awbNumber ?? null;
        trackingRef    = awbNumber ?? '';
        bigshipStatus  = shipDetails.status ?? null;
        // A successful manifest means the order left "draft" for Bigship's pickup
        // workflow even if this immediate lookup hasn't caught up yet — reflect
        // that now instead of leaving the shipment PACKED until the next sync.
        shipmentStatus = mapBigshipStatusToShipmentStatus(shipDetails.status) ?? ShipmentStatus.IN_TRANSIT;
        shiprocketNote = awbNumber
          ? ` BigShip Order: ${bigshipOrderId} — manifested, AWB ${awbNumber}.`
          : ` BigShip Order: ${bigshipOrderId} — manifested, AWB pending (use Sync Bigship to refresh).`;
      }
    } else if (rateId.startsWith('sr-') && this.shiprocket.isConfigured()) {
      // ── Shiprocket booking ───────────────────────────────────────────────
      const courierCompanyId = parseInt(rateId.replace(/^sr-/, ''), 10);
      if (Number.isFinite(courierCompanyId) && courierCompanyId > 0) {
        const sr = await this.shiprocket.tryCreateAdhocOrder({
          pickupLocation: warehouse.location,
          orderNumber: order.orderNumber,
          customerName: order.customer.businessName,
          customerPhone: order.customer.phone ?? '9999999999',
          customerEmail: order.customer.email ?? 'noreply@example.com',
          billingAddress: addr.line, billingCity: addr.city,
          billingPincode: addr.pincode, billingState: addr.state,
          weightKg, subTotal: dispatchItemsValue,
          courierCompanyId,
          isCod: orderIsCod,
          codAmount: orderCodAmt,
        });
        if (sr.shiprocketOrderId) {
          trackingRef    = sr.shiprocketOrderId;
          shiprocketNote = ` Shiprocket: ${sr.shiprocketOrderId}.`;
        }
      }
    }

    let result: { shipmentNumber: string; carrierName: string; amount: number; newStatus: OrderStatus };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.shipment.create({
          data: {
            orderId,
            handledById: userId,
            shipmentNumber,
            carrierName: picked.carrierName,
            status: shipmentStatus,
            dispatchDate: new Date(),
            trackingNumber: trackingRef || null,
            awbNumber,
            dispatchType: 'COURIER',
            transportChargesType: orderIsCod ? 'COD' : 'PREPAID',
            // bigshipOrderId isn't in the generated Prisma types until `prisma generate`
            // picks up the new schema column at deploy time (see feedback memory on this
            // repo's sandbox not regenerating the client locally) — cast to bypass that.
            ...(bigshipOrderId ? ({ bigshipOrderId } as any) : {}),
            ...(bigshipStatus ? ({ bigshipStatus, bigshipSyncedAt: new Date() } as any) : {}),
            // Dispatch > Courier Charges: Actual = the rate quote just picked
            // above; Taken from Customer is pre-filled from what the seller
            // entered in Book Shipment (Ready for Dispatch), still editable
            // by hand afterwards in the Courier Charges tab.
            courierChargeActual: new Prisma.Decimal(picked.amount),
            ...(order.courierChargeQuoted != null
              ? { courierChargeCollected: order.courierChargeQuoted, courierChargeUpdatedAt: new Date() }
              : {}),
            notes: [
              `Items: ${itemsToDispatch.map((i) => i.id).join(', ')}`,
              `Courier: ${picked.carrierName}, ${picked.amount} INR.${shiprocketNote}`.trim(),
              packageNote,
            ].filter(Boolean).join('. '),
          },
        });

        const remainingItems = await tx.orderItem.findMany({ where: { orderId } });
        const newStatus = this.nextOrderStatusAfterDispatch({ items: remainingItems }, itemIds);

        await tx.order.update({
          where: { id: orderId },
          data: { status: newStatus, shippingCharge: new Prisma.Decimal(picked.amount) },
        });

        // Mark exactly these items as physically dispatched. itemProductionStage
        // deliberately stays READY_FOR_DISPATCH (it tracks production, not
        // shipment) -- without this separate marker, an already-shipped item
        // looked identical to a still-awaiting-dispatch one everywhere
        // (Dispatch's own queue, Orders' Ready for Dispatch tab/badges), and
        // persisted in Dispatch's queue forever even after Bigship showed it
        // as shipped. Confirmed via a real order, 2026-08-10.
        await tx.orderItem.updateMany({
          where: { id: { in: itemsToDispatch.map((i) => i.id) } },
          data: ({ dispatchedAt: new Date() } as any),
        });

        await tx.statusLog.create({
          data: {
            orderId, fromStatus: order.status, toStatus: newStatus,
            changedById: userId,
            reason: `${itemsToDispatch.length} item(s) dispatched via ${picked.carrierName}`,
            metadata: { shipmentNumber, rateId, amount: picked.amount, dispatchType: 'COURIER', packageBoxes: normalizedBoxes },
          },
        });

        return { shipmentNumber, carrierName: picked.carrierName, amount: picked.amount, newStatus };
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save courier dispatch';
      this.logger.error(`Courier booking failed for ${order.orderNumber}: ${message}`);
      throw new BadRequestException(message);
    }

    // ── WhatsApp: Dispatched 🚚 ────────────────────────────────────────────
    if (order.customer.phone) {
      const productNames = itemsToDispatch.map(i => i.product.name).join(', ');
      const trackingInfo = awbNumber ? ` Tracking: ${awbNumber}` : '';
      const statusMsg    = awbNumber
        ? `Dispatched 🚚 via ${picked.carrierName}.${trackingInfo}`
        : `Dispatch booked via ${picked.carrierName}. Tracking will be shared after courier manifest.`;

      void this.whatsapp.sendOrderUpdate({
        customerName:  order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo:       order.orderNumber,
        product:       productNames,
        status:        statusMsg,
        agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return result;
  }

  async bookTransport(input: TransportDispatchInput, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        payments: {
          where: { verificationStatus: PaymentVerificationStatus.VERIFIED },
          select: { amount: true },
        },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    await this.assertCanDispatch(order);

    const itemsToDispatch = order.items.filter(
      (i) => input.itemIds.includes(i.id) &&
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH &&
        !(i as any).dispatchedAt,
    );
    if (itemsToDispatch.length === 0) throw new BadRequestException('No ready items selected for dispatch');
    if (!input.transportName?.trim()) throw new BadRequestException('Transport name is required');

    const chargeType = input.transportChargesType === 'PREPAID' ? 'PREPAID' : 'TOPAY';
    const totalCharge = chargeType === 'PREPAID' ? Math.max(0, Number(input.totalTransportCharges || 0)) : 0;
    const creditAdjusted = Math.min(this.paymentCredit(order), totalCharge);
    const netCharge = Math.max(0, totalCharge - creditAdjusted);
    const shipmentNumber = `TRN-${Date.now()}-${randomSuffix()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.shipment.create({
        data: {
          orderId: input.orderId,
          handledById: userId,
          shipmentNumber,
          carrierName: input.transportName.trim(),
          status: ShipmentStatus.IN_TRANSIT,
          dispatchDate: new Date(),
          dispatchType: 'TRANSPORT',
          transportName: input.transportName.trim(),
          lrNumber: input.lrNumber?.trim() || null,
          transportChargesType: chargeType,
          transportBy: input.transportBy?.trim() || null,
          notes: [
            `Items: ${itemsToDispatch.map((i) => i.id).join(', ')}`,
            `Transport: ${input.transportName.trim()}`,
            input.lrNumber?.trim() ? `LR: ${input.lrNumber.trim()}` : '',
            `Charges: ${chargeType}`,
            chargeType === 'PREPAID' ? `Total transport charges: ₹${totalCharge}` : '',
            creditAdjusted > 0 ? `Credit adjusted: ₹${creditAdjusted}` : '',
            chargeType === 'PREPAID' ? `Net transport charges: ₹${netCharge}` : 'To Pay collected by transport',
            input.notes?.trim() || '',
          ].filter(Boolean).join(' | '),
        },
      });

      const newStatus = this.nextOrderStatusAfterDispatch(order, input.itemIds);
      await tx.order.update({
        where: { id: input.orderId },
        data: { status: newStatus, shippingCharge: new Prisma.Decimal(netCharge) },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemsToDispatch.map((i) => i.id) } },
        data: ({ dispatchedAt: new Date() } as any),
      });
      await tx.statusLog.create({
        data: {
          orderId: input.orderId,
          fromStatus: order.status,
          toStatus: newStatus,
          changedById: userId,
          reason: `Dispatched by transport: ${input.transportName.trim()}${input.lrNumber ? ` LR ${input.lrNumber}` : ''}`,
          metadata: { shipmentNumber, dispatchType: 'TRANSPORT', chargeType, totalCharge, creditAdjusted, netCharge },
        },
      });
      return { shipmentNumber, carrierName: input.transportName?.trim(), amount: netCharge, newStatus };
    });

    if (order.customer.phone) {
      const productNames = itemsToDispatch.map(i => i.product.name).join(', ');
      void this.whatsapp.sendOrderUpdate({
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo: order.orderNumber,
        product: productNames,
        status: `Dispatched by transport${input.lrNumber ? ` | LR: ${input.lrNumber}` : ''}`,
        agentName: order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return result;
  }

  async sendDirectOtp(input: DirectDispatchInput, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    await this.assertCanDispatch(order);
    const itemsToDispatch = order.items.filter(
      (i) => input.itemIds.includes(i.id) &&
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH &&
        !(i as any).dispatchedAt,
    );
    if (itemsToDispatch.length === 0) throw new BadRequestException('No ready items selected for dispatch');

    const otp = randomOtp();
    const shipmentNumber = `${input.dispatchType === 'BY_HAND' ? 'HAND' : 'SELF'}-${Date.now()}-${randomSuffix()}`;
    const label = input.dispatchType === 'BY_HAND' ? 'By Hand' : 'Self Collected';

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.shipment.create({
        data: {
          orderId: input.orderId,
          handledById: userId,
          shipmentNumber,
          status: ShipmentStatus.IN_TRANSIT,
          dispatchDate: new Date(),
          dispatchType: input.dispatchType,
          deliveryBoyName: input.deliveryBoyName?.trim() || null,
          collectedByName: input.collectedByName?.trim() || null,
          collectedByPhone: input.collectedByPhone?.trim() || null,
          notes: [
            `Items: ${itemsToDispatch.map((i) => i.id).join(', ')}`,
            `${label} delivery OTP: ${otp}`,
            input.deliveryBoyName?.trim() ? `Delivery Boy: ${input.deliveryBoyName.trim()}` : '',
            input.collectedByName?.trim() ? `Collected By: ${input.collectedByName.trim()}` : '',
            input.collectedByPhone?.trim() ? `Collector Phone: ${input.collectedByPhone.trim()}` : '',
          ].filter(Boolean).join(' | '),
        },
      });
      const newStatus = this.nextOrderStatusAfterDispatch(order, input.itemIds);
      await tx.order.update({ where: { id: input.orderId }, data: { status: newStatus, shippingCharge: new Prisma.Decimal(0) } });
      await tx.orderItem.updateMany({
        where: { id: { in: itemsToDispatch.map((i) => i.id) } },
        data: ({ dispatchedAt: new Date() } as any),
      });
      await tx.statusLog.create({
        data: {
          orderId: input.orderId,
          fromStatus: order.status,
          toStatus: newStatus,
          changedById: userId,
          reason: `${label} OTP sent`,
          metadata: { shipmentNumber, dispatchType: input.dispatchType },
        },
      });
      return { shipmentNumber, dispatchType: input.dispatchType };
    });

    // Await (not fire-and-forget) so we can tell the dispatch staff whether the
    // WhatsApp OTP actually went out, instead of silently swallowing failures.
    let whatsappSent = false;
    if (order.customer.phone) {
      const productNames = itemsToDispatch.map(i => i.product.name).join(', ');
      try {
        whatsappSent = await this.whatsapp.sendOrderUpdate({
          customerName: order.customer.businessName,
          customerPhone: order.customer.phone,
          orderNo: order.orderNumber,
          product: productNames,
          status: `${label} delivery OTP: ${otp}. Share this only after receiving the parcel.`,
          agentName: order.salesAgent?.fullName ?? 'Rareprint Team',
        });
      } catch (e) {
        this.logger.error(`Direct OTP WhatsApp send threw for order ${order.orderNumber}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // If WhatsApp delivery failed (or there's no phone on file), hand the OTP back
    // in the response so dispatch staff can share it with the customer manually
    // (call/SMS) instead of being blocked. Never included when the send succeeded.
    return { ...result, whatsappSent, otp: whatsappSent ? undefined : otp };
  }

  async verifyDirectOtp(orderId: string, otp: string, userId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        orderId,
        dispatchType: { in: ['BY_HAND', 'SELF_COLLECTED'] },
        status: ShipmentStatus.IN_TRANSIT,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
            customer: true,
            salesAgent: { select: { fullName: true } },
            items: { include: { product: true } },
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException('No direct delivery pending OTP verification');
    const storedOtp = shipment.notes?.match(/OTP:\s*(\d{6})/i)?.[1];
    if (!storedOtp || storedOtp !== otp.trim()) throw new BadRequestException('Invalid OTP');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.DELIVERED,
          deliveredAt: new Date(),
          notes: `${shipment.notes ?? ''} | OTP verified`,
        },
      });
      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DELIVERED },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: shipment.order.status,
          toStatus: OrderStatus.DELIVERED,
          changedById: userId,
          reason: `${shipment.dispatchType === 'BY_HAND' ? 'By Hand' : 'Self Collected'} OTP verified`,
          metadata: { shipmentNumber: shipment.shipmentNumber, dispatchType: shipment.dispatchType },
        },
      });
      return order;
    });

    if (shipment.order.customer.phone) {
      void this.whatsapp.sendOrderUpdate({
        customerName: shipment.order.customer.businessName,
        customerPhone: shipment.order.customer.phone,
        orderNo: shipment.order.orderNumber,
        product: shipment.order.items.map((i) => i.product.name).join(', '),
        status: 'Delivered',
        agentName: shipment.order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return updated;
  }

  async getShipmentHistory(limit = 50) {
    const shipments = await this.prisma.shipment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        order: {
          include: {
            customer: { select: { businessName: true, phone: true, shippingAddress: true, billingAddress: true } },
            salesAgent: { select: { fullName: true } },
          },
        },
      },
    });

    return shipments.map((s) => {
      const orderNotes = s.order.notes ?? '';
      const isCod = /\bCOD[:\s]/i.test(orderNotes);
      const codAmountMatch = orderNotes.match(/COD(?:\s+amount)?:\s*₹?(\d+)/i);
      const codAmount = codAmountMatch ? Number(codAmountMatch[1]) : null;

      return {
        id: s.id,
        shipmentNumber: s.shipmentNumber,
        carrierName: s.carrierName,
        trackingNumber: s.trackingNumber,
        dispatchType: s.dispatchType,
        transportName: s.transportName,
        lrNumber: s.lrNumber,
        awbNumber: s.awbNumber,
        status: s.status,
        amount: s.order.shippingCharge ? Number(s.order.shippingCharge) : null,
        isCod,
        codAmount,
        dispatchDate: s.dispatchDate?.toISOString() ?? s.createdAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        orderId: s.orderId,
        orderNo: s.order.orderNumber,
        customerName: s.order.customer.businessName,
        customerPhone: s.order.customer.phone ?? null,
        shippingAddress: s.order.customer.shippingAddress ?? s.order.customer.billingAddress ?? null,
        salesAgentName: s.order.salesAgent?.fullName ?? null,
        notes: s.notes,
        bigshipOrderId: (s as any).bigshipOrderId ?? null,
        bigshipStatus: (s as any).bigshipStatus ?? null,
        bigshipSyncedAt: (s as any).bigshipSyncedAt ? new Date((s as any).bigshipSyncedAt).toISOString() : null,
      };
    });
  }

  /** Pull the real AWB + tracking status from Bigship for a shipment that was booked
   *  through Bigship, and persist it. Lets the ERP refresh on demand instead of only
   *  ever showing whatever was captured at booking time. */
  async syncShipmentFromBigship(shipmentId: string): Promise<{
    success: boolean;
    awbNumber?: string | null;
    status?: string | null;
    message?: string;
  }> {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);
    const bigshipOrderId = (shipment as any).bigshipOrderId as string | null;
    if (!bigshipOrderId) {
      throw new BadRequestException('This shipment has no linked Bigship order to sync from');
    }

    const details = await this.bigship.getOrderShipmentDetails(bigshipOrderId);
    if (details.message && !details.awbNumber && !details.status) {
      return { success: false, message: details.message };
    }

    const mappedStatus = mapBigshipStatusToShipmentStatus(details.status);

    // If Bigship says this order was cancelled (e.g. cancelled directly from their
    // dashboard, outside the ERP), don't just park it as a CANCELLED shipment record —
    // put the order back in the dispatch queue automatically so it can be re-booked,
    // same effect as clicking "↩ Queue" by hand.
    if (mappedStatus === ShipmentStatus.CANCELLED) {
      await this.autoReturnToQueueOnCancellation(shipmentId, details.status ?? 'Cancelled');
      return { success: true, awbNumber: details.awbNumber ?? null, status: details.status ?? null };
    }

    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        ...(details.awbNumber ? { awbNumber: details.awbNumber, trackingNumber: details.awbNumber } : {}),
        ...(mappedStatus ? { status: mappedStatus } : {}),
        ...(mappedStatus === ShipmentStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
        ...({ bigshipStatus: details.status ?? null, bigshipSyncedAt: new Date() } as any),
      },
    });

    return { success: true, awbNumber: details.awbNumber ?? null, status: details.status ?? null };
  }

  /** Same effect as returnToQueue(), but triggered automatically from a Bigship sync
   *  (single or bulk) when the live status comes back cancelled, rather than requiring
   *  a human to notice and click "↩ Queue". changedById is left null since no user
   *  initiated this — it's a system reaction to an external cancellation. */
  private async autoReturnToQueueOnCancellation(shipmentId: string, rawStatus: string): Promise<void> {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) return;

    const order = await this.prisma.order.findUnique({ where: { id: shipment.orderId } });
    if (!order) return;

    // Only orders still sitting in a dispatched state should bounce back to the queue —
    // if it's already DELIVERED/RETURNED or was manually handled since, leave it alone.
    if (order.status !== OrderStatus.DISPATCHED && order.status !== OrderStatus.PARTIALLY_DISPATCHED) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.delete({ where: { id: shipmentId } });
      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        // dispatchedAt must be cleared too, not just itemProductionStage —
        // listReadyForDispatch's readyItems filter excludes any item with
        // dispatchedAt set (see line ~514), so leaving it set here makes the
        // order silently vanish from Dispatch > Queue after being returned.
        data: ({ itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH, dispatchedAt: null } as any),
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      });
      await tx.statusLog.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          changedById: null,
          reason: `Bigship order cancelled ("${rawStatus}") — auto-returned to dispatch queue`,
        },
      });
    });
  }

  /** Sync every open Bigship-linked shipment in one go, instead of clicking
   *  "Sync Bigship" one row at a time. Only touches shipments that have a
   *  bigshipOrderId and are still PACKED/IN_TRANSIT (nothing to gain from
   *  re-syncing something already DELIVERED/CANCELLED/RETURNED). Runs the Bigship
   *  calls a few at a time (not all at once) to avoid hammering their API. */
  async syncAllFromBigship(): Promise<{
    total: number;
    synced: number;
    failed: number;
    results: Array<{ shipmentId: string; shipmentNumber: string; success: boolean; message?: string }>;
  }> {
    const candidates = await this.prisma.shipment.findMany({
      where: { status: { in: [ShipmentStatus.PACKED, ShipmentStatus.IN_TRANSIT] } },
      select: { id: true, shipmentNumber: true, bigshipOrderId: true } as any,
    });
    const shipments = (candidates as unknown as Array<{ id: string; shipmentNumber: string; bigshipOrderId: string | null }>)
      .filter((s) => !!s.bigshipOrderId);

    const results: Array<{ shipmentId: string; shipmentNumber: string; success: boolean; message?: string }> = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < shipments.length; i += CONCURRENCY) {
      const batch = shipments.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (s) => {
          try {
            const r = await this.syncShipmentFromBigship(s.id);
            return { shipmentId: s.id, shipmentNumber: s.shipmentNumber, success: r.success, message: r.message };
          } catch (e) {
            return {
              shipmentId: s.id,
              shipmentNumber: s.shipmentNumber,
              success: false,
              message: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );
      results.push(...batchResults);
    }

    return {
      total: shipments.length,
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /** Manually set/correct the AWB on an existing shipment — for cases like Bigship
   *  where the order was created but never actually shipped (still sitting in
   *  Bigship's "Unshipped" queue), so the ERP has no real AWB to sync yet. Lets a
   *  human ship it from Bigship's own dashboard and paste the resulting AWB back in. */
  async setManualAwb(shipmentId: string, awbNumber: string): Promise<{ success: boolean }> {
    const trimmed = awbNumber.trim();
    if (!trimmed) throw new BadRequestException('AWB number is required');

    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);

    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        awbNumber: trimmed,
        trackingNumber: trimmed,
        ...(shipment.status === ShipmentStatus.PACKED ? { status: ShipmentStatus.IN_TRANSIT } : {}),
      },
    });

    return { success: true };
  }

  async markManuallyDispatched(
    orderId: string,
    userId: string,
    input: { awbNumber?: string; carrierName?: string; trackingNumber?: string; notes?: string; codAmount?: number },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new BadRequestException('Order not found');

    const shipmentNumber = `MAN-${Date.now()}-${randomSuffix()}`;
    const carrierName = input.carrierName?.trim() || 'Manual';
    const trackingRef = input.awbNumber?.trim() || input.trackingNumber?.trim() || null;
    const codPart = input.codAmount ? ` COD: ₹${input.codAmount}` : '';
    const shipmentNotes = input.notes
      ? `${input.notes}${codPart}`
      : `Manually marked as dispatched via ${carrierName}${codPart}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.create({
        data: {
          orderId,
          handledById: userId,
          shipmentNumber,
          carrierName,
          status: ShipmentStatus.PACKED,
          dispatchDate: new Date(),
          trackingNumber: trackingRef,
          awbNumber: trackingRef,
          dispatchType: 'COURIER',
          notes: shipmentNotes,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DISPATCHED },
      });

      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.DISPATCHED,
          changedById: userId,
          reason: `Manually marked as dispatched. Carrier: ${carrierName}${trackingRef ? `. AWB: ${trackingRef}` : ''}`,
          metadata: { shipmentNumber, carrierName, awbNumber: trackingRef },
        },
      });
    });

    if (order.customer.phone) {
      void this.whatsapp.sendOrderUpdate({
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo: order.orderNumber,
        product: order.items.map(i => i.product.name).join(', '),
        status: `Dispatched via ${carrierName}${trackingRef ? `. Tracking: ${trackingRef}` : ''}`,
        agentName: order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return { success: true, shipmentNumber, carrierName, awbNumber: trackingRef };
  }

  /** Return a dispatched order back to the dispatch queue.
   *  Deletes the latest shipment record and resets order + items to READY_FOR_DISPATCH.
   *
   *  Safety check: if the shipment is linked to a Bigship order, this refuses to run
   *  unless Bigship confirms the order is actually cancelled (live check, not the
   *  ERP's possibly-stale cached bigshipStatus) — otherwise a still-active shipment
   *  could get silently requeued and rebooked, risking a duplicate dispatch. A
   *  "not found"/"does not exist" response from Bigship is also treated as cancelled:
   *  that's the response Bigship gives for a draft that was cancelled before it was
   *  ever manifested (still in their Unshipped tab), so there's genuinely nothing
   *  left there to conflict with. Shipments with no Bigship order (manual/by-hand
   *  dispatch etc.) skip this check entirely — nothing external to verify against. */
  async returnToQueue(orderId: string, userId: string): Promise<{ success: boolean }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, shipments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const latestShipment = order.shipments[0];
    const bigshipOrderId = (latestShipment as any)?.bigshipOrderId as string | null | undefined;
    if (latestShipment && bigshipOrderId) {
      const details = await this.bigship.getOrderShipmentDetails(bigshipOrderId);
      const mappedStatus = mapBigshipStatusToShipmentStatus(details.status);
      const bigshipOrderGone = !!details.message &&
        /not found|does not exist|invalid order/i.test(details.message);
      const isCancelled = mappedStatus === ShipmentStatus.CANCELLED || bigshipOrderGone;
      if (!isCancelled) {
        throw new BadRequestException(
          `Cannot return to queue — Bigship order ${bigshipOrderId} is not cancelled ` +
          `(current status: ${details.status || details.message || 'unknown'}). ` +
          `Cancel it in Bigship first, then try again.`,
        );
      }
      // Persist the confirmed status so History reflects what we just verified,
      // even though the shipment row itself is about to be deleted below.
      await this.prisma.shipment.update({
        where: { id: latestShipment.id },
        data: ({ bigshipStatus: details.status ?? 'Cancelled', bigshipSyncedAt: new Date() } as any),
      }).catch(() => {}); // best-effort — deletion right after makes this non-critical
    }

    await this.prisma.$transaction(async (tx) => {
      if (order.shipments.length > 0) {
        await tx.shipment.delete({ where: { id: order.shipments[0].id } });
      }
      await tx.orderItem.updateMany({
        where: { orderId },
        // dispatchedAt must be cleared too — see identical comment in
        // autoReturnToQueueOnCancellation above, same bug/fix.
        data: ({ itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH, dispatchedAt: null } as any),
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          changedById: userId,
          reason: 'Returned to dispatch queue by user',
        },
      });
    });

    return { success: true };
  }

  /** Mark a shipment (and its order) DELIVERED from the Dispatch > History list, and
   *  fire the "rate us / review / testimonial" WhatsApp utility template to the customer —
   *  see WhatsAppService.sendDeliveryReviewRequest for the template copy/points breakdown. */
  async markDelivered(shipmentId: string, userId: string, reason = 'Marked delivered from Dispatch history') {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          include: {
            customer: true,
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);
    if (shipment.status === ShipmentStatus.DELIVERED) {
      return shipment;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.DELIVERED,
          deliveredAt: new Date(),
          // Keep the displayed "live status as reported by Bigship" text in
          // sync too -- without this, a shipment marked delivered here (by
          // hand or via the bulk Delivered Orders Report import) kept
          // showing whatever bigshipStatus was last captured at booking
          // time (e.g. "Pickup Scheduled") forever, since the Sync button
          // that would normally refresh it only shows for PACKED/IN_TRANSIT
          // shipments and disappears once status flips to DELIVERED. Same
          // "as any" spread pattern already used for this field elsewhere
          // in this file (syncShipmentFromBigship, autoReturnToQueue, etc.)
          // -- safe for a `data:` write payload, unlike a `select`/`include`
          // query shape. Only touch it for shipments actually booked
          // through Bigship -- for Manual-courier shipments this field
          // should stay null, since there's no real Bigship status to show.
          ...((shipment as any).bigshipOrderId
            ? ({ bigshipStatus: 'Delivered', bigshipSyncedAt: new Date() } as any)
            : {}),
        },
      });
      await tx.order.update({
        where: { id: shipment.orderId },
        data: { status: OrderStatus.DELIVERED },
      });
      await tx.statusLog.create({
        data: {
          orderId: shipment.orderId,
          fromStatus: shipment.order.status,
          toStatus: OrderStatus.DELIVERED,
          changedById: userId,
          reason,
          metadata: { shipmentNumber: shipment.shipmentNumber },
        },
      });
      return updatedShipment;
    });

    if (shipment.order.customer.phone) {
      void this.whatsapp.sendDeliveryReviewRequest({
        customerName: shipment.order.customer.businessName,
        customerPhone: shipment.order.customer.phone,
        orderNo: shipment.order.orderNumber,
        pointsBalance: shipment.order.loyaltyPointsEarned ?? 0,
      });
    }

    return updated;
  }

  // ── Bigship "Delivered Orders Report" bulk import ─────────────────────────
  //
  // Daily workflow: download the Delivered Orders Report from Bigship's
  // dashboard and drop it in here (Dispatch > History). Every row is matched
  // against shipments that are still open (not already DELIVERED) using the
  // same three signals as the Remittance importer, in order of confidence:
  //   1. AWB number — exact match against Shipment.awbNumber (unambiguous;
  //      it's the courier's own tracking number, set when we book the
  //      shipment or sync from Bigship).
  //   2. Channel Order Id / Invoice Number — resolved to Order.orderNumber
  //      via deriveOrderNumberCandidates (handles the RP-prefix / stray
  //      leading zeros Bigship round-trips through).
  //   3. Receiver mobile — matched against Customer.phone; only used when
  //      AWB/order-number found nothing, and only trusted outright if it
  //      resolves to exactly one open shipment for that customer.
  // A row that resolves to more than one open shipment (e.g. same phone
  // number on two live orders) is never auto-picked — it's surfaced for the
  // admin to choose from, per how this was scoped. Rows that don't resolve
  // to anything are still returned (as UNMATCHED) so nothing silently
  // disappears; the admin can always fall back to marking those by hand.
  //
  // This only reads — nothing is written until confirmDeliveredFromReport is
  // called with the specific shipmentIds the admin approved.

  private parseDeliveredOrdersReport(buffer: Buffer) {
    const rows = sheetToObjects(buffer, [
      'AWB No.', 'Channel Order Id / Invoice Number', 'Receiver Mobile1', 'Order Status',
    ]);
    return rows
      .map((r, idx) => ({
        rowNumber: idx + 2, // +1 for 0-index, +1 for the header row itself
        orderStatus: r['Order Status'] ? String(r['Order Status']).trim() : null,
        awb: normalizeAwb(r['AWB No.']),
        channelOrderId: r['Channel Order Id / Invoice Number'] ?? null,
        receiverName: r['Receiver Name'] ? String(r['Receiver Name']).trim() : null,
        receiverMobile:
          (r['Receiver Mobile1'] && String(r['Receiver Mobile1']).trim()) ||
          (r['Receiver Mobile2'] && String(r['Receiver Mobile2']).trim()) ||
          null,
        orderDate: parseFlexibleDate(r['Order Date']),
        courierName: r['Courier Name'] ? String(r['Courier Name']).trim() : null,
        productDetails: r['Product Details'] ? String(r['Product Details']).trim() : null,
      }))
      // Bigship's "Delivered Orders Report" is pre-filtered to delivered rows, but
      // don't trust the filename — only act on rows the sheet itself marks Delivered,
      // in case someone exports a broader report by mistake.
      .filter((r) => r.awb && (r.orderStatus ?? '').toLowerCase() === 'delivered');
  }

  async previewDeliveredReportMatch(buffer: Buffer) {
    const rows = this.parseDeliveredOrdersReport(buffer);
    if (rows.length === 0) {
      throw new BadRequestException(
        'No delivered rows found in this file — make sure it\'s the Bigship "Delivered Orders Report" export.',
      );
    }

    // Candidate pool: every shipment still open (not already DELIVERED/CANCELLED),
    // scoped to real orders only. Kept in memory and matched per-row below rather
    // than N+1 querying — this pool is always small (only what's currently out
    // for delivery), never the full shipment history.
    const openShipments = await this.prisma.shipment.findMany({
      where: {
        status: { notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
        order: { isTest: false },
      },
      include: { order: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const byAwb = new Map<string, typeof openShipments>();
    const byOrderNumber = new Map<string, typeof openShipments>();
    const byPhone = new Map<string, typeof openShipments>();
    for (const s of openShipments) {
      const awb = normalizeAwb(s.awbNumber);
      if (awb) byAwb.set(awb, [...(byAwb.get(awb) ?? []), s]);
      byOrderNumber.set(s.order.orderNumber, [...(byOrderNumber.get(s.order.orderNumber) ?? []), s]);
      const phone = normalizeMobile(s.order.customer.phone);
      if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), s]);
    }

    const toCandidate = (s: (typeof openShipments)[number]) => ({
      shipmentId: s.id,
      orderId: s.orderId,
      orderNo: s.order.orderNumber,
      customerName: s.order.customer.businessName,
      customerPhone: s.order.customer.phone,
      shipmentStatus: s.status,
      awbNumber: s.awbNumber,
    });

    const results = rows.map((row) => {
      const orderNumberCandidates = deriveOrderNumberCandidates(row.channelOrderId);
      const receiverMobile = normalizeMobile(row.receiverMobile);

      const awbMatches = row.awb ? (byAwb.get(row.awb) ?? []) : [];
      const orderNoMatches = orderNumberCandidates.flatMap((c) => byOrderNumber.get(c) ?? []);
      const phoneMatches = receiverMobile ? (byPhone.get(receiverMobile) ?? []) : [];

      // Dedup across signals (a shipment can legitimately show up via more than one).
      const uniqueBy = <T extends { id: string }>(list: T[]) => Array.from(new Map(list.map((s) => [s.id, s])).values());

      let matchStatus: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';
      let matchMethod: string | null = null;
      let matched: (typeof openShipments)[number] | null = null;
      let candidates: (typeof openShipments)[number][] = [];

      if (awbMatches.length === 1) {
        matchStatus = 'MATCHED'; matchMethod = 'AWB'; matched = awbMatches[0];
      } else if (awbMatches.length > 1) {
        matchStatus = 'AMBIGUOUS'; matchMethod = 'AWB'; candidates = uniqueBy(awbMatches);
      } else if (orderNoMatches.length === 1) {
        matchStatus = 'MATCHED'; matchMethod = 'ORDER_NUMBER'; matched = orderNoMatches[0];
      } else if (orderNoMatches.length > 1) {
        matchStatus = 'AMBIGUOUS'; matchMethod = 'ORDER_NUMBER'; candidates = uniqueBy(orderNoMatches);
      } else if (phoneMatches.length === 1) {
        matchStatus = 'MATCHED'; matchMethod = 'MOBILE'; matched = phoneMatches[0];
      } else if (phoneMatches.length > 1) {
        matchStatus = 'AMBIGUOUS'; matchMethod = 'MOBILE'; candidates = uniqueBy(phoneMatches);
      } else {
        matchStatus = 'UNMATCHED';
      }

      // A confident AWB/order-number match whose receiver mobile doesn't agree with
      // the matched order's customer phone is still returned as MATCHED (AWB and
      // order-number are stronger signals than phone), but flagged so the admin can
      // eyeball it rather than it looking identical to a fully-agreeing row.
      const phoneMismatch =
        !!matched && !!receiverMobile && !!normalizeMobile(matched.order.customer.phone) &&
        normalizeMobile(matched.order.customer.phone) !== receiverMobile;

      return {
        rowNumber: row.rowNumber,
        awb: row.awb,
        channelOrderId: row.channelOrderId != null ? String(row.channelOrderId) : null,
        receiverName: row.receiverName,
        receiverMobile: row.receiverMobile,
        orderDate: row.orderDate?.toISOString() ?? null,
        courierName: row.courierName,
        productDetails: row.productDetails,
        matchStatus,
        matchMethod,
        phoneMismatch,
        matched: matched ? toCandidate(matched) : null,
        candidates: candidates.map(toCandidate),
      };
    });

    return {
      totalRows: rows.length,
      matched: results.filter((r) => r.matchStatus === 'MATCHED').length,
      ambiguous: results.filter((r) => r.matchStatus === 'AMBIGUOUS').length,
      unmatched: results.filter((r) => r.matchStatus === 'UNMATCHED').length,
      rows: results,
    };
  }

  /** Bulk-applies markDelivered to every shipmentId the admin approved from the
   *  preview above. Runs one at a time (not a single transaction) so one bad
   *  row can't roll back the rest of a large daily batch — failures are
   *  collected and returned instead of thrown. */
  async confirmDeliveredFromReport(shipmentIds: string[], userId: string) {
    const results: { shipmentId: string; success: boolean; error?: string }[] = [];
    for (const shipmentId of shipmentIds) {
      try {
        await this.markDelivered(shipmentId, userId, 'Marked delivered via Bigship Delivered Orders Report import');
        results.push({ shipmentId, success: true });
      } catch (err: any) {
        results.push({ shipmentId, success: false, error: err?.message ?? 'Unknown error' });
      }
    }
    return {
      success: true,
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success),
    };
  }

  // ── Courier Charges (Dispatch > Courier Charges) ──────────────────────────
  // Bigship's COD remittance sometimes bundles freight into "collected
  // amount", and posting that straight onto the order (see remittance.service.ts)
  // used to inflate the customer's paid amount and later get silently
  // "adjusted" against their next order. This section keeps courier money in
  // its own ledger, entirely separate from Order.grandTotal/payments:
  //   - "Actual" cost is auto-fetched from Bigship's monthly Shipping Charges
  //     report (Total Charges — already includes freight + any
  //     overweight/RTO surcharge, see Order Status on RTO/Cancelled rows
  //     where Total > Freight), matched by AWB against Shipment.awbNumber
  //     (which the ERP itself set at dispatch time — no fuzzy matching
  //     needed, unlike remittance's order-number/phone fallback).
  //   - "Taken from customer" is entered by hand by dispatch/sales staff on
  //     Shipment.courierChargeCollected — never negative.
  //   - "Net" = Taken − Actual = courier profit/loss on that shipment.

  private parseShippingChargesReport(buffer: Buffer) {
    const rows = sheetToObjects(buffer, ['AWBNumber', 'Order Id', 'Total Charges', 'Freight Charges']);
    const num = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[₹,\s]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    return rows
      .map((r) => ({
        awb: normalizeAwb(r['AWBNumber']),
        bigshipOrderId: r['Order Id'] != null ? String(r['Order Id']).trim() : null,
        courierName: r['Courier'] ? String(r['Courier']).trim() : null,
        orderStatus: r['Order Status'] ? String(r['Order Status']).trim() : null,
        courierCreatedAt: parseFlexibleDate(r['Created At']),
        manifestedWeight: num(r['Manifested Weight (kg)']),
        appliedWeight: num(r['Applied Weight (kg)']),
        weightParameter: r['Weight Parameter'] ? String(r['Weight Parameter']).trim() : null,
        freightCharges: num(r['Freight Charges']),
        totalCharges: num(r['Total Charges']) ?? 0,
        orderValue: num(r['Order Value']),
        productsRaw: r['Products'] ? String(r['Products']) : null,
      }))
      .filter((r) => r.awb);
  }

  async importShippingChargesReport(buffer: Buffer, fileName: string, userId: string) {
    const rows = this.parseShippingChargesReport(buffer);
    if (rows.length === 0) {
      throw new BadRequestException(
        'No valid rows found — make sure this is the Bigship "Shipping Charges" monthly export (needs an AWBNumber column).',
      );
    }
    for (const row of rows) {
      const data = {
        bigshipOrderId: row.bigshipOrderId,
        courierName: row.courierName,
        orderStatus: row.orderStatus,
        courierCreatedAt: row.courierCreatedAt,
        manifestedWeight: row.manifestedWeight != null ? new Prisma.Decimal(row.manifestedWeight) : null,
        appliedWeight: row.appliedWeight != null ? new Prisma.Decimal(row.appliedWeight) : null,
        weightParameter: row.weightParameter,
        freightCharges: row.freightCharges != null ? new Prisma.Decimal(row.freightCharges) : null,
        totalCharges: new Prisma.Decimal(row.totalCharges),
        orderValue: row.orderValue != null ? new Prisma.Decimal(row.orderValue) : null,
        productsRaw: row.productsRaw,
        sourceFileName: fileName,
        importedById: userId,
      };
      await (this.prisma as any).shippingChargeRecord.upsert({
        where: { awbNumber: row.awb },
        create: { awbNumber: row.awb, ...data },
        update: data,
      });
    }
    return { success: true, rowsProcessed: rows.length };
  }

  async listCourierCharges(query: { month?: string } = {}) {
    const where: any = {
      status: { not: ShipmentStatus.CANCELLED },
      order: { isTest: false },
    };
    if (query.month) {
      const [y, m] = query.month.split('-').map((n) => Number(n));
      if (y && m) where.dispatchDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const shipments = await this.prisma.shipment.findMany({
      where,
      orderBy: { dispatchDate: 'desc' },
      include: {
        order: {
          include: {
            customer: { select: { businessName: true, phone: true } },
            salesAgent: { select: { fullName: true } },
          },
        },
      },
    });

    const awbs = shipments
      .map((s) => (s.dispatchType === 'COURIER' && s.awbNumber ? normalizeAwb(s.awbNumber) : null))
      .filter((a): a is string => !!a);
    const chargeRecords = awbs.length
      ? await (this.prisma as any).shippingChargeRecord.findMany({ where: { awbNumber: { in: awbs } } })
      : [];
    const byAwb = new Map<string, any>(chargeRecords.map((r: any) => [r.awbNumber, r]));

    // Resolve the best-known live status for each shipment, preferring the
    // most authoritative source available: the courier's own reconciled
    // "Order Status" from the uploaded Shipping Charges report (ground
    // truth), then Bigship's last-synced live status (bigshipStatus — can
    // be ahead of the ERP's local `status` enum if a shipment was cancelled
    // directly in Bigship's dashboard and nobody has clicked "Sync Bigship"
    // for it since), then finally the local ERP status as a last resort.
    // Cancelled shipments are excluded below — once cancelled, the courier
    // doesn't actually charge for it (amount gets credited back), so it has
    // no place in a courier profit/loss reconciliation.
    const rows = shipments
      .map((s) => {
        const isCourier = s.dispatchType === 'COURIER';
        const awb = isCourier && s.awbNumber ? normalizeAwb(s.awbNumber) : null;
        const chargeRecord = awb ? byAwb.get(awb) : undefined;
        const parcelStatus = chargeRecord?.orderStatus ?? (s as any).bigshipStatus ?? s.status;
        // Prefer the reconciled real cost from the uploaded Shipping Charges
        // report (accounts for weight/RTO surcharges); fall back to the rate
        // quote captured at booking time so this is never blank in between.
        const actual = chargeRecord
          ? Number(chargeRecord.totalCharges)
          : (s as any).courierChargeActual != null
          ? Number((s as any).courierChargeActual)
          : null;
        const taken = (s as any).courierChargeCollected != null ? Number((s as any).courierChargeCollected) : null;
        const net = actual != null && taken != null ? taken - actual : null;
        return {
          shipmentId: s.id,
          orderId: s.orderId,
          orderNo: s.order.orderNumber,
          customerName: s.order.customer.businessName,
          salesAgentName: s.order.salesAgent?.fullName ?? null,
          dispatchDate: s.dispatchDate?.toISOString() ?? s.createdAt.toISOString(),
          dispatchType: s.dispatchType,
          awbNumber: awb,
          carrierName: s.carrierName,
          courierOrderStatus: chargeRecord?.orderStatus ?? null,
          parcelStatus,
          actual,
          taken,
          net,
          hasReportData: !!chargeRecord,
        };
      })
      .filter((r) => !/cancel/i.test(r.parcelStatus ?? ''));

    const totals = rows.reduce(
      (acc, r) => {
        if (r.actual != null) acc.actual += r.actual;
        if (r.taken != null) acc.taken += r.taken;
        if (r.net != null) acc.net += r.net;
        return acc;
      },
      { actual: 0, taken: 0, net: 0 },
    );

    return { rows, totals, count: rows.length };
  }

  async updateCourierChargeCollected(shipmentId: string, amount: number) {
    if (amount == null || Number.isNaN(amount) || amount < 0) {
      throw new BadRequestException('Courier charge collected must be a non-negative amount');
    }
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const updated = await (this.prisma.shipment as any).update({
      where: { id: shipmentId },
      data: { courierChargeCollected: new Prisma.Decimal(amount), courierChargeUpdatedAt: new Date() },
    });
    return { shipmentId: updated.id, courierChargeCollected: Number(updated.courierChargeCollected) };
  }

  // Owner-facing Dashboard summary — monthly totals across every courier
  // shipment (Actual from the Shipping Charges report, Taken from what
  // agents entered, Net = profit/loss). Grouped by dispatch month.
  async getMonthlyCourierProfitSummary(monthsBack = 12) {
    // Cast the model accessor (not the `select` object) to `any` here —
    // casting `select` itself made Prisma's generic return-type inference
    // collapse every selected field (including plain pre-existing ones like
    // dispatchDate) down to `never`, which broke the build
    // ("Property 'getFullYear' does not exist on type 'never'").
    const shipments = await (this.prisma.shipment as any).findMany({
      where: {
        dispatchType: 'COURIER',
        status: { not: ShipmentStatus.CANCELLED },
        dispatchDate: { not: null },
        order: { isTest: false },
      },
      select: { dispatchDate: true, awbNumber: true, courierChargeCollected: true, bigshipStatus: true },
    });

    const awbs = shipments.map((s) => (s.awbNumber ? normalizeAwb(s.awbNumber) : null)).filter((a): a is string => !!a);
    const chargeRecords = awbs.length
      ? await (this.prisma as any).shippingChargeRecord.findMany({ where: { awbNumber: { in: awbs } }, select: { awbNumber: true, totalCharges: true, orderStatus: true } })
      : [];
    const byAwb = new Map<string, number>(chargeRecords.map((r: any) => [r.awbNumber, Number(r.totalCharges)]));
    const statusByAwb = new Map<string, string | null>(chargeRecords.map((r: any) => [r.awbNumber, r.orderStatus]));

    const byMonth = new Map<string, { actual: number; taken: number; net: number; shipments: number }>();
    for (const s of shipments) {
      if (!s.dispatchDate) continue;
      const awb = s.awbNumber ? normalizeAwb(s.awbNumber) : null;
      // Same cancellation gap as listCourierCharges: local `status` can be
      // stale if a shipment was cancelled directly in Bigship and nobody
      // has synced since — check the reconciled report status and Bigship's
      // last-synced live status too, so this dashboard rollup and the
      // Dispatch > Courier Charges page never disagree.
      const resolvedStatus = (awb ? statusByAwb.get(awb) : null) ?? s.bigshipStatus;
      if (resolvedStatus && /cancel/i.test(resolvedStatus)) continue;
      const monthKey = `${s.dispatchDate.getFullYear()}-${String(s.dispatchDate.getMonth() + 1).padStart(2, '0')}`;
      const actual = awb ? byAwb.get(awb) ?? null : null;
      const taken = (s as any).courierChargeCollected != null ? Number((s as any).courierChargeCollected) : null;
      const bucket = byMonth.get(monthKey) ?? { actual: 0, taken: 0, net: 0, shipments: 0 };
      bucket.shipments += 1;
      if (actual != null) bucket.actual += actual;
      if (taken != null) bucket.taken += taken;
      if (actual != null && taken != null) bucket.net += taken - actual;
      byMonth.set(monthKey, bucket);
    }

    return Array.from(byMonth.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-monthsBack);
  }

}
