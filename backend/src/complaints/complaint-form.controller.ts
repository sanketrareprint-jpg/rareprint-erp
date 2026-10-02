// backend/src/complaints/complaint-form.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';

// Public — no JWT guard. Customers reach this from the link in their order
// status WhatsApp; access is gated by the signed per-order token, same
// pattern as the HR agreement and invoice PDF links.
@Controller('complaint-form')
export class ComplaintFormController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  getForm(@Query('t') token: string) {
    return this.complaintsService.getComplaintForm(token);
  }

  @Post()
  submit(@Query('t') token: string, @Body() body: { type?: unknown; category?: unknown; description?: unknown }) {
    return this.complaintsService.submitComplaintForm(token, body);
  }
}
