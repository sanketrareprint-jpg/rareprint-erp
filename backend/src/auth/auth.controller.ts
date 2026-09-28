import { Body, Controller, Get, Post, Req } from '@nestjs/common';
// `import type` matters: Request appears in a decorated method signature, and
// with isolatedModules + emitDecoratorMetadata a value import there is a
// TS1272 error (the same one already littering this project's typecheck).
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class RegisterDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  // Optional — defaults to SALES_AGENT if omitted (see AuthService.register).
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // Whether this deployment has no users yet, i.e. whether the next account
  // created becomes the bootstrap administrator. Public on purpose: the
  // signup screen has to know which form to render before anyone has signed
  // in. Returns one boolean and nothing else.
  @Get('registration-status')
  async registrationStatus() {
    return this.authService.registrationStatus();
  }

  // Administrator-only, apart from the bootstrap case (an empty User table),
  // which is enforced in AuthService.register. Not behind a route guard
  // because the endpoint legitimately has to serve unauthenticated callers on
  // a brand-new instance — so the bearer token is optional here and verified
  // in the service.
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const authHeader = req.headers.authorization ?? '';
    const requesterToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    return this.authService.register(dto.fullName, dto.email, dto.password, dto.role, requesterToken);
  }

  // Public — no JwtAuthGuard on this controller. Always returns { sent: true }
  // regardless of whether the email exists, to avoid leaking account existence.
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const origin = this.config.get<string>('FRONTEND_ORIGIN') ?? 'https://rareprint-erp.vercel.app';
    return this.authService.requestPasswordReset(dto.email, origin);
  }

  // Public — access is gated by possession of the emailed token, same
  // pattern as the HR agreement accept link.
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
