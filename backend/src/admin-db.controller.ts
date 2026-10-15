import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma/prisma.service';
import type { Request } from 'express';

// Already-hashed bcrypt values look like "$2a$10$...", "$2b$12$...", etc.
// Anything else typed into the passwordHash field is treated as a plaintext
// password and hashed here before it ever touches the database.
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

async function hashPasswordIfPlaintext(value: unknown): Promise<string> {
  const str = String(value ?? '');
  if (BCRYPT_HASH_PATTERN.test(str)) return str;
  return bcrypt.hash(str, 10);
}

type JwtUser = { id: string; role: string };

// Owner account — never deletable or deactivatable from the DB admin screen.
const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';

// Every non-cascade [table, column] that points at User.id in schema.prisma.
// Checked before a user may be permanently deleted (see findUserLinks).
const USER_LINK_COLUMNS: [string, string][] = [
  ['AttendanceImportSession', 'importedById'], ['AttendanceRecord', 'editedById'],
  ['BankImportSession', 'importedById'], ['BankTransaction', 'checkedById'],
  ['BankTransaction', 'recheckedById'], ['BankTransaction', 'reconciledById'],
  ['BankTransaction', 'salaryForUserId'], ['CallAnalysis', 'agentId'],
  ['CallLogImport', 'agentId'], ['CallLogImport', 'importedById'],
  ['CallLogRecord', 'agentId'], ['Commission', 'salesAgentId'],
  ['CommissionOverride', 'agentId'], ['CommissionOverride', 'setById'],
  ['CommissionVerification', 'agentId'], ['CommissionVerification', 'verifiedById'],
  ['CompanyHoliday', 'createdById'], ['CompanyTerms', 'createdById'],
  ['Complaint', 'assignedToId'], ['Complaint', 'raisedById'],
  ['ContactImport', 'importedById'], ['DailyLearningStreak', 'userId'],
  ['DialerCall', 'agentId'], ['Employee', 'approvedById'], ['Employee', 'userId'],
  ['EmployeeLeaveEntry', 'recordedById'], ['ImportedContact', 'agentId'],
  ['ItemStageLog', 'changedById'], ['Lead', 'agentId'], ['LeadActivity', 'createdById'],
  ['MachineReading', 'paidById'], ['MachineReading', 'recordedById'],
  ['MarketingCampaign', 'createdById'], ['MarketingContact', 'assignedAgentId'],
  ['MilestoneAttempt', 'userId'], ['Order', 'salesAgentId'],
  ['Payment', 'receivedById'], ['Payment', 'verifiedById'],
  ['PolicyDocument', 'createdById'], ['ProductionJob', 'assignedToId'],
  ['QuizAttempt', 'userId'], ['RemittanceImportSession', 'importedById'],
  ['RemittanceRecord', 'postedById'], ['Shipment', 'handledById'],
  ['ShippingChargeRecord', 'importedById'], ['StatusLog', 'changedById'],
  ['Task', 'assignedToId'], ['Task', 'createdById'], ['UserTopicProgress', 'userId'],
];

const ALLOWED_TABLES = [
  'user','customer','productCategory','product','productCostSlab','commissionRule',
  'paymentAccount','vendor','jobWork','printSheet','printSheetItem','sheetStageVendor',
  'itemStageLog','godown','order','orderItem','payment','invoice','commission',
  'productionJob','shipment','statusLog'
];

const STRING_FIELDS = [
  'phone','email','name','fullName','address','city','state','pincode','role','status',
  'sku','description','sizeInches','sides','printingType','openSizeInches','paperType','passwordHash',
  'notes','slug','type','category','unit','uom','businessName','contactName',
  'gstNumber','panNumber','ifscCode','accountNumber','bankName','accountType',
  'orderNumber','label','tag','code','title','prefix','color','remark','remarks','hsnCode',
];

const RELATION_FIELDS = [
  'category','productCategory','customer','order','vendor','user','product',
  'items','payments','costSlabs','commissionRule','paymentAccount','jobWork',
  'printSheet','shipment','invoice','commission','productionJob','tags',
  'orderItem','printSheetItem','sheetStageVendor','itemStageLog',
];

const TABLE_SEARCH_FIELDS: Record<string, string[]> = {
  user: ['fullName', 'email', 'phone', 'role'],
  customer: ['businessName', 'contactPerson', 'phone', 'email', 'city', 'state', 'pincode', 'gstNumber', 'panNumber'],
  productCategory: ['name', 'description'],
  product: ['sku', 'name', 'description', 'sizeInches', 'openSizeInches'],
  paymentAccount: ['name', 'accountType', 'bankName', 'accountNumber', 'ifscCode', 'upiId'],
  vendor: ['name', 'phone', 'email', 'gstNumber', 'address'],
  jobWork: ['name', 'description'],
  printSheet: ['sheetNo', 'quality', 'sizeInches', 'printing', 'status'],
  godown: ['name', 'address', 'city', 'state', 'pincode'],
  order: ['orderNumber'],
};

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

  // Blocks removing (delete or deactivate) your own account or the owner account.
  private async assertUserRemovable(req: Request & { user: JwtUser }, id: string) {
    if (id === req.user.id) throw new ForbiddenException('You cannot remove your own account');
    const target = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!target) throw new BadRequestException('User not found');
    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      throw new ForbiddenException('The owner account cannot be removed');
    }
  }

  // Lists the tables that still reference this user (e.g. ["Order: 12", "Payment: 3"]).
  // Two sources, merged: (1) Postgres's live foreign-key catalog, which also picks up
  // relations added in future; (2) USER_LINK_COLUMNS, because some production tables
  // were created outside migrations and may have the column without a real FK.
  // ON DELETE CASCADE links (login sessions, dialer locks, payment keywords) are
  // skipped: the schema defines those as removed together with the user.
  private async findUserLinks(id: string): Promise<string[]> {
    const fks = await this.prisma.$queryRawUnsafe<{ tbl: string; col: string }[]>(`
      SELECT cl.relname AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_class cl     ON cl.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
      JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'public."User"'::regclass
        AND c.confdeltype <> 'c'
    `);
    const columns = new Map<string, [string, string]>();
    for (const [tbl, col] of [...USER_LINK_COLUMNS, ...fks.map(f => [f.tbl, f.col] as [string, string])]) {
      columns.set(`${tbl}.${col}`, [tbl, col]);
    }
    const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
    const countsByTable = new Map<string, number>();
    for (const [tbl, col] of columns.values()) {
      let n = 0;
      try {
        const rows = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
          `SELECT COUNT(*)::int AS n FROM public.${quote(tbl)} WHERE ${quote(col)} = $1`,
          id,
        );
        n = rows[0]?.n ?? 0;
      } catch (e: any) {
        // Only a missing table/column (not in this deployment's DB) is safe to skip.
        const msg = String(e?.message ?? e);
        if (!/does not exist/.test(msg)) throw new BadRequestException(`Could not check ${tbl}: ${msg}`);
      }
      if (n > 0) countsByTable.set(tbl, (countsByTable.get(tbl) ?? 0) + n);
    }
    return [...countsByTable].map(([table, n]) => `${table}: ${n}`);
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
    const q = search.trim();
    const searchableFields = TABLE_SEARCH_FIELDS[name] || [];
    const where = q && searchableFields.length > 0
      ? {
          OR: searchableFields.map(field => ({
            [field]: { contains: q, mode: 'insensitive' },
          })),
        }
      : undefined;
    try {
      const [rows, total] = await Promise.all([
        (this.prisma as any)[name].findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }).catch(() =>
          (this.prisma as any)[name].findMany({ where, skip, take })
        ),
        (this.prisma as any)[name].count({ where }),
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

    // Auto-generate id if not present
    if (!finalData.id) {
      const { createId } = require('@paralleldrive/cuid2');
      try { finalData.id = createId(); } catch { finalData.id = require('crypto').randomUUID(); }
    }

    // Admins type a plain password into the passwordHash field — hash it before saving.
    if (name === 'user' && finalData.passwordHash != null) {
      finalData.passwordHash = await hashPasswordIfPlaintext(finalData.passwordHash);
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

    // passwordHash is a required field, so a blank submission means "leave it alone"
    // (the edit form pre-fills with the existing hash; clearing it signals no change).
    if (name === 'user') {
      if (cleaned.isActive === false) await this.assertUserRemovable(req, id);
      if (cleaned.passwordHash == null) {
        delete cleaned.passwordHash;
      } else {
        cleaned.passwordHash = await hashPasswordIfPlaintext(cleaned.passwordHash);
      }
    }

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
    if (['order', 'payment'].includes(name)) throw new ForbiddenException('Cannot delete from protected table');
    if (name === 'user') {
      await this.assertUserRemovable(req, id);
      const linked = await this.findUserLinks(id);
      if (linked.length > 0) {
        throw new BadRequestException(
          `This user has linked records (${linked.join(', ')}) and cannot be deleted. Deactivate them instead.`,
        );
      }
    }
    try {
      await (this.prisma as any)[name].delete({ where: { id } });
      return { success: true };
    } catch (e: any) {
      throw new BadRequestException(e?.message || String(e));
    }
  }
}


