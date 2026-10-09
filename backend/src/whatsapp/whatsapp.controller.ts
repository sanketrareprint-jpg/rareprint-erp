// backend/src/whatsapp/whatsapp.controller.ts
import { Controller, ForbiddenException, Get, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /whatsapp/status
   * Latest AiSensy send outcome (failing + AiSensy's reason) for the admin
   * Dashboard warning. See WhatsAppSendStatus in whatsapp.service.ts.
   */
  @Get('status')
  getStatus(@Req() req: Request & { user: { role: string } }) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only an admin can view WhatsApp send status');
    }
    return this.whatsapp.getSendStatus();
  }

  /**
   * GET /whatsapp/my-failures?since=<ISO time>
   * WhatsApp sends that failed after `since`, started by the caller's own
   * actions — any logged-in user, own failures only. Polled by
   * frontend/components/whatsapp-failure-alerts.tsx to show the failure on
   * whatever screen the user is on.
   */
  @Get('my-failures')
  async getMyFailures(
    @Req() req: Request & { user: { id: string } },
    @Query('since') since?: string,
  ) {
    return { serverTime: new Date().toISOString(), failures: await this.whatsapp.getFailuresForUser(req.user.id, since) };
  }

  /**
   * POST /whatsapp/send/:orderId
   * Manually send a WhatsApp update for any order.
   * Called from the Orders page "WhatsApp" button.
   */
  @Post('send/:orderId')
  async sendForOrder(@Param('orderId') orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });

    if (!order) return { success: false, message: 'Order not found' };
    if (!order.customer.phone) return { success: false, message: 'Customer has no phone number' };

    const product = order.items.map(i => i.product.name).join(', ');
    const status  = WhatsAppService.statusLabel(order.status);

    const sent = await this.whatsapp.sendOrderUpdate({
      customerName:  order.customer.businessName,
      customerPhone: order.customer.phone,
      orderNo:       order.orderNumber,
      product,
      status,
      agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
    });

    return { success: sent };
  }
}