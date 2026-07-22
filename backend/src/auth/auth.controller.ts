import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
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
