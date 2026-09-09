// File: backend/src/crm/crm.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, LeadSource, ActivityType } from '@prisma/client';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  // ─── LIST LEADS (agent sees own, admin sees all) ───────────────────────────
  async getLeads(userId: string, role: string, status?: string, search?: string, myOnly?: boolean) {
    const where: any = {};
    if (role !== 'ADMIN' || myOnly) where.agentId = userId;
    if (status && status !== 'ALL') where.status = status as LeadStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { businessName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const leads = await this.prisma.lead.findMany({
      where,
      include: {
        agent: { select: { id: true, fullName: true } },
        followUps: {
          where: { status: 'PENDING' },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
        _count: { select: { activities: true } },
      },
      orderBy: [{ isHot: 'desc' }, { score: 'desc' }, { updatedAt: 'desc' }],
    });

    // Attach duplicate warning: check if same phone exists in other agents' pipelines
    const phones = leads.map((l) => l.phone);
    const duplicates = await this.prisma.lead.groupBy({
      by: ['phone'],
      where: { phone: { in: phones } },
      _count: { phone: true },
    });
    const dupPhones = new Set(
      duplicates.filter((d) => d._count.phone > 1).map((d) => d.phone),
    );

    return leads.map((l) => ({
      ...l,
      isDuplicate: dupPhones.has(l.phone),
      nextFollowUp: l.followUps[0] ?? null,
      activityCount: l._count.activities,
    }));
  }

  // ─── GET SINGLE LEAD WITH FULL TIMELINE ────────────────────────────────────
  async getLeadById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, fullName: true } },
        activities: {
          include: { createdBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        followUps: { orderBy: { scheduledAt: 'asc' } },
      },
    });

    // Find other agents with same phone
    const samePhone = await this.prisma.lead.findMany({
      where: { phone: lead!.phone, id: { not: id } },
      include: { agent: { select: { fullName: true } } },
    });

    return { ...lead, sharedWith: samePhone };
  }

  // ─── CREATE LEAD ───────────────────────────────────────────────────────────
  async createLead(data: any, agentId: string) {
    const score = this._scoreLead(data);

    // Notify other agents if phone already exists
    await this._notifyDuplicateAgents(data.phone, agentId, data.name);

    const lead = await this.prisma.lead.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        businessName: data.businessName,
        city: data.city,
        productInterest: data.productInterest,
        estimatedQty: data.estimatedQty ? Number(data.estimatedQty) : null,
        estimatedValue: data.estimatedValue ? Number(data.estimatedValue) : null,
        notes: data.notes,
        source: data.source ?? LeadSource.MANUAL,
        agentId,
        score,
        isHot: score >= 70,
      },
    });

    // Auto-schedule first follow-up (Day 1)
    await this._scheduleFollowUps(lead.id);

    // Log activity
    await this.prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: ActivityType.NOTE_ADDED,
        description: 'Lead created',
        createdById: agentId,
      },
    });

    return lead;
  }

  // ─── UPDATE LEAD STATUS ────────────────────────────────────────────────────
  async updateStatus(id: string, status: LeadStatus, agentId: string) {
    const old = await this.prisma.lead.findUnique({ where: { id } });

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { status },
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        type: ActivityType.STATUS_CHANGED,
        description: `Status changed: ${old!.status} → ${status}`,
        createdById: agentId,
      },
    });

    // If WON — notify agent to convert to order
    // If LOST — auto-schedule recycle follow-up in 30 days
    if (status === 'LOST') {
      await this.prisma.leadFollowUp.create({
        data: {
          leadId: id,
          scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          note: 'Recycle — check if requirement still exists',
        },
      });
    }

    return lead;
  }

  // ─── LOG CALL ──────────────────────────────────────────────────────────────
  async logCall(leadId: string, outcome: string, note: string, agentId: string) {
    const typeMap: Record<string, ActivityType> = {
      ANSWERED: ActivityType.CALL_MADE,
      BUSY: ActivityType.CALL_BUSY,
      NO_ANSWER: ActivityType.CALL_MISSED,
    };

    await this.prisma.leadActivity.create({
      data: {
        leadId,
        type: typeMap[outcome] ?? ActivityType.CALL_MADE,
        description: note || `Call outcome: ${outcome}`,
        createdById: agentId,
      },
    });

    // Schedule next follow-up based on outcome
    let daysLater = outcome === 'ANSWERED' ? 3 : 1;
    await this.prisma.leadFollowUp.create({
      data: {
        leadId,
        scheduledAt: new Date(Date.now() + daysLater * 24 * 60 * 60 * 1000),
        note: `After ${outcome.toLowerCase()} call`,
      },
    });

    return { success: true };
  }

  // ─── ADD NOTE ─────────────────────────────────────────────────────────────
  async addNote(leadId: string, note: string, agentId: string) {
    return this.prisma.leadActivity.create({
      data: {
        leadId,
        type: ActivityType.NOTE_ADDED,
        description: note,
        createdById: agentId,
      },
    });
  }

  // ─── GET TODAY'S FOLLOW-UPS FOR AGENT ─────────────────────────────────────
  async getTodayFollowUps(agentId: string, role: string) {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const where: any = {
      status: 'PENDING',
      scheduledAt: { lte: endOfDay },
    };

    if (role !== 'ADMIN') {
      where.lead = { agentId };
    }

    return this.prisma.leadFollowUp.findMany({
      where,
      include: {
        lead: {
          include: { agent: { select: { fullName: true } } },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  // ─── POWER DIALER: get next lead to call ──────────────────────────────────
  async getNextDialerLead(agentId: string, currentLeadId?: string) {
    const leads = await this.prisma.lead.findMany({
      where: {
        agentId,
        status: { in: ['NEW', 'CONTACTED', 'INTERESTED'] },
        id: currentLeadId ? { not: currentLeadId } : undefined,
      },
      orderBy: [{ isHot: 'desc' }, { score: 'desc' }, { updatedAt: 'asc' }],
      take: 1,
      include: {
        followUps: {
          where: { status: 'PENDING' },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
      },
    });
    return leads[0] ?? null;
  }

  // ─── CSV BULK IMPORT ───────────────────────────────────────────────────────
  async bulkImport(rows: any[], agentId: string) {
    const results = { success: 0, skipped: 0, duplicates: 0, errors: [] as string[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.name || !row.phone) {
        results.errors.push(`Row ${i + 2}: missing name or phone`);
        results.skipped++;
        continue;
      }

      try {
        const phone = String(row.phone).replace(/\D/g, '').slice(-10);
        const score = this._scoreLead(row);

        await this.prisma.lead.create({
          data: {
            name: String(row.name).trim(),
            phone,
            email: row.email ? String(row.email).trim() : null,
            businessName: row.businessName ? String(row.businessName).trim() : null,
            city: row.city ? String(row.city).trim() : null,
            productInterest: row.productInterest ? String(row.productInterest).trim() : null,
            estimatedQty: row.estimatedQty ? Number(row.estimatedQty) : null,
            estimatedValue: row.estimatedValue ? Number(row.estimatedValue) : null,
            notes: row.notes ? String(row.notes).trim() : null,
            source: LeadSource.CSV_IMPORT,
            agentId,
            score,
            isHot: score >= 70,
          },
        });

        // Check for duplicates across agents
        const existing = await this.prisma.lead.count({
          where: { phone, id: { not: undefined } },
        });
        if (existing > 1) {
          results.duplicates++;
          await this._notifyDuplicateAgents(phone, agentId, row.name);
        }

        // Auto follow-up
        const created = await this.prisma.lead.findFirst({
          where: { phone, agentId },
          orderBy: { createdAt: 'desc' },
        });
        if (created) await this._scheduleFollowUps(created.id);

        results.success++;
      } catch (e) {
        results.errors.push(`Row ${i + 2}: ${e.message}`);
        results.skipped++;
      }
    }

    return results;
  }

  // ─── DUPLICATE ALERT: get all agents who share this phone ─────────────────
  async getDuplicateAlert(phone: string) {
    const normalized = String(phone).replace(/\D/g, '').slice(-10);
    const leads = await this.prisma.lead.findMany({
      where: { phone: normalized },
      include: { agent: { select: { id: true, fullName: true } } },
    });

    if (leads.length <= 1) return null;

    return {
      phone: normalized,
      agents: leads.map((l) => ({
        agentName: l.agent.fullName,
        leadName: l.name,
        status: l.status,
        leadId: l.id,
      })),
    };
  }

  // ─── STATS FOR MANAGER DASHBOARD ──────────────────────────────────────────
  async getStats(userId: string, role: string) {
    const where = role !== 'ADMIN' ? { agentId: userId } : {};

    const [total, byStatus, hotLeads, todayFollowUps] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.lead.count({ where: { ...where, isHot: true } }),
      this.prisma.leadFollowUp.count({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
          ...(role !== 'ADMIN' ? { lead: { agentId: userId } } : {}),
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s) => (statusMap[s.status] = s._count.status));

    return { total, byStatus: statusMap, hotLeads, todayFollowUps };
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────
  private _scoreLead(data: any): number {
    let score = 30; // base
    if (data.estimatedQty && Number(data.estimatedQty) >= 5000) score += 20;
    if (data.estimatedQty && Number(data.estimatedQty) >= 20000) score += 10;
    if (data.estimatedValue && Number(data.estimatedValue) >= 5000) score += 15;
    if (data.businessName) score += 10;
    if (data.email) score += 5;
    if (data.productInterest) score += 10;
    return Math.min(score, 100);
  }

  private async _scheduleFollowUps(leadId: string) {
    const days = [1, 3, 7, 14, 30];
    const now = Date.now();
    await this.prisma.leadFollowUp.createMany({
      data: days.map((d) => ({
        leadId,
        scheduledAt: new Date(now + d * 24 * 60 * 60 * 1000),
        note: `Day ${d} follow-up`,
      })),
    });
  }

  private async _notifyDuplicateAgents(phone: string, currentAgentId: string, leadName: string) {
    const normalized = String(phone).replace(/\D/g, '').slice(-10);
    const existing = await this.prisma.lead.findMany({
      where: { phone: normalized, agentId: { not: currentAgentId } },
      include: { agent: { select: { id: true, fullName: true } } },
    });
    // In production: push notification / WhatsApp to each agent
    // For now: logged — real notification can hook into your AiSensy integration
    if (existing.length > 0) {
      console.log(
        `[CRM DUPLICATE] Lead "${leadName}" (${normalized}) already exists with agents: ` +
          existing.map((e) => e.agent.fullName).join(', '),
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
// ADD THESE METHODS TO crm.service.ts (paste at the bottom, before the last })
// ─────────────────────────────────────────────────────────────────────────────

  // ─── ROUND ROBIN: get next agent ─────────────────────────────────────────
  private async getNextAgent(): Promise<string> {
    // Get all active sales agents
    const agents = await this.prisma.user.findMany({
      where: { role: 'SALES_AGENT', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!agents.length) throw new Error('No active sales agents found');

    // Count leads per agent to find who has least
    const counts = await Promise.all(
      agents.map(async (a) => ({
        id: a.id,
        count: await this.prisma.lead.count({ where: { agentId: a.id } }),
      })),
    );

    // Assign to agent with fewest leads
    counts.sort((a, b) => a.count - b.count);
    return counts[0].id;
  }

  // ─── RECEIVE META LEAD WEBHOOK ───────────────────────────────────────────
  async receiveMetaWebhook(rawBody: any) {
    // Handle Meta webhook format
    if (rawBody.object === "page" && rawBody.entry) {
      for (const entry of rawBody.entry) {
        for (const change of entry.changes ?? []) {
          if (change.field === "leadgen") {
            const leadId = change.value.leadgen_id;
            const formId = change.value.form_id;
            const pageId = change.value.page_id;
            console.log(`[META] New lead: ${leadId} from form ${formId}`);
            // Here you would fetch lead details from Meta Graph API
            // For now log it
          }
        }
      }
    }
    return { status: "ok" };
  }

  async receiveMetaLead(data: {
    name: string;
    phone: string;
    email?: string;
    businessName?: string;
    city?: string;
    productInterest?: string;
    estimatedQty?: number;
    estimatedValue?: number;
    notes?: string;
  }) {
    // Check for duplicate phone
    const existing = await this.prisma.lead.findFirst({
      where: { phone: data.phone },
    });

    const agentId = await this.getNextAgent();

    const lead = await this.prisma.lead.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        businessName: data.businessName,
        city: data.city,
        productInterest: data.productInterest,
        estimatedQty: data.estimatedQty,
        estimatedValue: data.estimatedValue,
        notes: data.notes,
        source: 'WHATSAPP' as any,
        status: 'NEW' as any,
        agentId,
      },
      include: {
        agent: { select: { id: true, fullName: true } },
      },
    });

    // Log activity
    await this.prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'NOTE_ADDED' as any,
        description: `Lead received from Meta Ads and assigned to ${lead.agent.fullName}`,
        createdById: agentId,
      },
    });

    return { lead, isDuplicate: !!existing };
  }

  // ─── SEND LEAD TO AISENSY ────────────────────────────────────────────────
  async sendLeadToAisensy(leadId: string, userId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        agent: { select: { id: true, fullName: true } },
      },
    });

    if (!lead) throw new Error('Lead not found');

    const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
    const AISENSY_API_KEY = process.env.AISENSY_API_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NzI3YmI2NzEyN2RmMGMyMDc5OGM1ZCIsIm5hbWUiOiJSQVJFUFJJTlQzIiwiYXBwTmFtZSI6IkFpU2Vuc3kiLCJjbGllbnRJZCI6IjYyMjZmOTA1MDFhNWM5NjdhMDBiMDRkNCIsImFjdGl2ZVBsYW4iOiJQUk9fWUVBUkxZIiwiaWF0IjoxNzU5MjM4OTQzfQ.FQpnJHJnplYIcwZc2FKOkJUrOkLvoF2jFTTx7GycoBE';

    // Normalize phone
    const digits = lead!.phone.replace(/\D/g, '');
    let phone = digits;
    if (digits.length === 10) phone = `91${digits}`;
    else if (digits.length === 11 && digits.startsWith('0')) phone = `91${digits.slice(1)}`;

    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName: 'question',
      destination: phone,
      userName: lead.name,
      templateParams: [lead.name],
      source: 'rareprint-erp-crm',
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
    };

    const res = await fetch(AISENSY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const responseData = await res.json().catch(() => ({}));

    // Log the activity
    await this.prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'WHATSAPP_SENT' as any,
        description: `WhatsApp sent to ${lead!.phone} via AiSensy (template: question) by ${lead.agent.fullName}`,
        createdById: userId,
      },
    });

    // Update lead status to CONTACTED
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'CONTACTED' as any },
    });

    return {
      success: res.ok,
      response: responseData,
      sentTo: phone,
      agentName: lead.agent.fullName,
    };
  }
}





