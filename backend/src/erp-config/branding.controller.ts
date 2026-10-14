import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ErpConfigService } from './erp-config.service';

// App name + logo shown in the app shell and on the login pages.
// Kept apart from ErpConfigController because that one requires a signed-in
// user on every route, and GET here must be public: the login page has to
// show the right name before anyone has signed in. Only ADMIN can change it.
@Controller('branding')
export class BrandingController {
  constructor(private readonly erpConfig: ErpConfigService) {}

  // Public on purpose. Returns only the display name and logo — nothing else.
  @Get()
  getBranding() {
    return this.erpConfig.getBranding();
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('name')
  setName(@Req() req: any, @Body() body: { appName?: unknown }) {
    this.assertAdmin(req);
    return this.erpConfig.setBrandingName(body?.appName ?? null);
  }

  // The interceptor's limit is only a hard ceiling; the real 300 KB rule is
  // checked in the service so the admin gets a clear message, not a bare 413.
  @UseGuards(AuthGuard('jwt'))
  @Post('logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  setLogo(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    this.assertAdmin(req);
    // A missing file must not fall through to "clear the logo".
    if (!file) throw new BadRequestException('No file uploaded');
    return this.erpConfig.setBrandingLogo(file);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('logo')
  clearLogo(@Req() req: any) {
    this.assertAdmin(req);
    return this.erpConfig.setBrandingLogo(null);
  }

  private assertAdmin(req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can change the app name and logo');
    }
  }
}
