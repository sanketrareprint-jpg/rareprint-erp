// backend/src/billing/billing.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { BillingService } from './billing.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

function contentDispositionFilename(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('invoices')
  listInvoices(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.billingService.listInvoices({ from, to, customerId, status, search });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('invoices/:id/pdf')
  async downloadInvoicePdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.billingService.generateInvoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionFilename(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  // Unauthenticated but token-gated — this is the URL handed to AiSensy for
  // WhatsApp document attachment (see BillingService.shareInvoiceViaWhatsapp).
  // A short-lived signed token stands in for the normal JWT guard since
  // AiSensy's servers can't send our app's auth headers.
  @Get('invoices/:id/pdf/public')
  async downloadInvoicePdfPublic(@Param('id') id: string, @Query('token') token: string, @Res() res: Response) {
    if (!this.billingService.verifyPublicToken(id, token)) {
      res.status(403).json({ message: 'Invalid or expired link' });
      return;
    }
    const { buffer, filename } = await this.billingService.generateInvoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionFilename(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('invoices/:id/share-whatsapp')
  shareInvoiceViaWhatsapp(@Param('id') id: string) {
    return this.billingService.shareInvoiceViaWhatsapp(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('parties')
  listParties() {
    return this.billingService.listParties();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('parties/:customerId/statement')
  getPartyStatement(@Param('customerId') customerId: string) {
    return this.billingService.getPartyLedger(customerId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('parties/:customerId/statement/pdf')
  async downloadPartyStatementPdf(@Param('customerId') customerId: string, @Res() res: Response) {
    const { buffer, filename } = await this.billingService.generatePartyStatementPdf(customerId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionFilename(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('company-profile')
  getCompanyProfile() {
    return this.billingService.getCompanyProfile();
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('company-profile')
  updateCompanyProfile(@Body() dto: UpdateCompanyProfileDto) {
    return this.billingService.updateCompanyProfile(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('company-profile/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateLogo(@UploadedFile() file: Express.Multer.File) {
    return this.billingService.updateLogo(file);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('company-profile/signature')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateSignature(@UploadedFile() file: Express.Multer.File) {
    return this.billingService.updateSignature(file);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('gst-summary')
  getGstSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.billingService.getGstSummary(from, to);
  }
}
