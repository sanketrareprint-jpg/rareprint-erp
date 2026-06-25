import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PING_INTERVAL_SECONDS = 30;
const SESSION_GAP_SECONDS = 120; // new session if gap > 2 min

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called every 30s from frontend when cursor is moving */
  async ping(userId: string, page: string): Promise<{ sessionId: string }> {
    const now = new Date();
    const gapCutoff = new Date(now.getTime() - SESSION_GAP_SECONDS * 1000);

    // Find an open session for this user (lastPingAt within gap)
    const openSession = await this.prisma.userActivitySession.findFirst({
      where: { userId, lastPingAt: { gte: gapCutoff } },
      orderBy: { lastPingAt: 'desc' },
    });

    if (openSession) {
      // Extend existing session
      const updated = await this.prisma.userActivitySession.update({
        where: { id: openSession.id },
        data: {
          lastPingAt: now,
          page, // update to current page
          activeSeconds: { increment: PING_INTERVAL_SECONDS },
        },
      });
      return { sessionId: updated.id };
    }

    // Start a new session
    const created = await this.prisma.userActivitySession.create({
      data: { userId, page, startedAt: now, lastPingAt: now, activeSeconds: PING_INTERVAL_SECONDS },
    });
    return { sessionId: created.id };
  }

  /** Report: total active time per user, with expandable session list */
  async report(from?: string, to?: string) {
    const where: Record<string, unknown> = {};
    if (from || to) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.startedAt = dateFilter;
    }

    const sessions = await this.prisma.userActivitySession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    });

    // Group by user
    const userMap = new Map<
      string,
      {
        userId: string;
        fullName: string;
        email: string;
        role: string;
        totalActiveSeconds: number;
        sessionCount: number;
        lastSeen: Date | null;
        sessions: Array<{
          id: string;
          page: string;
          startedAt: Date;
          lastPingAt: Date;
          activeSeconds: number;
        }>;
      }
    >();

    for (const s of sessions) {
      if (!userMap.has(s.userId)) {
        userMap.set(s.userId, {
          userId: s.userId,
          fullName: s.user.fullName,
          email: s.user.email,
          role: s.user.role,
          totalActiveSeconds: 0,
          sessionCount: 0,
          lastSeen: null,
          sessions: [],
        });
      }
      const entry = userMap.get(s.userId)!;
      entry.totalActiveSeconds += s.activeSeconds;
      entry.sessionCount += 1;
      if (!entry.lastSeen || s.lastPingAt > entry.lastSeen) {
        entry.lastSeen = s.lastPingAt;
      }
      entry.sessions.push({
        id: s.id,
        page: s.page,
        startedAt: s.startedAt,
        lastPingAt: s.lastPingAt,
        activeSeconds: s.activeSeconds,
      });
    }

    const users = [...userMap.values()].sort((a, b) => b.totalActiveSeconds - a.totalActiveSeconds);

    return {
      totalLogEntries: sessions.length,
      users,
    };
  }
}
