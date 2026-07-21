// backend/src/complaints/complaints.sla.service.ts
//
// Scheduled jobs for the complaints module: SLA breach escalation and
// auto-close of stale RESOLVED tickets. Uses @nestjs/schedule's @Cron the
// same way notifications.service.ts's runAllChecks() does — ScheduleModule
// is already registered globally in app.module.ts, so no extra wiring is
// needed beyond adding this provider to ComplaintsModule.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ComplaintsNotifications } from './complaints.notifications';
import { ComplaintStatus, StatusInterval, computePausedDurationMs, effectiveResolutionDueAt, isEligibleForAutoClose, shouldEscalate } from './complaints.calc';

const AUTO_CLOSE_KEY = 'complaint.autoCloseDays';
const DEFAULT_AUTO_CLOSE_DAYS = 3;

@Injectable()
export class ComplaintsSlaService {
  private readonly logger = new Logger(ComplaintsSlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: ComplaintsNotifications,
  ) {}

  private async getAutoCloseDays(): Promise<number> {
    const row = await (this.prisma as any).systemConfig.findUnique({ where: { key: AUTO_CLOSE_KEY } });
    return Number(row?.value ?? DEFAULT_AUTO_CLOSE_DAYS);
  }

  private async findAdmin() {
    return this.prisma.user.findFirst({
      where: { email: { equals: 'sanket.rareprint@gmail.com', mode: 'insensitive' } },
      select: { id: true, fullName: true },
    });
  }

  // ── Runs every 15 minutes: SLA breach escalation + auto-close sweep ─────
  @Cron(CronExpression.EVERY_15_MINUTES)
  async runSlaChecks() {
    await Promise.allSettled([this.escalateBreachedTickets(), this.autoCloseStaleResolved()]);
  }

  async escalateBreachedTickets() {
    const now = new Date();
    const candidates = await (this.prisma as any).complaint.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        escalatedToAdmin: false,
        slaResolutionDueAt: { not: null, lt: now },
      },
      include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
    });

    let escalated = 0;
    const admin = await this.findAdmin();

    for (const complaint of candidates) {
      const intervals = this.buildStatusIntervals(complaint.statusLogs, complaint.createdAt, now);
      const pausedMs = computePausedDurationMs(intervals);
      const effectiveDueAt = effectiveResolutionDueAt(complaint.slaResolutionDueAt, pausedMs);

      const escalate = shouldEscalate({
        resolutionDueAt: effectiveDueAt,
        now,
        status: complaint.status,
        alreadyEscalated: complaint.escalatedToAdmin,
      });
      if (!escalate) continue;

      await (this.prisma as any).complaint.update({
        where: { id: complaint.id },
        data: { escalatedToAdmin: true, escalatedAt: now },
      });
      if (admin) {
        await this.notifications.notifyEscalation(complaint, admin.id, admin.fullName);
      }
      escalated++;
    }

    return { checked: candidates.length, escalated };
  }

  async autoCloseStaleResolved() {
    const autoCloseDays = await this.getAutoCloseDays();
    const now = new Date();
    const resolved = await (this.prisma as any).complaint.findMany({
      where: { status: 'RESOLVED', resolvedAt: { not: null } },
    });

    let closed = 0;
    for (const complaint of resolved) {
      if (!isEligibleForAutoClose(complaint.resolvedAt, now, autoCloseDays)) continue;
      await this.prisma.$transaction(async (tx) => {
        await (tx as any).complaint.update({ where: { id: complaint.id }, data: { status: 'CLOSED', closedAt: now } });
        await (tx as any).complaintStatusLog.create({
          data: {
            complaintId: complaint.id,
            fromStatus: 'RESOLVED',
            toStatus: 'CLOSED',
            changedById: null,
            reason: `Auto-closed after ${autoCloseDays} day(s) with no customer response`,
          },
        });
      });
      closed++;
    }

    return { checked: resolved.length, closed };
  }

  // ── Rebuild PENDING_CUSTOMER / PENDING_VENDOR wall-clock intervals from the
  // ComplaintStatusLog history so we can pause the SLA clock accurately. ────
  private buildStatusIntervals(
    statusLogs: Array<{ toStatus: ComplaintStatus; createdAt: Date }>,
    createdAt: Date,
    now: Date,
  ): StatusInterval[] {
    if (statusLogs.length === 0) return [];
    const intervals: StatusInterval[] = [];
    let prevStatus: ComplaintStatus = 'OPEN';
    let prevAt = createdAt;
    for (const log of statusLogs) {
      intervals.push({ status: prevStatus, from: prevAt, to: log.createdAt });
      prevStatus = log.toStatus;
      prevAt = log.createdAt;
    }
    intervals.push({ status: prevStatus, from: prevAt, to: now });
    return intervals;
  }

  async triggerManualCheck() {
    const [sla, autoClose] = await Promise.all([this.escalateBreachedTickets(), this.autoCloseStaleResolved()]);
    return { sla, autoClose };
  }
}
