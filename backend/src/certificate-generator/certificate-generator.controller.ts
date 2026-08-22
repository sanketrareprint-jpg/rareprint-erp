// backend/src/certificate-generator/certificate-generator.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CertificateGeneratorService } from './certificate-generator.service';

type JwtUser = { id: string; role: string };

@Controller('certificate-generator')
@UseGuards(AuthGuard('jwt'))
export class CertificateGeneratorController {
  constructor(private readonly service: CertificateGeneratorService) {}

  // ── Templates ──

  @Post('templates')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  createTemplate(
    @Body() body: { name: string; widthIn: string; heightIn: string; dpi?: string; fields: string },
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.createTemplate({
      name: body.name,
      widthIn: Number(body.widthIn),
      heightIn: Number(body.heightIn),
      dpi: body.dpi ? Number(body.dpi) : undefined,
      fields: body.fields,
      file,
      userId: req.user.id,
    });
  }

  @Get('templates')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.service.getTemplate(id);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: { name?: string; fields?: unknown }) {
    return this.service.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.service.deleteTemplate(id);
  }

  @Post('templates/:id/preview')
  async previewCertificate(@Param('id') id: string, @Body() body: { values: Record<string, string> }, @Res() res: Response) {
    const buffer = await this.service.previewCertificate(id, body?.values ?? {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(buffer);
  }

  // ── Jobs: upload → map → validate → generate → download ──

  @Post('jobs')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  createJob(
    @Body() body: { templateId: string },
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.service.createJobFromUpload({ templateId: body.templateId, file, userId: req.user.id });
  }

  @Post('jobs/:id/validate')
  previewValidation(@Param('id') id: string, @Body() body: { columnMapping: Record<string, string> }) {
    return this.service.previewValidation(id, body?.columnMapping);
  }

  @Post('jobs/:id/generate')
  startGeneration(
    @Param('id') id: string,
    @Body() body: { columnMapping: Record<string, string>; sheetSettings?: unknown; invalidRowMode?: 'SKIP' | 'BLANK' },
  ) {
    return this.service.startGeneration(id, body);
  }

  @Get('jobs/:id')
  getJobStatus(@Param('id') id: string) {
    return this.service.getJobStatus(id);
  }

  @Get('jobs/:id/download')
  async downloadJob(@Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.service.downloadJob(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
