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

function splitAddressForShiprocket(customer: {
  shippingAddress: string | null;
  billingAddress: string | null;
  businessName: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): { line: string; city: string; state: string; pincode: string } {
  const raw = customer.shippingAddress?.trim() || customer.billingAddress?.trim() || customer.businessName;
  const pin = customer.pincode?.trim() || extractPincode(raw) || '110001';
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

  private nextOrderStatusAfterDispatch(order: { items: Array<{ id: string; itemProductionStage: OrderProductionStage }> }, itemIds: string[]): OrderStatus {
    const selected = new Set(itemIds);
    const readyItems = order.items.filter((i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH);
    const allReadyItemsSelected = readyItems.length > 0 && readyItems.every((i) => selected.has(i.id));
    const everyOrderItemWasReady = order.items.every((i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH);
    return allReadyItemsSelected && everyOrderItemWasReady
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
      const readyItems = o.items.filter(
        (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
      );
      if (readyItems.length === 0) continue;

      const paymentInfo = this.dispatchPaymentInfo(o);
      const isSample = (o as any).isSample ?? false;
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
    // Rate fetching only needs a valid dispatchable status — skip the approval
    // log check here (that's enforced on actual booking in bookItems).
    const dispatchableStatuses: OrderStatus[] = [OrderStatus.READY_FOR_DISPATCH, OrderStatus.PARTIALLY_DISPATCHED];
    if (!dispatchableStatuses.includes(order.status)) {
      throw new BadRequestException('Order must be in a dispatchable status to fetch rates');
    }

    const readyItems = order.items.filter(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );
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
              invoiceAmount: Number(order.grandTotal),
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

  async bookItems(orderId: string, itemIds: string[], rateId: string, userId: string, isCod?: boolean, codAmount?: number, warehouseId?: string, weightKgOverride?: number, pickupOverride?: PickupOverride, selectedQuote?: SelectedRateQuote, packageBoxes?: DispatchPackageBox[]) {
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
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );
    if (itemsToDispatch.length === 0) {
      throw new BadRequestException('No ready items selected for dispatch');
    }

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
          weightKg, subTotal: Number(order.grandTotal),
          courierId,
          isCod: orderIsCod,
          codAmount: orderCodAmt,
          pickupWarehouseId: bsPickupWHId,
          packageBoxes: normalizedBoxes,
        });
      }

      if (!bs.bigshipOrderId) {
        const message = bs.message ?? 'no Bigship order ID returned';
        throw new BadRequestException(`Bigship booking failed: ${message}`);
      }

      // ── Manifest immediately (place-order) so the AWB comes back and gets stored
      // here in the ERP. Without this, tryCreateAdhocOrder only leaves an unmanifested
      // draft in Bigship — the user then has to open the Bigship dashboard, pick the
      // courier again and click "Ship Now" by hand, which is also what was silently
      // discarding the multi-box package details (Bigship's manual Ship Now flow does
      // not carry over the box list from the API-created draft). Auto-invoice is
      // generated inside placeExistingOrder when no invoice file has been uploaded.
      let manifestFailure = '';
      if (!bs.awbNumber) {
        // Defensive try/catch: the draft order already exists in Bigship at this point
        // (created moments ago with a specific invoice number). If manifesting throws for
        // any unexpected reason, we must NOT let it fail the whole booking request — that
        // would burn through the RP/0RP/00RP invoice-candidate fallback on retry and could
        // eventually stop new orders from reaching Bigship at all. Fall back to the
        // pre-existing "manual manifest pending" behavior instead.
        try {
          const placed = await this.bigship.placeExistingOrder({
            masterCustomOrderId: bs.bigshipOrderId,
            courierId,
            invoiceData: {
              orderNumber: order.orderNumber,
              customerName: order.customer.businessName,
              amount: Number(order.grandTotal),
            },
          });
          if (placed.awbNumber) {
            bs = { ...bs, awbNumber: placed.awbNumber };
          } else if (placed.message) {
            manifestFailure = placed.message;
            this.logger.warn(`Bigship manifest (place-order) failed for order ${bs.bigshipOrderId}: ${placed.message}`);
          }
        } catch (e) {
          manifestFailure = e instanceof Error ? e.message : String(e);
          this.logger.warn(`Bigship manifest (place-order) threw unexpectedly for order ${bs.bigshipOrderId}: ${manifestFailure}`);
        }
      }

      // ── Courier fallback ──────────────────────────────────────────────────
      // The confirmed courier can still fail at place-order time for reasons that
      // have nothing to do with our booking (e.g. "380005 is non serviceable
      // pincode" — confirmed live 2026-07-30) even though it passed rate
      // confirmation moments earlier. Rather than leaving the order stuck
      // unmanifested in Bigship until someone manually retries with a different
      // courier, try up to 2 alternate couriers (courierId is just a per-call
      // field on place-order — the same draft order can be placed with a
      // different courier without recreating it).
      if (!bs.awbNumber && manifestFailure) {
        try {
          const isB2BFallback = bigshipTotalBoxCount(normalizedBoxes) > 1;
          const alternates = isB2BFallback
            ? await this.bigship.fetchB2BCourierRates({
                pickupPostcode: warehouse.pincode,
                deliveryPostcode: addr.pincode,
                weightKg,
                isCod: orderIsCod,
                codAmount: orderCodAmt,
                invoiceAmount: Number(order.grandTotal),
                orderNumber: order.orderNumber,
                shippingName: order.customer.businessName,
                shippingMobile: order.customer.phone ?? undefined,
                shippingEmail: order.customer.email ?? undefined,
                shippingAddress: addr.line,
                pickupWarehouseId: bsPickupWHId,
                packageBoxes: normalizedBoxes,
              })
            : await this.bigship.fetchCourierRates({
            pickupPostcode: warehouse.pincode,
            deliveryPostcode: addr.pincode,
            weightKg,
            isCod: orderIsCod,
            codAmount: orderCodAmt,
            invoiceAmount: Number(order.grandTotal),
            orderNumber: order.orderNumber,
            shippingCity: addr.city,
            shippingState: addr.state,
            packageBoxes: normalizedBoxes,
          });
          const tried = new Set([courierId]);
          const candidates = alternates
            .filter((r) => r.courierId > 0 && !tried.has(r.courierId))
            .sort((a, b) => a.amount - b.amount)
            .slice(0, 2);
          for (const candidate of candidates) {
            if (bs.awbNumber) break;
            tried.add(candidate.courierId);
            try {
              this.logger.log(`Bigship manifest fallback — retrying order ${bs.bigshipOrderId} with courier ${candidate.courierId} (${candidate.carrierName}) after: ${manifestFailure}`);
              const retried = await this.bigship.placeExistingOrder({
                masterCustomOrderId: bs.bigshipOrderId,
                courierId: candidate.courierId,
                invoiceData: {
                  orderNumber: order.orderNumber,
                  customerName: order.customer.businessName,
                  amount: Number(order.grandTotal),
                },
              });
              if (retried.awbNumber) {
                bs = { ...bs, awbNumber: retried.awbNumber };
                manifestFailure = '';
              } else if (retried.message) {
                manifestFailure = retried.message;
                this.logger.warn(`Bigship manifest fallback — courier ${candidate.courierId} also failed for order ${bs.bigshipOrderId}: ${retried.message}`);
              }
            } catch (e) {
              manifestFailure = e instanceof Error ? e.message : String(e);
              this.logger.warn(`Bigship manifest fallback — courier ${candidate.courierId} threw for order ${bs.bigshipOrderId}: ${manifestFailure}`);
            }
          }
        } catch (e) {
          this.logger.warn(`Bigship manifest fallback — could not fetch alternate couriers for order ${bs.bigshipOrderId}: ${e instanceof Error ? e.message : e}`);
        }
      }

      trackingRef    = bs.awbNumber ?? '';
      awbNumber      = bs.awbNumber ?? null;
      bigshipOrderId = bs.bigshipOrderId ?? null;
      shiprocketNote = ` BigShip Order: ${bs.bigshipOrderId}${bs.awbNumber ? ` AWB: ${bs.awbNumber}` : ` (manual manifest pending${manifestFailure ? ` — ${manifestFailure.slice(0, 150)}` : ''})`}.`;
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
          weightKg, subTotal: Number(order.grandTotal),
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
            status: ShipmentStatus.PACKED,
            dispatchDate: new Date(),
            trackingNumber: trackingRef || null,
            awbNumber,
            dispatchType: 'COURIER',
            transportChargesType: orderIsCod ? 'COD' : 'PREPAID',
            // bigshipOrderId isn't in the generated Prisma types until `prisma generate`
            // picks up the new schema column at deploy time (see feedback memory on this
            // repo's sandbox not regenerating the client locally) — cast to bypass that.
            ...(bigshipOrderId ? ({ bigshipOrderId } as any) : {}),
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
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
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
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
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
        data: { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH },
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
   *  Deletes the latest shipment record and resets order + items to READY_FOR_DISPATCH. */
  async returnToQueue(orderId: string, userId: string): Promise<{ success: boolean }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, shipments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    await this.prisma.$transaction(async (tx) => {
      if (order.shipments.length > 0) {
        await tx.shipment.delete({ where: { id: order.shipments[0].id } });
      }
      await tx.orderItem.updateMany({
        where: { orderId },
        data: { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH },
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
  async markDelivered(shipmentId: string, userId: string) {
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
        data: { status: ShipmentStatus.DELIVERED, deliveredAt: new Date() },
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
          reason: 'Marked delivered from Dispatch history',
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

}
