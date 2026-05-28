import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, PaymentVerificationStatus, Prisma, ProductSides, PrintingType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const fallbackCatalog = [
  'Medicine Paper Pouch',
  'Premium Business Cards',
  'Stickers And Labels',
  'Flyers And Leaflets',
  'Letterheads And Envelopes',
  'Corporate Gifts',
];

function cleanSku(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        costSlabs: { orderBy: { minQuantity: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      source: products.length ? 'database' : 'starter',
      products: products.length
        ? products.map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            category: product.category.name,
            description: product.description,
            gsm: product.gsm,
            sizeInches: product.sizeInches,
            printingType: product.printingType,
            sides: product.sides,
            rates: product.costSlabs.map((slab) => ({
              minQuantity: slab.minQuantity,
              maxQuantity: slab.maxQuantity,
              unitPrice: Number(slab.unitPrice),
            })),
          }))
        : fallbackCatalog.map((name) => ({ name, category: 'Web To Print', rates: [] })),
    };
  }

  private async generateOrderNumber() {
    const last = await this.prisma.order.findFirst({ orderBy: { createdAt: 'desc' } });
    const lastNum = last ? parseInt(last.orderNumber, 10) : 10588;
    const next = (Number.isFinite(lastNum) ? lastNum : 10588) + 1;
    const exists = await this.prisma.order.findUnique({ where: { orderNumber: String(next) } });
    return exists ? `WEB-${Date.now()}` : String(next);
  }

  private async findOrCreateProduct(item: any) {
    const productName = String(item?.productName ?? '').trim();
    if (!productName) throw new BadRequestException('Product name is required');

    const existing = await this.prisma.product.findFirst({
      where: { isActive: true, name: { equals: productName, mode: 'insensitive' } },
    });
    if (existing) return existing;

    const category = await this.prisma.productCategory.upsert({
      where: { name: 'Web To Print' },
      update: { isActive: true },
      create: { name: 'Web To Print', description: 'Public web-to-print storefront products' },
    });

    const skuBase = cleanSku(item?.productSlug ?? productName) || 'WEB-PRINT';
    const sku = `WEB-${skuBase}-${Date.now().toString().slice(-6)}`;

    return this.prisma.product.create({
      data: {
        sku,
        name: productName,
        description: 'Created from public web-to-print storefront order',
        categoryId: category.id,
        gsm: 0,
        sizeInches: 'Custom',
        printingType: PrintingType.OFFSET,
        sides: ProductSides.SINGLE_SIDE,
        costSlabs: {
          create: [{
            minQuantity: Number(item?.quantity ?? 1),
            unitPrice: new Prisma.Decimal(Number(item?.unitPrice ?? 0)),
          }],
        },
      },
    });
  }

  async createOrder(body: any) {
    const inputItems = Array.isArray(body?.items) && body.items.length > 0 ? body.items : [body?.item ?? {}];
    const customer = body?.customer ?? {};
    const name = String(customer?.name ?? '').trim();

    if (!name) throw new BadRequestException('Customer name is required');

    const rows = await Promise.all(inputItems.map(async (item: any) => {
      const quantity = Math.max(1, Number(item?.quantity ?? 0));
      const unitPrice = Math.max(0, Number(item?.unitPrice ?? 0));
      if (!quantity || !unitPrice) throw new BadRequestException('Quantity and unit price are required');
      const product = await this.findOrCreateProduct(item);
      return {
        item,
        product,
        quantity,
        unitPrice,
        lineTotal: new Prisma.Decimal(quantity * unitPrice),
      };
    }));

    const orderNumber = await this.generateOrderNumber();
    const subtotal = rows.reduce((sum, row) => sum.plus(row.lineTotal), new Prisma.Decimal(0));
    const customerCode = `WEB-CUST-${Date.now()}`;
    const shippingAddress = [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', ');
    const artworkNotes = rows.map((row) => row.item?.artworkNotes).filter(Boolean).join(' || ');

    const order = await this.prisma.$transaction(async (tx) => {
      const createdCustomer = await tx.customer.create({
        data: {
          customerCode,
          businessName: name,
          contactPerson: name,
          phone: customer.phone,
          email: customer.email,
          city: customer.city,
          state: customer.state,
          pincode: customer.pincode,
          shippingAddress: shippingAddress || undefined,
        },
      });

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId: createdCustomer.id,
          status: OrderStatus.PENDING_APPROVAL,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          discount: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          shippingCharge: new Prisma.Decimal(0),
          grandTotal: subtotal,
          leadSource: 'WEB_TO_PRINT',
          notes: [
            'Public web-to-print checkout',
            'Payment: 50% advance via Razorpay, balance COD',
            'Shipping provider: Shiprocket',
            body?.quote?.advance ? `Razorpay advance due: ₹${body.quote.advance}` : '',
            body?.quote?.balanceCod ? `COD balance: ₹${body.quote.balanceCod}` : '',
            artworkNotes ? `Artwork: ${artworkNotes}` : '',
          ].filter(Boolean).join(' | '),
          items: {
            create: rows.map((row) => ({
              productId: row.product.id,
              quantity: row.quantity,
              unitPrice: new Prisma.Decimal(row.unitPrice),
              lineDiscount: new Prisma.Decimal(0),
              taxRatePct: new Prisma.Decimal(0),
              taxAmount: new Prisma.Decimal(0),
              lineTotal: row.lineTotal,
              artworkNotes: row.item?.artworkNotes ?? null,
              productionNotes: `Source: Web-to-print | Product slug: ${row.item?.productSlug ?? ''}`,
            })),
          },
        },
      });

      await tx.statusLog.create({
        data: {
          orderId: createdOrder.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING_APPROVAL,
          reason: 'Order created from public web-to-print storefront',
        },
      });

      return createdOrder;
    });

    return { success: true, orderId: order.id, orderNumber: order.orderNumber };
  }

  async createRazorpayOrder(orderId: string, amount: number) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new BadRequestException('Razorpay credentials are not configured');
    }
    const Razorpay = require('razorpay');
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await rzp.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: 'INR',
      receipt: orderId,
    });
    return { razorpay_order_id: order.id, key_id: process.env.RAZORPAY_KEY_ID };
  }

  async confirmPayment(orderId: string, body: any) {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      throw new BadRequestException('Razorpay credentials are not configured');
    }

    const crypto = require('crypto');
    const sig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest('hex');
    if (sig !== body.razorpay_signature) throw new BadRequestException('Invalid Razorpay signature');

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found');

    let account = await this.prisma.paymentAccount.findFirst({
      where: { name: 'Razorpay Web Storefront', isActive: true },
    });
    if (!account) {
      account = await this.prisma.paymentAccount.create({
        data: {
          name: 'Razorpay Web Storefront',
          accountType: 'ONLINE_GATEWAY',
          currentBalance: new Prisma.Decimal(0),
        },
      });
    }

    const amount = new Prisma.Decimal(order.grandTotal).div(2);
    await this.prisma.payment.create({
      data: {
        orderId,
        paymentAccountId: account.id,
        amount,
        method: PaymentMethod.CARD,
        referenceNumber: body.razorpay_payment_id,
        notes: `Razorpay order ${body.razorpay_order_id}`,
        verificationStatus: PaymentVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.PARTIALLY_PAID },
    });
    return { success: true };
  }
}
