// backend/src/loyalty/loyalty.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CostTableService } from '../cost-table/cost-table.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { computeEarnPoints, computeRedemption, computeReversal } from './loyalty.calc';

// ─── SystemConfig keys for loyalty settings ─────────────────────────────────
// Same "individual key per setting, JSON-free" convention as marketing.service.ts
// (CFG map + findMany + fallback), so finance can tune these without a deploy.
const CFG = {
  EARN_RATE_PCT: 'loyalty_earn_rate_pct',
  GP_RATE_PCT: 'loyalty_gp_rate_pct',
  POINT_CAP: 'loyalty_point_cap',
  REDEMPTION_CAP_PCT: 'loyalty_redemption_cap_pct',
};

const DEFAULTS = {
  earnRatePct: 5,
  gpRatePct: 10,
  pointCap: 2000,
  redemptionCapPct: 50,
};

export interface LoyaltyThresholds {
  earnRatePct: number;
  gpRatePct: number;
  pointCap: number;
  redemptionCapPct: number;
}

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly costTable: CostTableService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ── Thresholds (SystemConfig-backed, not hardcoded) ────────────────────────
  async getThresholds(): Promise<LoyaltyThresholds> {
    const rows = await (this.prisma as any).systemConfig.findMany({
      where: { key: { in: Object.values(CFG) } },
    });
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    return {
      earnRatePct: Number(map[CFG.EARN_RATE_PCT] ?? DEFAULTS.earnRatePct),
      gpRatePct: Number(map[CFG.GP_RATE_PCT] ?? DEFAULTS.gpRatePct),
      pointCap: Number(map[CFG.POINT_CAP] ?? DEFAULTS.pointCap),
      redemptionCapPct: Number(map[CFG.REDEMPTION_CAP_PCT] ?? DEFAULTS.redemptionCapPct),
    };
  }

  async updateThresholds(body: Partial<LoyaltyThresholds>): Promise<LoyaltyThresholds> {
    const pairs: [string, string][] = [];
    if (body.earnRatePct != null) pairs.push([CFG.EARN_RATE_PCT, String(body.earnRatePct)]);
    if (body.gpRatePct != null) pairs.push([CFG.GP_RATE_PCT, String(body.gpRatePct)]);
    if (body.pointCap != null) pairs.push([CFG.POINT_CAP, String(body.pointCap)]);
    if (body.redemptionCapPct != null) pairs.push([CFG.REDEMPTION_CAP_PCT, String(body.redemptionCapPct)]);

    await Promise.all(
      pairs.map(([key, value]) =>
        (this.prisma as any).systemConfig.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
    return this.getThresholds();
  }

  private normalizePhoneOrNull(phone?: string | null): string | null {
    if (!phone) return null;
    return this.whatsapp.normalizePhone(phone);
  }

  // ── Consent check — reuse the same opt-out/blacklist fields the marketing
  // module applies to MarketingContact, so loyalty messages never go to
  // opted-out numbers. No contact record at all just means this phone has
  // never been in a marketing campaign — that's not an opt-out.
  private async isOptedOut(phone: string): Promise<boolean> {
    const contact = await (this.prisma as any).marketingContact.findUnique({ where: { mobile: phone } });
    if (!contact) return false;
    return !!(contact.isBlacklisted || contact.optedOutAt);
  }

  private async sendEarnNotification(order: any, phone: string, pointsEarned: number, newBalance: number) {
    try {
      if (await this.isOptedOut(phone)) {
        this.logger.log(`Loyalty: skipping WhatsApp for opted-out/blacklisted ${phone} (order ${order.orderNumber})`);
        return;
      }
      await this.whatsapp.sendLoyaltyPointsEarned({
        customerName: order.customer?.businessName ?? 'Customer',
        customerPhone: phone,
        orderNo: order.orderNumber,
        pointsEarned,
        newBalance,
      });
    } catch (err) {
      this.logger.error(`Loyalty WhatsApp notification failed for order ${order.orderNumber}: ${err}`);
    }
  }

  // ── EARN ─────────────────────────────────────────────────────────────────
  // Call this once an order is invoiced/completed (see accounts.service.ts
  // approveOrder). Idempotent — safe to call repeatedly for the same orderId;
  // the DB unique index on (orderId, type) is the source of truth for that,
  // the findFirst check below just avoids the round-trip cost on retries.
  async earnForOrder(orderId: string): Promise<{ skipped: boolean; points?: number; reason?: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) return { skipped: true, reason: 'ORDER_NOT_FOUND' };
    if ((order as any).isTest || (order as any).isSample) return { skipped: true, reason: 'TEST_OR_SAMPLE' };

    const existing = await (this.prisma as any).customerLoyaltyTransaction.findFirst({
      where: { orderId, type: 'EARN' },
    });
    if (existing) return { skipped: true, reason: 'ALREADY_EARNED' };

    const phone = this.normalizePhoneOrNull(order.customer?.phone);
    if (!phone) {
      this.logger.warn(`Loyalty: no valid phone for order ${order.orderNumber}, skipping points`);
      return { skipped: true, reason: 'NO_PHONE' };
    }

    const subtotal = Number(order.subtotal);
    const discount = Number(order.discount); // redemption never touches this field — see loyaltyDiscountAmount
    const baseAmount = subtotal - discount;
    const discountPct = subtotal > 0 ? (discount / subtotal) * 100 : 0;

    const { grossProfit, hasMissingCost } = await this.costTable.computeOrderGrossProfit(orderId);
    const thresholds = await this.getThresholds();

    const calc = computeEarnPoints({
      baseAmount,
      discountPct,
      grossProfit,
      hasMissingCost,
      earnRatePct: thresholds.earnRatePct,
      gpRatePct: thresholds.gpRatePct,
      pointCap: thresholds.pointCap,
    });

    let walletBalance: number;
    try {
      walletBalance = await this.prisma.$transaction(async (tx) => {
        const wallet = await (tx as any).customerLoyaltyWallet.upsert({
          where: { phone },
          create: { phone, customerId: order.customerId ?? null, points: 0 },
          update: order.customerId ? { customerId: order.customerId } : {},
        });

        const updatedWallet = calc.points > 0
          ? await (tx as any).customerLoyaltyWallet.update({
              where: { id: wallet.id },
              data: { points: { increment: calc.points } },
            })
          : wallet;

        await (tx as any).customerLoyaltyTransaction.create({
          data: {
            walletId: updatedWallet.id,
            orderId,
            type: 'EARN',
            points: calc.points,
            baseAmount,
            grossProfit: grossProfit ?? null,
            discountPct: Number(discountPct.toFixed(2)),
            reason: calc.flagged ? `Flagged: ${calc.flagReason}` : 'Order invoiced',
          },
        });

        await tx.order.update({
          where: { id: orderId },
          data: { loyaltyPointsEarned: calc.points } as any,
        });

        return updatedWallet.points as number;
      });
    } catch (err: any) {
      // Unique constraint race — two concurrent calls for the same order.
      // Whichever loses is treated as already-earned, not an error.
      if (err?.code === 'P2002') return { skipped: true, reason: 'ALREADY_EARNED' };
      throw err;
    }

    if (calc.points > 0) {
      void this.sendEarnNotification(order, phone, calc.points, walletBalance);
    }

    return { skipped: false, points: calc.points };
  }

  // ── REDEEM ───────────────────────────────────────────────────────────────
  // Redemption is treated as a payment method against the order's invoice
  // (like an AccountingNote credit note reduces invoice.balanceAmount),
  // never written into Order.discount — that field stays reserved for
  // promotional discounts so it doesn't distort future EARN discountPct
  // calculations. Row-locks the wallet to prevent concurrent double-spend.
  async redeemForOrder(orderId: string, requestedPoints?: number): Promise<{
    redeemed: number;
    walletBalance: number;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, invoice: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.invoice) throw new BadRequestException('Order has no invoice yet — redemption happens at billing time');

    const phone = this.normalizePhoneOrNull(order.customer?.phone);
    if (!phone) throw new BadRequestException('Customer has no valid phone number for loyalty redemption');

    const alreadyRedeemed = await (this.prisma as any).customerLoyaltyTransaction.findFirst({
      where: { orderId, type: 'REDEEM' },
    });
    if (alreadyRedeemed) throw new BadRequestException('Points have already been redeemed against this order');

    const thresholds = await this.getThresholds();
    const billValue = Number(order.invoice.balanceAmount); // can't redeem more than what's actually still owed

    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE row lock — two orders for the same customer redeeming at
      // once must not both read the same balance and double-spend it.
      const rows: any[] = await tx.$queryRawUnsafe(
        `SELECT * FROM "CustomerLoyaltyWallet" WHERE phone = $1 FOR UPDATE`,
        phone,
      );
      const wallet = rows[0];
      if (!wallet) throw new BadRequestException('No loyalty wallet found for this customer');

      const calc = computeRedemption({
        billValue,
        availableBalance: Number(wallet.points),
        requestedPoints,
        redemptionCapPct: thresholds.redemptionCapPct,
      });

      if (calc.redeemed <= 0) {
        return { redeemed: 0, walletBalance: Number(wallet.points) };
      }

      await (tx as any).customerLoyaltyWallet.update({
        where: { id: wallet.id },
        data: { points: { decrement: calc.redeemed } },
      });
      await (tx as any).customerLoyaltyTransaction.create({
        data: {
          walletId: wallet.id,
          orderId,
          type: 'REDEEM',
          points: -calc.redeemed,
          reason: 'Redeemed at billing',
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          loyaltyPointsRedeemed: calc.redeemed,
          loyaltyDiscountAmount: calc.redeemed,
        } as any,
      });
      await tx.invoice.update({
        where: { id: order.invoice!.id },
        data: { balanceAmount: Math.max(0, this.round2(billValue - calc.redeemed)) },
      });

      return { redeemed: calc.redeemed, walletBalance: Number(wallet.points) - calc.redeemed };
    });
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  // ── REVERSE ──────────────────────────────────────────────────────────────
  // Call on order cancellation/refund. Safe no-op if the order never earned
  // points, or was already reversed (unique index on (orderId, type) backs
  // this up at the DB level too).
  async reverseForOrder(orderId: string, reason: string): Promise<{
    reversed: boolean;
    needsManualReconciliation?: boolean;
  }> {
    const earnTxn = await (this.prisma as any).customerLoyaltyTransaction.findFirst({
      where: { orderId, type: 'EARN' },
    });
    if (!earnTxn || earnTxn.points <= 0) return { reversed: false };

    const alreadyReversed = await (this.prisma as any).customerLoyaltyTransaction.findFirst({
      where: { orderId, type: 'REVERSE' },
    });
    if (alreadyReversed) return { reversed: false };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows: any[] = await tx.$queryRawUnsafe(
          `SELECT * FROM "CustomerLoyaltyWallet" WHERE id = $1 FOR UPDATE`,
          earnTxn.walletId,
        );
        const wallet = rows[0];
        if (!wallet) return { reversed: false };

        const calc = computeReversal(Number(wallet.points), Number(earnTxn.points));

        await (tx as any).customerLoyaltyWallet.update({
          where: { id: wallet.id },
          data: { points: calc.newBalance },
        });
        await (tx as any).customerLoyaltyTransaction.create({
          data: {
            walletId: wallet.id,
            orderId,
            type: 'REVERSE',
            points: -Number(earnTxn.points),
            reason: calc.needsManualReconciliation
              ? `${reason} — balance already partly spent, flagged for manual reconciliation`
              : reason,
          },
        });

        return { reversed: true, needsManualReconciliation: calc.needsManualReconciliation };
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return { reversed: false };
      throw err;
    }
  }

  // ── Reporting ────────────────────────────────────────────────────────────
  // Wallet + ledger by phone, for support ("how many points do I have") and
  // finance (auditing payouts).
  async getWalletByPhone(rawPhone: string) {
    const phone = this.normalizePhoneOrNull(rawPhone);
    if (!phone) throw new BadRequestException('Invalid phone number');

    const wallet = await (this.prisma as any).customerLoyaltyWallet.findUnique({
      where: { phone },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 200 } },
    });
    if (!wallet) return { phone, points: 0, transactions: [] };
    return wallet;
  }
}
