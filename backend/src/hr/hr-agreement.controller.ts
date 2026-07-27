// backend/src/hr/hr-agreement.controller.ts
//
// Public, unauthenticated endpoints for the digital HR agreement acceptance
// page. Deliberately a separate controller (no JwtAuthGuard) from
// HrController — the employee opening this link has no login account.
// Access is gated purely by possession of the random token, not a session.
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { HrService } from './hr.service';

@Controller('hr/agreement')
export class HrAgreementController {
  constructor(private readonly svc: HrService) {}

  @Get(':token')
  getAgreement(@Param('token') token: string) {
    return this.svc.getAgreementByToken(token);
  }

  // Accept is multipart/form-data now: the employee must attach a scan/photo
  // of their ID proof alongside the typed signature. Stored as a base64 data
  // URI in the existing idProofDocUrl field (same convention as the
  // admin-side photo upload — see hr.controller.ts's uploadPhoto).
  @Post(':token/accept')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  acceptAgreement(
    @Param('token') token: string,
    @Body() dto: { signatureName: string },
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new ForbiddenException('Please attach a scan or photo of your ID proof (field: file)');
    const isPdf = file.mimetype === 'application/pdf';
    if (!file.mimetype?.startsWith('image/') && !isPdf) {
      throw new ForbiddenException('Only image or PDF files are allowed for ID proof');
    }
    const idProofDocUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.svc.acceptAgreement(token, { signatureName: dto?.signatureName, ip, idProofDocUrl });
  }
}
