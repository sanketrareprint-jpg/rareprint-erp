// backend/src/rewards/bonus-points.service.ts
//
// Activity-based Bonus Points: admin defines a catalog of activities worth N
// points each (BonusActivity). MANUAL activities are earned by staff
// submitting a BonusClaim (with a required evidence attachment) that any
// ADMIN-role user then approves or rejects. AUTOMATIC activities skip the
// claim/approval step — an admin credits them directly via directCredit().
// Approved points land in the same RewardWallet/RewardTransaction ledger
// used elsewhere in this module (see rewards.service.ts), so "My Bonus
// Points" is just that wallet's balance under a friendlier name.
//
// `as any` casts on prisma.bonusActivity / bonusClaim / rewardWallet /
// rewardTransaction match the existing convention in rewards.service.ts —
// this repo's Prisma client isn't regenerated inside the sandbox, so newly
// added models aren't in the generated types yet. Run `npx prisma generate`
// locally after `prisma migrate deploy` to pick them up for real type-checking.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ClaimType = 'MANUAL' | 'AUTOMATIC';

@Injectable()
export class BonusPointsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Activity catalog (admin-managed) ─────────────────────────────────────

  async listActivities(includeInactive: boolean) {
    return (this.prisma as any).bonusActivity.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createActivity(
    data: { name?: string; description?: string; points?: number; claimType?: ClaimType },
    createdById: string,
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const points = Number(data.points);
    if (!Number.isFinite(points) || points <= 0) throw new BadRequestException('points must be a positive number');
    const claimType: ClaimType = data.claimType === 'AUTOMATIC' ? 'AUTOMATIC' : 'MANUAL';

    return (this.prisma as any).bonusActivity.create({
      data: {
        name,
        description: data.description?.trim() || null,
        points: Math.round(points),
        claimType,
        createdById,
      },
    });
  }

  async updateActivity(
    id: string,
    data: { name?: string; description?: string; points?: number; claimType?: ClaimType; isActive?: boolean },
  ) {
    await this.getActivityOrThrow(id);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new BadRequestException('name cannot be empty');
      patch.name = data.name.trim();
    }
    if (data.description !== undefined) patch.description = data.description.trim() || null;
    if (data.points !== undefined) {
      const points = Number(data.points);
      if (!Number.isFinite(points) || points <= 0) throw new BadRequestException('points must be a positive number');
      patch.points = Math.round(points);
    }
    if (data.claimType !== undefined) patch.claimType = data.claimType === 'AUTOMATIC' ? 'AUTOMATIC' : 'MANUAL';
    if (data.isActive !== undefined) patch.isActive = !!data.isActive;

    return (this.prisma as any).bonusActivity.update({ where: { id }, data: patch });
  }

  private async getActivityOrThrow(id: string) {
    const activity = await (this.prisma as any).bonusActivity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  // ── Claims (staff-submitted, MANUAL activities only) ─────────────────────

  async submitClaim(userId: string, activityId: string, details: string, file?: Express.Multer.File) {
    const activity = await this.getActivityOrThrow(activityId);
    if (!activity.isActive) throw new BadRequestException('This activity is no longer accepting claims');
    if (activity.claimType !== 'MANUAL') {
      throw new BadRequestException('This activity is credited directly by an admin, not by claim');
    }
    if (!details?.trim()) throw new BadRequestException('Please describe what you did to earn this');
    if (!file) throw new BadRequestException('An evidence attachment is required to submit a claim');

    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return (this.prisma as any).bonusClaim.create({
      data: {
        activityId,
        userId,
        points: activity.points,
        details: details.trim(),
        attachmentUrl: dataUri,
        attachmentName: file.originalname,
        attachmentType: file.mimetype,
        status: 'PENDING',
      },
      include: { activity: true },
    });
  }

  async listClaims(filter: { status?: string; userId?: string }) {
    return (this.prisma as any).bonusClaim.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
      },
      include: { activity: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveClaim(id: string, adminId: string, note: string | undefined) {
    const claim = await this.getClaimOrThrow(id);
    if (claim.status !== 'PENDING') throw new BadRequestException('This claim was already reviewed');

    const wallet = await (this.prisma as any).rewardWallet.upsert({
      where: { userId: claim.userId },
      create: { userId: claim.userId, coins: 0 },
      update: {},
    });

    const [updatedClaim] = await this.prisma.$transaction([
      (this.prisma as any).bonusClaim.update({
        where: { id },
        data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date(), reviewNote: note?.trim() || null },
        include: { activity: true },
      }),
      (this.prisma as any).rewardWallet.update({
        where: { id: wallet.id },
        data: { coins: { increment: claim.points } },
      }),
      (this.prisma as any).rewardTransaction.create({
        data: {
          walletId: wallet.id,
          coins: claim.points,
          reason: `Bonus: ${claim.activity.name}`,
          claimId: claim.id,
        },
      }),
    ]);
    return updatedClaim;
  }

  async rejectClaim(id: string, adminId: string, note: string | undefined) {
    const claim = await this.getClaimOrThrow(id);
    if (claim.status !== 'PENDING') throw new BadRequestException('This claim was already reviewed');
    return (this.prisma as any).bonusClaim.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), reviewNote: note?.trim() || null },
      include: { activity: true },
    });
  }

  private async getClaimOrThrow(id: string) {
    const claim = await (this.prisma as any).bonusClaim.findUnique({ where: { id }, include: { activity: true } });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  // ── Direct credit for AUTOMATIC activities — admin-triggered, no claim/approval step ──

  async directCredit(activityId: string, userId: string, adminId: string, note: string | undefined) {
    const activity = await this.getActivityOrThrow(activityId);
    if (!activity.isActive) throw new BadRequestException('This activity is inactive');
    if (!userId) throw new BadRequestException('userId is required');

    return this.prisma.$transaction(async (tx) => {
      const wallet = await (tx as any).rewardWallet.upsert({
        where: { userId },
        create: { userId, coins: 0 },
        update: {},
      });

      const claim = await (tx as any).bonusClaim.create({
        data: {
          activityId,
          userId,
          points: activity.points,
          details: note?.trim() || `Credited directly by admin for "${activity.name}"`,
          status: 'APPROVED',
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
        include: { activity: true },
      });

      await (tx as any).rewardWallet.update({
        where: { id: wallet.id },
        data: { coins: { increment: activity.points } },
      });

      await (tx as any).rewardTransaction.create({
        data: {
          walletId: wallet.id,
          coins: activity.points,
          reason: `Bonus: ${activity.name}`,
          claimId: claim.id,
        },
      });

      return claim;
    });
  }

  // ── Leaderboard — every staff member's current bonus points balance ──────
  // This is the direct fix for "bonus points not showing for every user":
  // previously the only wallet ever credited was PRAJAKTA DALAL's, via a
  // single hardcoded automated trigger in rewards.service.ts. Every user now
  // gets a wallet (upserted lazily) and can earn points through the catalog.

  async leaderboard() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    const wallets = await (this.prisma as any).rewardWallet.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    const pointsByUser = new Map<string, number>(wallets.map((w: any) => [w.userId, w.coins]));
    return users
      .map((u) => ({ ...u, points: pointsByUser.get(u.id) ?? 0 }))
      .sort((a, b) => b.points - a.points);
  }
}
