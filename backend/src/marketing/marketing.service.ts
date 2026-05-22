import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const AISENSY_API_URL = process.env.AISENSY_API_URL ?? 'https://backend.aisensy.com/campaign/t1/api/v2';
const DAILY_DEFAULT_LIMIT = 10000;

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(private prisma: PrismaService) {}

  async getOverview(userId: string, role: string) {
    const contactWhere = role === 'SALES_AGENT' ? { assignedAgentId: userId } : {};
    const [
      contacts,
      activeCampaigns,
      queued,
      sentToday,
      repliesToday,
      hotLeads,
    ] = await Promise.all([
      (this.prisma as any).marketingContact.count({ where: contactWhere }),
      (this.prisma as any).marketingCampaign.count({ where: { status: 'ACTIVE' } }),
      (this.prisma as any).marketingBroadcastJob.count({ where: { status: 'QUEUED' } }),
      (this.prisma as any).marketingMessageEvent.count({ where: { eventType: 'SENT', occurredAt: { gte: this.startOfDay() } } }),
      (this.prisma as any).marketingMessageEvent.count({ where: { eventType: 'REPLIED', occurredAt: { gte: this.startOfDay() } } }),
      (this.prisma as any).marketingContact.count({ where: { ...contactWhere, leadTemperature: 'HOT' } }),
    ]);

    return { contacts, activeCampaigns, queued, sentToday, repliesToday, hotLeads };
  }

  async getContacts(query: any) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { mobile: { contains: query.search } },
        { shopName: { contains: query.search, mode: 'insensitive' } },
        { ownerName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.state) where.state = { equals: query.state, mode: 'insensitive' };
    if (query.temperature && query.temperature !== 'ALL') where.leadTemperature = query.temperature;

    const take = Math.min(Number(query.take ?? 50), 200);
    const skip = Math.max(Number(query.skip ?? 0), 0);

    const [items, total] = await Promise.all([
      (this.prisma as any).marketingContact.findMany({
        where,
        include: { assignedAgent: { select: { id: true, fullName: true } } },
        orderBy: [{ engagementScore: 'desc' }, { updatedAt: 'desc' }],
        take,
        skip,
      }),
      (this.prisma as any).marketingContact.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async importContacts(rows: any[]) {
    const result = { success: 0, updated: 0, skipped: 0, errors: [] as string[] };
    const contactsByMobile = new Map<string, any>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mobile = this.normalizePhone(row.mobile ?? row.phone ?? row.Mobile ?? row.Phone);
      if (!mobile) {
        result.skipped++;
        result.errors.push(`Row ${i + 1}: invalid mobile`);
        continue;
      }

      const data = {
        mobile,
        shopName: this.clean(row.shopName ?? row.shop_name ?? row.businessName ?? row.name),
        ownerName: this.clean(row.ownerName ?? row.owner_name ?? row.contactPerson),
        city: this.clean(row.city),
        state: this.clean(row.state),
        productCategory: this.clean(row.productCategory ?? row.product_category ?? row.productInterest),
        tags: this.toTags(row.tags),
      };

      contactsByMobile.set(mobile, data);
    }

    const contacts = Array.from(contactsByMobile.values());
    const duplicateRowsInFile = rows.length - result.skipped - contacts.length;
    if (duplicateRowsInFile > 0) result.skipped += duplicateRowsInFile;

    for (const chunk of this.chunkArray(contacts, 1000)) {
      const created = await (this.prisma as any).marketingContact.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      result.success += created.count ?? 0;
      result.skipped += chunk.length - (created.count ?? 0);
    }

    return result;
  }

  updateContact(id: string, body: any) {
    return (this.prisma as any).marketingContact.update({
      where: { id },
      data: {
        shopName: body.shopName,
        ownerName: body.ownerName,
        city: body.city,
        state: body.state,
        productCategory: body.productCategory,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        assignedAgentId: body.assignedAgentId || undefined,
        isBlacklisted: body.isBlacklisted,
      },
    });
  }

  async optOutContact(id: string) {
    return (this.prisma as any).marketingContact.update({
      where: { id },
      data: {
        optedOutAt: new Date(),
        whatsappStatus: 'UNSUBSCRIBED',
        leadTemperature: 'BLOCKED',
        engagementScore: { decrement: 50 },
      },
    });
  }

  getSegments() {
    return (this.prisma as any).marketingSegment.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  createSegment(body: any) {
    return (this.prisma as any).marketingSegment.create({
      data: {
        name: body.name,
        description: body.description,
        filters: body.filters ?? {},
      },
    });
  }

  async previewSegment(filters: any) {
    const where = this.segmentWhere(filters);
    const [count, sample] = await Promise.all([
      (this.prisma as any).marketingContact.count({ where }),
      (this.prisma as any).marketingContact.findMany({ where, take: 10, orderBy: { updatedAt: 'desc' } }),
    ]);
    return { count, sample };
  }

  getTemplates() {
    return (this.prisma as any).marketingTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  createTemplate(body: any) {
    return (this.prisma as any).marketingTemplate.create({
      data: {
        name: body.name,
        aisensyCampaignName: body.aisensyCampaignName,
        templateType: body.templateType ?? 'TEXT',
        language: body.language ?? 'en',
        body: body.body,
        mediaUrl: body.mediaUrl || null,
        variables: body.variables ?? [],
        ctaButtons: body.ctaButtons ?? [],
      },
    });
  }

  getCampaigns() {
    return (this.prisma as any).marketingCampaign.findMany({
      include: {
        steps: { include: { template: true }, orderBy: { stepOrder: 'asc' } },
        _count: { select: { jobs: true, events: true } },
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createCampaign(body: any, userId: string) {
    if (!body.steps?.length) throw new BadRequestException('At least one campaign step is required');
    return (this.prisma as any).marketingCampaign.create({
      data: {
        name: body.name,
        segmentId: body.segmentId || null,
        dailyLimit: Number(body.dailyLimit ?? DAILY_DEFAULT_LIMIT),
        cooldownDays: Number(body.cooldownDays ?? 30),
        priority: Number(body.priority ?? 0),
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        createdById: userId,
        steps: {
          create: body.steps.map((step: any, index: number) => ({
            templateId: step.templateId,
            stepOrder: Number(step.stepOrder ?? index + 1),
            delayHours: Number(step.delayHours ?? 0),
            filters: step.filters ?? {},
          })),
        },
      },
      include: { steps: true },
    });
  }

  async cloneCampaign(id: string, userId: string) {
    const campaign = await (this.prisma as any).marketingCampaign.findUnique({
      where: { id },
      include: { steps: true },
    });
    if (!campaign) throw new BadRequestException('Campaign not found');
    return this.createCampaign({
      ...campaign,
      name: `${campaign.name} Copy`,
      steps: campaign.steps,
    }, userId);
  }

  async deleteCampaign(id: string) {
    const campaign = await (this.prisma as any).marketingCampaign.findUnique({ where: { id } });
    if (!campaign) throw new BadRequestException('Campaign not found');

    await (this.prisma as any).marketingMessageEvent.updateMany({
      where: { campaignId: id },
      data: { campaignId: null },
    });
    await (this.prisma as any).marketingCampaign.delete({ where: { id } });
    return { success: true };
  }

  updateCampaignStatus(id: string, status: string) {
    return (this.prisma as any).marketingCampaign.update({
      where: { id },
      data: { status },
    });
  }

  async scheduleCampaign(id: string) {
    const campaign = await (this.prisma as any).marketingCampaign.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!campaign) throw new BadRequestException('Campaign not found');
    if (!campaign.steps.length) throw new BadRequestException('Campaign has no steps');

    const segment = campaign.segmentId
      ? await (this.prisma as any).marketingSegment.findUnique({ where: { id: campaign.segmentId } })
      : null;
    const where = this.segmentWhere(segment?.filters ?? {});
    where.isBlacklisted = false;
    where.optedOutAt = null;

    const cooldownFrom = new Date(Date.now() - campaign.cooldownDays * 24 * 60 * 60 * 1000);
    where.OR = [{ lastBroadcastDate: null }, { lastBroadcastDate: { lt: cooldownFrom } }];

    const contacts = await (this.prisma as any).marketingContact.findMany({
      where,
      select: { id: true },
      take: campaign.dailyLimit ?? DAILY_DEFAULT_LIMIT,
      orderBy: [{ engagementScore: 'desc' }, { updatedAt: 'asc' }],
    });

    let queued = 0;
    const jobs = contacts.flatMap((contact) =>
      campaign.steps.map((step) => ({
        campaignId: campaign.id,
        stepId: step.id,
        contactId: contact.id,
        scheduledAt: new Date(Date.now() + step.delayHours * 60 * 60 * 1000),
      })),
    );

    for (const chunk of this.chunkArray(jobs, 1000)) {
      const created = await (this.prisma as any).marketingBroadcastJob.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      queued += created.count ?? 0;
    }

    await (this.prisma as any).marketingCampaign.update({
      where: { id },
      data: { status: 'ACTIVE', lastRotatedAt: new Date() },
    });

    return { queued, contacts: contacts.length, skipped: jobs.length - queued };
  }

  async processDueBroadcastJobs() {
    return this.processBroadcastBatches(1);
  }

  async processOneBroadcastJob() {
    return this.processBroadcastBatches(1, 1);
  }

  @Cron('0 11 * * *', { timeZone: 'Asia/Kolkata' })
  async processDailyBroadcastQueue() {
    const maxBatches = Number(process.env.MARKETING_DAILY_QUEUE_BATCHES ?? 250);
    const result = await this.processBroadcastBatches(maxBatches);
    this.logger.log(`Daily 11:00 AM marketing queue run: ${JSON.stringify(result)}`);
    return result;
  }

  async getBroadcastDiagnostics() {
    const [jobs, recentFailures] = await Promise.all([
      (this.prisma as any).marketingBroadcastJob.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      (this.prisma as any).marketingBroadcastJob.findMany({
        where: {
          status: 'FAILED',
          errorMessage: { not: null },
        },
        include: {
          contact: { select: { mobile: true, shopName: true } },
          campaign: { select: { name: true } },
          step: { include: { template: { select: { name: true, aisensyCampaignName: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      jobs: Object.fromEntries(jobs.map((job: any) => [job.status, job._count.status])),
      recentFailures: recentFailures.map((job: any) => ({
        id: job.id,
        mobile: job.contact?.mobile,
        shopName: job.contact?.shopName,
        campaignName: job.campaign?.name,
        templateName: job.step?.template?.name,
        aisensyCampaignName: job.step?.template?.aisensyCampaignName,
        retryCount: job.retryCount,
        errorMessage: job.errorMessage,
        updatedAt: job.updatedAt,
      })),
      aisensyApiKeyConfigured: Boolean(process.env.AISENSY_API_KEY),
      sendBatchSize: Number(process.env.MARKETING_SEND_BATCH_SIZE ?? 40),
      dailyRun: '11:00 AM IST',
    };
  }

  private async processBroadcastBatches(maxBatches: number, batchSizeOverride?: number) {
    let processed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const batchSize = batchSizeOverride ?? Number(process.env.MARKETING_SEND_BATCH_SIZE ?? 40);

    for (let batch = 0; batch < maxBatches; batch++) {
      const jobs = await (this.prisma as any).marketingBroadcastJob.findMany({
        where: {
          status: { in: ['QUEUED', 'FAILED'] },
          retryCount: { lt: 3 },
          scheduledAt: { lte: new Date() },
        },
        include: {
          contact: true,
          campaign: true,
          step: { include: { template: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: batchSize,
      });

      if (!jobs.length) break;
      processed += jobs.length;

      for (const job of jobs) {
        if (job.contact.isBlacklisted || job.contact.optedOutAt) {
          await this.finishJob(job.id, 'SKIPPED', 'Opted out or blacklisted');
          skipped++;
          continue;
        }

        await (this.prisma as any).marketingBroadcastJob.update({ where: { id: job.id }, data: { status: 'SENDING' } });
        const result = await this.sendViaAisensy(job);
        if (result.success) {
          await (this.prisma as any).$transaction([
            (this.prisma as any).marketingBroadcastJob.update({
              where: { id: job.id },
              data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId },
            }),
            (this.prisma as any).marketingContact.update({
              where: { id: job.contactId },
              data: { lastBroadcastDate: new Date() },
            }),
            (this.prisma as any).marketingMessageEvent.create({
              data: { contactId: job.contactId, campaignId: job.campaignId, providerMessageId: result.providerMessageId, eventType: 'SENT', rawPayload: result.raw ?? {} },
            }),
          ]);
          sent++;
        } else {
          await (this.prisma as any).marketingBroadcastJob.update({
            where: { id: job.id },
            data: { status: 'FAILED', retryCount: { increment: 1 }, errorMessage: result.error },
          });
          failed++;
        }
      }

      if (jobs.length < batchSize) break;
    }

    return {
      processed,
      sent,
      failed,
      skipped,
      nextRun: 'Daily at 11:00 AM IST',
    };
  }

  async receiveAisensyWebhook(body: any, signature: string | undefined, kind: 'status' | 'reply') {
    if (process.env.AISENSY_WEBHOOK_SECRET && signature !== process.env.AISENSY_WEBHOOK_SECRET) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const providerMessageId = body.messageId ?? body.message_id ?? body.id ?? body.msgId;
    const mobile = this.normalizePhone(body.phone ?? body.mobile ?? body.destination ?? body.wa_id);
    const eventType = kind === 'reply' ? 'REPLIED' : this.mapWebhookStatus(body.status ?? body.event ?? body.type);
    const contact = mobile ? await (this.prisma as any).marketingContact.findUnique({ where: { mobile } }) : null;
    const job = providerMessageId
      ? await (this.prisma as any).marketingBroadcastJob.findFirst({ where: { providerMessageId } })
      : null;

    await (this.prisma as any).marketingMessageEvent.create({
      data: {
        contactId: contact?.id ?? job?.contactId,
        campaignId: job?.campaignId,
        providerMessageId,
        eventType,
        rawPayload: body,
      },
    });

    if (contact?.id) await this.applyEngagement(contact.id, eventType);
    return { ok: true };
  }

  async getAnalytics() {
    const events = await (this.prisma as any).marketingMessageEvent.groupBy({
      by: ['eventType'],
      _count: { eventType: true },
    });
    const jobs = await (this.prisma as any).marketingBroadcastJob.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const topCities = await (this.prisma as any).marketingContact.groupBy({
      by: ['city'],
      where: { city: { not: null } },
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 8,
    });
    return {
      events: Object.fromEntries(events.map((e: any) => [e.eventType, e._count.eventType])),
      jobs: Object.fromEntries(jobs.map((j: any) => [j.status, j._count.status])),
      topCities,
    };
  }

  getAgentDashboard(userId: string, role: string) {
    const where: any = role === 'ADMIN' ? {} : { assignedAgentId: userId };
    return (this.prisma as any).marketingContact.findMany({
      where: { ...where, leadTemperature: { in: ['HOT', 'WARM'] }, optedOutAt: null, isBlacklisted: false },
      orderBy: [{ leadTemperature: 'desc' }, { engagementScore: 'desc' }, { lastReplyDate: 'desc' }],
      take: 100,
    });
  }

  private async sendViaAisensy(job: any) {
    const apiKey = process.env.AISENSY_API_KEY;
    if (!apiKey) return { success: false, error: 'AISENSY_API_KEY is not configured' };
    const media = this.buildAisensyMedia(job.step.template);
    if (media.error) return { success: false, error: media.error };

    const body = {
      apiKey,
      campaignName: job.step.template.aisensyCampaignName,
      destination: job.contact.mobile,
      userName: job.contact.ownerName || job.contact.shopName || 'Customer',
      templateParams: this.resolveTemplateParams(job.step.template.variables, job.contact),
      source: 'rareprint-marketing-automation',
      media: media.value,
      buttons: job.step.template.ctaButtons ?? [],
      carouselCards: [],
      location: {},
    };

    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: JSON.stringify(data), raw: data };
      return { success: true, providerMessageId: data.messageId ?? data.id ?? data.requestId ?? job.id, raw: data };
    } catch (error) {
      this.logger.error(`AiSensy marketing send failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  private async finishJob(id: string, status: string, errorMessage?: string) {
    return (this.prisma as any).marketingBroadcastJob.update({ where: { id }, data: { status, errorMessage } });
  }

  private buildAisensyMedia(template: any): { value: Record<string, string>; error?: string } {
    const type = String(template.templateType ?? 'TEXT').toUpperCase();
    const mediaUrl = String(template.mediaUrl ?? '').trim();
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(type) && !mediaUrl) {
      return {
        value: {},
        error: `${type} template "${template.name}" needs a public Media URL. Add the file URL in Templates, then create/schedule the campaign again.`,
      };
    }
    if (!mediaUrl) return { value: {} };

    return {
      value: {
        url: mediaUrl,
        filename: this.filenameFromUrl(mediaUrl, type),
      },
    };
  }

  private filenameFromUrl(mediaUrl: string, type: string): string {
    try {
      const pathname = new URL(mediaUrl).pathname;
      const rawName = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
      if (rawName && rawName.includes('.')) return rawName;
    } catch {
      // Fall through to a safe generated filename.
    }

    const extensionMap: Record<string, string> = {
      IMAGE: 'jpg',
      VIDEO: 'mp4',
      DOCUMENT: 'pdf',
    };
    return `rareprint-marketing.${extensionMap[type] ?? 'jpg'}`;
  }

  private async applyEngagement(contactId: string, eventType: string) {
    const delta: Record<string, number> = {
      READ: 1,
      CLICKED: 3,
      REPLIED: 5,
      ORDER_PLACED: 20,
      BLOCKED: -20,
      UNSUBSCRIBED: -50,
    };
    const contact = await (this.prisma as any).marketingContact.update({
      where: { id: contactId },
      data: {
        engagementScore: { increment: delta[eventType] ?? 0 },
        lastReplyDate: eventType === 'REPLIED' ? new Date() : undefined,
        optedOutAt: eventType === 'UNSUBSCRIBED' ? new Date() : undefined,
        whatsappStatus: eventType === 'BLOCKED' ? 'BLOCKED' : eventType === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : undefined,
      },
    });
    const temperature = contact.optedOutAt || contact.whatsappStatus === 'BLOCKED'
      ? 'BLOCKED'
      : contact.engagementScore >= 10
        ? 'HOT'
        : contact.engagementScore >= 3
          ? 'WARM'
          : 'COLD';
    await (this.prisma as any).marketingContact.update({ where: { id: contactId }, data: { leadTemperature: temperature } });
  }

  private segmentWhere(filters: any) {
    const where: any = {};
    if (filters.city) where.city = { equals: filters.city, mode: 'insensitive' };
    if (filters.state) where.state = { equals: filters.state, mode: 'insensitive' };
    if (filters.productCategory) where.productCategory = { contains: filters.productCategory, mode: 'insensitive' };
    if (filters.temperature) where.leadTemperature = filters.temperature;
    if (filters.minScore) where.engagementScore = { gte: Number(filters.minScore) };
    if (filters.tag) where.tags = { has: filters.tag };
    return where;
  }

  private resolveTemplateParams(variables: any, contact: any): string[] {
    const vars = Array.isArray(variables) ? variables : [];
    if (!vars.length) return [contact.ownerName || contact.shopName || 'Customer'];
    return vars.map((name) => {
      const key = String(name).replace(/[{}]/g, '');
      return String(contact[key] ?? '');
    });
  }

  private mapWebhookStatus(raw: string): string {
    const value = String(raw ?? '').toUpperCase();
    if (value.includes('READ')) return 'READ';
    if (value.includes('DELIVER')) return 'DELIVERED';
    if (value.includes('CLICK')) return 'CLICKED';
    if (value.includes('BLOCK')) return 'BLOCKED';
    if (value.includes('UNSUB')) return 'UNSUBSCRIBED';
    if (value.includes('FAIL')) return 'FAILED';
    return 'SENT';
  }

  private normalizePhone(raw: any): string | null {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length > 10) return digits;
    return null;
  }

  private toTags(raw: any): string[] {
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    return String(raw ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  }

  private clean(value: any): string | undefined {
    const text = String(value ?? '').trim();
    return text || undefined;
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private startOfDay() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
