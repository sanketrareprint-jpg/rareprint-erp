// backend/src/remittance/remittance.service.ts
//
// Reconciles courier COD remittance reports against ERP orders and posts
// receipts (Payments) that adjust the customer's balance.
//
// Two reports are involved (both exported from the courier's dashboard, e.g.
// Bigship):
//   1. "Remittance Report"      — AWBNumber, NetPayableAmount, CollectableAmount, ...
//                                  (no customer name/phone/order number)
//   2. "Delivered Orders Report" — AWB No., Channel Order Id / Invoice Number,
//                                  Receiver Name, Receiver Mobile1/2, ...
//
// The two reports are joined by AWB number. The "Channel Order Id / Invoice
// Number" column on the Delivered Orders report is what the shop actually
// typed in as the ERP order number when booking the shipment, so it is tried
// first as a direct lookup against Order.orderNumber. As a second signal, the
// AWB is also looked up against Shipment.awbNumber (populated automatically
// when a shipment is booked through the ERP's own Bigship integration). The
// receiver's mobile number is used as a cross-check against the matched
// order's customer phone — a mismatch downgrades a match to manual review
// rather than silently trusting a single field. When neither the order
// number nor AWB resolves anything, the mobile number is used as a last
// resort to *suggest* a candidate order, but such rows always require manual
// confirmation before a receipt is posted.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { Prisma, RemittanceMatchStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { createHash } from 'crypto';

const BIGSHIP_ACCOUNT_NAME = 'Bigship COD Remittance';

// ─── Parsing helpers ────────────────────────────────────────────────────────

/** Reads the first sheet of an xlsx buffer into an array of plain objects keyed by header text.
 *  Scans the first few rows to find the real header row (defensive against banner/title rows). */
function sheetToObjects(buffer: Buffer, headerHints: string[]): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  let headerRowIdx = 0;
  const lowerHints = headerHints.map((h) => h.toLowerCase());
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = (aoa[i] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
    const hits = lowerHints.filter((h) => row.includes(h)).length;
    if (hits >= Math.min(2, lowerHints.length)) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (aoa[headerRowIdx] ?? []).map((c) => String(c ?? '').trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    const isBlank = raw.every((c) => c === null || c === undefined || String(c).trim() === '');
    if (isBlank) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = raw[idx] ?? null;
    });
    rows.push(obj);
  }
  return rows;
}

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    return parseFloat(raw.replace(/[₹,\s]/g, '')) || 0;
  }
  return 0;
}

function parseFlexibleDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeAwb(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\.0+$/, '');
}

function cleanChannelId(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/\.0+$/, '');
  if (!s || s.length > 20) return null;
  return s;
}

/**
 * Derives possible ERP Order.orderNumber values from a raw "Channel Order Id / Invoice
 * Number" value. When a shipment is booked through the ERP's own Bigship integration, the
 * invoice number sent to Bigship is `RP<orderNumber>` (or `0RP<orderNumber>` / `00RP<orderNumber>`
 * for rebook attempts — see bigship.service.ts tryCreateAdhocOrder). Some rows also come through
 * with a plain numeric order number, sometimes with a stray leading zero. Shipments booked
 * directly on the courier's own dashboard (not through the ERP) carry the courier's own
 * generic numeric channel id here instead, which won't match anything — that's expected and
 * such rows fall through to the AWB/phone matching below.
 */
function deriveOrderNumberCandidates(raw: unknown): string[] {
  const s = cleanChannelId(raw);
  if (!s) return [];
  const candidates = new Set<string>([s]);
  const rpStripped = s.replace(/^0{0,2}RP/i, '');
  if (rpStripped && rpStripped !== s) candidates.add(rpStripped);
  for (const c of Array.from(candidates)) {
    const noLeadingZeros = c.replace(/^0+(?=\d)/, '');
    if (noLeadingZeros) candidates.add(noLeadingZeros);
  }
  return Array.from(candidates).filter((c) => /^[A-Za-z0-9-]+$/.test(c));
}

/** Normalizes an Indian mobile number to a bare 10-digit string, or null if not usable. */
function normalizeMobile(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const stripped = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  const ten = stripped.slice(-10);
  return ten.length === 10 && /^[6-9]/.test(ten) ? ten : null;
}

interface ParsedRemittanceRow {
  remittanceRef: string | null;
  bigshipOrderId: string | null;
  awbNumber: string;
  courierName: string | null;
  lrNumber: string | null;
  deliveryDate: Date | null;
  remittanceDate: Date | null;
  collectableAmount: number;
  earlyCodAmount: number | null;
  otherDeduction: number | null;
  netPayableAmount: number;
  remittanceStatus: string | null;
}

interface ParsedDeliveredRow {
  awbNumber: string;
  channelOrderId: string | null;
  receiverName: string | null;
  receiverMobile: string | null;
  productDetails: string | null;
  awbDate: Date | null;
}

@Injectable()
export class RemittanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  // ── 1. Parsing ─────────────────────────────────────────────────────────────

  private parseRemittanceXlsx(buffer: Buffer): ParsedRemittanceRow[] {
    const rows = sheetToObjects(buffer, ['AWBNumber', 'OrderId', 'NetPayableAmount', 'RemittanceDate']);
    const out: ParsedRemittanceRow[] = [];
    for (const r of rows) {
      const awb = normalizeAwb(r['AWBNumber']);
      if (!awb) continue;
      const collectable = parseAmount(r['CollectableAmount']);
      const netPayable = parseAmount(r['NetPayableAmount']);
      if (collectable <= 0 && netPayable <= 0) continue;
      out.push({
        remittanceRef: r['RemittanceId'] != null ? String(r['RemittanceId']).trim() : null,
        bigshipOrderId: r['OrderId'] != null ? String(r['OrderId']).trim() : null,
        awbNumber: awb,
        courierName: r['CourierName'] ? String(r['CourierName']).trim() : null,
        lrNumber: r['LRNumber'] ? String(r['LRNumber']).trim() : null,
        deliveryDate: parseFlexibleDate(r['DeliveryDate']),
        remittanceDate: parseFlexibleDate(r['RemittanceDate']),
        collectableAmount: collectable,
        earlyCodAmount: r['EarlyCodAmount'] != null ? parseAmount(r['EarlyCodAmount']) : null,
        otherDeduction: r['OtherDeduction'] != null ? parseAmount(r['OtherDeduction']) : null,
        netPayableAmount: netPayable,
        remittanceStatus: r['RemittanceStatus'] ? String(r['RemittanceStatus']).trim() : null,
      });
    }
    return out;
  }

  private parseDeliveredOrdersXlsx(buffer: Buffer): Map<string, ParsedDeliveredRow> {
    const rows = sheetToObjects(buffer, [
      'AWB No.', 'Channel Order Id / Invoice Number', 'Receiver Mobile1', 'Order ID',
    ]);
    const map = new Map<string, ParsedDeliveredRow>();
    for (const r of rows) {
      const awb = normalizeAwb(r['AWB No.']);
      if (!awb) continue;
      const receiverMobile =
        (r['Receiver Mobile1'] && String(r['Receiver Mobile1']).trim()) ||
        (r['Receiver Mobile2'] && String(r['Receiver Mobile2']).trim()) ||
        null;
      map.set(awb, {
        awbNumber: awb,
        channelOrderId: cleanChannelId(r['Channel Order Id / Invoice Number']),
        receiverName: r['Receiver Name'] ? String(r['Receiver Name']).trim() : null,
        receiverMobile,
        productDetails: r['Product Details'] ? String(r['Product Details']).trim() : null,
        awbDate: parseFlexibleDate(r['AWB Date']),
      });
    }
    return map;
  }

  // ── 2. Import ───────────────────────────────────────────────────────────────

  async importReports(
    remittanceBuffer: Buffer,
    remittanceFileName: string,
    deliveredBuffer: Buffer | null,
    deliveredFileName: string | null,
    importedById: string,
  ) {
    const remittanceRows = this.parseRemittanceXlsx(remittanceBuffer);
    if (remittanceRows.length === 0) {
      throw new BadRequestException('No valid rows found in the remittance report');
    }
    const deliveredMap = deliveredBuffer ? this.parseDeliveredOrdersXlsx(deliveredBuffer) : new Map<string, ParsedDeliveredRow>();

    // Captured from every PARSED row, before dedup — not from the records
    // that end up actually created. A file where every row turns out to be
    // a duplicate still has a real remittance date in it; deriving this
    // only from newly-created records made such a session show "—" even
    // though rowsFound was clearly non-zero (see listSessions).
    const parsedDates = remittanceRows.map((r) => r.remittanceDate).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime());

    const session = await this.prisma.remittanceImportSession.create({
      data: {
        fileName: remittanceFileName,
        deliveredFileName: deliveredFileName ?? undefined,
        importedById,
        rowsFound: remittanceRows.length,
        remittanceDateFrom: parsedDates[0] ?? undefined,
        remittanceDateTo: parsedDates[parsedDates.length - 1] ?? undefined,
      },
    });

    let matched = 0, needReview = 0, duplicate = 0;
    const seenInFile = new Set<string>();

    for (const row of remittanceRows) {
      const importKey = row.remittanceRef
        ? createHash('sha256').update(`RID:${row.remittanceRef}`).digest('hex')
        : createHash('sha256')
            .update(`${row.awbNumber}|${row.remittanceDate?.toISOString() ?? ''}|${row.netPayableAmount.toFixed(2)}`)
            .digest('hex');

      // Two distinct ways a row can be a duplicate: it repeats within THIS
      // file (seenInFile), or it was already imported in a past session
      // (existing, looked up by importKey in the DB). Both used to only
      // count the second kind — a file that was entirely re-uploaded (every
      // row a repeat of itself or an earlier import) silently produced
      // rowsFound > 0 with matched/needReview/duplicate all landing at 0,
      // making a working safety net (never double-post the same COD
      // receipt) look like a data-loss bug in Import History. Counting both
      // kinds here means rowsFound == matched + needReview + duplicate
      // always holds, so the Duplicate column (see listSessions/frontend)
      // fully explains any 0/0 result instead of leaving it a mystery.
      if (seenInFile.has(importKey)) { duplicate++; continue; }
      seenInFile.add(importKey);

      const existing = await this.prisma.remittanceRecord.findUnique({ where: { importKey } });
      if (existing) {
        duplicate++;
        continue;
      }

      const delivered = deliveredMap.get(row.awbNumber) ?? null;
      const match = await this.resolveMatch(row, delivered);

      if (match.matchStatus === RemittanceMatchStatus.MATCHED) matched++;
      else needReview++;

      await this.prisma.remittanceRecord.create({
        data: {
          sessionId: session.id,
          importKey,
          remittanceRef: row.remittanceRef,
          awbNumber: row.awbNumber,
          courierName: row.courierName,
          lrNumber: row.lrNumber,
          pickupDate: delivered?.awbDate ?? null,
          deliveryDate: row.deliveryDate,
          remittanceDate: row.remittanceDate,
          collectableAmount: new Prisma.Decimal(row.collectableAmount),
          earlyCodAmount: row.earlyCodAmount != null ? new Prisma.Decimal(row.earlyCodAmount) : null,
          otherDeduction: row.otherDeduction != null ? new Prisma.Decimal(row.otherDeduction) : null,
          netPayableAmount: new Prisma.Decimal(row.netPayableAmount),
          remittanceStatus: row.remittanceStatus,
          channelOrderId: delivered?.channelOrderId ?? null,
          receiverName: delivered?.receiverName ?? null,
          receiverMobile: delivered?.receiverMobile ?? null,
          productDetails: delivered?.productDetails ?? null,
          matchStatus: match.matchStatus,
          matchMethod: match.matchMethod,
          matchedOrderId: match.matchedOrderId,
          suggestedOrderId: match.suggestedOrderId,
          mobileMismatch: match.mobileMismatch,
          reviewNote: match.reviewNote,
        },
      });
    }

    await this.prisma.remittanceImportSession.update({
      where: { id: session.id },
      data: { rowsMatched: matched, rowsNeedReview: needReview, rowsDuplicate: duplicate },
    });

    // Automatically fix old backlog too — a Delivered Orders Report export
    // isn't scoped to any one remittance batch, so an AWB in TODAY's file may
    // well belong to a row from a PAST import that got stuck as "Unknown
    // receiver / no mobile" because the report wasn't available (or didn't
    // cover that AWB) back when it was originally imported. Every normal
    // import now sweeps that backlog automatically — the shop should never
    // need to remember to go fix an old session by hand.
    const retro = deliveredMap.size > 0
      ? await this.sweepPendingWithDeliveredMap(deliveredMap, { sessionId: { not: session.id } })
      : { newlyMatched: 0, recordsConsidered: 0 };

    return {
      sessionId: session.id,
      totalInFile: remittanceRows.length,
      matched,
      needsReview: needReview,
      duplicate,
      deliveredOrdersJoined: deliveredMap.size,
      retroactivelyMatched: retro.newlyMatched,
    };
  }

  // ── 2b. Sweep NEEDS_REVIEW rows with a Delivered Orders Report ─────────────
  //
  // Shared by importReports (auto-sweeps the rest of the backlog every time a
  // Delivered Orders Report comes in) and attachDeliveredOrders /
  // attachDeliveredOrdersGlobal (an explicit "fix past rows" upload). Joins
  // by AWB and re-runs the same resolveMatch() used at import time. Rows
  // already MATCHED/POSTED/REJECTED are left untouched.
  private async sweepPendingWithDeliveredMap(
    deliveredMap: Map<string, ParsedDeliveredRow>,
    where: Prisma.RemittanceRecordWhereInput,
  ) {
    const pending = await this.prisma.remittanceRecord.findMany({
      where: { ...where, matchStatus: RemittanceMatchStatus.NEEDS_REVIEW },
    });

    let newlyMatched = 0, stillNeedsReview = 0, notInDeliveredFile = 0;
    const sessionDeltas = new Map<string, number>();

    for (const record of pending) {
      const delivered = deliveredMap.get(record.awbNumber) ?? null;
      if (!delivered) { notInDeliveredFile++; continue; }

      const match = await this.resolveMatch(
        { awbNumber: record.awbNumber, collectableAmount: Number(record.collectableAmount) },
        delivered,
      );

      if (match.matchStatus === RemittanceMatchStatus.MATCHED) {
        newlyMatched++;
        sessionDeltas.set(record.sessionId, (sessionDeltas.get(record.sessionId) ?? 0) + 1);
      } else {
        stillNeedsReview++;
      }

      await this.prisma.remittanceRecord.update({
        where: { id: record.id },
        data: {
          channelOrderId: delivered.channelOrderId,
          receiverName: delivered.receiverName,
          receiverMobile: delivered.receiverMobile,
          productDetails: delivered.productDetails,
          pickupDate: delivered.awbDate ?? undefined,
          matchStatus: match.matchStatus,
          matchMethod: match.matchMethod,
          matchedOrderId: match.matchedOrderId,
          suggestedOrderId: match.suggestedOrderId,
          mobileMismatch: match.mobileMismatch,
          reviewNote: match.reviewNote,
        },
      });
    }

    for (const [sessionId, delta] of sessionDeltas) {
      await this.prisma.remittanceImportSession.update({
        where: { id: sessionId },
        data: { rowsMatched: { increment: delta }, rowsNeedReview: { decrement: delta } },
      }).catch(() => undefined);
    }

    return { recordsConsidered: pending.length, newlyMatched, stillNeedsReview, notInDeliveredFile };
  }

  /** Upload a Delivered Orders Report against one specific already-imported session
   *  (used from the Sessions/Import History tab, scoped to that session's own rows). */
  async attachDeliveredOrders(sessionId: string, deliveredBuffer: Buffer, deliveredFileName: string, _userId: string) {
    const session = await this.prisma.remittanceImportSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Import session not found');

    const deliveredMap = this.parseDeliveredOrdersXlsx(deliveredBuffer);
    if (deliveredMap.size === 0) {
      throw new BadRequestException(
        "Could not read any rows from that file — check it's the Delivered Orders Report export (needs an AWB No. column) and try again.",
      );
    }

    const result = await this.sweepPendingWithDeliveredMap(deliveredMap, { sessionId });

    await this.prisma.remittanceImportSession.update({
      where: { id: sessionId },
      data: {
        deliveredFileName: session.deliveredFileName
          ? `${session.deliveredFileName} + ${deliveredFileName}`
          : deliveredFileName,
      },
    });

    return { sessionId, deliveredRowsParsed: deliveredMap.size, ...result };
  }

  /** Upload a Delivered Orders Report to fix "Unknown receiver / no mobile" rows across
   *  EVERY import, not just one — the normal, no-need-to-hunt-for-a-session way to catch up
   *  a backlog. (Also runs automatically as part of every regular importReports() call.) */
  async attachDeliveredOrdersGlobal(deliveredBuffer: Buffer, _deliveredFileName: string, _userId: string) {
    const deliveredMap = this.parseDeliveredOrdersXlsx(deliveredBuffer);
    if (deliveredMap.size === 0) {
      throw new BadRequestException(
        "Could not read any rows from that file — check it's the Delivered Orders Report export (needs an AWB No. column) and try again.",
      );
    }
    const result = await this.sweepPendingWithDeliveredMap(deliveredMap, {});
    return { deliveredRowsParsed: deliveredMap.size, ...result };
  }

  // ── 3. Matching ────────────────────────────────────────────────────────────
  //
  // Receiver mobile number is the FIRST priority signal (per shop's instruction) — it is
  // tried before order number / AWB. Order number and AWB are still resolved up front and
  // used two ways: (a) to confirm/disambiguate a mobile match when a customer has more than
  // one open order, and (b) as a fallback when the mobile number doesn't resolve to a usable
  // match at all. A match is only auto-accepted when a single order is unambiguous; anything
  // with more than one plausible order, or where the signals disagree, goes to manual review.

  private async resolveMatch(
    row: Pick<ParsedRemittanceRow, 'awbNumber' | 'collectableAmount'>,
    delivered: ParsedDeliveredRow | null,
  ): Promise<{
    matchStatus: RemittanceMatchStatus;
    matchMethod: string | null;
    matchedOrderId: string | null;
    suggestedOrderId: string | null;
    mobileMismatch: boolean;
    reviewNote: string | null;
  }> {
    const receiverMobile = normalizeMobile(delivered?.receiverMobile);
    const orderNumberCandidates = deriveOrderNumberCandidates(delivered?.channelOrderId);

    const [orderByNumber, shipmentByAwb] = await Promise.all([
      orderNumberCandidates.length > 0
        ? this.prisma.order.findFirst({
            where: { orderNumber: { in: orderNumberCandidates } },
            include: { customer: true },
          })
        : Promise.resolve(null),
      this.prisma.shipment.findFirst({
        where: { awbNumber: row.awbNumber },
        orderBy: { createdAt: 'desc' },
        include: { order: { include: { customer: true } } },
      }),
    ]);
    const shipmentOrder = shipmentByAwb?.order ?? null;
    const secondaryAgree = !orderByNumber || !shipmentOrder || orderByNumber.id === shipmentOrder.id;
    const secondarySignalOrder = orderByNumber ?? shipmentOrder ?? null;
    const secondaryMethod =
      orderByNumber && shipmentOrder && orderByNumber.id === shipmentOrder.id ? 'ORDER_NUMBER+SHIPMENT_AWB'
      : orderByNumber ? 'ORDER_NUMBER'
      : shipmentOrder ? 'SHIPMENT_AWB'
      : null;

    const matched = (orderId: string, method: string) => ({
      matchStatus: RemittanceMatchStatus.MATCHED,
      matchMethod: method,
      matchedOrderId: orderId,
      suggestedOrderId: null,
      mobileMismatch: false,
      reviewNote: null,
    });

    // ── PRIORITY 1: receiver mobile number ────────────────────────────────────
    if (receiverMobile) {
      const customers = await this.prisma.customer.findMany({
        where: { phone: { contains: receiverMobile } },
        select: { id: true, phone: true },
      });
      const exactCustomerIds = new Set(
        customers.filter((c) => normalizeMobile(c.phone) === receiverMobile).map((c) => c.id),
      );

      if (exactCustomerIds.size > 0) {
        // Order number / AWB pointing to an order that belongs to this same customer is the
        // strongest possible confirmation of the mobile match — accept it directly.
        if (secondaryAgree && secondarySignalOrder && exactCustomerIds.has(secondarySignalOrder.customerId)) {
          return matched(secondarySignalOrder.id, `MOBILE+${secondaryMethod}`);
        }

        const candidateOrders = await this.prisma.order.findMany({
          where: {
            customerId: { in: Array.from(exactCustomerIds) },
            isTest: false,
            status: { not: 'CANCELLED' },
            paymentStatus: { in: ['PENDING', 'PARTIALLY_PAID'] },
          },
          include: { payments: true },
          orderBy: { orderDate: 'desc' },
        });

        if (candidateOrders.length === 1) {
          const only = candidateOrders[0];
          // Sanity-check a lone mobile match against a clearly conflicting secondary signal
          // (e.g. the AWB is on record for a totally different order) before trusting it.
          if (secondarySignalOrder && secondarySignalOrder.customerId !== only.customerId) {
            return {
              matchStatus: RemittanceMatchStatus.NEEDS_REVIEW,
              matchMethod: 'MOBILE',
              matchedOrderId: null,
              suggestedOrderId: only.id,
              mobileMismatch: false,
              reviewNote: `Receiver mobile matches order #${only.orderNumber}, but the Channel Order Id / AWB on this row points to a different order (#${secondarySignalOrder.orderNumber}). Please verify.`,
            };
          }
          return matched(only.id, 'MOBILE');
        }

        if (candidateOrders.length > 1) {
          const scored = candidateOrders
            .map((o) => {
              const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
              const balanceDue = Number(o.grandTotal) - paid;
              return { order: o, diff: Math.abs(balanceDue - row.collectableAmount) };
            })
            .sort((a, b) => a.diff - b.diff);
          return {
            matchStatus: RemittanceMatchStatus.NEEDS_REVIEW,
            matchMethod: 'MOBILE_AMBIGUOUS',
            matchedOrderId: null,
            suggestedOrderId: scored[0].order.id,
            mobileMismatch: false,
            reviewNote: `Receiver mobile ${delivered?.receiverMobile} has ${candidateOrders.length} open orders on file. Suggested order #${scored[0].order.orderNumber} (closest balance due to the ₹${row.collectableAmount} collected) — please confirm.`,
          };
        }
        // Customer found by phone but has no open orders right now — fall through to the
        // order-number / AWB signal below rather than giving up.
      }
    }

    // ── PRIORITY 2: order number / AWB (fallback when mobile didn't resolve) ──
    if (secondarySignalOrder && secondaryMethod) {
      const orderCustomerPhone = normalizeMobile(secondarySignalOrder.customer?.phone);
      if (receiverMobile && orderCustomerPhone && receiverMobile !== orderCustomerPhone) {
        return {
          matchStatus: RemittanceMatchStatus.NEEDS_REVIEW,
          matchMethod: secondaryMethod,
          matchedOrderId: null,
          suggestedOrderId: secondarySignalOrder.id,
          mobileMismatch: true,
          reviewNote: `Order #${secondarySignalOrder.orderNumber} found via ${secondaryMethod}, but receiver mobile (${delivered?.receiverMobile ?? 'unknown'}) does not match this order's customer phone (${secondarySignalOrder.customer?.phone ?? 'none'}). Please verify before posting.`,
        };
      }
      if (!secondaryAgree) {
        return {
          matchStatus: RemittanceMatchStatus.NEEDS_REVIEW,
          matchMethod: 'ORDER_NUMBER',
          matchedOrderId: null,
          suggestedOrderId: secondarySignalOrder.id,
          mobileMismatch: false,
          reviewNote: `Channel Order Id resolves to order #${orderByNumber?.orderNumber}, but this AWB is also recorded on order #${shipmentOrder?.orderNumber}'s shipment. Please verify which order this remittance belongs to.`,
        };
      }
      return matched(secondarySignalOrder.id, secondaryMethod);
    }

    return {
      matchStatus: RemittanceMatchStatus.NEEDS_REVIEW,
      matchMethod: null,
      matchedOrderId: null,
      suggestedOrderId: null,
      mobileMismatch: false,
      reviewNote: 'No receiver mobile, order number, or AWB could be matched to any order. Please match manually.',
    };
  }

  // ── 4. Listing ─────────────────────────────────────────────────────────────

  async listSessions() {
    const sessions = await this.prisma.remittanceImportSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        importedBy: { select: { id: true, fullName: true } },
        records: { select: { remittanceDate: true } },
      },
    });

    // remittanceDateFrom/To are now captured directly at import time from
    // every parsed row (see importReports), so they're correct even for a
    // session where every row turned out to be a duplicate and zero
    // RemittanceRecord rows got created. Sessions imported before that
    // column existed have it as null — for those only, fall back to
    // deriving from whatever records the session actually has (the
    // original approach), so old history rows don't regress to "—".
    return sessions.map(({ records, ...session }) => {
      if (session.remittanceDateFrom || session.remittanceDateTo) {
        return session;
      }
      const dates = records
        .map((r) => r.remittanceDate)
        .filter((d): d is Date => d != null)
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        ...session,
        remittanceDateFrom: dates[0] ?? null,
        remittanceDateTo: dates[dates.length - 1] ?? null,
      };
    });
  }

  async listRecords(filters: {
    sessionId?: string;
    matchStatus?: RemittanceMatchStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.RemittanceRecordWhereInput = {};
    if (filters.sessionId) where.sessionId = filters.sessionId;
    if (filters.matchStatus) where.matchStatus = filters.matchStatus;

    // Free-text search across everything a user might have in hand while
    // reconciling a remittance report: the AWB, the courier's receiver
    // name/mobile, the channel order id, our own remittance reference, and
    // — for rows that already have a matched or suggested order — that
    // order's number and customer name/phone. Search-server-side (not
    // client-side filtering of the current page) since Needs Review alone
    // can run into the hundreds of rows across many pages.
    const q = filters.search?.trim();
    if (q) {
      where.OR = [
        { awbNumber: { contains: q, mode: 'insensitive' } },
        { receiverName: { contains: q, mode: 'insensitive' } },
        { receiverMobile: { contains: q, mode: 'insensitive' } },
        { channelOrderId: { contains: q, mode: 'insensitive' } },
        { remittanceRef: { contains: q, mode: 'insensitive' } },
        { matchedOrder: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { matchedOrder: { customer: { businessName: { contains: q, mode: 'insensitive' } } } },
        { matchedOrder: { customer: { phone: { contains: q, mode: 'insensitive' } } } },
        { suggestedOrder: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { suggestedOrder: { customer: { businessName: { contains: q, mode: 'insensitive' } } } },
        { suggestedOrder: { customer: { phone: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.remittanceRecord.count({ where }),
      this.prisma.remittanceRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          matchedOrder: { select: { id: true, orderNumber: true, grandTotal: true, paymentStatus: true, customer: { select: { businessName: true, phone: true } }, payments: { select: { amount: true } } } },
          suggestedOrder: { select: { id: true, orderNumber: true, grandTotal: true, paymentStatus: true, customer: { select: { businessName: true, phone: true } }, payments: { select: { amount: true } } } },
          postedPayment: { select: { id: true, amount: true, paymentDate: true } },
          postedBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    // Attach a real balanceDue (grandTotal - sum of payments) to each order reference so the
    // review UI can show the customer's actual outstanding balance next to the COD amount
    // collected, instead of just the order's grand total.
    function attachBalance(order: any): any {
      if (!order) return order;
      const paid = (order.payments ?? []).reduce((sum: number, p: { amount: unknown }) => sum + Number(p.amount), 0);
      const { payments, ...rest } = order;
      return { ...rest, balanceDue: Number(order.grandTotal) - paid };
    }
    const withBalance = data.map((record) => {
      return {
        ...record,
        matchedOrder: attachBalance(record.matchedOrder),
        suggestedOrder: attachBalance(record.suggestedOrder),
      };
    });

    return { total, page, limit, data: withBalance };
  }

  async getSummary(sessionId?: string) {
    const where: Prisma.RemittanceRecordWhereInput = sessionId ? { sessionId } : {};
    const byStatus = await this.prisma.remittanceRecord.groupBy({
      by: ['matchStatus'],
      where,
      _count: true,
      _sum: { collectableAmount: true, netPayableAmount: true },
    });
    return { byStatus };
  }

  /** Search candidate orders for the manual-match picker (by order number, business name, or phone). */
  async searchOrdersForMatch(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    const orders = await this.prisma.order.findMany({
      where: {
        isTest: false,
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' } },
          { customer: { businessName: { contains: q, mode: 'insensitive' } } },
          { customer: { phone: { contains: q } } },
        ],
      },
      include: { customer: { select: { businessName: true, phone: true } }, payments: true },
      orderBy: { orderDate: 'desc' },
      take: 20,
    });
    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.businessName,
      customerPhone: o.customer.phone,
      grandTotal: o.grandTotal,
      paymentStatus: o.paymentStatus,
      balanceDue: Number(o.grandTotal) - o.payments.reduce((s, p) => s + Number(p.amount), 0),
    }));
  }

  // ── 5. Manual match / reject ────────────────────────────────────────────────

  async manualMatch(recordId: string, orderId: string, userId: string) {
    const record = await this.prisma.remittanceRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Remittance record not found');
    if (record.matchStatus === RemittanceMatchStatus.POSTED) {
      throw new BadRequestException('This remittance row has already been posted as a receipt');
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');

    const receiverMobile = normalizeMobile(record.receiverMobile);
    const customerPhone = normalizeMobile(order.customer.phone);
    const mismatch = !!(receiverMobile && customerPhone && receiverMobile !== customerPhone);

    return this.prisma.remittanceRecord.update({
      where: { id: recordId },
      data: {
        matchedOrderId: orderId,
        suggestedOrderId: null,
        matchStatus: RemittanceMatchStatus.MATCHED,
        matchMethod: 'MANUAL',
        mobileMismatch: mismatch,
        reviewNote: mismatch
          ? `Manually matched by user to order #${order.orderNumber} — note: receiver mobile does not match customer phone on file.`
          : null,
      },
    });
  }

  async rejectRecord(recordId: string, note: string) {
    const record = await this.prisma.remittanceRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Remittance record not found');
    if (record.matchStatus === RemittanceMatchStatus.POSTED) {
      throw new BadRequestException('This remittance row has already been posted as a receipt');
    }
    return this.prisma.remittanceRecord.update({
      where: { id: recordId },
      data: { matchStatus: RemittanceMatchStatus.REJECTED, reviewNote: note || 'Rejected' },
    });
  }

  // ── 6. Posting (creates the actual receipt / Payment) ──────────────────────

  private async getOrCreateBigshipAccount() {
    let account = await this.prisma.paymentAccount.findFirst({
      where: { name: BIGSHIP_ACCOUNT_NAME },
    });
    if (!account) {
      account = await this.prisma.paymentAccount.create({
        data: {
          name: BIGSHIP_ACCOUNT_NAME,
          accountType: 'COURIER_COD',
          currentBalance: new Prisma.Decimal(0),
        },
      });
    }
    return account;
  }

  /**
   * Posts a receipt for a matched remittance row.
   * Amount defaults to the full CollectableAmount (what the customer actually paid COD at
   * the doorstep) rather than NetPayableAmount, since NetPayableAmount already has the
   * courier's handling/early-COD charges deducted — those are a shipping expense to the
   * business, not a discount to the customer, and should not reduce the customer's balance.
   * Callers may override with a specific amount if the shop wants to book the net amount instead.
   */
  async postRecord(recordId: string, userId: string, amountOverride?: number) {
    const record = await this.prisma.remittanceRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Remittance record not found');
    if (record.matchStatus === RemittanceMatchStatus.POSTED) {
      throw new BadRequestException('This remittance row has already been posted as a receipt');
    }
    const matchedOrderId = record.matchedOrderId;
    if (record.matchStatus !== RemittanceMatchStatus.MATCHED || !matchedOrderId) {
      throw new BadRequestException('This remittance row is not matched to an order yet — match it first');
    }

    const account = await this.getOrCreateBigshipAccount();
    const amount = amountOverride ?? Number(record.collectableAmount);

    const payment = await this.orders.addPayment(matchedOrderId, userId, {
      amount,
      method: 'BANK_TRANSFER',
      paymentAccountId: account.id,
      referenceNumber: record.awbNumber,
      notes: `Bigship COD remittance — AWB ${record.awbNumber}${record.remittanceRef ? `, Remittance #${record.remittanceRef}` : ''}. Collected ₹${record.collectableAmount}, net payable to bank after courier charges ₹${record.netPayableAmount}.`,
      paymentDate: record.remittanceDate ? record.remittanceDate.toISOString() : undefined,
    });

    // Money is already confirmed received per the courier's remittance report — auto-verify.
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { verificationStatus: 'VERIFIED', verifiedById: userId, verifiedAt: new Date() },
    });

    const updated = await this.prisma.remittanceRecord.update({
      where: { id: recordId },
      data: {
        matchStatus: RemittanceMatchStatus.POSTED,
        postedPaymentId: payment.id,
        postedAt: new Date(),
        postedById: userId,
      },
    });

    // Import History's "Posted" column reads session.rowsPosted, which was
    // only ever set to its (always-0) default at import time and never
    // touched again — every session showed 0 posted there forever, even
    // ones with everything actually posted, because posting happens later
    // as a separate per-record action that didn't know to update the
    // session it came from. Keep it in sync here instead.
    await this.prisma.remittanceImportSession.update({
      where: { id: record.sessionId },
      data: { rowsPosted: { increment: 1 } },
    }).catch(() => undefined);

    return updated;
  }

  async postBatch(recordIds: string[], userId: string) {
    const results: Array<{ recordId: string; ok: boolean; message?: string }> = [];
    for (const id of recordIds) {
      try {
        await this.postRecord(id, userId);
        results.push({ recordId: id, ok: true });
      } catch (e: unknown) {
        results.push({ recordId: id, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return {
      posted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }
}
