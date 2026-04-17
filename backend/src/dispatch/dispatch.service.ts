// backend/src/dispatch/dispatch.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderProductionStage, OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShiprocketService } from '../shiprocket/shiprocket.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

type LocalRateQuote = {
  rateId: string;
  carrierName: string;
  amount: number;
  currency: string;
  estimatedDays: number;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiprocket: ShiprocketService,
    private readonly whatsapp: WhatsAppService,
  ) {}

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

  async listReadyForDispatch() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.PARTIALLY_DISPATCHED] },
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

  async getRates(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const readyItems = order.items.filter(
      (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
    );
    const weightKg   = this.weightKgFromItems(readyItems.length > 0 ? readyItems : order.items);
    const pickup     = process.env.SHIPROCKET_PICKUP_PINCODE?.trim() || '110001';
    const delivery   = extractPincode(order.customer.shippingAddress) ||
                       extractPincode(order.customer.billingAddress)  ||
                       process.env.SHIPROCKET_DEFAULT_DELIVERY_PINCODE?.trim() || pickup;

    if (this.shiprocket.isConfigured()) {
      try {
        const sr = await this.shiprocket.fetchCourierRates({ pickupPostcode: pickup, deliveryPostcode: delivery, weightKg });
        if (sr.length) {
          return {
            orderId: order.id, orderNo: order.orderNumber,
            destination: order.customer.businessName,
            weightKg, deliveryPincode: delivery, pickupPincode: pickup,
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
      source: 'local',
      rates: this.computeLocalRates(weightKg),
    };
  }

  async bookItems(orderId: string, itemIds: string[], rateId: string, userId: string) {
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

    const ratesPayload = await this.getRates(orderId);
    const picked = ratesPayload.rates.find((r) => r.rateId === rateId);
    if (!picked) throw new BadRequestException('Invalid shipping rate selection');

    const weightKg     = this.weightKgFromItems(itemsToDispatch);
    const shipmentNumber = `SHP-${Date.now()}-${randomSuffix()}`;
    let trackingRef    = '';
    let shiprocketNote = '';

    if (rateId.startsWith('sr-') && this.shiprocket.isConfigured()) {
      const courierCompanyId = parseInt(rateId.replace(/^sr-/, ''), 10);
      if (Number.isFinite(courierCompanyId) && courierCompanyId > 0) {
        const addr = splitAddressForShiprocket(order.customer);
        const sr = await this.shiprocket.tryCreateAdhocOrder({
          orderNumber: order.orderNumber,
          customerName: order.customer.businessName,
          customerPhone: order.customer.phone ?? '9999999999',
          customerEmail: order.customer.email ?? 'noreply@example.com',
          billingAddress: addr.line, billingCity: addr.city,
          billingPincode: addr.pincode, billingState: addr.state,
          weightKg, subTotal: Number(order.grandTotal),
          courierCompanyId,
        });
        if (sr.shiprocketOrderId) {
          trackingRef    = sr.shiprocketOrderId;
          shiprocketNote = ` Shiprocket: ${sr.shiprocketOrderId}.`;
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.shipment.create({
        data: {
          orderId, handledById: userId, shipmentNumber,
          carrierName: picked.carrierName,
          status: ShipmentStatus.PACKED,
          dispatchDate: new Date(),
          trackingNumber: trackingRef || null,
          notes: `Items: ${itemsToDispatch.map((i) => i.id).join(', ')}. ${picked.carrierName}, ${picked.amount} INR.${shiprocketNote}`,
        },
      });

      for (const itemId of itemIds) {
        await tx.orderItem.update({
          where: { id: itemId },
          data: { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH },
        });
      }

      const remainingItems = await tx.orderItem.findMany({ where: { orderId } });
      const allDispatched  = remainingItems.every(
        (i) => i.itemProductionStage === OrderProductionStage.READY_FOR_DISPATCH,
      );

      const newStatus = allDispatched ? OrderStatus.DISPATCHED : OrderStatus.PARTIALLY_DISPATCHED;

      await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus, shippingCharge: new Prisma.Decimal(picked.amount) },
      });

      await tx.statusLog.create({
        data: {
          orderId, fromStatus: order.status, toStatus: newStatus,
          changedById: userId,
          reason: `${itemsToDispatch.length} item(s) dispatched via ${picked.carrierName}`,
          metadata: { shipmentNumber, rateId, amount: picked.amount },
        },
      });

      return { shipmentNumber, carrierName: picked.carrierName, amount: picked.amount, newStatus };
    });

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
}