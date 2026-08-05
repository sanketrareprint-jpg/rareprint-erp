import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GmailDraftService } from '../production/gmail-draft.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

type JwtUserPayload = {
  sub: string;
  email: string;
  role: string;
};

type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly gmail: GmailDraftService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let passwordOk = false;
    try {
      passwordOk = await bcrypt.compare(password, user.passwordHash);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    user: { id: string; fullName: string; email: string; role: string };
  }> {
    const user = await this.validateUser(email, password);

    const payload: JwtUserPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ── Sign up ──────────────────────────────────────────────────────────────
  // Creates the account and returns the same shape as login() so the signup
  // form can log the person straight in. Defaults to SALES_AGENT when no role
  // is given — the least-privileged role, rather than silently granting ADMIN.
  async register(
    fullName: string,
    email: string,
    password: string,
    role?: UserRole,
  ): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    user: { id: string; fullName: string; email: string; role: string };
  }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: role ?? UserRole.SALES_AGENT,
      },
    });

    const payload: JwtUserPayload = { sub: user.id, email: user.email, role: user.role };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    };
  }

  // ── Forgot password (tokenized reset link, mirrors the HR agreement flow) ──

  async requestPasswordReset(email: string, frontendOrigin: string): Promise<{ sent: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always report success even if the account doesn't exist or is
    // inactive — otherwise this endpoint becomes a way to enumerate which
    // emails have accounts.
    if (!user || !user.isActive) {
      return { sent: true };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    const link = `${frontendOrigin.replace(/\/$/, '')}/reset-password/${token}`;
    const body =
      `Hi ${user.fullName},\n\n` +
      `We received a request to reset your RarePrint ERP password. Click the link below to set a new one:\n\n` +
      `${link}\n\n` +
      `This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
      `Regards,\nRarePrint`;

    // Send first, persist second — if Gmail fails we must not store a
    // token the user was never actually able to see.
    await this.gmail.sendMail(user.email, 'Reset your RarePrint ERP password', body);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
    });

    return { sent: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { passwordResetToken: token } });

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
    });

    return { success: true };
  }
}
