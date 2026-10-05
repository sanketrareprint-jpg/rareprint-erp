// backend/src/dialer/dialer.service.ts
//
// Auto dialer queue + call results for the Android app.
//
// GET /dialer/next picks the logged-in agent's next number, in this order:
//   1. FOLLOW_UP_DUE  — Lead / Not Contacted follow-ups scheduled for today (India time) and due now
//   2. FRESH_LEAD     — the agent's NEW leads that have never been called
//   3. NOT_CONTACTED  — the agent's Not Contacted contacts (same rule as Call
//                       Compliance: no call in the agent's imported call logs)
//                       that have no Lead yet and haven't been dialed
//   4. OLD_CALLBACK   — follow-ups that were due before today (most recent first)
// and always skips: numbers marked WRONG_NUMBER (forever), numbers dialed in
// the last RECENT_CALL_SKIP_MINUTES by anyone, and numbers another agent is
// currently dialing (DialerLock).
//
// Status changes / follow-ups go to the same Lead / ImportedContact rows the
// CRM and Not Contacted tabs use — nothing is tracked in a second place.
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, DialerOutcome, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DIALER_LOCK_MINUTES,
  DIALER_ROLES,
  RECENT_CALL_SKIP_MINUTES,
  formatDuration,
  isConclusiveOutcome,
  istDayStart,
  nextStatusForOutcome,
  normalizeDialPhone,
  parseDialerResult,
  wantsRecycleFollowUp,
} from './dialer.rules';

type DialerUser = { id: string; role: string };
type QueueSource = 'FOLLOW_UP_DUE' | 'FRESH_LEAD' | 'NOT_CONTACTED' | 'OLD_CALLBACK';

interface Candidate {
  source: QueueSource;
  phone: string; // normalized
  leadId: string | null;
  importedContactId: string | null;
  followUpId: string | null;
  scheduledAt: Date | null;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10; // up to 1,000 candidates checked per tier before moving on
const RECYCLE_DAYS = 30;
const MAX_SKIP_PHONES = 200; // cap on the ?skip= list from one session
const CALL_ACTIVITY_TYPES: ActivityType[] = [ActivityType.CALL_MADE, ActivityType.CALL_MISSED, ActivityType.CALL_BUSY];

const OUTCOME_LABELS: Record<DialerOutcome, string> = {
  INTERESTED: 'Interested',
  CALLBACK: 'Callback',
  NOT_ANSWERED: 'Not answered',
  BUSY: 'Busy',
  WRONG_NUMBER: 'Wrong number',
  NOT_INTERESTED: 'Not interested',
};

@Injectable()
export class DialerService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDialerRole(user: DialerUser) {
    if (!DIALER_ROLES.includes(user.role)) {
      throw new ForbiddenException('The auto dialer is available to sales agents and admins only');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET /dialer/next
  // ───────────────────────────────────────────────────────────────────────

  async getNext(user: DialerUser, skipPhones: string[] = []) {
    this.assertDialerRole(user);
    const agentId = user.id;
    const now = new Date();
    const todayStart = istDayStart(now);

    // Asking for the next lead means the agent is done with (or skipped) the
    // previous one — free it for others.
    await this.prisma.dialerLock.deleteMany({ where: { agentId } });

    const tiers: Array<(skip: number) => Promise<{ items: Candidate[]; more: boolean }>> = [
      (skip) => this.followUpCandidates('FOLLOW_UP_DUE', agentId, { gte: todayStart, lte: now }, 'asc', skip),
      (skip) => this.freshLeadCandidates(agentId, skip),
      (skip) => this.notContactedCandidates(agentId, skip),
      (skip) => this.followUpCandidates('OLD_CALLBACK', agentId, { lt: todayStart }, 'desc', skip),
    ];

    // Numbers the agent skipped this session are treated as already seen.
    const seen = new Set<string>(
      skipPhones.slice(0, MAX_SKIP_PHONES).map(normalizeDialPhone).filter((p) => p.length >= 6),
    );
    for (const tier of tiers) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { items, more } = await tier(page * PAGE_SIZE);
        const fresh = items.filter((c) => c.phone.length >= 6 && !seen.has(c.phone));
        fresh.forEach((c) => seen.add(c.phone));
        if (fresh.length) {
          const blocked = await this.blockedPhones(fresh.map((c) => c.phone), agentId, now);
          for (const c of fresh) {
            if (blocked.has(c.phone)) continue;
            if (await this.claim(c, agentId, now)) return { item: await this.describe(c, now) };
          }
        }
        if (!more) break;
      }
    }
    return { item: null };
  }

  /** Lead + Not Contacted follow-ups in a time window (tiers 1 and 4). */
  private async followUpCandidates(
    source: QueueSource,
    agentId: string,
    window: Prisma.DateTimeFilter,
    order: 'asc' | 'desc',
    skip: number,
  ) {
    const [leadFollowUps, contactFollowUps] = await Promise.all([
      this.prisma.leadFollowUp.findMany({
        where: { status: 'PENDING', scheduledAt: window, lead: { agentId, status: { not: LeadStatus.WON } } },
        orderBy: { scheduledAt: order },
        skip,
        take: PAGE_SIZE,
        select: { id: true, scheduledAt: true, lead: { select: { id: true, phone: true } } },
      }),
      this.prisma.importedContactFollowUp.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: window,
          contact: { agentId, leadId: null, pipelineStatus: { not: LeadStatus.WON } },
        },
        orderBy: { scheduledAt: order },
        skip,
        take: PAGE_SIZE,
        select: { id: true, scheduledAt: true, contact: { select: { id: true, phone: true } } },
      }),
    ]);

    const items: Candidate[] = [
      ...leadFollowUps.map((f) => ({
        source,
        phone: normalizeDialPhone(f.lead.phone),
        leadId: f.lead.id,
        importedContactId: null,
        followUpId: f.id,
        scheduledAt: f.scheduledAt,
      })),
      ...contactFollowUps.map((f) => ({
        source,
        phone: normalizeDialPhone(f.contact.phone),
        leadId: null,
        importedContactId: f.contact.id,
        followUpId: f.id,
        scheduledAt: f.scheduledAt,
      })),
    ].sort((a, b) =>
      order === 'asc'
        ? a.scheduledAt.getTime() - b.scheduledAt.getTime()
        : b.scheduledAt.getTime() - a.scheduledAt.getTime(),
    );

    return { items, more: leadFollowUps.length === PAGE_SIZE || contactFollowUps.length === PAGE_SIZE };
  }

  /** Tier 2: the agent's NEW leads with no call logged anywhere. */
  private async freshLeadCandidates(agentId: string, skip: number) {
    const leads = await this.prisma.lead.findMany({
      where: {
        agentId,
        status: LeadStatus.NEW,
        activities: { none: { type: { in: CALL_ACTIVITY_TYPES } } },
        dialerCalls: { none: {} },
      },
      orderBy: [{ isHot: 'desc' }, { score: 'desc' }, { createdAt: 'asc' }],
      skip,
      take: PAGE_SIZE,
      select: { id: true, phone: true },
    });
    const items: Candidate[] = leads.map((l) => ({
      source: 'FRESH_LEAD',
      phone: normalizeDialPhone(l.phone),
      leadId: l.id,
      importedContactId: null,
      followUpId: null,
      scheduledAt: null,
    }));
    return { items, more: leads.length === PAGE_SIZE };
  }

  /**
   * Tier 3: Not Contacted contacts — tagged to this agent, no Lead yet, still
   * NEW, never dialed through the dialer, and (same rule as
   * CallComplianceService.getNotContactedLeads) no call to that phone in the
   * agent's imported call logs.
   */
  private async notContactedCandidates(agentId: string, skip: number) {
    const contacts = await this.prisma.importedContact.findMany({
      where: { agentId, leadId: null, pipelineStatus: LeadStatus.NEW, dialerCalls: { none: {} } },
      orderBy: [{ lastActiveAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
      skip,
      take: PAGE_SIZE,
      select: { id: true, phone: true },
    });
    const called = contacts.length
      ? await this.prisma.callLogRecord.findMany({
          where: { agentId, phone: { in: contacts.map((c) => c.phone) } },
          select: { phone: true },
          distinct: ['phone'],
        })
      : [];
    const calledPhones = new Set(called.map((c) => c.phone));

    const items: Candidate[] = contacts
      .filter((c) => !calledPhones.has(c.phone))
      .map((c) => ({
        source: 'NOT_CONTACTED',
        phone: normalizeDialPhone(c.phone),
        leadId: null,
        importedContactId: c.id,
        followUpId: null,
        scheduledAt: null,
      }));
    return { items, more: contacts.length === PAGE_SIZE };
  }

  /** Phones that must not be dialed right now. */
  private async blockedPhones(phones: string[], agentId: string, now: Date): Promise<Set<string>> {
    const recentCutoff = new Date(now.getTime() - RECENT_CALL_SKIP_MINUTES * 60 * 1000);
    const lockCutoff = new Date(now.getTime() - DIALER_LOCK_MINUTES * 60 * 1000);
    const [recent, wrong, locks] = await Promise.all([
      this.prisma.dialerCall.findMany({
        where: { phone: { in: phones }, startedAt: { gte: recentCutoff } },
        select: { phone: true },
        distinct: ['phone'],
      }),
      this.prisma.dialerCall.findMany({
        where: { phone: { in: phones }, outcome: DialerOutcome.WRONG_NUMBER },
        select: { phone: true },
        distinct: ['phone'],
      }),
      this.prisma.dialerLock.findMany({
        where: { phone: { in: phones }, agentId: { not: agentId }, lockedAt: { gte: lockCutoff } },
        select: { phone: true },
      }),
    ]);
    return new Set([...recent, ...wrong, ...locks].map((r) => r.phone));
  }

  /**
   * Atomically takes the number for this agent. Returns false if another
   * agent holds a live lock on it (they got there first).
   */
  private async claim(c: Candidate, agentId: string, now: Date): Promise<boolean> {
    const data = { agentId, leadId: c.leadId, importedContactId: c.importedContactId, lockedAt: now };
    try {
      await this.prisma.dialerLock.create({ data: { phone: c.phone, ...data } });
      return true;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    // Row exists — take it over only if it's ours or abandoned. The WHERE is
    // re-checked inside the UPDATE, so two agents racing for an abandoned
    // lock can't both win.
    const lockCutoff = new Date(now.getTime() - DIALER_LOCK_MINUTES * 60 * 1000);
    const res = await this.prisma.dialerLock.updateMany({
      where: { phone: c.phone, OR: [{ agentId }, { lockedAt: { lt: lockCutoff } }] },
      data,
    });
    return res.count === 1;
  }

  /** What the dialer screen shows for the claimed number. */
  private async describe(c: Candidate, now: Date) {
    const lockedUntil = new Date(now.getTime() + DIALER_LOCK_MINUTES * 60 * 1000);
    const base = {
      source: c.source,
      leadId: c.leadId,
      importedContactId: c.importedContactId,
      followUpId: c.followUpId,
      scheduledAt: c.scheduledAt,
      lockedUntil,
    };

    if (c.leadId) {
      const lead = await this.prisma.lead.findUniqueOrThrow({
        where: { id: c.leadId },
        select: {
          name: true, phone: true, businessName: true, productInterest: true, tags: true, status: true, notes: true,
          activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { description: true, createdAt: true } },
        },
      });
      return {
        ...base,
        phone: lead.phone,
        name: lead.name,
        businessName: lead.businessName,
        productInterest: lead.productInterest,
        tags: lead.tags,
        status: lead.status,
        lastNote: lead.activities[0]?.description ?? lead.notes ?? null,
      };
    }

    const contact = await this.prisma.importedContact.findUniqueOrThrow({
      where: { id: c.importedContactId! },
      select: {
        name: true, phone: true, tagRaw: true, pipelineStatus: true,
        followUps: { orderBy: { createdAt: 'desc' }, take: 1, select: { note: true } },
      },
    });
    return {
      ...base,
      phone: contact.phone,
      name: contact.name,
      businessName: null,
      productInterest: null,
      tags: contact.tagRaw ? [contact.tagRaw] : [],
      status: contact.pipelineStatus,
      lastNote: contact.followUps[0]?.note ?? null,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST /dialer/result
  // ───────────────────────────────────────────────────────────────────────

  async saveResult(user: DialerUser, body: any) {
    this.assertDialerRole(user);
    const parsed = parseDialerResult(body);
    // `'error' in` (not `!parsed.ok`): the production build (nest build) runs
    // without strictNullChecks, where boolean-literal narrowing doesn't apply.
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    const v = parsed.value;
    const isAdmin = user.role === 'ADMIN';
    const now = new Date();

    // ── Resolve which record the outcome applies to ──────────────────────
    let contact: { id: string; agentId: string | null; leadId: string | null; pipelineStatus: LeadStatus } | null = null;
    if (v.importedContactId) {
      contact = await this.prisma.importedContact.findUnique({
        where: { id: v.importedContactId },
        select: { id: true, agentId: true, leadId: true, pipelineStatus: true },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      if (!isAdmin && contact.agentId !== user.id) throw new ForbiddenException('This contact is not assigned to you');
    }
    // A contact with a matching Lead is worked through the Lead (same as the Not Contacted tab).
    const leadId = v.leadId ?? contact?.leadId ?? null;
    let lead: { id: string; agentId: string; status: LeadStatus } | null = null;
    if (leadId) {
      lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, agentId: true, status: true } });
      if (!lead) throw new NotFoundException('Lead not found');
      const ownsViaContact = contact?.leadId === lead.id && contact.agentId === user.id;
      if (!isAdmin && lead.agentId !== user.id && !ownsViaContact) throw new ForbiddenException('This lead is not assigned to you');
    }

    if (v.followUpId) {
      const belongs = lead
        ? await this.prisma.leadFollowUp.count({ where: { id: v.followUpId, leadId: lead.id } })
        : await this.prisma.importedContactFollowUp.count({ where: { id: v.followUpId, contactId: contact!.id } });
      if (!belongs) throw new BadRequestException('followUpId does not belong to this lead/contact');
    }

    const conclusive = isConclusiveOutcome(v.outcome);
    const description = [
      `Auto dialer call — ${OUTCOME_LABELS[v.outcome]}`,
      v.answered ? formatDuration(v.durationSec) : 'not answered',
      v.callbackAt ? `callback ${v.callbackAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}` : null,
      v.note,
    ].filter(Boolean).join(' · ');

    return this.prisma.$transaction(async (tx) => {
      const call = await tx.dialerCall.create({
        data: {
          agentId: user.id,
          leadId: lead?.id ?? null,
          importedContactId: contact?.id ?? null,
          phone: v.phone,
          startedAt: v.startedAt,
          durationSec: v.durationSec,
          answered: v.answered,
          outcome: v.outcome,
          note: v.note,
          callbackAt: v.callbackAt,
        },
      });

      let statusChange: { from: LeadStatus; to: LeadStatus } | null = null;
      let followUpCreated: { id: string; scheduledAt: Date } | null = null;

      if (lead) {
        // Close follow-ups first, so the callback follow-up created below is never closed by mistake.
        if (conclusive) {
          await tx.leadFollowUp.updateMany({
            where: {
              leadId: lead.id,
              status: 'PENDING',
              OR: [{ scheduledAt: { lte: now } }, ...(v.followUpId ? [{ id: v.followUpId }] : [])],
            },
            data: { status: 'DONE' },
          });
        }

        const next = nextStatusForOutcome(lead.status, v.outcome);
        if (next) {
          await tx.lead.update({ where: { id: lead.id }, data: { status: next } });
          await tx.leadActivity.create({
            data: {
              leadId: lead.id,
              type: ActivityType.STATUS_CHANGED,
              description: `Status changed: ${lead.status} → ${next} (auto dialer)`,
              createdById: user.id,
            },
          });
          statusChange = { from: lead.status, to: next };
          // Mirrors CrmService.updateStatus: LOST gets a 30-day recycle check (not for wrong numbers).
          if (wantsRecycleFollowUp(v.outcome)) {
            await tx.leadFollowUp.create({
              data: {
                leadId: lead.id,
                scheduledAt: new Date(now.getTime() + RECYCLE_DAYS * 24 * 60 * 60 * 1000),
                note: 'Recycle — check if requirement still exists',
              },
            });
          }
        }

        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type:
              v.outcome === DialerOutcome.BUSY ? ActivityType.CALL_BUSY
              : v.outcome === DialerOutcome.NOT_ANSWERED ? ActivityType.CALL_MISSED
              : ActivityType.CALL_MADE,
            description,
            createdById: user.id,
          },
        });

        if (v.outcome === DialerOutcome.CALLBACK && v.callbackAt) {
          const fu = await tx.leadFollowUp.create({
            data: { leadId: lead.id, scheduledAt: v.callbackAt, note: v.note ? `Callback: ${v.note}` : 'Callback requested on a dialer call' },
          });
          followUpCreated = { id: fu.id, scheduledAt: fu.scheduledAt };
        }
      } else if (contact) {
        if (conclusive) {
          await tx.importedContactFollowUp.updateMany({
            where: {
              contactId: contact.id,
              status: 'PENDING',
              OR: [{ scheduledAt: { lte: now } }, ...(v.followUpId ? [{ id: v.followUpId }] : [])],
            },
            data: { status: 'DONE' },
          });
        }

        const next = nextStatusForOutcome(contact.pipelineStatus, v.outcome);
        if (next) {
          await tx.importedContact.update({ where: { id: contact.id }, data: { pipelineStatus: next } });
          statusChange = { from: contact.pipelineStatus, to: next };
          // Mirrors CallComplianceService.updateContactStatus's LOST recycle check.
          if (wantsRecycleFollowUp(v.outcome)) {
            await tx.importedContactFollowUp.create({
              data: {
                contactId: contact.id,
                scheduledAt: new Date(now.getTime() + RECYCLE_DAYS * 24 * 60 * 60 * 1000),
                note: 'Recycle — check if requirement still exists',
              },
            });
          }
        }

        if (v.outcome === DialerOutcome.CALLBACK && v.callbackAt) {
          const fu = await tx.importedContactFollowUp.create({
            data: { contactId: contact.id, scheduledAt: v.callbackAt, note: v.note ? `Callback: ${v.note}` : 'Callback requested on a dialer call' },
          });
          followUpCreated = { id: fu.id, scheduledAt: fu.scheduledAt };
        }
      }

      // The agent is done with this number — free it.
      await tx.dialerLock.deleteMany({ where: { agentId: user.id } });

      return { id: call.id, outcome: call.outcome, statusChange, followUpCreated };
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET /dialer/session-stats
  // ───────────────────────────────────────────────────────────────────────

  async getSessionStats(user: DialerUser) {
    this.assertDialerRole(user);
    const since = istDayStart();
    const where = { agentId: user.id, startedAt: { gte: since } };
    const [all, connected] = await Promise.all([
      this.prisma.dialerCall.aggregate({ where, _count: { _all: true }, _sum: { durationSec: true } }),
      this.prisma.dialerCall.count({ where: { ...where, answered: true } }),
    ]);
    return {
      since,
      callsMade: all._count._all,
      connected,
      talkTimeSec: all._sum.durationSec ?? 0,
    };
  }
}
