import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ForbiddenException, BadRequestException } from '@nestjs/common';
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

const STRING_FIELDS = [
  'phone','email','name','fullName','address','city','state','pincode','role','status',
  'sku','description','sizeInches','sides','printingType','openSizeInches','passwordHash',
  'notes','slug','type','category','unit','uom','businessName','contactName',
  'gstNumber','panNumber','ifscCode','accountNumber','bankName','accountType',
  'orderNumber','label','tag','code','title','prefix','color','remark','remarks',
];

const RELATION_FIELDS = [
  'category','productCategory','customer','order','vendor','user','product',
  'items','payments','costSlabs','commissionRule','paymentAccount','jobWork',
  'printSheet','shipment','invoice','commission','productionJob','tags',
  'orderItem','printSheetItem','sheetStageVendor','itemStageLog',
];

function cleanData(data: Record<string, any>): Record<string, any> {
  // Remove auto fields and relation name fields
  const AUTO = ['id', 'createdAt', 'updatedAt'];
  AUTO.forEach(f => delete data[f]);
  RELATION_FIELDS.forEach(f => delete data[f]);

  const cleaned: Record<string, any> = {};

  for (const [k, v] of Object.entries(data)) {
    // Skip nested objects/arrays
    if (v !== null && typeof v === 'object') continue;
    // Nullify empty / null strings
    if (v === '' || v === 'null' || v === 'NULL' || v === undefined) {
      cleaned[k] = null;
      continue;
    }
    // Booleans
    if (typeof v === 'string' && v.toLowerCase() === 'true') { cleaned[k] = true; continue; }
    if (typeof v === 'string' && v.toLowerCase() === 'false') { cleaned[k] = false; continue; }
    // Numbers — only if not a string field and is a pure decimal
    if (typeof v === 'string' && !STRING_FIELDS.includes(k) && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      cleaned[k] = parseFloat(v.trim());
      continue;
    }
    cleaned[k] = v;
  }

  return cleaned;
}

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
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { rows, total, columns, page: parseInt(page), limit: take };
    } catch (e) {
      return { rows: [], total: 0, columns: [], error: String(e) };
    }
  }

  @Post('query')
  async runQuery(@Req() req: Request & { user: JwtUser }, @Body('sql') sql: string) {
    this.checkAdmin(req);
    if (!sql?.trim()) return { error: 'No SQL provided' };
    const upper = sql.trim().toUpperCase();
    if (upper.includes('DROP ') || upper.includes('TRUNCATE ') || upper.includes('ALTER ')) {
      throw new ForbiddenException('DROP, TRUNCATE, ALTER not allowed');
    }
    try {
      const result = await this.prisma.$queryRawUnsafe(sql);
      const rows = Array.isArray(result) ? result : [result];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { rows, columns, count: rows.length };
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

        const cleaned = cleanData({ ...data });

    // Convert xxxId fields to Prisma connect syntax for required relations
    const finalData: Record<string, any> = {};
    for (const [k, v] of Object.entries(cleaned)) {
      if (k.endsWith('Id') && v !== null && typeof v === 'string') {
        const rel = k.slice(0, -2);
        finalData[rel] = { connect: { id: v } };
      } else {
        finalData[k] = v;
      }
    }

    try {
      const result = await (this.prisma as any)[name].create({ data: finalData });
      return { success: true, row: result };
    } catch (e: any) {
      throw new BadRequestException(e?.message || String(e));
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

    const cleaned = cleanData({ ...data });

    try {
      const result = await (this.prisma as any)[name].update({ where: { id }, data: cleaned });
      return { success: true, row: result };
    } catch (e: any) {
      throw new BadRequestException(e?.message || String(e));
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
    if (['user', 'order', 'payment'].includes(name)) throw new ForbiddenException('Cannot delete from protected table');
    try {
      await (this.prisma as any)[name].delete({ where: { id } });
      return { success: true };
    } catch (e: any) {
      throw new BadRequestException(e?.message || String(e));
    }
  }
}

