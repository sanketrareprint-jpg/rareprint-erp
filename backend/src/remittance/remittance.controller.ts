// backend/src/remittance/remittance.controller.ts
import {
  Body, Controller, Get, Param, Patch, Post,
  Query, Request, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { RemittanceMatchStatus } from '@prisma/client';
import { RemittanceService } from './remittance.service';

type JwtUser = { id: string };

@Controller('remittance')
@UseGuards(AuthGuard('jwt'))
export class RemittanceController {
  constructor(private readonly svc: RemittanceService) {}

  // ── Import ─────────────────────────────────────────────────────────────────

  /** POST /remittance/import  (multipart fields: "remittanceFile" required, "deliveredOrdersFile" optional) */
  @Post('import')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'remittanceFile', maxCount: 1 },
        { name: 'deliveredOrdersFile', maxCount: 1 },
      ],
      { limits: { fileSize: 20 * 1024 * 1024 } },
    ),
  )
  async import(
    @UploadedFiles() files: { remittanceFile?: Express.Multer.File[]; deliveredOrdersFile?: Express.Multer.File[] },
    @Request() req: { user: JwtUser },
  ) {
    const remittanceFile = files?.remittanceFile?.[0];
    const deliveredFile = files?.deliveredOrdersFile?.[0];
    if (!remittanceFile) throw new Error('Remittance report file is required (field: remittanceFile)');
    return this.svc.importReports(
      remittanceFile.buffer,
      remittanceFile.originalname,
      deliveredFile?.buffer ?? null,
      deliveredFile?.originalname ?? null,
      req.user.id,
    );
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  @Get('sessions')
  listSessions() {
    return this.svc.listSessions();
  }

  // ── Records ────────────────────────────────────────────────────────────────

  @Get('records')
  listRecords(
    @Query('sessionId') sessionId?: string,
    @Query('matchStatus') matchStatus?: RemittanceMatchStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listRecords({
      sessionId,
      matchStatus,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('summary')
  getSummary(@Query('sessionId') sessionId?: string) {
    return this.svc.getSummary(sessionId);
  }

  @Get('order-search')
  searchOrders(@Query('q') q: string) {
    return this.svc.searchOrdersForMatch(q ?? '');
  }

  @Patch('records/:id/match')
  manualMatch(
    @Param('id') id: string,
    @Body() body: { orderId: string },
    @Request() req: { user: JwtUser },
  ) {
    return this.svc.manualMatch(id, body.orderId, req.user.id);
  }

  @Patch('records/:id/reject')
  reject(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.rejectRecord(id, body.note ?? '');
  }

  @Post('records/:id/post')
  postOne(
    @Param('id') id: string,
    @Body() body: { amount?: number },
    @Request() req: { user: JwtUser },
  ) {
    return this.svc.postRecord(id, req.user.id, body?.amount);
  }

  @Post('records/post-batch')
  postBatch(
    @Body() body: { recordIds: string[] },
    @Request() req: { user: JwtUser },
  ) {
    return this.svc.postBatch(body.recordIds ?? [], req.user.id);
  }
}
