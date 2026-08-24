// backend/src/events/events.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { EventsService } from './events.service';

type JwtUser = { id: string; role: string };
const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  // ── Contacts ──

  @UseGuards(AuthGuard('jwt'))
  @Post('contacts')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  createContact(@Body() body: Record<string, string>, @UploadedFile() file: Express.Multer.File, @Req() req: Request & { user: JwtUser }) {
    return this.service.createContact(body, file, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('contacts')
  listContacts(@Query('search') search?: string) {
    return this.service.listContacts(search);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('contacts/:id')
  getContact(@Param('id') id: string) {
    return this.service.getContact(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('contacts/:id')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  updateContact(@Param('id') id: string, @Body() body: Record<string, string>, @UploadedFile() file: Express.Multer.File) {
    return this.service.updateContact(id, body, file);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('contacts/:id')
  deleteContact(@Param('id') id: string) {
    return this.service.deleteContact(id);
  }

  // ── Templates ──

  @UseGuards(AuthGuard('jwt'))
  @Post('templates')
  @UseInterceptors(FileInterceptor('background', { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  createTemplate(@Body() body: Record<string, string>, @UploadedFile() file: Express.Multer.File, @Req() req: Request & { user: JwtUser }) {
    return this.service.createTemplate(body, file, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('templates')
  listTemplates(@Query('occasionType') occasionType?: string) {
    return this.service.listTemplates(occasionType);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('templates/:id')
  @UseInterceptors(FileInterceptor('background', { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  updateTemplate(@Param('id') id: string, @Body() body: Record<string, string>, @UploadedFile() file: Express.Multer.File) {
    return this.service.updateTemplate(id, body, file);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('templates/:id/preview')
  async previewTemplate(@Param('id') id: string, @Body() body: { contactId?: string }, @Res() res: Response) {
    const buffer = await this.service.previewFlyer(id, body?.contactId);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  // ── Festivals ──

  @UseGuards(AuthGuard('jwt'))
  @Post('festivals')
  createFestival(@Body() body: { name: string; month: string; day: string; templateId: string }, @Req() req: Request & { user: JwtUser }) {
    return this.service.createFestival(body, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('festivals')
  listFestivals() {
    return this.service.listFestivals();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('festivals/:id')
  updateFestival(@Param('id') id: string, @Body() body: { name?: string; month?: string; day?: string; templateId?: string; isActive?: boolean }) {
    return this.service.updateFestival(id, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('festivals/:id')
  deleteFestival(@Param('id') id: string) {
    return this.service.deleteFestival(id);
  }

  // ── Sending ──

  @UseGuards(AuthGuard('jwt'))
  @Post('contacts/:id/send-now')
  sendNow(@Param('id') id: string, @Body() body: { occasionType: 'BIRTHDAY' | 'ANNIVERSARY' | 'FESTIVAL'; festivalId?: string }, @Req() req: Request & { user: JwtUser }) {
    return this.service.sendNow(id, body.occasionType, body.festivalId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('contacts/:id/send-test')
  sendTest(@Param('id') id: string, @Body() body: { occasionType: 'BIRTHDAY' | 'ANNIVERSARY' | 'FESTIVAL'; festivalId?: string }, @Req() req: Request & { user: JwtUser }) {
    return this.service.sendTest(id, body.occasionType, body.festivalId, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('run-now')
  runNow() {
    return this.service.triggerDailyCheckNow();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('messages')
  listMessages(
    @Query('status') status?: string,
    @Query('occasionType') occasionType?: string,
    @Query('contactId') contactId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.service.listMessages({ status, occasionType, contactId, skip: skip ? Number(skip) : undefined, take: take ? Number(take) : undefined });
  }

  // Unauthenticated but token-gated — this is the URL handed to AiSensy for
  // the WhatsApp image attachment (see EventsService.buildPublicImageUrl).
  // Same pattern as billing.controller.ts's invoices/:id/pdf/public.
  @Get('messages/:id/image/public')
  async getMessageImagePublic(@Param('id') id: string, @Query('token') token: string, @Res() res: Response) {
    if (!this.service.verifyPublicToken(id, token)) {
      res.status(403).json({ message: 'Invalid or expired link' });
      return;
    }
    const buffer = await this.service.getMessageImageBuffer(id);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
