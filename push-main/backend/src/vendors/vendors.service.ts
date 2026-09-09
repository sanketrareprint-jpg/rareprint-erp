// backend/src/vendors/vendors.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listVendors() {
    return this.prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createVendor(data: { name: string; phone?: string; email?: string; address?: string; gstNumber?: string }) {
    return this.prisma.vendor.create({ data });
  }
}
