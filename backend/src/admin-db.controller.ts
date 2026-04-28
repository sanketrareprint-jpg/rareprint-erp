import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('admin/db')
export class AdminDbController {
  constructor(private prisma: PrismaService) {}

  @Get('tables')
  async getTables() {
    const tables = await this.prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const result = [];
    for (const t of (tables as any[])) {
      const count = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${t.tablename}"`);
      result.push({ name: t.tablename, rows: Number((count as any)[0].count) });
    }
    return result;
  }

  @Get('table/:name')
  async getTable(@Param('name') name: string) {
    const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM "${name}" LIMIT 100`);
    return rows;
  }

  @Post('query')
  async runQuery(@Body('sql') sql: string) {
    const rows = await this.prisma.$queryRawUnsafe(sql);
    return rows;
  }
}
