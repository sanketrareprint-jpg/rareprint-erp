// backend/src/bank-statement/bank-statement.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BankReconcileStatus, BankTxnType, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { createHash } from 'crypto';

const GST_BANK_ACCOUNT = '0513102000013378';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawBankRow {
  srl: number;
  txnDate: Date;
  txnDateTime: Date | null;
  valueDate: Date;
  description: string;
  chequeNo: string;
  crDr: BankTxnType;
  amount: number;
  balance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    return parseFloat(raw.replace(/,/g, '').trim()) || 0;
  }
  return 0;
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // DD/MM/YYYY HH:MM:SS  or  YYYY-MM-DD HH:MM:
  const ddmmyyyy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, time] = ddmmyyyy;
    return new Date(`${yyyy}-${mm}-${dd}T${time || '00:00:00'}+05:30`);
  }
  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})\s*(\d{2}:\d{2})?/);
  if (yyyymmdd) {
    const [, yyyy, mm, dd, time] = yyyymmdd;
    return new Date(
      `${yyyy}-${mm}-${dd}T${time ? time + ':00' : '00:00:00'}+05:30`,
    );
  }
  return null;
}

function startOfIstDate(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

function endOfIstDate(date: string): Date {
  return new Date(`${date}T23:59:59.999+05:30`);
}

function normalizeText(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function moneyKey(amount: Prisma.Decimal | number): string {
  return Number(amount).toFixed(2);
}

function dateKey(date: Date | string | null | undefined): string {
  if (!date) return '';
  return new Date(date).toISOString();
}

function buildImportKey(
  row: Pick<RawBankRow, 'txnDate' | 'crDr' | 'amount' | 'description'>,
): string {
  // Stable key: uses only fields that are immutable across re-exports.
  // IMPORTANT: `srl` is intentionally excluded — it is the row number within
  // a given XLS export, not a stable bank-assigned ID. Overlapping re-exports
  // assign a different srl to the same transaction, which was the root cause
  // of duplicate entries (same txn got a different hash each time → bypassed
  // the unique constraint).
  // `balance` is also excluded (shifts if any earlier txn is corrected).
  // `txnDateTime` excluded (often null in some exports, present in others).
  // The description already contains the UPI/NEFT reference number which
  // uniquely identifies each transaction.
  const rawKey = [
    dateKey(row.txnDate),
    row.crDr,
    moneyKey(row.amount),
    normalizeText(row.description),
  ].join('|');

  return createHash('sha256').update(rawKey).digest('hex');
}

function extractAccountNumber(sheet: XLSX.WorkSheet): string {
  for (let r = 0; r < 6; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell?.v && String(cell.v).match(/\d{12,}/)) {
      const match = String(cell.v).match(/(\d{12,})/);
      if (match) return match[1];
    }
  }
  return 'UNKNOWN';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BankStatementService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 1. Parse XLS Buffer ────────────────────────────────────────────────────

  parseXls(buffer: Buffer): { accountNumber: string; rows: RawBankRow[] } {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    const accountNumber = extractAccountNumber(sheet);

    // Find header row (contains "Srl" or "Description")
    let headerRow = 5;
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:K1');
    for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell?.v && String(cell.v).trim().toLowerCase() === 'description') {
          headerRow = r;
          break;
        }
      }
    }

    const rows: RawBankRow[] = [];
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const get = (col: number) =>
        sheet[XLSX.utils.encode_cell({ r, c: col })]?.v;

      const srl = parseFloat(String(get(2) ?? '0'));
      if (!srl || isNaN(srl)) continue;

      const txnDate = parseDate(get(3));
      const valueDate = parseDate(get(4));
      if (!txnDate || !valueDate) continue;

      const txnDateTime = parseDate(get(0));
      const description = String(get(5) ?? '').trim();
      const chequeNo = String(get(6) ?? '').trim();
      const crDrRaw = String(get(7) ?? '')
        .trim()
        .toLowerCase();
      const crDr: BankTxnType = crDrRaw.startsWith('cr') ? 'CR' : 'DR';
      const amount = parseAmount(get(9));
      const balance = parseAmount(get(10));

      if (!description || amount <= 0) continue;

      rows.push({
        srl,
        txnDate,
        txnDateTime,
        valueDate,
        description,
        chequeNo,
        crDr,
        amount,
        balance,
      });
    }

    return { accountNumber, rows };
  }

  // ── 2. Import Statement (with smart dedup) ─────────────────────────────────

  async importStatement(
    buffer: Buffer,
    fileName: string,
    importedById: string,
  ) {
    const { accountNumber, rows } = this.parseXls(buffer);
    if (rows.length === 0)
      throw new BadRequestException('No valid transactions found in file');

    // Application-level dedup. Running balance is not unique: a debit followed by
    // a credit can return to the same balance, so use the full row fingerprint.
    // Read stored importKeys directly — never recompute from stored fields,
    // because Prisma/Postgres datetime normalization can produce a different
    // hash than what was originally stored.
    const existing = await this.prisma.bankTransaction.findMany({
      where: { accountNumber },
      select: { importKey: true },
    });
    const existingImportKeys = new Set(existing.map((r) => r.importKey));
    const rowsSeenInFile = new Set<string>();
    const newRows = rows.filter((r) => {
      const importKey = buildImportKey(r);
      if (existingImportKeys.has(importKey) || rowsSeenInFile.has(importKey))
        return false;
      rowsSeenInFile.add(importKey);
      return true;
    });
    let skipped = rows.length - newRows.length;

    // Create import session
    const session = await this.prisma.bankImportSession.create({
      data: {
        accountNumber,
        fileName,
        importedById,
        rowsFound: rows.length,
        rowsImported: 0,
        rowsSkipped: skipped,
        status: 'PROCESSING',
      },
    });

    // Load keyword maps
    const vendorKeywords = await this.prisma.vendorKeyword.findMany({
      select: { keyword: true, vendorId: true },
    });
    const expenseKeywords = await this.prisma.expenseKeyword.findMany({
      select: { keyword: true, categoryId: true },
    });

    let importedCount = 0;
    const toCreate: Prisma.BankTransactionCreateManyInput[] = [];

    for (const row of newRows) {
      const desc = row.description.toUpperCase();

      let reconcileStatus: BankReconcileStatus = 'UNMATCHED';

      // 1. Try vendor keyword match (DR transactions)
      let matchedVendorId: string | undefined;
      if (row.crDr === 'DR') {
        for (const vk of vendorKeywords) {
          if (desc.includes(vk.keyword.toUpperCase())) {
            matchedVendorId = vk.vendorId;
            reconcileStatus = 'MATCHED_VENDOR';
            break;
          }
        }
      }

      // 2. Try expense category match
      let expenseCategoryId: string | undefined;
      if (row.crDr === 'DR' && !matchedVendorId) {
        for (const ek of expenseKeywords) {
          if (desc.includes(ek.keyword.toUpperCase())) {
            expenseCategoryId = ek.categoryId;
            reconcileStatus = 'MATCHED_EXPENSE';
            break;
          }
        }
      }

      // 4. Flag for manual review if still unmatched
      if (reconcileStatus === 'UNMATCHED') {
        reconcileStatus = 'MANUAL_REVIEW';
      }

      toCreate.push({
        sessionId: session.id,
        accountNumber,
        importKey: buildImportKey(row),
        srl: row.srl,
        txnDate: row.txnDate,
        txnDateTime: row.txnDateTime ?? null,
        valueDate: row.valueDate,
        description: row.description,
        chequeNo: row.chequeNo || null,
        crDr: row.crDr,
        amount: row.amount,
        balance: row.balance,
        reconcileStatus,
        matchedPaymentId: null,
        matchedVendorId: matchedVendorId ?? null,
        expenseCategoryId: expenseCategoryId ?? null,
      });

      importedCount++;
    }

    // Bulk insert — skip duplicates on (accountNumber, txnDate, srl)
    let insertedCount = 0;
    if (toCreate.length > 0) {
      const result = await this.prisma.bankTransaction.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      insertedCount = result.count;
      skipped = toCreate.length - insertedCount;
    }

    // Update session status
    const lastRow = newRows[newRows.length - 1];
    await this.prisma.bankImportSession.update({
      where: { id: session.id },
      data: {
        rowsImported: insertedCount,
        lastSrlImported: lastRow?.srl ?? null,
        lastBalance: lastRow?.balance ?? null,
        status: 'COMPLETED',
      },
    });

    return {
      sessionId: session.id,
      accountNumber,
      totalInFile: rows.length,
      skipped,
      imported: insertedCount,
      summary: {
        matched_payment: toCreate.filter(
          (r) => r.reconcileStatus === 'MATCHED_PAYMENT',
        ).length,
        matched_vendor: toCreate.filter(
          (r) => r.reconcileStatus === 'MATCHED_VENDOR',
        ).length,
        matched_expense: toCreate.filter(
          (r) => r.reconcileStatus === 'MATCHED_EXPENSE',
        ).length,
        manual_review: toCreate.filter(
          (r) => r.reconcileStatus === 'MANUAL_REVIEW',
        ).length,
      },
    };
  }

  // ── 3. List Transactions ───────────────────────────────────────────────────

  async listAccounts() {
    const [txnAccounts, sessionAccounts] = await Promise.all([
      this.prisma.bankTransaction.groupBy({
        by: ['accountNumber'],
        _count: { _all: true },
        orderBy: { accountNumber: 'asc' },
      }),
      this.prisma.bankImportSession.groupBy({
        by: ['accountNumber'],
        _count: { _all: true },
        orderBy: { accountNumber: 'asc' },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const row of [...txnAccounts, ...sessionAccounts]) {
      counts.set(
        row.accountNumber,
        (counts.get(row.accountNumber) ?? 0) + row._count._all,
      );
    }

    return Array.from(counts.entries()).map(([accountNumber, count]) => ({
      accountNumber,
      label:
        accountNumber === GST_BANK_ACCOUNT
          ? 'GST Bank'
          : `CC Bank ${accountNumber.slice(-4)}`,
      count,
      isDefault: accountNumber === GST_BANK_ACCOUNT,
    }));
  }

  async listTransactions(filters: {
    accountNumber?: string;
    reconcileStatus?: BankReconcileStatus;
    crDr?: BankTxnType;
    fromDate?: string;
    toDate?: string;
    amountMin?: number;
    amountMax?: number;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.BankTransactionWhereInput = {};
    if (filters.accountNumber) where.accountNumber = filters.accountNumber;
    if (filters.reconcileStatus)
      where.reconcileStatus = filters.reconcileStatus;
    if (filters.crDr) where.crDr = filters.crDr;
    if (filters.fromDate || filters.toDate) {
      where.txnDate = {};
      if (filters.fromDate)
        (where.txnDate as any).gte = startOfIstDate(filters.fromDate);
      if (filters.toDate)
        (where.txnDate as any).lte = endOfIstDate(filters.toDate);
    }
    if (filters.amountMin !== undefined || filters.amountMax !== undefined) {
      where.amount = {};
      if (filters.amountMin !== undefined)
        (where.amount as any).gte = filters.amountMin;
      if (filters.amountMax !== undefined)
        (where.amount as any).lte = filters.amountMax;
    }

    const [total, data] = await Promise.all([
      this.prisma.bankTransaction.count({ where }),
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: [
          { txnDateTime: { sort: 'desc', nulls: 'last' } },
          { txnDate: 'desc' },
          { srl: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          matchedPayment: {
            select: {
              id: true,
              amount: true,
              referenceNumber: true,
              order: { select: { id: true } },
            },
          },
          matchedVendor: { select: { id: true, name: true } },
          expenseCategory: { select: { id: true, name: true } },
          reconciledBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    return { total, page, limit, data };
  }

  // ── 4. Manual Reconcile ────────────────────────────────────────────────────

  async reconcileTransaction(
    txnId: string,
    userId: string,
    body: {
      reconcileStatus: BankReconcileStatus;
      matchedPaymentId?: string;
      matchedVendorId?: string;
      expenseCategoryId?: string;
      reviewNote?: string;
    },
  ) {
    return this.prisma.bankTransaction.update({
      where: { id: txnId },
      data: {
        reconcileStatus: body.reconcileStatus,
        matchedPaymentId: body.matchedPaymentId ?? null,
        matchedVendorId: body.matchedVendorId ?? null,
        expenseCategoryId: body.expenseCategoryId ?? null,
        reviewNote: body.reviewNote ?? null,
        reconciledById: userId,
        reconciledAt: new Date(),
      },
    });
  }

  // ── 5. Import Sessions ─────────────────────────────────────────────────────

  async listSessions(accountNumber?: string) {
    return this.prisma.bankImportSession.findMany({
      where: accountNumber ? { accountNumber } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { importedBy: { select: { id: true, fullName: true } } },
    });
  }

  // ── 6. Summary / Dashboard ─────────────────────────────────────────────────

  async getSummary(
    filters: {
      accountNumber?: string;
      fromDate?: string;
      toDate?: string;
    } = {},
  ) {
    const where: Prisma.BankTransactionWhereInput = {};
    if (filters.accountNumber) where.accountNumber = filters.accountNumber;
    if (filters.fromDate || filters.toDate) {
      where.txnDate = {};
      if (filters.fromDate)
        (where.txnDate as any).gte = startOfIstDate(filters.fromDate);
      if (filters.toDate)
        (where.txnDate as any).lte = endOfIstDate(filters.toDate);
    }

    const [total, byCrDr, byStatus] = await Promise.all([
      this.prisma.bankTransaction.count({ where }),
      this.prisma.bankTransaction.groupBy({
        by: ['crDr'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.bankTransaction.groupBy({
        by: ['reconcileStatus'],
        where,
        _count: true,
      }),
    ]);

    const lastBalance = await this.prisma.bankTransaction.findFirst({
      where,
      orderBy: [
        { txnDateTime: { sort: 'desc', nulls: 'last' } },
        { txnDate: 'desc' },
        { srl: 'desc' },
        { createdAt: 'desc' },
      ],
      select: { balance: true, txnDate: true, txnDateTime: true },
    });

    return { total, byCrDr, byStatus, lastBalance };
  }

  // ── 7. Vendor Keywords CRUD ────────────────────────────────────────────────

  async listVendorKeywords() {
    return this.prisma.vendorKeyword.findMany({
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { keyword: 'asc' },
    });
  }

  async upsertVendorKeyword(keyword: string, vendorId: string) {
    return this.prisma.vendorKeyword.upsert({
      where: { keyword: keyword.toUpperCase() },
      create: { keyword: keyword.toUpperCase(), vendorId },
      update: { vendorId },
    });
  }

  async deleteVendorKeyword(id: string) {
    return this.prisma.vendorKeyword.delete({ where: { id } });
  }

  // ── 8. Expense Categories & Keywords ──────────────────────────────────────

  async listExpenseCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { isActive: true },
      include: { keywords: true },
      orderBy: { name: 'asc' },
    });
  }

  async createExpenseCategory(name: string, description?: string) {
    return this.prisma.expenseCategory.create({ data: { name, description } });
  }

  async upsertExpenseKeyword(keyword: string, categoryId: string) {
    return this.prisma.expenseKeyword.upsert({
      where: { keyword: keyword.toUpperCase() },
      create: { keyword: keyword.toUpperCase(), categoryId },
      update: { categoryId },
    });
  }

  async deleteExpenseKeyword(id: string) {
    return this.prisma.expenseKeyword.delete({ where: { id } });
  }

  // ── 9. Re-run auto-matching on existing unmatched rows ────────────────────

  async reRunAutoMatch(accountNumber?: string) {
    const where: Prisma.BankTransactionWhereInput = {
      reconcileStatus: { in: ['UNMATCHED', 'MANUAL_REVIEW'] },
    };
    if (accountNumber) where.accountNumber = accountNumber;

    const txns = await this.prisma.bankTransaction.findMany({ where });
    const vendorKeywords = await this.prisma.vendorKeyword.findMany();
    const expenseKeywords = await this.prisma.expenseKeyword.findMany();
    let updated = 0;
    for (const txn of txns) {
      const desc = txn.description.toUpperCase();
      let reconcileStatus: BankReconcileStatus = 'MANUAL_REVIEW';
      let matchedVendorId: string | null = null;
      let expenseCategoryId: string | null = null;

      if (txn.crDr === 'DR') {
        for (const vk of vendorKeywords) {
          if (desc.includes(vk.keyword.toUpperCase())) {
            matchedVendorId = vk.vendorId;
            reconcileStatus = 'MATCHED_VENDOR';
            break;
          }
        }
        if (!matchedVendorId) {
          for (const ek of expenseKeywords) {
            if (desc.includes(ek.keyword.toUpperCase())) {
              expenseCategoryId = ek.categoryId;
              reconcileStatus = 'MATCHED_EXPENSE';
              break;
            }
          }
        }
      }

      if (
        reconcileStatus !== 'MANUAL_REVIEW' ||
        txn.reconcileStatus !== reconcileStatus
      ) {
        await this.prisma.bankTransaction.update({
          where: { id: txn.id },
          data: {
            reconcileStatus,
            matchedPaymentId: null,
            matchedVendorId,
            expenseCategoryId,
          },
        });
        updated++;
      }
    }

    return { processed: txns.length, updated };
  }
}
