// backend/src/call-compliance/call-compliance.service.ts
//
// Cross-checks monthly phone-statement call logs (imported from carrier PDF
// bills) against AiSensy contact-tag exports (CSV), to answer: "which agent
// tagged a WhatsApp contact as theirs but never actually called them?"
//
// Data flow:
//  1. Admin uploads each agent's monthly statement PDF -> parsed into
//     CallLogRecord rows (destination number, timestamp, duration),
//     auto-assigned to the agent whose User.phone matches the statement's
//     own number, with a manual-assign fallback.
//  2. Admin uploads the AiSensy "export contacts" CSV -> upserted into
//     ImportedContact by phone, with the Tags column resolved to an agentId
//     via User.aisensyTag.
//  3. A contact is "not contacted" if it's tagged to an agent but that
//     agent's CallLogRecord rows never show that phone number.
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseJioStatementPdf, normalizePhone, ParsedCallRow } from './jio-statement-parser';
import { parseAisensyContactsCsv } from './aisensy-contacts-parser';

const AGENT_ROLES: UserRole[] = [UserRole.SALES_AGENT, UserRole.ADMIN, UserRole.INHOUSE];

@Injectable()
export class CallComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────
  // CALL LOG (PDF) IMPORT
  // ─────────────────────────────────────────────────────────────────────

  async importCallLogPdf(file: Express.Multer.File, importedById: string, forceAgentId?: string) {
    if (!file) throw new BadRequestException('file is required (field: file)');
    const parsed = await parseJioStatementPdf(file.buffer);

    let agent: { id: string; fullName: string } | null = null;
    if (forceAgentId) {
      agent = await this.prisma.user.findUnique({ where: { id: forceAgentId }, select: { id: true, fullName: true } });
      if (!agent) throw new NotFoundException('Selected agent not found');
    } else if (parsed.ownerNumber) {
      agent = await this.findAgentByPhone(parsed.ownerNumber);
    }

    const importRow = await this.prisma.callLogImport.create({
      data: {
        fileName: file.originalname,
        ownerNumber: parsed.ownerNumber,
        agentId: agent?.id ?? null,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        rowsFound: parsed.rows.length,
        rowsImported: 0,
        rawRows: agent ? Prisma.JsonNull : (parsed.rows as unknown as Prisma.InputJsonValue),
        importedById,
      },
    });

    let inserted = 0;
    let duplicates = 0;
    if (agent) {
      const result = await this.materializeCallLogRecords(importRow.id, agent.id, parsed.rows);
      inserted = result.inserted;
      duplicates = result.duplicates;
      await this.prisma.callLogImport.update({ where: { id: importRow.id }, data: { rowsImported: inserted } });
    }

    return {
      id: importRow.id,
      fileName: file.originalname,
      ownerNumber: parsed.ownerNumber,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      rowsFound: parsed.rows.length,
      // rowsImported/duplicatesSkipped only reflect anything once an agent is
      // known — if this statement overlaps a previously-imported period for
      // the same agent, the overlapping calls are skipped as duplicates
      // (same agent + same number + same exact call timestamp), not
      // double-counted.
      rowsImported: inserted,
      duplicatesSkipped: duplicates,
      agent,
      needsAgentAssignment: !agent,
    };
  }

  async listCallLogImports() {
    return this.prisma.callLogImport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, fullName: true } },
        importedBy: { select: { fullName: true } },
        _count: { select: { records: true } },
      },
    });
  }

  async assignCallLogImport(importId: string, agentId: string) {
    const importRow = await this.prisma.callLogImport.findUnique({ where: { id: importId } });
    if (!importRow) throw new NotFoundException('Import not found');
    const agent = await this.prisma.user.findUnique({ where: { id: agentId }, select: { id: true, fullName: true } });
    if (!agent) throw new NotFoundException('Agent not found');

    const rawRows = (importRow.rawRows as unknown as ParsedCallRow[] | null) ?? [];
    const rows: ParsedCallRow[] = rawRows.map((r) => ({ ...r, calledAt: new Date(r.calledAt) }));

    const result = await this.materializeCallLogRecords(importId, agent.id, rows);

    await this.prisma.callLogImport.update({
      where: { id: importId },
      data: { agentId: agent.id, rowsImported: result.inserted, rawRows: Prisma.JsonNull },
    });

    return { success: true, agent, rowsImported: result.inserted, duplicatesSkipped: result.duplicates };
  }

  async deleteCallLogImport(importId: string) {
    await this.prisma.callLogImport.delete({ where: { id: importId } });
    return { success: true };
  }

  private async materializeCallLogRecords(
    importId: string,
    agentId: string,
    rows: ParsedCallRow[],
  ): Promise<{ inserted: number; duplicates: number }> {
    // Clear out this import's own previously-materialized rows first (so
    // re-assigning an import is idempotent), then insert fresh. `skipDuplicates`
    // relies on the (agentId, phone, calledAt) unique index to silently drop
    // any row that's already present from a *different* import — this is what
    // prevents an overlapping-period re-upload from double-counting calls.
    await this.prisma.callLogRecord.deleteMany({ where: { importId } });
    if (!rows.length) return { inserted: 0, duplicates: 0 };
    const result = await this.prisma.callLogRecord.createMany({
      data: rows.map((r) => ({ importId, agentId, phone: r.phone, calledAt: r.calledAt, durationSec: r.durationSec })),
      skipDuplicates: true,
    });
    return { inserted: result.count, duplicates: rows.length - result.count };
  }

  private async findAgentByPhone(phoneLast10: string): Promise<{ id: string; fullName: string } | null> {
    const users = await this.prisma.user.findMany({
      where: { phone: { not: null } },
      select: { id: true, fullName: true, phone: true },
    });
    const match = users.find((u) => normalizePhone(u.phone ?? '') === phoneLast10);
    return match ? { id: match.id, fullName: match.fullName } : null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // AISENSY CONTACTS (CSV) IMPORT
  // ─────────────────────────────────────────────────────────────────────

  async importContactsCsv(file: Express.Multer.File, importedById: string) {
    if (!file) throw new BadRequestException('file is required (field: file)');
    const parsedRows = parseAisensyContactsCsv(file.buffer);
    if (!parsedRows.length) throw new BadRequestException('No usable rows found (need a UserNumber column with valid phone numbers)');

    const agentsByTag = await this.buildAgentTagIndex();

    const importRow = await this.prisma.contactImport.create({
      data: { fileName: file.originalname, rowsFound: parsedRows.length, importedById },
    });

    const phones = parsedRows.map((r) => r.phone);
    const existingRows = await this.prisma.importedContact.findMany({
      where: { phone: { in: phones } },
      select: { id: true, phone: true },
    });
    const existingByPhone = new Map(existingRows.map((r) => [r.phone, r.id]));

    const toCreate: Prisma.ImportedContactCreateManyInput[] = [];
    const updateJobs: Array<{ id: string; data: Prisma.ImportedContactUpdateInput }> = [];

    for (const row of parsedRows) {
      const agent = row.primaryTag ? agentsByTag.get(row.primaryTag.toLowerCase()) : undefined;
      const base = {
        importId: importRow.id,
        name: row.name,
        tagRaw: row.tagRaw,
        agentId: agent?.id ?? null,
        lastActiveAt: row.lastActiveAt,
        createdOnAt: row.createdOnAt,
        source: row.source,
        status: row.status,
        optedIn: row.optedIn,
      };
      const existingId = existingByPhone.get(row.phone);
      if (existingId) {
        updateJobs.push({ id: existingId, data: base });
      } else {
        toCreate.push({ ...base, phone: row.phone });
      }
    }

    if (toCreate.length) {
      await this.prisma.importedContact.createMany({ data: toCreate, skipDuplicates: true });
    }

    const BATCH = 25;
    for (let i = 0; i < updateJobs.length; i += BATCH) {
      await Promise.all(
        updateJobs.slice(i, i + BATCH).map((job) => this.prisma.importedContact.update({ where: { id: job.id }, data: job.data })),
      );
    }

    await this.prisma.contactImport.update({
      where: { id: importRow.id },
      data: { rowsImported: toCreate.length, rowsUpdated: updateJobs.length },
    });

    const unmatchedTags = [
      ...new Set(
        parsedRows
          .filter((r) => r.primaryTag && !agentsByTag.has(r.primaryTag.toLowerCase()))
          .map((r) => r.primaryTag as string),
      ),
    ];

    // Diagnostic: how many rows actually had a parseable "Created On" date.
    // The Ad ROI tab groups contacts by this field — if it's 0 here despite
    // rowsFound being large, the CSV's date column/format doesn't match what
    // aisensy-contacts-parser.ts expects, and every month will show 0
    // contacts created even though the import itself "succeeded".
    const rowsWithCreatedOnAt = parsedRows.filter((r) => r.createdOnAt != null).length;

    return {
      importId: importRow.id,
      rowsFound: parsedRows.length,
      created: toCreate.length,
      updated: updateJobs.length,
      unmatchedTags,
      rowsWithCreatedOnAt,
    };
  }

  async listContactImports() {
    return this.prisma.contactImport.findMany({
      orderBy: { createdAt: 'desc' },
      include: { importedBy: { select: { fullName: true } }, _count: { select: { contacts: true } } },
    });
  }

  private async buildAgentTagIndex() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: AGENT_ROLES } },
      select: { id: true, fullName: true, aisensyTag: true },
    });
    const map = new Map<string, { id: string; fullName: string }>();
    for (const u of users) {
      const key = (u.aisensyTag || u.fullName.split(' ')[0]).trim().toLowerCase();
      if (key) map.set(key, { id: u.id, fullName: u.fullName });
    }
    return map;
  }

  // ─────────────────────────────────────────────────────────────────────
  // AGENT MAPPING (AiSensy tag <-> user)
  // ─────────────────────────────────────────────────────────────────────

  async listAgents() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: AGENT_ROLES } },
      select: { id: true, fullName: true, role: true, phone: true, aisensyTag: true },
      orderBy: { fullName: 'asc' },
    });
    return users;
  }

  async setAgentTag(agentId: string, aisensyTag: string | null) {
    const agent = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent not found');
    return this.prisma.user.update({
      where: { id: agentId },
      data: { aisensyTag: aisensyTag?.trim() || null },
      select: { id: true, fullName: true, aisensyTag: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // COMPLIANCE STATS (per agent + org-wide dashboard)
  // ─────────────────────────────────────────────────────────────────────

  async getAgentComplianceStats(agentId: string, month?: string) {
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, fullName: true, aisensyTag: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const monthFilter = month ? this.monthRange(month) : null;

    const [taggedContacts, allCallRecords] = await Promise.all([
      this.prisma.importedContact.findMany({
        // Which tagged contacts we're reporting on is scoped to the month
        // (by when AiSensy says the contact was created) if one is given.
        where: { agentId, ...(monthFilter ? { createdOnAt: { gte: monthFilter.start, lt: monthFilter.end } } : {}) },
        select: { name: true, phone: true, tagRaw: true, lastActiveAt: true, createdOnAt: true },
      }),
      // Always fetch the agent's FULL call history — whether a contact has
      // been called shouldn't depend on which month you're viewing; a lead
      // tagged in July but called in August is still contacted.
      this.prisma.callLogRecord.findMany({
        where: { agentId },
        select: { phone: true, calledAt: true, durationSec: true },
      }),
    ]);

    const calledPhones = new Set(allCallRecords.map((c) => c.phone));
    const notContacted = taggedContacts.filter((c) => !calledPhones.has(c.phone));

    // The "calls made" stats below (top 5, calling pattern) DO respect the
    // month filter — that's the actual "call activity this month" view.
    const scopedCallRecords = monthFilter
      ? allCallRecords.filter((c) => c.calledAt >= monthFilter.start && c.calledAt < monthFilter.end)
      : allCallRecords;

    type Agg = { count: number; totalDurationSec: number; lastCalledAt: Date };
    const byPhone = new Map<string, Agg>();
    for (const c of scopedCallRecords) {
      const cur = byPhone.get(c.phone) ?? { count: 0, totalDurationSec: 0, lastCalledAt: c.calledAt };
      cur.count += 1;
      cur.totalDurationSec += c.durationSec;
      if (c.calledAt > cur.lastCalledAt) cur.lastCalledAt = c.calledAt;
      byPhone.set(c.phone, cur);
    }

    const top5Called = [...byPhone.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([phone, v]) => ({ phone, count: v.count, totalDurationSec: v.totalDurationSec, lastCalledAt: v.lastCalledAt }));

    let calledOnce = 0;
    let calledRepeat = 0;
    const bucketCounts: Record<string, number> = { '1 call': 0, '2-3 calls': 0, '4-6 calls': 0, '7+ calls': 0 };
    for (const [, v] of byPhone) {
      if (v.count === 1) { calledOnce++; bucketCounts['1 call']++; }
      else {
        calledRepeat++;
        if (v.count <= 3) bucketCounts['2-3 calls']++;
        else if (v.count <= 6) bucketCounts['4-6 calls']++;
        else bucketCounts['7+ calls']++;
      }
    }
    const distinctNumbersCalled = byPhone.size;
    const repeatCallRate = distinctNumbersCalled ? Math.round((calledRepeat / distinctNumbersCalled) * 100) : 0;

    return {
      agentId: agent.id,
      agentName: agent.fullName,
      aisensyTag: agent.aisensyTag,
      month: month ?? null,
      taggedCount: taggedContacts.length,
      contactedCount: taggedContacts.length - notContacted.length,
      notContactedCount: notContacted.length,
      notContactedNumbers: notContacted
        .map((c) => ({ name: c.name, phone: c.phone, tagRaw: c.tagRaw, lastActiveAt: c.lastActiveAt, createdOnAt: c.createdOnAt }))
        .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0)),
      top5Called,
      callingPattern: {
        distinctNumbersCalled,
        calledOnce,
        calledRepeat,
        repeatCallRate, // % of contacted numbers this agent called more than once
        distribution: Object.entries(bucketCounts).map(([bucket, count]) => ({ bucket, count })),
      },
    };
  }

  async getComplianceDashboard(month?: string) {
    const monthFilter = month ? this.monthRange(month) : null;

    const agents = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: AGENT_ROLES } },
      select: { id: true, fullName: true, aisensyTag: true },
    });

    const [allContacts, allCalls] = await Promise.all([
      this.prisma.importedContact.findMany({
        // "tags applied this month" = contacts AiSensy says were created
        // that month. Falls back to all-time when no month is given.
        where: { agentId: { not: null }, ...(monthFilter ? { createdOnAt: { gte: monthFilter.start, lt: monthFilter.end } } : {}) },
        select: { agentId: true, phone: true },
      }),
      // Contacted-check always uses the full call history, not month-scoped —
      // see getAgentComplianceStats for why.
      this.prisma.callLogRecord.findMany({ select: { agentId: true, phone: true } }),
    ]);

    const calledSetByAgent = new Map<string, Set<string>>();
    for (const c of allCalls) {
      if (!calledSetByAgent.has(c.agentId)) calledSetByAgent.set(c.agentId, new Set());
      calledSetByAgent.get(c.agentId)!.add(c.phone);
    }

    const taggedByAgent = new Map<string, number>();
    const notContactedByAgent = new Map<string, number>();
    for (const contact of allContacts) {
      const aId = contact.agentId as string;
      taggedByAgent.set(aId, (taggedByAgent.get(aId) ?? 0) + 1);
      const calledSet = calledSetByAgent.get(aId);
      if (!calledSet || !calledSet.has(contact.phone)) {
        notContactedByAgent.set(aId, (notContactedByAgent.get(aId) ?? 0) + 1);
      }
    }

    const rows = agents
      .map((a) => ({
        agentId: a.id,
        agentName: a.fullName,
        aisensyTag: a.aisensyTag,
        tagsApplied: taggedByAgent.get(a.id) ?? 0,
        notContacted: notContactedByAgent.get(a.id) ?? 0,
        contacted: (taggedByAgent.get(a.id) ?? 0) - (notContactedByAgent.get(a.id) ?? 0),
      }))
      .filter((r) => r.tagsApplied > 0)
      .sort((a, b) => b.notContacted - a.notContacted);

    return {
      month: month ?? null,
      agents: rows,
      totals: {
        tagsApplied: rows.reduce((sum, r) => sum + r.tagsApplied, 0),
        notContacted: rows.reduce((sum, r) => sum + r.notContacted, 0),
      },
    };
  }

  /**
   * Org-wide version of getAgentComplianceStats' "top 5 called" / "calling
   * pattern" — same per-phone aggregation, but pooled across every agent's
   * CallLogRecord rows instead of scoping to one agentId. Used by the
   * dashboard's "Everyone's Top 5 Called Numbers" / "Everyone's Calling
   * Pattern" cards so the team sees combined call activity, not just
   * whoever happens to be logged in.
   */
  async getTeamCallStats(month?: string) {
    const monthFilter = month ? this.monthRange(month) : null;

    const calls = await this.prisma.callLogRecord.findMany({
      where: monthFilter ? { calledAt: { gte: monthFilter.start, lt: monthFilter.end } } : {},
      select: { phone: true, calledAt: true, durationSec: true },
    });

    type Agg = { count: number; totalDurationSec: number; lastCalledAt: Date };
    const byPhone = new Map<string, Agg>();
    for (const c of calls) {
      const cur = byPhone.get(c.phone) ?? { count: 0, totalDurationSec: 0, lastCalledAt: c.calledAt };
      cur.count += 1;
      cur.totalDurationSec += c.durationSec;
      if (c.calledAt > cur.lastCalledAt) cur.lastCalledAt = c.calledAt;
      byPhone.set(c.phone, cur);
    }

    const top5Called = [...byPhone.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([phone, v]) => ({ phone, count: v.count, totalDurationSec: v.totalDurationSec, lastCalledAt: v.lastCalledAt }));

    let calledOnce = 0;
    let calledRepeat = 0;
    const bucketCounts: Record<string, number> = { '1 call': 0, '2-3 calls': 0, '4-6 calls': 0, '7+ calls': 0 };
    for (const [, v] of byPhone) {
      if (v.count === 1) { calledOnce++; bucketCounts['1 call']++; }
      else {
        calledRepeat++;
        if (v.count <= 3) bucketCounts['2-3 calls']++;
        else if (v.count <= 6) bucketCounts['4-6 calls']++;
        else bucketCounts['7+ calls']++;
      }
    }
    const distinctNumbersCalled = byPhone.size;
    const repeatCallRate = distinctNumbersCalled ? Math.round((calledRepeat / distinctNumbersCalled) * 100) : 0;

    return {
      month: month ?? null,
      distinctNumbersCalled,
      top5Called,
      callingPattern: {
        distinctNumbersCalled,
        calledOnce,
        calledRepeat,
        repeatCallRate, // % of called numbers that got more than one call
        distribution: Object.entries(bucketCounts).map(([bucket, count]) => ({
          bucket,
          count,
          pct: distinctNumbersCalled ? Math.round((count / distinctNumbersCalled) * 100) : 0,
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // NOT-CONTACTED LEADS (CRM view)
  // ─────────────────────────────────────────────────────────────────────

  /** Admins see every agent's not-contacted numbers; agents see only their own. */
  async getNotContactedLeads(requester: { id: string; role: string }, month?: string) {
    const isAdmin = requester.role === 'ADMIN';
    const monthFilter = month ? this.monthRange(month) : null;
    const contactWhere = {
      ...(isAdmin ? { agentId: { not: null } } : { agentId: requester.id }),
      ...(monthFilter ? { createdOnAt: { gte: monthFilter.start, lt: monthFilter.end } } : {}),
    };

    const [contacts, calls] = await Promise.all([
      this.prisma.importedContact.findMany({
        where: contactWhere,
        select: {
          id: true, name: true, phone: true, tagRaw: true,
          lastActiveAt: true, createdOnAt: true, agentId: true,
          agent: { select: { fullName: true } },
        },
      }),
      // Contacted-check always uses the full call history — see
      // getAgentComplianceStats for why month doesn't scope this side.
      this.prisma.callLogRecord.findMany({
        where: isAdmin ? {} : { agentId: requester.id },
        select: { agentId: true, phone: true },
      }),
    ]);

    const calledSetByAgent = new Map<string, Set<string>>();
    for (const c of calls) {
      if (!calledSetByAgent.has(c.agentId)) calledSetByAgent.set(c.agentId, new Set());
      calledSetByAgent.get(c.agentId)!.add(c.phone);
    }

    return contacts
      .filter((c) => c.agentId && !calledSetByAgent.get(c.agentId)?.has(c.phone))
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        tagRaw: c.tagRaw,
        lastActiveAt: c.lastActiveAt,
        createdOnAt: c.createdOnAt,
        agentId: c.agentId,
        agentName: c.agent?.fullName ?? null,
      }))
      .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));
  }

  // ─────────────────────────────────────────────────────────────────────
  // MONTH HELPERS
  // ─────────────────────────────────────────────────────────────────────
  // "month" everywhere in this service is a "YYYY-MM" string (same convention
  // as marketing-roi.service.ts's monthKey, since both features read the
  // same ImportedContact.createdOnAt column for their month bucketing).

  /** Every month that has either a tagged contact or a logged call, most recent first. */
  async listAvailableMonths(): Promise<{ month: string; label: string }[]> {
    const [contacts, calls] = await Promise.all([
      this.prisma.importedContact.findMany({ where: { createdOnAt: { not: null } }, select: { createdOnAt: true } }),
      this.prisma.callLogRecord.findMany({ select: { calledAt: true } }),
    ]);
    const months = new Set<string>();
    for (const c of contacts) if (c.createdOnAt) months.add(this.toMonthKey(c.createdOnAt));
    for (const c of calls) months.add(this.toMonthKey(c.calledAt));
    return [...months].sort((a, b) => (a < b ? 1 : -1)).map((m) => ({ month: m, label: this.monthLabel(m) }));
  }

  private toMonthKey(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private monthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  private monthRange(monthKey: string): { start: Date; end: Date } {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new BadRequestException('month must be "YYYY-MM"');
    const [year, month] = monthKey.split('-').map(Number);
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
  }
}
