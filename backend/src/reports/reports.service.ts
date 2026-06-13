import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ReportType = 'orders' | 'vendors' | 'stages';

type ReportRow = Record<string, string | number | null>;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(type: ReportType, from?: string, to?: string) {
    const dateFilter = this.dateFilter(from, to);
    if (type === 'orders') return { type, rows: await this.orderRows(dateFilter) };
    if (type === 'vendors') return { type, rows: await this.vendorRows(dateFilter) };
    if (type === 'stages') return { type, rows: await this.stageRows(dateFilter) };
    throw new BadRequestException('Unsupported report type');
  }

  toCsv(rows: ReportRow[]) {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.map(escape).join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))].join('\n');
  }

  private dateFilter(from?: string, to?: string) {
    const filter: { gte?: Date; lte?: Date } = {};
    if (from) filter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.lte = end;
    }
    return Object.keys(filter).length ? filter : undefined;
  }

  private async orderRows(dateFilter?: { gte?: Date; lte?: Date }): Promise<ReportRow[]> {
    const orders = await this.prisma.order.findMany({
      where: dateFilter ? { orderDate: dateFilter } : undefined,
      orderBy: { orderDate: 'desc' },
      include: { customer: true, salesAgent: { select: { fullName: true } }, items: { include: { product: true } }, payments: true },
    });
    return orders.map((o) => ({
      orderNo: o.orderNumber,
      date: o.orderDate.toISOString().slice(0, 10),
      customer: o.customer.businessName,
      phone: o.customer.phone ?? '',
      salesAgent: o.salesAgent?.fullName ?? '',
      products: o.items.map((i) => `${i.product.name} x${i.quantity}`).join('; '),
      status: o.status,
      productionStage: o.productionStage,
      total: Number(o.grandTotal),
      paid: o.payments.reduce((sum, p) => sum + Number(p.amount), 0),
      balance: Number(o.grandTotal) - o.payments.reduce((sum, p) => sum + Number(p.amount), 0),
    }));
  }

  private async vendorRows(dateFilter?: { gte?: Date; lte?: Date }): Promise<ReportRow[]> {
    const vendors = await this.prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        jobWorks: { where: dateFilter ? { createdAt: dateFilter } : undefined },
        purchaseBills: { where: dateFilter ? { billDate: dateFilter } : undefined },
        vendorPayments: { where: dateFilter ? { paymentDate: dateFilter } : undefined },
      },
    });
    return vendors.map((v) => ({
      vendor: v.name,
      phone: v.phone ?? '',
      gstNumber: v.gstNumber ?? '',
      jobWorks: v.jobWorks.length,
      jobWorkCost: v.jobWorks.reduce((sum, j) => sum + Number(j.cost), 0),
      purchaseBills: v.purchaseBills.length,
      purchaseBillTotal: v.purchaseBills.reduce((sum, b) => sum + Number(b.totalAmount), 0),
      payments: v.vendorPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    }));
  }

  private async stageRows(dateFilter?: { gte?: Date; lte?: Date }): Promise<ReportRow[]> {
    const items = await this.prisma.orderItem.findMany({
      where: dateFilter ? { updatedAt: dateFilter } : undefined,
      include: { order: { include: { customer: true } }, product: true },
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((i) => ({
      orderNo: i.order.orderNumber,
      customer: i.order.customer.businessName,
      product: i.product.name,
      quantity: i.quantity,
      stage: i.itemProductionStage,
      category: i.productionCategory ?? '',
      updatedAt: i.updatedAt.toISOString().slice(0, 10),
    }));
  }
}
