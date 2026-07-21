// backend/src/complaints/complaints.notifications.ts
//
// Wires complaint events into the existing Notification model (internal,
// staff-facing) and WhatsAppService (customer-facing). Written directly
// against PrismaService rather than NotificationsService, matching how
// every other module (dispatch, production, loyalty) already writes its own
// Notification rows independently — there's no shared "create notification"
// service to depend on.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

type ComplaintForNotify = {
  id: string;
  ticketNumber: string;
  subject: string;
  assignedToId: string | null;
  orderId: string | null;
};

type CustomerForNotify = {
  businessName: string;
  phone: string | null;
};

@Injectable()
export class ComplaintsNotifications {
  private readonly logger = new Logger(ComplaintsNotifications.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ── Internal: assignment → Notification row for the assignee ────────────
  async notifyAssignment(complaint: ComplaintForNotify): Promise<void> {
    if (!complaint.assignedToId) return;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: complaint.assignedToId },
        select: { id: true, fullName: true },
      });
      if (!user) return;
      await (this.prisma as any).notification.create({
        data: {
          type: 'COMPLAINT_ASSIGNED',
          priority: 'HIGH',
          title: `Ticket ${complaint.ticketNumber} assigned to you`,
          message: `${complaint.subject}`,
          toUserId: user.id,
          toUserName: user.fullName,
          orderId: complaint.orderId ?? undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`notifyAssignment failed for ${complaint.ticketNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Internal: SLA escalation → Notification row copied to admin ─────────
  async notifyEscalation(complaint: ComplaintForNotify, adminUserId: string, adminName: string): Promise<void> {
    try {
      await (this.prisma as any).notification.create({
        data: {
          type: 'COMPLAINT_SLA_BREACHED',
          priority: 'URGENT',
          title: `🔴 SLA breached — Ticket ${complaint.ticketNumber}`,
          message: `${complaint.subject} has passed its resolution SLA and has not been resolved.`,
          toUserId: adminUserId,
          toUserName: adminName,
          orderId: complaint.orderId ?? undefined,
          copyToAdmin: true,
        },
      });
    } catch (e) {
      this.logger.warn(`notifyEscalation failed for ${complaint.ticketNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Customer-facing: status change (ASSIGNED / RESOLVED) via WhatsApp ───
  async notifyCustomerStatusChange(
    complaint: ComplaintForNotify,
    customer: CustomerForNotify,
    statusLabel: string,
  ): Promise<void> {
    if (!customer.phone) return;
    try {
      await this.whatsapp.sendComplaintUpdate({
        customerName: customer.businessName,
        customerPhone: customer.phone,
        ticketNumber: complaint.ticketNumber,
        subject: complaint.subject,
        status: statusLabel,
      });
    } catch (e) {
      this.logger.warn(`notifyCustomerStatusChange failed for ${complaint.ticketNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Customer-facing: new customer-visible reply via WhatsApp ────────────
  async notifyCustomerComment(complaint: ComplaintForNotify, customer: CustomerForNotify, message: string): Promise<void> {
    if (!customer.phone) return;
    try {
      await this.whatsapp.sendComplaintUpdate({
        customerName: customer.businessName,
        customerPhone: customer.phone,
        ticketNumber: complaint.ticketNumber,
        subject: complaint.subject,
        status: `New reply: ${message}`,
      });
    } catch (e) {
      this.logger.warn(`notifyCustomerComment failed for ${complaint.ticketNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
