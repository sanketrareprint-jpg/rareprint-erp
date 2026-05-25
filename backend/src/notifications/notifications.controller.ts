import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import type { Request } from 'express';

type JwtUser = { id: string; role: string };

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  getMyNotifications(@Req() req: Request & { user: JwtUser }) {
    return this.svc.getMyNotifications(req.user.id);
  }

  @Get('admin')
  getAdminNotifications() {
    return this.svc.getAdminNotifications();
  }

  @Get('user-view')
  getUserNotifications(@Req() req: Request & { user: JwtUser }, @Body() body?: { email?: string }) {
    // Admin can view any user's notifications by passing ?email=...
    const email = (req as any).query?.email as string;
    if (!email) return [];
    return this.svc.getUserNotificationsByEmail(email);
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: Request & { user: JwtUser }) {
    return this.svc.getUnreadCount(req.user.id);
  }

  @Post('mark-all-read')
  markAllRead(@Req() req: Request & { user: JwtUser }) {
    return this.svc.markAllRead(req.user.id);
  }

  @Post('trigger-check')
  triggerManualCheck() {
    return this.svc.triggerManualCheck();
  }

  @Post('order-reassurance/run')
  runOrderReassurance() {
    return this.svc.sendDueOrderReassuranceMessages();
  }

  @Get('order-reassurance/history/:orderId')
  getOrderReassuranceHistory(@Param('orderId') orderId: string) {
    return this.svc.getOrderReassuranceHistory(orderId);
  }

  @Post('ask-design/:itemId')
  notifySalesAgentDesign(@Param('itemId') itemId: string) {
    return this.svc.notifySalesAgentDesign(itemId);
  }

  @Post('set-due-date')
  setDueDate(@Body() body: { type: 'jobwork' | 'sheetitem'; id: string; dueDate: string }) {
    return this.svc.setDueDate(body.type, body.id, body.dueDate);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.svc.markRead(id);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body('actionTaken') actionTaken: string) {
    return this.svc.resolveNotification(id, actionTaken);
  }

  @Post(':id/explain')
  explain(@Param('id') id: string, @Body('explanation') explanation: string) {
    return this.svc.addExplanation(id, explanation);
  }

  @Post(':id/escalate')
  escalate(@Param('id') id: string) {
    return this.svc.escalateToAdmin(id);
  }
}
