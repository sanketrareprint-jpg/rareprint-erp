// backend/src/events/events.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { EventsService } from './events.service';

type JwtUser = { id: string; role: string };

@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  // ── Flyer templates ──

  @Post('templates')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  createTemplate(
    @Body() body: { name: string; occasionType: string; fields: string },
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.createTemplate({ name: body.name, occasionType: body.occasionType, fields: body.fields, file, userId: req.user.id });
  }

  @Get('templates')
  @UseGuards(AuthGuard('jwt'))
  listTemplates(@Query('occasionType') occasionType?: string) {
    return this.service.listTemplates(occasionType);
  }

  @Get('templates/:id')
  @UseGuards(AuthGuard('jwt'))
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @Patch('templates/:id')
  @UseGuards(AuthGuard('jwt'))
  updateTemplate(@Param('id') id: string, @Body() body: { name?: string; fields?: unknown; isActive?: boolean }) {
    return this.service.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  @UseGuards(AuthGuard('jwt'))
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  @Post('templates/:id/preview')
  @UseGuards(AuthGuard('jwt'))
  async previewTemplate(@Param('id') id: string, @Body() body: { values?: Record<string, string>; photoDataUrl?: string }, @Res() res: Response) {
    const buffer = await this.service.previewTemplate(id, body?.values ?? {}, body?.photoDataUrl);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline; filename="preview.jpg"');
    res.send(buffer);
  }

  // ── People ──

  @Post('people')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  createPerson(
    @Body() body: { name: string; whatsappNumber: string; relation?: string; dob?: string; anniversaryDate?: string; notes?: string },
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.createPerson({ ...body, file, userId: req.user.id });
  }

  @Get('people')
  @UseGuards(AuthGuard('jwt'))
  listPeople() {
    return this.service.listPeople();
  }

  @Get('people/:id')
  @UseGuards(AuthGuard('jwt'))
  getPerson(@Param('id') id: string) {
    return this.service.getPerson(id);
  }

  @Patch('people/:id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  updatePerson(
    @Param('id') id: string,
    @Body() body: { name?: string; whatsappNumber?: string; relation?: string; dob?: string; anniversaryDate?: string; notes?: string; isActive?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.updatePerson(id, {
      ...body,
      isActive: body.isActive === undefined ? undefined : body.isActive === 'true',
      file,
    });
  }

  @Delete('people/:id')
  @UseGuards(AuthGuard('jwt'))
  deletePerson(@Param('id') id: string) {
    return this.service.deletePerson(id);
  }

  @Post('people/:id/send-test')
  @UseGuards(AuthGuard('jwt'))
  sendTest(@Param('id') id: string, @Body() body: { occasionType: string; templateId?: string }) {
    return this.service.sendTestWish(id, body.occasionType, body.templateId);
  }

  // ── Festivals ──
  // isRecurring defaults true (month/day, fires every year) when omitted;
  // pass isRecurring:false + oneTimeDate for a one-off custom-date festival.

  @Post('festivals')
  @UseGuards(AuthGuard('jwt'))
  createFestival(
    @Body() body: { name: string; isRecurring?: boolean; month?: number; day?: number; oneTimeDate?: string; templateId?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.createFestival({ ...body, userId: req.user.id });
  }

  @Get('festivals')
  @UseGuards(AuthGuard('jwt'))
  listFestivals() {
    return this.service.listFestivals();
  }

  @Patch('festivals/:id')
  @UseGuards(AuthGuard('jwt'))
  updateFestival(
    @Param('id') id: string,
    @Body() body: { name?: string; isRecurring?: boolean; month?: number; day?: number; oneTimeDate?: string; templateId?: string | null; isActive?: boolean },
  ) {
    return this.service.updateFestival(id, body);
  }

  @Delete('festivals/:id')
  @UseGuards(AuthGuard('jwt'))
  deleteFestival(@Param('id') id: string) {
    return this.service.deleteFestival(id);
  }

  // ── Brand profile (logo/firm name/address/phone/products — set once,
  // reused by every template's BRAND_LOGO/BRAND_TEXT fields) ──

  @Get('brand-profile')
  @UseGuards(AuthGuard('jwt'))
  getBrandProfile() {
    return this.service.getBrandProfile();
  }

  @Patch('brand-profile')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: 8 * 1024 * 1024 } }))
  updateBrandProfile(
    @Body() body: { firmName?: string; address?: string; phone?: string; email?: string; website?: string; products?: string },
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.updateBrandProfile({ ...body, file, userId: req.user.id });
  }

  // ── History ──

  @Get('logs')
  @UseGuards(AuthGuard('jwt'))
  listLogs(@Query('personId') personId?: string, @Query('limit') limit?: string) {
    return this.service.listLogs({ personId, limit: limit ? Number(limit) : undefined });
  }

  // ── Public flyer image — fetched by AiSensy itself, no login, so NOT
  // guarded like every route above. Access is instead controlled by the
  // short-lived signed token in the query string (see
  // EventsService.signPublicToken / verifyPublicToken), the same scheme
  // BillingController's GET invoices/:id/pdf/public route already uses. ──

  @Get('flyer/:id')
  async getFlyerImage(@Param('id') id: string, @Query('token') token: string, @Query('expires') expires: string, @Res() res: Response) {
    if (!this.service.verifyPublicToken(id, token, expires)) {
      res.status(403).send('Invalid or expired link');
      return;
    }
    const buffer = await this.service.getFlyerImageForPublicRoute(id);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
