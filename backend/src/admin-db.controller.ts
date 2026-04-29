import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from './prisma/prisma.service';
import type { Request } from 'express';

type JwtUser = { id: string; role: string };

const ALLOWED_TABLES = [
  'user','customer','productCategory','product','productCostSlab','commissionRule',
  'paymentAccount','vendor','jobWork','printSheet','printSheetItem','sheetStageVendor',
  'itemStageLog','godown','order','orderItem','payment','invoice','commission',
  'productionJob','shipment','statusLog'
];

@Controller('admin/db')
@UseGuards(AuthGuard('jwt'))
export class AdminDbController {
  constructor(private readonly prisma: PrismaService) {}

  private checkAdmin(req: Request & { user: JwtUser }) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  @Get('tables')
  async getTables(@Req() req: Request & { user: JwtUser }) {
    this.checkAdmin(req);
    const counts: Record<string, number> = {};
    await Promise.all(ALLOWED_TABLES.map(async t => {
      try { counts[t] = await (this.prisma as any)[t].count(); } catch { counts[t] = 0; }
    }));
    return { tables: ALLOWED_TABLES, counts };
  }

  @Get('table/:name')
  async getTable(
    @Req() req: Request & { user: JwtUser },
    @Param('name') name: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search = '',
  ) {
    this.checkAdmin(req);
    if (!ALLOWED_TABLES.includes(name)) throw new ForbiddenException('Table not allowed');
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    try {
      const [rows, total] = await Promise.all([
        (this.prisma as any)[name].findMany({ skip, take, orderBy: { createdAt: 'desc' } }).catch(() =>
          (this.prisma as any)[name].findMany({ skip, take })
        ),
        (this.prisma as any)[name].count(),
      ]);
      return { rows, total, page: parseInt(page), limit: take };
    } catch (e) {
      return { rows: [], total: 0, error: String(e) };
    }
  }

  @Post('query')
  async runQuery(@Req() req: Request & { user: JwtUser }, @Body('sql') sql: string) {
    this.checkAdmin(req);
    if (!sql?.trim()) return { error: 'No SQL provided' };
    // Block dangerous operations
    const upper = sql.trim().toUpperCase();
    if (upper.includes('DROP ') || upper.includes('TRUNCATE ') || upper.includes('ALTER ')) {
      throw new ForbiddenException('DROP, TRUNCATE, ALTER not allowed');
    }
    try {
      const result = await this.prisma.$queryRawUnsafe(sql);
      return { rows: result, count: Array.isArray(result) ? result.length : 1 };
    } catch (e) {
      return { error: String(e) };
    }
  }

  @Post('table/:name')
  async createRow(
    @Req() req: Request & { user: JwtUser },
    @Param('name') name: string,
    @Body() data: Record<string, any>,
  ) {
    this.checkAdmin(req);
    if (!ALLOWED_TABLES.includes(name)) throw new ForbiddenException('Table not allowed');
    delete data.id; delete data.createdAt; delete data.updatedAt;

    // Clean data: convert types and strip nested objects/arrays (relations)
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      // Skip nested objects and arrays (Prisma relations)
      if (v !== null && typeof v === 'object') continue;
      if (v === '' || v === 'null' || v === 'NULL' || v === undefined) {
        cleaned[k] = null;
      } else if (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && v.trim() !== '') {
        cleaned[k] = Number(v);
      } else if (typeof v === 'string' && v.toLowerCase() === 'true') {
        cleaned[k] = true;
      } else if (typeof v === 'string' && v.toLowerCase() === 'false') {
        cleaned[k] = false;
      } else {
        cleaned[k] = v;
      }
    }

    try {
      const result = await (this.prisma as any)[name].create({ data: cleaned });
      return { success: true, row: result };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }


  @Patch('table/:name/:id')
  async updateRow(
    @Req() req: Request & { user: JwtUser },
    @Param('name') name: string,
    @Param('id') id: string,
    @Body() data: Record<string, any>,
  ) {
    this.checkAdmin(req);
    if (!ALLOWED_TABLES.includes(name)) throw new ForbiddenException('Table not allowed');
    delete data.id; delete data.createdAt; delete data.updatedAt;

    // Auto-convert types, strip nested objects
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === 'object') continue;
      if (v === '' || v === 'null' || v === 'NULL' || v === undefined) {
        cleaned[k] = null;
      } else if (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && v.trim() !== '') {
        cleaned[k] = Number(v);
      } else if (typeof v === 'string' && v.toLowerCase() === 'true') {
        cleaned[k] = true;
      } else if (typeof v === 'string' && v.toLowerCase() === 'false') {
        cleaned[k] = false;
      } else {
        cleaned[k] = v;
      }
    }

    try {
      const result = await (this.prisma as any)[name].update({ where: { id }, data: cleaned });
      return { success: true, row: result };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  @Delete('table/:name/:id')
  async deleteRow(
    @Req() req: Request & { user: JwtUser },
    @Param('name') name: string,
    @Param('id') id: string,
  ) {
    this.checkAdmin(req);
    if (!ALLOWED_TABLES.includes(name)) throw new ForbiddenException('Table not allowed');
    // Protect critical tables from deletion
    if (['user', 'order', 'payment'].includes(name)) throw new ForbiddenException('Cannot delete from protected table');
    try {
      await (this.prisma as any)[name].delete({ where: { id } });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
