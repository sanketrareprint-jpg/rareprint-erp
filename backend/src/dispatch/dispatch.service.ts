// backend/src/dispatch/dispatch.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderProductionStage, OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShiprocketService, type ShiprocketPickupLocation } from '../shiprocket/shiprocket.service';
import { BigshipService, type BigshipPackageBox } from '../bigship/bigship.service';
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
}): { line: string; city: string; state: string; pincode: string } {
  const raw = customer.shippingAddress?.trim() || customer.billingAddress?.trim() || customer.businessName;
  const pin = extractPincode(raw) || '110001';
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const city  = parts.length >= 2 ? parts[parts.length - 2]! : 'City';
  const state = parts.length >= 3 ? parts[parts.length - 3]! : 'State';
  const line  = parts.length ? parts.slice(0, Math.max(1, parts.length - 2)).join(', ') : raw;
  return { line: line || 'Address', city, state, pincode: pin };
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

  async getWarehouses(): Promise<Warehouse[]> {
    const activeCarrier = this.carrierConfig.getActiveCarrier();

    // ── Bigship: return all warehouses from cache (fast, no blocking) ──────────
    if (activeCarrier === 'bigship' && this.bigship.isConfigured()) {
      const cfg = this.carrierConfig.getConfig().bigship;
      const defaultPickupId = cfg.pickupWarehouseId;

      // Try to get from cache first (instant), trigger refresh in background
      const cached = await this.bigship.getCachedWarehouses();

      if (cached.length > 0) {
        // Return all active warehouses with real names from Bigship
        return cached
          .filter(w => w.isActive)
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

  async listReadyForDispatch() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          notIn: [
            OrderStatus.DISPATCHED,
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
          ],
        },
        items: {
          some: {
            itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });

    const result: Array<{
      id: string; orderNo: string; customerName: string;
      customerPhone: string | null; salesAgentName: string | null;
      shipTo: string; weightKg: number; orderDate: string;
      totalItems: number; readyItemsCount: number;
      dispatchType: 'COURIER' | 'TRANSPORT' | 'BY_HAND' | 'SELF_COLLECTED';
      paymentType: 'COD' | 'PREPAID';
      isCod: boolean; codAmount: number | null;
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

      // Detect COD from notes — handle both formats written by submitForDispatch and submitDispatchBatch
      const notesIsCod = /\bCOD[:\s]/i.test(o.notes ?? '');
      const notesCodeAmountMatch = (o.notes ?? '').match(/COD(?:\s+amount)?:\s*₹?(\d+)/i);
      const notescodAmount = notesCodeAmountMatch ? Number(notesCodeAmountMatch[1]) : null;

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
        paymentType: notesIsCod ? 'COD' : 'PREPAID',
        isCod: notesIsCod,
        codAmount: notescodAmount,
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
      include: { customer: true, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

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
                       process.env.SHIPROCKET_DEFAULT_DELIVERY_PINCODE?.trim() || pickup;
    const addr = splitAddressForShiprocket(order.customer);
    const orderIsCod = /\bCOD[:\s]/i.test(order.notes ?? '');
    const orderCodAmt = (() => {
      const m = (order.notes ?? '').match(/COD(?:\s+amount)?:\s*₹?(\d+)/i);
      return m ? Number(m[1]) : undefined;
    })();

    const activeCarrier = this.carrierConfig.getActiveCarrier();

    // ── BigShip ───────────────────────────────────────────────────────────
    if (activeCarrier === 'bigship' && this.bigship.isConfigured()) {
      try {
        // Pass bigshipWarehouseId if the selected warehouse came from Bigship
        const bsPickupWHId = (warehouse as Record<string, unknown>).bigshipWarehouseId as number | undefined
          ?? (warehouseId && /^\d+$/.test(warehouseId) ? parseInt(warehouseId, 10) : undefined);
        const bs = await this.bigship.fetchCourierRates({
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
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException(e instanceof Error ? e.message : 'Bigship live rates failed.');
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
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const itemsToDispatch = order.items.filter(
      (i) => itemIds.includes(i.id) &&
        i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );
    if (itemsToDispatch.length === 0) {
      throw new BadRequestException('No ready items selected for dispatch');
    }

    const bigshipRate = parseBigshipRateId(rateId);
    const picked = bigshipRate?.masterCustomOrderId
      ? sanitizeSelectedRateQuote(rateId, selectedQuote)
      : (await this.getRates(orderId, warehouseId, weightKgOverride, pickupOverride)).rates.find((r) => r.rateId === rateId);
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

    const addr = splitAddressForShiprocket(order.customer);
    const orderIsCod    = isCod ?? /\bCOD[:\s]/i.test(order.notes ?? '');
    const orderCodAmt   = codAmount ?? (() => { const m = (order.notes ?? '').match(/COD(?:\s+amount)?:\s*₹?(\d+)/i); return m ? Number(m[1]) : undefined; })();

    if (bigshipRate && this.bigship.isConfigured()) {
      // ── BigShip booking ─────────────────────────────────────────────────
      const courierId = bigshipRate.courierId;
      // resolveWarehouse now always returns bigshipWarehouseId for Bigship carrier
      const bsPickupWHId =
        (warehouse as Record<string, unknown>).bigshipWarehouseId as number | undefined
        ?? (warehouseId && /^\d+$/.test(warehouseId) ? parseInt(warehouseId, 10) : undefined);
      let bs: { bigshipOrderId?: string; awbNumber?: string; message?: string } = {};
      if (Number.isFinite(courierId) && courierId > 0) {
        bs = bigshipRate.masterCustomOrderId
          ? await this.bigship.placeExistingOrder({
              masterCustomOrderId: bigshipRate.masterCustomOrderId,
              courierId,
            })
          : await this.bigship.tryCreateAdhocOrder({
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
        throw new BadRequestException(`Bigship booking failed: ${bs.message ?? 'no Bigship order ID returned'}`);
      }

      trackingRef    = bs.awbNumber ?? bs.bigshipOrderId;
      awbNumber      = bs.awbNumber ?? null;
      shiprocketNote = ` BigShip Order: ${bs.bigshipOrderId}${bs.awbNumber ? ` AWB: ${bs.awbNumber}` : ''}.`;
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
            transportChargesType: isCod ? 'COD' : 'PREPAID',
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
      const trackingInfo = trackingRef ? ` Tracking: ${trackingRef}` : '';
      const statusMsg    = `Dispatched 🚚 via ${picked.carrierName}.${trackingInfo}`;

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
        payments: true,
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

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

    if (order.customer.phone) {
      const productNames = itemsToDispatch.map(i => i.product.name).join(', ');
      void this.whatsapp.sendOrderUpdate({
        customerName: order.customer.businessName,
        customerPhone: order.customer.phone,
        orderNo: order.orderNumber,
        product: productNames,
        status: `${label} delivery OTP: ${otp}. Share this only after receiving the parcel.`,
        agentName: order.salesAgent?.fullName ?? 'Rareprint Team',
      });
    }

    return result;
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
      };
    });
  }
}
