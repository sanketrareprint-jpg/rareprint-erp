// backend/src/complaints/complaints.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComplaintsNotifications } from './complaints.notifications';
import {
  ComplaintPriority,
  ComplaintStatus,
  DEFAULT_SLA_TARGETS,
  SlaTargets,
  canReopen,
  computeSlaDueDates,
  generateUniqueTicketNumber,
  isValidStatusTransition,
} from './complaints.calc';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { AssignComplaintDto, ComplaintFilters, UpdateStatusDto } from './dto/update-complaint.dto';
import { AddAttachmentDto, AddCommentDto } from './dto/add-comment.dto';
import { CsatDto, ReopenComplaintDto, ResolveComplaintDto } from './dto/resolve-complaint.dto';

const PRIORITIES: ComplaintPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const SLA_CFG_PREFIX = 'complaint.sla.';
const REOPEN_WINDOW_KEY = 'complaint.reopenWindowDays';
const AUTO_CLOSE_KEY = 'complaint.autoCloseDays';
const DEFAULT_REOPEN_WINDOW_DAYS = 7;
const DEFAULT_AUTO_CLOSE_DAYS = 3;

function humanizeResolutionType(type?: string | null): string {
  if (!type) return 'Resolved';
  return type.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: ComplaintsNotifications,
  ) {}

  // ── SystemConfig-backed tunables (same convention as loyalty.service.ts) ─

  async getSlaConfig(): Promise<Record<ComplaintPriority, SlaTargets>> {
    const keys = PRIORITIES.flatMap((p) => [`${SLA_CFG_PREFIX}${p}.responseHours`, `${SLA_CFG_PREFIX}${p}.resolutionHours`]);
    const rows = await (this.prisma as any).systemConfig.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    const result = {} as Record<ComplaintPriority, SlaTargets>;
    for (const p of PRIORITIES) {
      result[p] = {
        responseHours: Number(map[`${SLA_CFG_PREFIX}${p}.responseHours`] ?? DEFAULT_SLA_TARGETS[p].responseHours),
        resolutionHours: Number(map[`${SLA_CFG_PREFIX}${p}.resolutionHours`] ?? DEFAULT_SLA_TARGETS[p].resolutionHours),
      };
    }
    return result;
  }

  async updateSlaConfig(body: Partial<Record<ComplaintPriority, Partial<SlaTargets>>>) {
    const pairs: [string, string][] = [];
    for (const p of Object.keys(body) as ComplaintPriority[]) {
      const v = body[p];
      if (v?.responseHours != null) pairs.push([`${SLA_CFG_PREFIX}${p}.responseHours`, String(v.responseHours)]);
      if (v?.resolutionHours != null) pairs.push([`${SLA_CFG_PREFIX}${p}.resolutionHours`, String(v.resolutionHours)]);
    }
    await Promise.all(
      pairs.map(([key, value]) => (this.prisma as any).systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } })),
    );
    return this.getSlaConfig();
  }

  async getGeneralConfig(): Promise<{ reopenWindowDays: number; autoCloseDays: number }> {
    const rows = await (this.prisma as any).systemConfig.findMany({ where: { key: { in: [REOPEN_WINDOW_KEY, AUTO_CLOSE_KEY] } } });
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    return {
      reopenWindowDays: Number(map[REOPEN_WINDOW_KEY] ?? DEFAULT_REOPEN_WINDOW_DAYS),
      autoCloseDays: Number(map[AUTO_CLOSE_KEY] ?? DEFAULT_AUTO_CLOSE_DAYS),
    };
  }

  async updateGeneralConfig(body: { reopenWindowDays?: number; autoCloseDays?: number }) {
    const pairs: [string, string][] = [];
    if (body.reopenWindowDays != null) pairs.push([REOPEN_WINDOW_KEY, String(body.reopenWindowDays)]);
    if (body.autoCloseDays != null) pairs.push([AUTO_CLOSE_KEY, String(body.autoCloseDays)]);
    await Promise.all(
      pairs.map(([key, value]) => (this.prisma as any).systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } })),
    );
    return this.getGeneralConfig();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async listAssignableUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, email: true, role: true },
    });
  }

  private async getRawById(id: string) {
    const complaint = await (this.prisma as any).complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException('Complaint not found');
    return complaint;
  }

  private async findAdmin() {
    return this.prisma.user.findFirst({
      where: { email: { equals: 'sanket.rareprint@gmail.com', mode: 'insensitive' } },
      select: { id: true, fullName: true },
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateComplaintDto, raisedById?: string) {
    if (!dto.customerId) throw new BadRequestException('customerId is required');
    if (!dto.subject?.trim()) throw new BadRequestException('subject is required');
    if (!dto.description?.trim()) throw new BadRequestException('description is required');
    if (!dto.channel) throw new BadRequestException('channel is required');
    if (!dto.category) throw new BadRequestException('category is required');

    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order) throw new NotFoundException('Order not found');
    }

    const priority: ComplaintPriority = dto.priority ?? 'MEDIUM';
    const now = new Date();
    const slaTargets = await this.getSlaConfig();
    const { responseDueAt, resolutionDueAt } = computeSlaDueDates(now, priority, slaTargets);

    const year = now.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const startSequence = (await (this.prisma as any).complaint.count({ where: { createdAt: { gte: yearStart, lt: yearEnd } } })) + 1;

    let createdId: string | null = null;
    await generateUniqueTicketNumber(
      year,
      startSequence,
      async (ticketNumber) => {
        try {
          const created = await this.prisma.$transaction(async (tx) => {
            const complaint = await (tx as any).complaint.create({
              data: {
                ticketNumber,
                customerId: dto.customerId,
                orderId: dto.orderId ?? null,
                orderItemId: dto.orderItemId ?? null,
                productId: dto.productId ?? null,
                channel: dto.channel,
                category: dto.category,
                priority,
                subject: dto.subject.trim(),
                description: dto.description.trim(),
                raisedById: raisedById ?? null,
                slaResponseDueAt: responseDueAt,
                slaResolutionDueAt: resolutionDueAt,
              },
            });
            await (tx as any).complaintStatusLog.create({
              data: { complaintId: complaint.id, fromStatus: null, toStatus: 'OPEN', changedById: raisedById ?? null, reason: 'Ticket created' },
            });
            return complaint;
          });
          createdId = created.id;
          return true;
        } catch (e: any) {
          if (e?.code === 'P2002') return false;
          throw e;
        }
      },
    );

    return this.getById(createdId!);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async list(filters: ComplaintFilters) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.category) where.category = filters.category;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.overdue) {
      where.slaResolutionDueAt = { lt: new Date() };
      where.status = { notIn: ['RESOLVED', 'CLOSED'] };
    }

    return (this.prisma as any).complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        customer: { select: { businessName: true, phone: true } },
        order: { select: { orderNumber: true } },
        assignedTo: { select: { id: true, fullName: true } },
        raisedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async getById(id: string) {
    const complaint = await (this.prisma as any).complaint.findUnique({
      where: { id },
      include: {
        customer: { select: { businessName: true, phone: true, email: true } },
        order: { select: { orderNumber: true } },
        assignedTo: { select: { id: true, fullName: true } },
        raisedBy: { select: { id: true, fullName: true } },
        vendor: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        statusLogs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!complaint) throw new NotFoundException('Complaint not found');
    return complaint;
  }

  async stats() {
    const now = new Date();
    const [openCount, overdueCount, byCategoryRaw, resolvedTickets] = await Promise.all([
      (this.prisma as any).complaint.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      (this.prisma as any).complaint.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] }, slaResolutionDueAt: { lt: now } } }),
      (this.prisma as any).complaint.groupBy({ by: ['category'], _count: { _all: true } }),
      (this.prisma as any).complaint.findMany({
        where: { resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 500,
        orderBy: { resolvedAt: 'desc' },
      }),
    ]);

    const avgResolutionHours = resolvedTickets.length
      ? resolvedTickets.reduce((sum: number, t: any) => sum + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000, 0) /
        resolvedTickets.length
      : 0;

    return {
      openCount,
      overdueCount,
      avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      byCategory: byCategoryRaw.map((r: any) => ({ category: r.category, count: r._count._all })),
    };
  }

  // ── Assignment ────────────────────────────────────────────────────────────

  async assign(id: string, body: AssignComplaintDto, actorId?: string) {
    const complaint = await this.getRawById(id);
    const currentStatus: ComplaintStatus = complaint.status;
    const isFreshAssignment = currentStatus === 'OPEN' || currentStatus === 'REOPENED';

    if (isFreshAssignment && !isValidStatusTransition(currentStatus, 'ASSIGNED')) {
      throw new BadRequestException(`Cannot assign a ticket in ${currentStatus} status`);
    }
    if (!isFreshAssignment && !['ASSIGNED', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_VENDOR'].includes(currentStatus)) {
      throw new BadRequestException(`Cannot reassign a ticket in ${currentStatus} status`);
    }
    if (!body.assignedToId && !body.assignedTeam) {
      throw new BadRequestException('assignedToId or assignedTeam is required');
    }

    const now = new Date();
    let slaPatch: Record<string, Date> = {};
    if (isFreshAssignment) {
      // Restart the SLA clock when coming out of REOPENED (fresh OPEN already has it).
      if (currentStatus === 'REOPENED') {
        const slaTargets = await this.getSlaConfig();
        const { responseDueAt, resolutionDueAt } = computeSlaDueDates(now, complaint.priority, slaTargets);
        slaPatch = { slaResponseDueAt: responseDueAt, slaResolutionDueAt: resolutionDueAt };
      }
    }

    const nextStatus: ComplaintStatus = isFreshAssignment ? 'ASSIGNED' : currentStatus;

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await (tx as any).complaint.update({
        where: { id },
        data: {
          assignedToId: body.assignedToId ?? complaint.assignedToId,
          assignedTeam: body.assignedTeam ?? complaint.assignedTeam,
          status: nextStatus,
          ...slaPatch,
        },
      });
      await (tx as any).complaintStatusLog.create({
        data: {
          complaintId: id,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          changedById: actorId ?? null,
          reason: body.reason ?? (isFreshAssignment ? 'Assigned' : 'Reassigned'),
        },
      });
      return c;
    });

    void this.notifications.notifyAssignment(updated).catch(() => {});
    if (isFreshAssignment) {
      const full = await this.getById(id);
      void this.notifications.notifyCustomerAssigned(full, full.customer).catch(() => {});
    }
    return this.getById(id);
  }

  // ── Status transitions ───────────────────────────────────────────────────

  async updateStatus(id: string, body: UpdateStatusDto, actorId?: string) {
    const complaint = await this.getRawById(id);
    const currentStatus: ComplaintStatus = complaint.status;
    const toStatus = body.toStatus;

    if (toStatus === 'REOPENED') {
      return this.reopen(id, { reason: body.reason }, actorId);
    }
    if (!isValidStatusTransition(currentStatus, toStatus)) {
      throw new BadRequestException(`Cannot move ticket from ${currentStatus} to ${toStatus}`);
    }

    const data: Record<string, unknown> = { status: toStatus };
    if (toStatus === 'RESOLVED') data.resolvedAt = new Date();
    if (toStatus === 'CLOSED') data.closedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).complaint.update({ where: { id }, data });
      await (tx as any).complaintStatusLog.create({
        data: { complaintId: id, fromStatus: currentStatus, toStatus, changedById: actorId ?? null, reason: body.reason ?? null },
      });
    });

    if (toStatus === 'RESOLVED') {
      const full = await this.getById(id);
      void this.notifications.notifyCustomerResolved(full, full.customer, humanizeResolutionType(full.resolutionType)).catch(() => {});
    }
    return this.getById(id);
  }

  async resolve(id: string, body: ResolveComplaintDto, actorId?: string) {
    const complaint = await this.getRawById(id);
    const currentStatus: ComplaintStatus = complaint.status;
    if (!isValidStatusTransition(currentStatus, 'RESOLVED')) {
      throw new BadRequestException(`Cannot resolve a ticket in ${currentStatus} status`);
    }
    if (!body.resolutionType) throw new BadRequestException('resolutionType is required');

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).complaint.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionType: body.resolutionType,
          resolutionNotes: body.resolutionNotes ?? null,
          rootCause: body.rootCause ?? null,
          vendorId: body.vendorId ?? null,
        },
      });
      await (tx as any).complaintStatusLog.create({
        data: { complaintId: id, fromStatus: currentStatus, toStatus: 'RESOLVED', changedById: actorId ?? null, reason: 'Resolved' },
      });
    });

    const full = await this.getById(id);
    void this.notifications.notifyCustomerResolved(full, full.customer, humanizeResolutionType(body.resolutionType)).catch(() => {});
    return full;
  }

  async reopen(id: string, body: ReopenComplaintDto, actorId?: string) {
    const complaint = await this.getRawById(id);
    if (complaint.status !== 'CLOSED') {
      throw new BadRequestException('Only CLOSED tickets can be reopened');
    }
    const { reopenWindowDays } = await this.getGeneralConfig();
    if (!canReopen(complaint.closedAt, new Date(), reopenWindowDays)) {
      throw new BadRequestException(
        `Reopen window (${reopenWindowDays} days) has expired — raise a new ticket and reference ${complaint.ticketNumber} in the description`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).complaint.update({
        where: { id },
        data: { status: 'REOPENED', reopenCount: { increment: 1 } },
      });
      await (tx as any).complaintStatusLog.create({
        data: { complaintId: id, fromStatus: 'CLOSED', toStatus: 'REOPENED', changedById: actorId ?? null, reason: body.reason ?? 'Reopened' },
      });
    });

    return this.getById(id);
  }

  async csat(id: string, body: CsatDto) {
    if (!Number.isFinite(body.rating) || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('rating must be between 1 and 5');
    }
    const complaint = await this.getRawById(id);
    if (!['RESOLVED', 'CLOSED'].includes(complaint.status)) {
      throw new BadRequestException('CSAT can only be recorded after the ticket is resolved');
    }
    await (this.prisma as any).complaint.update({
      where: { id },
      data: { csatRating: Math.round(body.rating), csatFeedback: body.feedback ?? null },
    });
    return this.getById(id);
  }

  // ── Comments & attachments ───────────────────────────────────────────────

  async addComment(id: string, body: AddCommentDto, actorId?: string) {
    if (!body.message?.trim()) throw new BadRequestException('message is required');
    await this.getRawById(id);

    const comment = await (this.prisma as any).complaintComment.create({
      data: {
        complaintId: id,
        authorId: body.authorId ?? actorId ?? null,
        authorName: body.authorName?.trim() || 'Staff',
        visibility: body.visibility ?? 'INTERNAL',
        message: body.message.trim(),
      },
    });

    if (comment.visibility === 'CUSTOMER') {
      const full = await this.getById(id);
      void this.notifications.notifyCustomerReply(full, full.customer, comment.message).catch(() => {});
    }
    return comment;
  }

  async addAttachment(id: string, body: AddAttachmentDto, actorId?: string) {
    if (!body.url?.trim()) throw new BadRequestException('url is required');
    await this.getRawById(id);
    return (this.prisma as any).complaintAttachment.create({
      data: {
        complaintId: id,
        url: body.url.trim(),
        fileName: body.fileName?.trim() || 'attachment',
        fileType: body.fileType ?? null,
        uploadedById: body.uploadedById ?? actorId ?? null,
      },
    });
  }

  async addAttachmentFile(id: string, file: Express.Multer.File | undefined, actorId?: string) {
    if (!file) throw new BadRequestException('No file received');
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return this.addAttachment(id, { url: dataUri, fileName: file.originalname, fileType: file.mimetype }, actorId);
  }
}
