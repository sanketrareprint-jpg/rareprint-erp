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
    // Normalize whitespace so names match exactly when picked from lists later.
    const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : data.name;
    return this.prisma.vendor.create({ data: { ...data, name } });
  }
}
