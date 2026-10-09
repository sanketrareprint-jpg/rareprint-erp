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
//   5. RESERVED_LEAD  — the agent's reserved leads (CRM import "Reserved leads"),
//                       same rule as FRESH_LEAD, only once everything above is done
// and always skips: numbers marked WRONG_NUMBER (forever), numbers dialed in
// the last RECENT_CALL_SKIP_MINUTES by anyone, and numbers another agent is
// currently dialing (DialerLock).
//
// Status changes / follow-ups go to the same Lead / ImportedContact rows the
// CRM and Not Contacted tabs use — nothing is tracked in a second place.
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivityType, DialerOutcome, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  AgentStatsPeriod,
  DIALER_ACTIVITY_PREFIX,
  DIALER_LISTS,
  DIALER_LOCK_MINUTES,
  DIALER_ROLES,
  DIALER_SETTINGS_KEY,
  DialerList,
  DialerSettings,
  EMPTY_DIALER_SETTINGS,
  LIVE_CALL_MAX_MINUTES,
  isOnLiveCall,
  parseLiveState,
  OUTCOME_CAMPAIGN_REPEAT_HOURS,
  RECENT_CALL_SKIP_MINUTES,
  agentStatsSince,
  isDeskResponseCurrent,
  isFollowUpAnsweredByCall,
  isEndCallRequestCurrent,
  describeReplyProducts,
  NI_LIST_REASONS,
  NOT_INTERESTED_REASON_LABELS,
  NotInterestedReason,
  ReplyProduct,
  outcomeCampaignParams,
  parseDeskResponse,
  parseDialerList,
  parseDialerSettings,
  formatDuration,
  isConclusiveOutcome,
  istDayStart,
  nextStatusForOutcome,
  normalizeDialPhone,
  parseDialerResult,
  wantsRecycleFollowUp,
} from './dialer.rules';

type DialerUser = { id: string; role: string };
type QueueSource =
  | 'FOLLOW_UP_DUE' | 'FRESH_LEAD' | 'NOT_CONTACTED' | 'OLD_CALLBACK' | 'RESERVED_LEAD'
  | 'INTERESTED' | 'NOT_INTERESTED' | 'BUSY' | 'NOT_ANSWERED' | 'CALLBACK' // single-list dialing
  | 'NI_RATE' | 'NI_QUANTITY' | 'NI_TRUST' | 'NI_NO_REQUIREMENT'
  | 'LIVE'; // GET /dialer/live (the number the phone is on now)

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
const CALL_HISTORY_LIMIT = 15; // PC popup: past calls shown for the number on the line
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
  private readonly logger = new Logger(DialerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private assertDialerRole(user: DialerUser) {
    if (!DIALER_ROLES.includes(user.role)) {
      throw new ForbiddenException('The auto dialer is available to sales agents and admins only');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET /dialer/next
  // ───────────────────────────────────────────────────────────────────────

  async getNext(user: DialerUser, skipPhones: string[] = [], asAgentId?: string, listRaw?: string) {
    this.assertDialerRole(user);
    const list = parseDialerList(listRaw);
    if (!list) throw new BadRequestException(`list must be one of ${DIALER_LISTS.join(', ')}`);
    // Whose leads to dial: your own, or (admins only) a chosen seller's.
    const queueAgentId = await this.resolveQueueAgent(user, asAgentId);
    // Locks always belong to the person actually dialing, so an admin working a
    // seller's queue and that seller never get the same number at once.
    const agentId = user.id;
    const now = new Date();
    const todayStart = istDayStart(now);

    // Asking for the next lead means the agent is done with (or skipped) the
    // previous one — free it for others.
    await this.prisma.dialerLock.deleteMany({ where: { agentId } });

    type Tier = (skip: number) => Promise<{ items: Candidate[]; more: boolean }>;
    const dueToday: Tier = (skip) => this.followUpCandidates('FOLLOW_UP_DUE', queueAgentId, { gte: todayStart, lte: now }, 'asc', skip);
    const freshLeads: Tier = (skip) => this.freshLeadCandidates(queueAgentId, skip, false);
    const reservedLeads: Tier = (skip) => this.freshLeadCandidates(queueAgentId, skip, true);
    const notContacted: Tier = (skip) => this.notContactedCandidates(queueAgentId, skip);
    const olderFollowUps: Tier = (skip) => this.followUpCandidates('OLD_CALLBACK', queueAgentId, { lt: todayStart }, 'desc', skip);
    const tiersByList: Record<DialerList, Tier[]> = {
      ALL: [dueToday, freshLeads, notContacted, olderFollowUps, reservedLeads],
      NEW_LEADS: [freshLeads, reservedLeads],
      RESERVED_LEADS: [reservedLeads],
      NOT_CONTACTED: [notContacted],
      FOLLOW_UPS: [dueToday, olderFollowUps],
      INTERESTED: [(skip) => this.statusCandidates('INTERESTED', LeadStatus.INTERESTED, queueAgentId, skip)],
      NOT_INTERESTED: [(skip) => this.statusCandidates('NOT_INTERESTED', LeadStatus.LOST, queueAgentId, skip)],
      BUSY: [(skip) => this.lastOutcomeCandidates('BUSY', DialerOutcome.BUSY, queueAgentId, skip)],
      NOT_ANSWERED: [(skip) => this.lastOutcomeCandidates('NOT_ANSWERED', DialerOutcome.NOT_ANSWERED, queueAgentId, skip)],
      CALLBACK: [(skip) => this.lastOutcomeCandidates('CALLBACK', DialerOutcome.CALLBACK, queueAgentId, skip)],
      NI_RATE: [(skip) => this.lastOutcomeCandidates('NI_RATE', DialerOutcome.NOT_INTERESTED, queueAgentId, skip, NI_LIST_REASONS.NI_RATE)],
      NI_QUANTITY: [(skip) => this.lastOutcomeCandidates('NI_QUANTITY', DialerOutcome.NOT_INTERESTED, queueAgentId, skip, NI_LIST_REASONS.NI_QUANTITY)],
      NI_TRUST: [(skip) => this.lastOutcomeCandidates('NI_TRUST', DialerOutcome.NOT_INTERESTED, queueAgentId, skip, NI_LIST_REASONS.NI_TRUST)],
      NI_NO_REQUIREMENT: [(skip) => this.lastOutcomeCandidates('NI_NO_REQUIREMENT', DialerOutcome.NOT_INTERESTED, queueAgentId, skip, NI_LIST_REASONS.NI_NO_REQUIREMENT)],
    };
    const tiers = tiersByList[list];

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

  /** The seller whose leads are queued. Only admins may pick someone other than themselves. */
  private async resolveQueueAgent(user: DialerUser, asAgentId?: string): Promise<string> {
    const target = asAgentId?.trim();
    if (!target || target === user.id) return user.id;
    if (user.role !== 'ADMIN') throw new ForbiddenException("Only admins can dial another seller's leads");
    const agent = await this.prisma.user.findUnique({ where: { id: target }, select: { id: true, isActive: true } });
    if (!agent || !agent.isActive) throw new NotFoundException('Seller not found');
    return agent.id;
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
        select: { id: true, scheduledAt: true, createdAt: true, lead: { select: { id: true, phone: true } } },
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
        select: { id: true, scheduledAt: true, createdAt: true, contact: { select: { id: true, phone: true } } },
      }),
    ]);

    // Follow-ups already answered by a call to the same number (through any
    // record with that phone) are left out — see isFollowUpAnsweredByCall.
    const phones = [
      ...leadFollowUps.map((f) => normalizeDialPhone(f.lead.phone)),
      ...contactFollowUps.map((f) => normalizeDialPhone(f.contact.phone)),
    ];
    const calls = phones.length
      ? await this.prisma.dialerCall.findMany({
          where: { phone: { in: [...new Set(phones)] }, outcome: { notIn: [DialerOutcome.BUSY, DialerOutcome.NOT_ANSWERED] } },
          select: { phone: true, outcome: true, startedAt: true, createdAt: true },
        })
      : [];
    const isOpen = (phone: string, followUp: { scheduledAt: Date; createdAt: Date }) =>
      !calls.some((call) => call.phone === phone && isFollowUpAnsweredByCall(followUp, call));

    const items: Candidate[] = [
      ...leadFollowUps
        .filter((f) => isOpen(normalizeDialPhone(f.lead.phone), f))
        .map((f) => ({
          source,
          phone: normalizeDialPhone(f.lead.phone),
          leadId: f.lead.id,
          importedContactId: null,
          followUpId: f.id,
          scheduledAt: f.scheduledAt,
        })),
      ...contactFollowUps
        .filter((f) => isOpen(normalizeDialPhone(f.contact.phone), f))
        .map((f) => ({
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

  /**
   * Tier 2 (reserved = false) / tier 5 (reserved = true): the agent's NEW
   * leads whose number has no call logged anywhere.
   * Checked per phone, not per Lead row: the same number is often on several
   * Lead rows (a CSV imported twice, or given to another seller), and a call
   * on any of them means the number is no longer fresh.
   */
  private async freshLeadCandidates(agentId: string, skip: number, reserved: boolean) {
    const leads = await this.prisma.$queryRaw<Array<{ id: string; phone: string }>>(Prisma.sql`
      SELECT l."id", l."phone"
      FROM "Lead" l
      WHERE l."agentId" = ${agentId}
        AND l."status"::text = ${LeadStatus.NEW}
        AND l."isReserved" = ${reserved}
        AND NOT EXISTS (SELECT 1 FROM "DialerCall" dc WHERE dc."phone" = l."phone")
        AND NOT EXISTS (
          SELECT 1 FROM "LeadActivity" a
          JOIN "Lead" same ON same."id" = a."leadId"
          WHERE same."phone" = l."phone"
            AND a."type"::text IN (${Prisma.join(CALL_ACTIVITY_TYPES)})
        )
      ORDER BY l."isHot" DESC, l."score" DESC, l."createdAt" ASC
      OFFSET ${skip}::int LIMIT ${PAGE_SIZE}::int
    `);
    const items: Candidate[] = leads.map((l) => ({
      source: reserved ? 'RESERVED_LEAD' : 'FRESH_LEAD',
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
    const phones = contacts.map((c) => c.phone);
    // Also drop numbers already dialed under any other record (e.g. a Lead
    // with the same phone) — `dialerCalls: none` above only covers this contact row.
    const [called, dialed] = contacts.length
      ? await Promise.all([
          this.prisma.callLogRecord.findMany({
            where: { agentId, phone: { in: phones } },
            select: { phone: true },
            distinct: ['phone'],
          }),
          this.prisma.dialerCall.findMany({
            where: { phone: { in: phones } },
            select: { phone: true },
            distinct: ['phone'],
          }),
        ])
      : [[], []];
    const calledPhones = new Set([...called, ...dialed].map((c) => c.phone));

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

  /**
   * Interested / Not interested lists: the agent's Leads in that status, plus
   * Not Contacted contacts (no Lead yet) in that pipeline status. Least
   * recently touched first.
   */
  private async statusCandidates(source: QueueSource, status: LeadStatus, agentId: string, skip: number) {
    const [leads, contacts] = await Promise.all([
      this.prisma.lead.findMany({
        where: { agentId, status },
        orderBy: { updatedAt: 'asc' },
        skip,
        take: PAGE_SIZE,
        select: { id: true, phone: true, updatedAt: true },
      }),
      this.prisma.importedContact.findMany({
        where: { agentId, leadId: null, pipelineStatus: status },
        orderBy: { updatedAt: 'asc' },
        skip,
        take: PAGE_SIZE,
        select: { id: true, phone: true, updatedAt: true },
      }),
    ]);
    const items: Candidate[] = [
      ...leads.map((l) => ({ at: l.updatedAt, c: { source, phone: normalizeDialPhone(l.phone), leadId: l.id, importedContactId: null, followUpId: null, scheduledAt: null } })),
      ...contacts.map((x) => ({ at: x.updatedAt, c: { source, phone: normalizeDialPhone(x.phone), leadId: null, importedContactId: x.id, followUpId: null, scheduledAt: null } })),
    ]
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((x) => x.c);
    return { items, more: leads.length === PAGE_SIZE || contacts.length === PAGE_SIZE };
  }

  /**
   * Busy / Not answered / Callback / Not-interested-reason lists: numbers on
   * the agent's Leads / Not Contacted contacts whose most recent auto-dialer
   * call (by anyone) ended with that outcome (and, when given, that
   * not-interested reason). Won leads are left out. Longest-waiting first.
   */
  private async lastOutcomeCandidates(source: QueueSource, outcome: DialerOutcome, agentId: string, skip: number, reason?: NotInterestedReason) {
    const reasonFilter = reason ? Prisma.sql`AND t."notInterestedReason" = ${reason}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ phone: string; leadId: string | null; importedContactId: string | null }>>(Prisma.sql`
      SELECT t."phone", t."leadId", t."importedContactId"
      FROM (
        SELECT DISTINCT ON (dc."phone")
          dc."phone", dc."leadId", dc."importedContactId", dc."outcome", dc."notInterestedReason", dc."startedAt",
          l."status" AS "leadStatus", ic."pipelineStatus" AS "contactStatus"
        FROM "DialerCall" dc
        LEFT JOIN "Lead" l ON l."id" = dc."leadId"
        LEFT JOIN "ImportedContact" ic ON ic."id" = dc."importedContactId"
        WHERE l."agentId" = ${agentId} OR (dc."leadId" IS NULL AND ic."agentId" = ${agentId})
        ORDER BY dc."phone", dc."startedAt" DESC
      ) t
      WHERE t."outcome"::text = ${outcome}
        ${reasonFilter}
        AND COALESCE(t."leadStatus"::text, t."contactStatus"::text, '') <> ${LeadStatus.WON}
      ORDER BY t."startedAt" ASC
      OFFSET ${skip}::int LIMIT ${PAGE_SIZE}::int
    `);
    const items: Candidate[] = rows.map((r) => ({
      source,
      phone: normalizeDialPhone(r.phone),
      leadId: r.leadId,
      importedContactId: r.leadId ? null : r.importedContactId,
      followUpId: null,
      scheduledAt: null,
    }));
    return { items, more: rows.length === PAGE_SIZE };
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
      await this.prisma.dialerLock.create({ data: { phone: c.phone, ...data }, select: { phone: true } });
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

    const products = await this.resolveReplyProducts(v.products);
    const conclusive = isConclusiveOutcome(v.outcome);
    const description = [
      `${DIALER_ACTIVITY_PREFIX} — ${OUTCOME_LABELS[v.outcome]}`,
      v.notInterestedReason ? NOT_INTERESTED_REASON_LABELS[v.notInterestedReason] : null,
      v.answered ? formatDuration(v.durationSec) : 'not answered',
      v.callbackAt ? `callback ${v.callbackAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}` : null,
      products.length ? describeReplyProducts(products) : null,
      v.note,
    ].filter(Boolean).join(' · ');

    const result = await this.prisma.$transaction(async (tx) => {
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
          notInterestedReason: v.notInterestedReason,
          products: products.length ? (products as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
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

    // After the commit, never inside the transaction: a slow or failing
    // AiSensy call must not hold up or undo the saved call.
    void this.sendOutcomeCampaign(user.id, result.id, v.phone, v.outcome, lead?.id ?? null, contact?.id ?? null)
      .catch((e) => this.logger.error(`Dialer outcome WhatsApp failed for ${v.phone}: ${e}`));

    return result;
  }

  /** Checks every product exists and fills in its name (kept on the call, so a later rename doesn't change history). */
  private async resolveReplyProducts(products: ReplyProduct[]): Promise<ReplyProduct[]> {
    if (!products.length) return [];
    const ids = [...new Set(products.map((p) => p.productId))];
    const found = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(found.map((p) => [p.id, p.name]));
    const missing = ids.filter((id) => !names.has(id));
    if (missing.length) throw new BadRequestException('A chosen product no longer exists — pick it again');
    return products.map((p) => ({ productId: p.productId, productName: names.get(p.productId)!, quantity: p.quantity, rate: p.rate }));
  }

  /**
   * Sends the AiSensy campaign set for this outcome in the dialer settings
   * (nothing when none is set). Skipped when the same outcome's campaign was
   * already triggered for this number in the last OUTCOME_CAMPAIGN_REPEAT_HOURS,
   * so three "not answered" calls in a day send one message, not three.
   */
  private async sendOutcomeCampaign(
    agentId: string, callId: string, phone: string, outcome: DialerOutcome,
    leadId: string | null, contactId: string | null,
  ) {
    const campaignName = (await this.readSettings()).outcomeCampaigns[outcome];
    if (!campaignName) return;

    const since = new Date(Date.now() - OUTCOME_CAMPAIGN_REPEAT_HOURS * 60 * 60 * 1000);
    const repeats = await this.prisma.dialerCall.count({ where: { phone, outcome, id: { not: callId }, createdAt: { gte: since } } });
    if (repeats > 0) return;

    const [agent, customer] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: agentId }, select: { fullName: true, phone: true } }),
      leadId
        ? this.prisma.lead.findUnique({ where: { id: leadId }, select: { name: true } })
        : contactId ? this.prisma.importedContact.findUnique({ where: { id: contactId }, select: { name: true } }) : null,
    ]);
    if (!agent?.phone?.trim()) {
      this.logger.warn(`Dialer outcome campaign ${campaignName} not sent to ${phone}: agent ${agentId} has no phone number on their user profile`);
      return;
    }

    const sent = await this.whatsapp.sendDialerOutcome({
      campaignName,
      customerName: customer?.name ?? 'Customer',
      customerPhone: phone,
      templateParams: outcomeCampaignParams(customer?.name ?? null, agent.fullName, agent.phone),
    });
    if (sent && leadId) {
      await this.prisma.leadActivity.create({
        data: { leadId, type: ActivityType.WHATSAPP_SENT, description: `WhatsApp campaign ${campaignName} sent (auto dialer — ${OUTCOME_LABELS[outcome]})`, createdById: agentId },
      });
    }
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

  // ───────────────────────────────────────────────────────────────────────
  // GET /dialer/agent-stats
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Per-agent calling summary for the Dashboard, CRM and Dialer pages.
   * Admins get every agent; everyone else gets only their own row.
   *
   * Calls (in the chosen period):
   *   - Android auto dialer calls → DialerCall, counted by outcome.
   *   - CRM calls (web power dialer / "Log call") → LeadActivity CALL_MADE /
   *     CALL_BUSY / CALL_MISSED, minus the activities the auto dialer itself
   *     writes (DIALER_ACTIVITY_PREFIX), so no call is counted twice.
   *     CALL_BUSY → busy, CALL_MISSED → not answered, CALL_MADE → answered
   *     (the CRM's log-call has no interested/not-interested choice).
   * Current snapshot (not period-filtered), Leads + Not Contacted contacts that
   * have no Lead yet (same as the dialer queue):
   *   - newLeads    — Leads in NEW status, not reserved
   *   - pipeline    — CONTACTED / INTERESTED / QUOTED
   *   - followUpsDue — customers (not WON/LOST) with a pending follow-up due by end of today
   */
  async getAgentStats(user: DialerUser, periodRaw?: string) {
    const period: AgentStatsPeriod = periodRaw === '7d' || periodRaw === 'month' ? periodRaw : 'today';
    const now = new Date();
    const since = agentStatsSince(period, now);
    const endOfToday = new Date(agentStatsSince('today', now).getTime() + 24 * 60 * 60 * 1000 - 1);
    const isAdmin = user.role === 'ADMIN';
    const onlyMe = isAdmin ? {} : { agentId: user.id };

    const pipelineStatuses = [LeadStatus.CONTACTED, LeadStatus.INTERESTED, LeadStatus.QUOTED];
    const closedStatuses = [LeadStatus.WON, LeadStatus.LOST];
    const dueFollowUp = { some: { status: 'PENDING' as const, scheduledAt: { lte: endOfToday } } };

    const [dialerCalls, crmCalls, leadsByStatus, contactsInPipeline, leadsDue, contactsDue] = await Promise.all([
      this.prisma.dialerCall.groupBy({
        by: ['agentId', 'outcome'],
        where: { ...onlyMe, startedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.leadActivity.groupBy({
        by: ['createdById', 'type'],
        where: {
          ...(isAdmin ? {} : { createdById: user.id }),
          type: { in: CALL_ACTIVITY_TYPES },
          createdAt: { gte: since },
          NOT: { description: { startsWith: DIALER_ACTIVITY_PREFIX } },
        },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['agentId', 'status', 'isReserved'],
        where: { ...onlyMe, status: { in: [LeadStatus.NEW, ...pipelineStatuses] } },
        _count: { _all: true },
      }),
      this.prisma.importedContact.groupBy({
        by: ['agentId'],
        where: { ...(isAdmin ? { agentId: { not: null } } : onlyMe), leadId: null, pipelineStatus: { in: pipelineStatuses } },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['agentId'],
        where: { ...onlyMe, status: { notIn: closedStatuses }, followUps: dueFollowUp },
        _count: { _all: true },
      }),
      this.prisma.importedContact.groupBy({
        by: ['agentId'],
        where: {
          ...(isAdmin ? { agentId: { not: null } } : onlyMe),
          leadId: null,
          pipelineStatus: { notIn: closedStatuses },
          followUps: dueFollowUp,
        },
        _count: { _all: true },
      }),
    ]);

    type Row = {
      agentId: string; agentName: string; callsMade: number;
      interested: number; callback: number; notAnswered: number; busy: number;
      wrongNumber: number; notInterested: number; answeredOther: number;
      newLeads: number; pipeline: number; followUpsDue: number;
    };
    type CountField = Exclude<keyof Row, 'agentId' | 'agentName'>;
    const rows = new Map<string, Row>();
    const row = (agentId: string): Row => {
      let r = rows.get(agentId);
      if (!r) {
        r = {
          agentId, agentName: '', callsMade: 0,
          interested: 0, callback: 0, notAnswered: 0, busy: 0, wrongNumber: 0, notInterested: 0, answeredOther: 0,
          newLeads: 0, pipeline: 0, followUpsDue: 0,
        };
        rows.set(agentId, r);
      }
      return r;
    };

    const outcomeField: Record<DialerOutcome, CountField> = {
      INTERESTED: 'interested',
      CALLBACK: 'callback',
      NOT_ANSWERED: 'notAnswered',
      BUSY: 'busy',
      WRONG_NUMBER: 'wrongNumber',
      NOT_INTERESTED: 'notInterested',
    };
    for (const g of dialerCalls) {
      const r = row(g.agentId);
      r.callsMade += g._count._all;
      r[outcomeField[g.outcome]] += g._count._all;
    }
    for (const g of crmCalls) {
      const r = row(g.createdById);
      r.callsMade += g._count._all;
      if (g.type === ActivityType.CALL_BUSY) r.busy += g._count._all;
      else if (g.type === ActivityType.CALL_MISSED) r.notAnswered += g._count._all;
      else r.answeredOther += g._count._all;
    }
    for (const g of leadsByStatus) {
      // Reserved leads still in NEW aren't counted as new leads (the dialer
      // calls them only after new leads run out); once called they count in pipeline.
      if (g.status === LeadStatus.NEW) { if (!g.isReserved) row(g.agentId).newLeads += g._count._all; }
      else row(g.agentId).pipeline += g._count._all;
    }
    for (const g of contactsInPipeline) if (g.agentId) row(g.agentId).pipeline += g._count._all;
    for (const g of leadsDue) row(g.agentId).followUpsDue += g._count._all;
    for (const g of contactsDue) if (g.agentId) row(g.agentId).followUpsDue += g._count._all;

    // Every active sales agent gets a row even with nothing yet (admins: all
    // agents; others: themselves), so a seller with zero calls is visible.
    if (isAdmin) {
      const agents = await this.prisma.user.findMany({ where: { isActive: true, role: 'SALES_AGENT' }, select: { id: true } });
      agents.forEach((a) => row(a.id));
    } else {
      row(user.id);
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...rows.keys()] } },
      select: { id: true, fullName: true },
    });
    users.forEach((u) => { const r = rows.get(u.id); if (r) r.agentName = u.fullName; });

    const agents = [...rows.values()].sort((a, b) => b.callsMade - a.callsMade || a.agentName.localeCompare(b.agentName));
    const totals = agents.reduce((t, r) => {
      (Object.keys(t) as Array<keyof typeof t>).forEach((k) => { t[k] += r[k]; });
      return t;
    }, {
      callsMade: 0, interested: 0, callback: 0, notAnswered: 0, busy: 0, wrongNumber: 0,
      notInterested: 0, answeredOther: 0, newLeads: 0, pipeline: 0, followUpsDue: 0,
    });

    return { period, since, agents, totals };
  }

  // ───────────────────────────────────────────────────────────────────────
  // PC popup — GET /dialer/live, POST + GET /dialer/desk-response
  // ───────────────────────────────────────────────────────────────────────

  /**
   * The lead the logged-in user's phone is on a call with right now, with
   * what the PC popup shows. { item: null } when the phone isn't on a lead
   * call. A DialerLock alone isn't enough — it stays behind when the agent
   * pauses / stops / closes the app — so the phone's reported call state
   * (POST /dialer/live-state) must say DIALING / ON_CALL / WRAP_UP.
   */
  async getLive(user: DialerUser) {
    this.assertDialerRole(user);
    const now = new Date();
    const lock = await this.prisma.dialerLock.findFirst({
      where: {
        agentId: user.id,
        lockedAt: { gte: new Date(now.getTime() - LIVE_CALL_MAX_MINUTES * 60 * 1000) },
        liveState: { in: ['DIALING', 'ON_CALL', 'WRAP_UP'] },
      },
      orderBy: { lockedAt: 'desc' },
      select: {
        phone: true, leadId: true, importedContactId: true, lockedAt: true, liveState: true, liveStateAt: true,
        deskOutcome: true, deskNote: true, deskCallbackAt: true, deskSubmittedAt: true,
        deskNotInterestedReason: true, deskProducts: true, deskEndCallAt: true, deskThen: true,
      },
    });
    if (!lock || (!lock.leadId && !lock.importedContactId) || !isOnLiveCall(lock, now)) return { item: null };

    const [item, dialerCalls, crmCalls, agent] = await Promise.all([
      this.describe(
        { source: 'LIVE', phone: lock.phone, leadId: lock.leadId, importedContactId: lock.importedContactId, followUpId: null, scheduledAt: null },
        now,
      ).catch(() => null), // lead/contact deleted mid-call
      this.prisma.dialerCall.findMany({
        where: { phone: lock.phone },
        orderBy: { startedAt: 'desc' },
        take: CALL_HISTORY_LIMIT,
        select: {
          startedAt: true, outcome: true, note: true, durationSec: true, answered: true,
          notInterestedReason: true, products: true, agent: { select: { fullName: true } },
        },
      }),
      // Calls logged from the CRM (not the auto dialer, which is listed above).
      lock.leadId
        ? this.prisma.leadActivity.findMany({
            where: { leadId: lock.leadId, type: { in: CALL_ACTIVITY_TYPES }, NOT: { description: { startsWith: DIALER_ACTIVITY_PREFIX } } },
            orderBy: { createdAt: 'desc' },
            take: CALL_HISTORY_LIMIT,
            select: { createdAt: true, type: true, description: true, createdBy: { select: { fullName: true } } },
          })
        : Promise.resolve([]),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, phone: true } }),
    ]);
    if (!item) return { item: null };

    const callHistory = [
      ...dialerCalls.map((c) => ({
        via: 'DIALER' as const, at: c.startedAt, outcome: c.outcome as string | null, note: c.note,
        durationSec: c.durationSec, answered: c.answered, agentName: c.agent.fullName,
        notInterestedReason: c.notInterestedReason, products: c.products,
      })),
      ...crmCalls.map((a) => ({
        via: 'CRM' as const, at: a.createdAt, outcome: null, note: a.description,
        durationSec: null, answered: a.type === ActivityType.CALL_MADE, agentName: a.createdBy.fullName,
        notInterestedReason: null, products: null,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, CALL_HISTORY_LIMIT);

    return {
      item: {
        ...item,
        lockedAt: lock.lockedAt,
        deskResponse: isDeskResponseCurrent(lock) ? this.deskResponseOf(lock) : null,
        endCallRequested: isEndCallRequestCurrent(lock),
        liveState: lock.liveState,
        callHistory,
        agent: { name: agent?.fullName ?? '', phone: agent?.phone ?? '' },
      },
    };
  }

  private deskResponseOf(lock: {
    deskOutcome: DialerOutcome | null; deskNote: string | null; deskCallbackAt: Date | null; deskSubmittedAt: Date | null;
    deskNotInterestedReason: string | null; deskProducts: Prisma.JsonValue; deskThen: string | null;
  }) {
    return {
      then: lock.deskThen ?? 'NEXT',
      outcome: lock.deskOutcome,
      note: lock.deskNote,
      callbackAt: lock.deskCallbackAt,
      submittedAt: lock.deskSubmittedAt,
      notInterestedReason: lock.deskNotInterestedReason,
      products: Array.isArray(lock.deskProducts) ? lock.deskProducts : [],
    };
  }

  /**
   * Response typed in the PC popup. Saved on the lock; the phone saves it as
   * the call's result (with the real duration) as soon as the call ends, then
   * dials the next number. Submitting again before that replaces it.
   */
  async saveDeskResponse(user: DialerUser, body: any) {
    this.assertDialerRole(user);
    const parsed = parseDeskResponse(body);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    const v = parsed.value;
    const products = await this.resolveReplyProducts(v.products);
    const res = await this.prisma.dialerLock.updateMany({
      where: { phone: v.phone, agentId: user.id },
      data: {
        deskOutcome: v.outcome, deskNote: v.note, deskCallbackAt: v.callbackAt, deskSubmittedAt: new Date(), deskThen: v.then,
        deskNotInterestedReason: v.notInterestedReason,
        deskProducts: products.length ? (products as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
    if (res.count === 0) throw new NotFoundException('This call was already saved on the phone, or the dialer moved on');
    return { ok: true };
  }

  /**
   * The phone asks whether the PC has answered for the number it's on, and
   * whether "End call" was pressed there. { response: null } when not answered.
   */
  async getDeskResponse(user: DialerUser, phoneRaw?: string) {
    this.assertDialerRole(user);
    const phone = normalizeDialPhone(phoneRaw);
    if (phone.length < 6) throw new BadRequestException('phone is required');
    const lock = await this.prisma.dialerLock.findFirst({
      where: { phone, agentId: user.id },
      select: {
        lockedAt: true, deskOutcome: true, deskNote: true, deskCallbackAt: true, deskSubmittedAt: true,
        deskNotInterestedReason: true, deskProducts: true, deskEndCallAt: true, deskThen: true,
      },
    });
    if (!lock) return { response: null, endCallRequested: false };
    return {
      response: isDeskResponseCurrent(lock) ? this.deskResponseOf(lock) : null,
      endCallRequested: isEndCallRequestCurrent(lock),
    };
  }

  /**
   * The phone reports what it's doing with the number on screen (see
   * LIVE_STATES). NONE clears every number this user holds, so the PC popup
   * closes as soon as the agent pauses, stops or leaves the dialer.
   */
  async reportLiveState(user: DialerUser, body: any) {
    this.assertDialerRole(user);
    const parsed = parseLiveState(body);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    const { state, phone } = parsed.value;
    const now = new Date();
    if (state === 'NONE') {
      await this.prisma.dialerLock.updateMany({ where: { agentId: user.id }, data: { liveState: null, liveStateAt: now } });
      return { ok: true };
    }
    if (!phone) throw new BadRequestException('number is required'); // parseLiveState guarantees it; keeps the filter from ever matching every lock
    const res = await this.prisma.dialerLock.updateMany({ where: { phone, agentId: user.id }, data: { liveState: state, liveStateAt: now } });
    // No lock = the call was already saved / the dialer moved on; nothing to show.
    return { ok: res.count > 0 };
  }

  /** PC popup "End call": the phone hangs up the call it's on for this number. */
  async requestEndCall(user: DialerUser, body: any) {
    this.assertDialerRole(user);
    const phone = normalizeDialPhone(body?.number ?? body?.phone);
    if (phone.length < 6) throw new BadRequestException('number is required');
    const res = await this.prisma.dialerLock.updateMany({
      where: { phone, agentId: user.id },
      data: { deskEndCallAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('This call was already saved on the phone, or the dialer moved on');
    return { ok: true };
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET + PUT /dialer/settings — rate lists, outcome → AiSensy campaign
  // ───────────────────────────────────────────────────────────────────────

  private async readSettings(): Promise<DialerSettings> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: DIALER_SETTINGS_KEY } });
    if (!row) return EMPTY_DIALER_SETTINGS;
    try {
      const parsed = parseDialerSettings(JSON.parse(row.value));
      if ('value' in parsed) return parsed.value;
      this.logger.error(`Stored dialer settings are invalid (${parsed.error}) — using none`);
    } catch (e) {
      this.logger.error(`Stored dialer settings are not valid JSON: ${e}`);
    }
    return EMPTY_DIALER_SETTINGS;
  }

  async getSettings(user: DialerUser) {
    this.assertDialerRole(user);
    return this.readSettings();
  }

  async updateSettings(user: DialerUser, body: any) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can change the dialer settings');
    const parsed = parseDialerSettings(body);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    const value = JSON.stringify(parsed.value);
    await this.prisma.systemConfig.upsert({
      where: { key: DIALER_SETTINGS_KEY },
      create: { key: DIALER_SETTINGS_KEY, value },
      update: { value },
    });
    return parsed.value;
  }
}
