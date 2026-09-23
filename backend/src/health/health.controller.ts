import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isCustomerSuspended } from '../common/suspended-customer.middleware';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }

    return {
      status: 'ok',
      database: 'ok',
      // SaaS: true when this deployment has CUSTOMER_SUSPENDED=true (the only
      // route still answering in that state) — read by saas-ops/customer-status.js.
      suspended: isCustomerSuspended(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
