import { Controller, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AccountsService } from './accounts.service';
import { PaymentMethod } from '@prisma/client';

type JwtUser = { id: string; role: string };

@UseGuards(AuthGuard('jwt'))
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('pending')
  getPendingOrders() {
    return this.accountsService.getPendingOrders();
  }

  @Get('pending-dispatch')
  getPendingDispatchOrders() {
    return this.accountsService.getPendingDispatchOrders();
  }

  @Get('pending-payments')
  getPendingPayments() {
    return this.accountsService.getPendingPayments();
  }

  @Get('payment-accounts')
  getPaymentAccounts() {
    return this.accountsService.getPaymentAccounts();
  }

  @Get('customer-outstanding')
  getCustomerOutstanding() {
    return this.accountsService.getCustomerOutstanding();
  }

@Get('payment-history')
  getPaymentHistory() {
  return this.accountsService.getPaymentHistory();
}

  @Get('vendor-statements')
  getVendorStatements() {
    return this.accountsService.getVendorStatements();
  }

  @Patch(':id/approve')
  approveOrder(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.accountsService.approveOrder(id, req.user);
  }

  @Patch(':id/reject')
  rejectOrder(@Param('id') id: string, @Body('reason') reason: string) {
    return this.accountsService.rejectOrder(id, reason);
  }

  @Patch(':id/approve-dispatch')
  approveDispatch(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.accountsService.approveDispatch(id, req.user);
  }

  @Patch(':id/reject-dispatch')
  rejectDispatch(@Param('id') id: string, @Body('reason') reason: string) {
    return this.accountsService.rejectDispatch(id, reason);
  }

  @Patch('payments/:id/verify')
  verifyPayment(
    @Param('id') id: string,
    @Body('referenceNumber') referenceNumber: string | undefined,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.verifyPayment(id, req.user.id, referenceNumber);
  }

  @Patch('payments/:id')
  updatePayment(
    @Param('id') id: string,
    @Body() body: {
      amount?: number;
      method?: PaymentMethod;
      paymentAccountId?: string;
      referenceNumber?: string | null;
      notes?: string | null;
      paymentDate?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.updatePendingPayment(id, req.user, body);
  }

  @Patch('payments/:id/reject')
  rejectPayment(@Param('id') id: string, @Body('reason') reason: string, @Req() req: Request & { user: JwtUser }) {
    return this.accountsService.rejectPayment(id, req.user.id, reason);
  }

  @Patch('vendor-statements/jobwork/:id/paid')
  markJobWorkPaid(@Param('id') id: string) {
    return this.accountsService.markJobWorkPaid(id);
  }

  @Patch('vendor-statements/sheet-stage/:id/paid')
  markSheetStagePaid(@Param('id') id: string) {
    return this.accountsService.markSheetStagePaid(id);
  }
}
