// backend/src/whatsapp/whatsapp.controller.ts
import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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