import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ComboItem,
  DISCOUNT_MODES,
  DiscountMode,
  ORDER_OFFER_TYPES,
  discountedLineTotal,
  isOfferInWindow,
  isOrderOfferType,
} from './offer-rules';

export type OfferPricedLine = {
  // DISCOUNT: index of the order line this prices. FREE_ON_QTY / COMBO: null
  // (the line comes from the offer itself).
  sourceIndex: number | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isFree: boolean;
};

export type CreateOfferInput = {
  code?: string;
  description?: string;
  offerType?: string;
  notes?: string;
  validFrom?: string | null;
  validTo?: string | null;
  productIds?: string[];
  discountMode?: string;
  discountValue?: number;
  buyProductId?: string;
  buyQuantity?: number;
  freeProductId?: string;
  freeQuantity?: number;
  comboItems?: ComboItem[];
};

const positiveInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  // Offers tab (ADMIN): every order-level offer, with how many order lines use it.
  async listAll() {
    const offers = await this.prisma.offerCode.findMany({
      where: { offerType: { in: [...ORDER_OFFER_TYPES] } },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orderItems: true } } },
    });
    return offers.map(({ _count, ...o }) => ({ ...this.serialize(o), usedOnLines: _count.orderItems }));
  }

  // Create Order dropdown: only offers that can be applied right now.
  async listAvailable() {
    const offers = await this.prisma.offerCode.findMany({
      where: { offerType: { in: [...ORDER_OFFER_TYPES] }, isActive: true },
      orderBy: { code: 'asc' },
    });
    const now = new Date();
    return offers.filter((o) => isOfferInWindow(o, now)).map((o) => this.serialize(o));
  }

  async create(input: CreateOfferInput) {
    const code = input.code?.trim().toUpperCase();
    if (!code) throw new BadRequestException('Offer code is required');
    const description = input.description?.trim();
    if (!description) throw new BadRequestException('Offer text is required');
    if (!isOrderOfferType(input.offerType)) {
      throw new BadRequestException(`Offer type must be one of ${ORDER_OFFER_TYPES.join(', ')}`);
    }
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if ((validFrom && isNaN(validFrom.getTime())) || (validTo && isNaN(validTo.getTime()))) {
      throw new BadRequestException('Valid from / to must be valid dates');
    }
    if (validFrom && validTo && validTo < validFrom) {
      throw new BadRequestException('Valid to cannot be before valid from');
    }

    const existing = await this.prisma.offerCode.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`Offer code "${code}" already exists`);

    const data: Record<string, unknown> = {
      code,
      description,
      offerType: input.offerType,
      notes: input.notes?.trim() || null,
      validFrom,
      validTo,
      productIds: [],
    };

    if (input.offerType === 'DISCOUNT') {
      if (!(DISCOUNT_MODES as readonly string[]).includes(input.discountMode ?? '')) {
        throw new BadRequestException('Choose a discount of ₹ amount or %');
      }
      const value = Number(input.discountValue);
      if (!Number.isFinite(value) || value <= 0) throw new BadRequestException('Discount must be greater than 0');
      if (input.discountMode === 'PERCENT' && value >= 100) {
        throw new BadRequestException('A % discount must be below 100% — use a free-item offer to give a product free');
      }
      const productIds = [...new Set((input.productIds ?? []).filter(Boolean))];
      await this.assertProductsExist(productIds);
      Object.assign(data, { discountMode: input.discountMode, discountValue: value, productIds });
    } else if (input.offerType === 'FREE_ON_QTY') {
      if (!input.buyProductId || !positiveInt(input.buyQuantity)) {
        throw new BadRequestException('Choose the product and quantity that must be bought');
      }
      if (!input.freeProductId || !positiveInt(input.freeQuantity)) {
        throw new BadRequestException('Choose the free product and its quantity');
      }
      await this.assertProductsExist([input.buyProductId, input.freeProductId]);
      // The bought line is charged at its rate-card price; without one the
      // offer could never be applied to an order.
      await this.rateCardTotal(input.buyProductId, input.buyQuantity!);
      Object.assign(data, {
        buyProductId: input.buyProductId,
        buyQuantity: input.buyQuantity,
        freeProductId: input.freeProductId,
        freeQuantity: input.freeQuantity,
      });
    } else {
      const items = Array.isArray(input.comboItems) ? input.comboItems : [];
      if (items.length === 0) throw new BadRequestException('Add at least one product to the combo');
      for (const item of items) {
        if (!item?.productId || !positiveInt(item.quantity)) {
          throw new BadRequestException('Every combo product needs a product and a quantity of at least 1');
        }
        if (typeof item.lineTotal !== 'number' || !Number.isFinite(item.lineTotal) || item.lineTotal < 0) {
          throw new BadRequestException('Every combo product needs an amount of ₹0 or more');
        }
      }
      if (items.reduce((s, i) => s + i.lineTotal, 0) <= 0) {
        throw new BadRequestException('The combo price must be greater than ₹0');
      }
      await this.assertProductsExist(items.map((i) => i.productId));
      data.comboItems = items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        lineTotal: Math.round(i.lineTotal * 100) / 100,
      }));
    }

    const created = await this.prisma.offerCode.create({ data: data as any });
    return this.serialize(created);
  }

  async setActive(id: string, isActive: boolean) {
    const offer = await this.findOrderOffer(id);
    const updated = await this.prisma.offerCode.update({ where: { id: offer.id }, data: { isActive } });
    return this.serialize(updated);
  }

  // Deleting would null out OrderItem.offerCodeId (FK is ON DELETE SET NULL)
  // and lose which offer a past order used, so a used offer can only be
  // deactivated.
  async remove(id: string) {
    const offer = await this.findOrderOffer(id);
    const used = await this.prisma.orderItem.count({ where: { offerCodeId: offer.id } });
    if (used > 0) {
      throw new BadRequestException(`Offer "${offer.code}" is already used on ${used} order line(s) — deactivate it instead`);
    }
    await this.prisma.offerCode.delete({ where: { id: offer.id } });
    return { success: true };
  }

  // The one place an offer's prices are worked out — used by the Create
  // Order preview and again by OrdersService.create, which never trusts the
  // prices the browser sends for offer lines.
  //   DISCOUNT:    prices the order lines whose product qualifies
  //   FREE_ON_QTY: the bought line (rate-card price) + the free line (₹0)
  //   COMBO:       the combo's lines at their fixed amounts
  async priceOffer(offerId: string, orderLines: Array<{ productId: string; quantity: number }>) {
    const offer = await this.findOrderOffer(offerId);
    if (!isOfferInWindow(offer)) {
      throw new BadRequestException(`Offer "${offer.code}" is not active right now`);
    }

    const lines: OfferPricedLine[] = [];
    if (offer.offerType === 'DISCOUNT') {
      const mode = offer.discountMode as DiscountMode;
      const value = Number(offer.discountValue);
      for (const [index, line] of orderLines.entries()) {
        if (offer.productIds.length > 0 && !offer.productIds.includes(line.productId)) continue;
        if (!positiveInt(line.quantity)) continue;
        const rateTotal = await this.rateCardTotal(line.productId, line.quantity);
        let lineTotal: number;
        try {
          lineTotal = discountedLineTotal(rateTotal, mode, value);
        } catch (err: any) {
          throw new BadRequestException(`Offer "${offer.code}": ${err.message}`);
        }
        lines.push({ sourceIndex: index, productId: line.productId, quantity: line.quantity, unitPrice: lineTotal / line.quantity, lineTotal, isFree: false });
      }
      if (lines.length === 0) {
        throw new BadRequestException(`Offer "${offer.code}" does not apply to any product in this order`);
      }
    } else if (offer.offerType === 'FREE_ON_QTY') {
      const buyQty = offer.buyQuantity!;
      const buyTotal = await this.rateCardTotal(offer.buyProductId!, buyQty);
      lines.push({ sourceIndex: null, productId: offer.buyProductId!, quantity: buyQty, unitPrice: buyTotal / buyQty, lineTotal: buyTotal, isFree: false });
      lines.push({ sourceIndex: null, productId: offer.freeProductId!, quantity: offer.freeQuantity!, unitPrice: 0, lineTotal: 0, isFree: true });
    } else {
      for (const item of (offer.comboItems as ComboItem[] | null) ?? []) {
        lines.push({ sourceIndex: null, productId: item.productId, quantity: item.quantity, unitPrice: item.lineTotal / item.quantity, lineTotal: item.lineTotal, isFree: item.lineTotal === 0 });
      }
    }
    return { offer: this.serialize(offer), lines };
  }

  private async findOrderOffer(id: string) {
    const offer = await this.prisma.offerCode.findUnique({ where: { id } });
    if (!offer || !isOrderOfferType(offer.offerType)) throw new NotFoundException('Offer not found');
    return offer;
  }

  private async assertProductsExist(productIds: string[]) {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return;
    const found = await this.prisma.product.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) throw new BadRequestException('One or more selected products were not found or are inactive');
  }

  // Rate-card total (ProductRateSlab.rateAmount) for a product at a quantity,
  // matched the same way as the commission code: the slab covering the
  // quantity with the highest minQuantity.
  private async rateCardTotal(productId: string, quantity: number): Promise<number> {
    const slab = await this.prisma.productRateSlab.findFirst({
      where: {
        productId,
        minQuantity: { lte: quantity },
        OR: [{ maxQuantity: null }, { maxQuantity: { gte: quantity } }],
      },
      orderBy: { minQuantity: 'desc' },
    });
    if (!slab) {
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
      throw new BadRequestException(
        `No rate-card price for "${product?.name ?? productId}" at quantity ${quantity} — add it in Cost Table before using this offer`,
      );
    }
    return Number(slab.rateAmount);
  }

  private serialize(o: any) {
    return {
      id: o.id,
      code: o.code,
      description: o.description,
      offerType: o.offerType,
      notes: o.notes,
      isActive: o.isActive,
      validFrom: o.validFrom,
      validTo: o.validTo,
      productIds: o.productIds,
      discountMode: o.discountMode,
      discountValue: o.discountValue != null ? Number(o.discountValue) : null,
      buyProductId: o.buyProductId,
      buyQuantity: o.buyQuantity,
      freeProductId: o.freeProductId,
      freeQuantity: o.freeQuantity,
      comboItems: o.comboItems ?? null,
      createdAt: o.createdAt,
    };
  }
}
