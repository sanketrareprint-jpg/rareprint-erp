import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

const ALLOWED_TABLES = [
  'user','customer','product','productCategory','productCostSlab',
  'commissionRule','paymentAccount','vendor','jobWork','printSheet',
  'printSheetItem','sheetStageVendor','itemStageLog','godown','order',
  'orderItem','payment','invoice','commission','productionJob',
  'shipment','statusLog',
];

const BLOCKED_SQL = ['drop ','truncate ','alter ','create ','grant ','revoke '];

@Controller('admin/db')
export class AdminDbController {
  constructor(private prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('tables')
  async getTables(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') return { error: 'Forbidden' };
    const counts: Record<string, number> = {};
    for (const t of ALLOWED_TABLES) {
      try {
        counts[t] = await (this.prisma as any)[t].count();
      } catch { counts[t] = 0; }
    }
    return { tables: ALLOWED_TABLES, counts };
  }

  @UseGuards(JwtAuthGuard)
  @Get('table/:name')
  async getTable(
    @Request() req: any,
    @Param('name') name: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    if (req.user?.role !== 'ADMIN') return { error: 'Forbidden' };
    if (!ALLOWED_TABLES.includes(name)) return { error: 'Table not allowed' };
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, parseInt(limit));
    try {
      const [rows, total] = await Promise.all([
        (this.prisma as any)[name].findMany({ skip: (p - 1) * l, take: l, orderBy: { createdAt: 'desc' } }).catch(() =>
          (this.prisma as any)[name].findMany({ skip: (p - 1) * l, take: l })
        ),
        (this.prisma as any)[name].count(),
      ]);
      return { rows, total };
    } catch (e: any) {
      return { error: e.message, rows: [], total: 0 };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('table/:name/:id')
  async updateRow(
    @Request() req: any,
    @Param('name') name: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    if (req.user?.role !== 'ADMIN') return { error: 'Forbidden' };
    if (!ALLOWED_TABLES.includes(name)) return { error: 'Table not allowed' };
    try {
      delete body.id; delete body.createdAt; delete body.updatedAt;
      const result = await (this.prisma as any)[name].update({ where: { id }, data: body });
      return { success: true, row: result };
    } catch (e: any) { return { success: false, error: e.message }; }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('table/:name/:id')
  async deleteRow(
    @Request() req: any,
    @Param('name') name: string,
    @Param('id') id: string,
  ) {
    if (req.user?.role !== 'ADMIN') return { error: 'Forbidden' };
    if (!ALLOWED_TABLES.includes(name)) return { error: 'Table not allowed' };
    try {
      await (this.prisma as any)[name].delete({ where: { id } });
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  }

  @UseGuards(JwtAuthGuard)
  @Post('query')
  async runQuery(@Request() req: any, @Body('sql') sql: string) {
    if (req.user?.role !== 'ADMIN') return { error: 'Forbidden' };
    if (!sql?.trim()) return { error: 'No SQL provided' };
    const lower = sql.toLowerCase().trim();
    for (const blocked of BLOCKED_SQL) {
      if (lower.includes(blocked)) return { error: `Blocked: ${blocked.trim()} is not allowed` };
    }
    try {
      const result = await this.prisma.$queryRawUnsafe(sql);
      const rows = Array.isArray(result) ? result : [result];
      return { rows, count: rows.length };
    } catch (e: any) { return { error: e.message }; }
  }
}
