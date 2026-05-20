import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const COINS_PER_TASK = 5;

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Get (or create) wallet for a user ────────────────────────────────────
  async getWallet(userId: string) {
    const wallet = await (this.prisma as any).rewardWallet.upsert({
      where: { userId },
      create: { userId, coins: 0 },
      update: {},
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
      },
    });
    return wallet;
  }

  // ── Award coins for a resolved notification ───────────────────────────────
  // Rules:
  //  1. Notification must already be resolved (isResolved: true)
  //  2. Notification must belong to PRAJAKTA DALAL
  //  3. The linked OrderItem's itemProductionStage must have changed from NOT_PRINTED,
  //     OR the linked Order's productionStage must be beyond NOT_PRINTED
  //  4. No duplicate reward for the same notificationId
  async awardCoinsForNotification(notificationId: string): Promise<void> {
    // 1. Load notification
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notif || !notif.isResolved) return;

    // 2. Find Prajakta
    const prajakta = await this.prisma.user.findFirst({
      where: { fullName: { equals: 'PRAJAKTA DALAL', mode: 'insensitive' } },
    });
    if (!prajakta || notif.toUserId !== prajakta.id) return;

    // 3. Guard against duplicate reward for same notification
    const alreadyRewarded = await (this.prisma as any).rewardTransaction.findFirst({
      where: { notificationId },
    });
    if (alreadyRewarded) return;

    // 4. Check if the actual production task was completed
    let taskDone = false;
    let reason = 'Notification resolved';

    if (notif.itemId) {
      const item = await this.prisma.orderItem.findUnique({
        where: { id: notif.itemId },
        select: {
          itemProductionStage: true,
          order: { select: { orderNumber: true } },
        },
      });
      if (item && item.itemProductionStage !== 'NOT_PRINTED') {
        taskDone = true;
        const orderNo = (item.order as any)?.orderNumber ?? '';
        reason = `Task completed — Order ${orderNo} moved to ${item.itemProductionStage}`;
      }
    } else if (notif.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: notif.orderId },
        select: { productionStage: true, orderNumber: true },
      });
      if (order && order.productionStage !== 'NOT_PRINTED') {
        taskDone = true;
        reason = `Task completed — Order ${order.orderNumber} at ${order.productionStage}`;
      }
    }

    if (!taskDone) return;

    // 5. Upsert wallet, increment coins, record transaction
    const wallet = await (this.prisma as any).rewardWallet.upsert({
      where: { userId: prajakta.id },
      create: { userId: prajakta.id, coins: 0 },
      update: {},
    });

    await this.prisma.$transaction([
      (this.prisma as any).rewardWallet.update({
        where: { id: wallet.id },
        data: { coins: { increment: COINS_PER_TASK } },
      }),
      (this.prisma as any).rewardTransaction.create({
        data: {
          walletId: wallet.id,
          coins: COINS_PER_TASK,
          reason,
          notificationId,
          orderId: notif.orderId ?? null,
        },
      }),
    ]);
  }
}
