import { Body, Controller, Delete, Get, Patch, Param, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AccountsService } from './accounts.service';
import { AccountingNoteType, AccountingPartyType, GstTreatment, PaymentMethod } from '@prisma/client';

type JwtUser = { id: string; role: string; email: string };

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

  @Get('summary')
  getAccountingSummary() {
    return this.accountsService.getAccountingSummary();
  }

  @Get('invoices')
  getInvoices() {
    return this.accountsService.getInvoices();
  }

  @Get('purchase-bills')
  getPurchaseBills() {
    return this.accountsService.getPurchaseBills();
  }

  @Post('purchase-bills')
  createPurchaseBill(
    @Body() body: {
      vendorId: string;
      billNumber: string;
      billDate?: string;
      dueDate?: string;
      subtotal: number;
      taxableAmount?: number;
      gstRatePct?: number;
      gstTreatment?: GstTreatment;
      notes?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.createPurchaseBill(req.user, body);
  }

  @Post('vendor-payments')
  createVendorPayment(
    @Body() body: {
      vendorId: string;
      purchaseBillId?: string;
      paymentAccountId: string;
      amount: number;
      method: PaymentMethod;
      referenceNumber?: string;
      notes?: string;
      paymentDate?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.createVendorPayment(req.user, body);
  }

  @Get('notes')
  getAccountingNotes() {
    return this.accountsService.getAccountingNotes();
  }

  @Post('notes')
  createAccountingNote(
    @Body() body: {
      noteType: AccountingNoteType;
      partyType: AccountingPartyType;
      customerId?: string;
      vendorId?: string;
      invoiceId?: string;
      purchaseBillId?: string;
      reason: string;
      taxableAmount: number;
      gstRatePct?: number;
      gstTreatment?: GstTreatment;
      noteDate?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.createAccountingNote(req.user, body);
  }

  @Get('outstanding-order-shipments')
  getOutstandingOrderShipments() {
    return this.accountsService.getOutstandingOrderShipments();
  }

  @Post('orders/:orderId/cod-booking')
  markOrderAsCod(
    @Param('orderId') orderId: string,
    @Body() body: { awbNumber?: string; courierPlatform: string; courierOrderId?: string },
  ) {
    return this.accountsService.markOrderAsCod(orderId, body);
  }

  @Patch('customers/:customerId/balance-reminder')
  sendBalanceReminder(@Param('customerId') customerId: string, @Req() req: Request & { user: JwtUser }) {
    return this.accountsService.sendBalanceReminder(customerId, req.user);
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
  approveOrder(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
    @Body('overrideReason') overrideReason?: string,
  ) {
    return this.accountsService.approveOrder(id, req.user, overrideReason);
  }

  @Patch(':id/reject')
  rejectOrder(@Param('id') id: string, @Body('reason') reason: string) {
    return this.accountsService.rejectOrder(id, reason);
  }

  @Patch(':id/return-to-accounts')
  returnToAccounts(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.returnToAccounts(id, reason, req.user);
  }

  @Patch(':id/approve-dispatch')
  approveDispatch(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.accountsService.approveDispatch(id, req.user);
  }

  // ── Sample Kit endpoints ──────────────────────────────────────────────────
  @Get('sample-orders')
  getSampleOrders() {
    return this.accountsService.getSampleOrders();
  }

  @Patch(':id/approve-sample')
  approveSampleOrder(
    @Param('id') id: string,
    @Body('paymentReceived') paymentReceived: boolean,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.approveSampleOrder(id, paymentReceived, req.user);
  }

  @Patch(':id/reject-sample')
  rejectSampleOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.accountsService.rejectSampleOrder(id, reason);
  }

  @Patch(':id/dispatch-sample')
  dispatchSampleOrder(
    @Param('id') id: string,
    @Body('trackingNumber') trackingNumber: string | undefined,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.accountsService.dispatchSampleOrder(id, trackingNumber, req.user as any);
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

  @Delete('payments/:id')
  deletePayment(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.accountsService.deletePayment(id, req.user);
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
