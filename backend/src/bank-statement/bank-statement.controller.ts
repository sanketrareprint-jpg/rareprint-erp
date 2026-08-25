// backend/src/bank-statement/bank-statement.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  Query, Request, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { BankReconcileStatus, BankTxnType } from '@prisma/client';
import { BankStatementService } from './bank-statement.service';

type JwtUser = { id: string };

@Controller('bank-statement')
@UseGuards(AuthGuard('jwt'))
export class BankStatementController {
  constructor(private readonly svc: BankStatementService) {}

  // ── Upload & Import ────────────────────────────────────────────────────────

  /** POST /bank-statement/import  (multipart field: "file") */
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async importStatement(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: JwtUser },
  ) {
    if (!file) throw new Error('No file provided');
    return this.svc.importStatement(file.buffer, file.originalname, req.user.id);
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  /** GET /bank-statement/accounts */
  @Get('accounts')
  listAccounts() {
    return this.svc.listAccounts();
  }

  /** GET /bank-statement/transactions?accountNumber=&reconcileStatus=&needsReview=true&crDr=&fromDate=&toDate=&page=&limit= */
  @Get('transactions')
  listTransactions(
    @Query('accountNumber') accountNumber?: string,
    @Query('reconcileStatus') reconcileStatus?: BankReconcileStatus,
    @Query('needsReview') needsReview?: string,
    @Query('crDr') crDr?: BankTxnType,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('amountMin') amountMin?: string,
    @Query('amountMax') amountMax?: string,
    @Query('vendorId') vendorId?: string,
    @Query('expenseCategoryId') expenseCategoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listTransactions({
      accountNumber,
      reconcileStatus,
      needsReview: needsReview === 'true',
      crDr,
      fromDate,
      toDate,
      amountMin: amountMin ? parseFloat(amountMin) : undefined,
      amountMax: amountMax ? parseFloat(amountMax) : undefined,
      vendorId,
      expenseCategoryId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  /** PATCH /bank-statement/transactions/:id/reconcile */
  @Patch('transactions/:id/reconcile')
  reconcileTransaction(
    @Param('id') id: string,
    @Request() req: { user: JwtUser },
    @Body() body: {
      reconcileStatus: BankReconcileStatus;
      matchedPaymentId?: string;
      matchedVendorId?: string;
      expenseCategoryId?: string;
      reviewNote?: string;
    },
  ) {
    return this.svc.reconcileTransaction(id, req.user.id, body);
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  /** GET /bank-statement/sessions?accountNumber= */
  @Get('sessions')
  listSessions(@Query('accountNumber') accountNumber?: string) {
    return this.svc.listSessions(accountNumber);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  /** GET /bank-statement/summary?accountNumber=&fromDate=&toDate= */
  @Get('summary')
  getSummary(
    @Query('accountNumber') accountNumber?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.svc.getSummary({ accountNumber, fromDate, toDate });
  }

  // ── Re-run matching ────────────────────────────────────────────────────────

  /** POST /bank-statement/rematch */
  @Post('rematch')
  reRunAutoMatch(@Query('accountNumber') accountNumber?: string) {
    return this.svc.reRunAutoMatch(accountNumber);
  }

  // ── Vendor Keywords ────────────────────────────────────────────────────────

  /** GET /bank-statement/vendor-keywords */
  @Get('vendor-keywords')
  listVendorKeywords() {
    return this.svc.listVendorKeywords();
  }

  /** POST /bank-statement/vendor-keywords */
  @Post('vendor-keywords')
  upsertVendorKeyword(@Body() body: { keyword: string; vendorId: string }) {
    return this.svc.upsertVendorKeyword(body.keyword, body.vendorId);
  }

  /** DELETE /bank-statement/vendor-keywords/:id */
  @Delete('vendor-keywords/:id')
  deleteVendorKeyword(@Param('id') id: string) {
    return this.svc.deleteVendorKeyword(id);
  }

  // ── Expense Categories ─────────────────────────────────────────────────────

  /** GET /bank-statement/expense-categories */
  @Get('expense-categories')
  listExpenseCategories() {
    return this.svc.listExpenseCategories();
  }

  /** POST /bank-statement/expense-categories */
  @Post('expense-categories')
  createExpenseCategory(@Body() body: { name: string; description?: string }) {
    return this.svc.createExpenseCategory(body.name, body.description);
  }

  /** POST /bank-statement/expense-keywords */
  @Post('expense-keywords')
  upsertExpenseKeyword(@Body() body: { keyword: string; categoryId: string }) {
    return this.svc.upsertExpenseKeyword(body.keyword, body.categoryId);
  }

  /** DELETE /bank-statement/expense-keywords/:id */
  @Delete('expense-keywords/:id')
  deleteExpenseKeyword(@Param('id') id: string) {
    return this.svc.deleteExpenseKeyword(id);
  }

  // ── Employee (User) Keywords ───────────────────────────────────────────────
  // Same idea as Vendor Keywords, but auto-tags a DR transaction as a user's
  // salary payment instead. See bank-statement.service.ts §8.5.

  /** GET /bank-statement/users — active users, for the keyword-target dropdown */
  @Get('users')
  listUsers() {
    return this.svc.listUsers();
  }

  /** GET /bank-statement/user-keywords */
  @Get('user-keywords')
  listUserPaymentKeywords() {
    return this.svc.listUserPaymentKeywords();
  }

  /** POST /bank-statement/user-keywords */
  @Post('user-keywords')
  upsertUserPaymentKeyword(@Body() body: { keyword: string; userId: string }) {
    return this.svc.upsertUserPaymentKeyword(body.keyword, body.userId);
  }

  /** DELETE /bank-statement/user-keywords/:id */
  @Delete('user-keywords/:id')
  deleteUserPaymentKeyword(@Param('id') id: string) {
    return this.svc.deleteUserPaymentKeyword(id);
  }
}
