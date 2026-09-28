import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GmailDraftService } from '../production/gmail-draft.service';
import { isOwnerEmail } from '../common/super-admin';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Account creation is administrator-only. There is no open self-signup: the
// previous behaviour let anyone who found the URL create a working account
// (and pick their own role) on any deployment, which on a SaaS customer's
// instance means a stranger with a login to their ERP.
//
// The one exception is bootstrapping. A freshly provisioned customer's
// database has no users at all, so there is no administrator who could
// create the first one. While the User table is empty, the first account
// created is allowed through and is forced to ADMIN — see register().
//
// An earlier fix here restricted which roles self-signup could request
// (ADMIN was excluded) after it was found exploitable end-to-end against
// demo-test-co on 2026-09-19: the frontend hid ADMIN from its dropdown, but
// the endpoint accepted role:"ADMIN" posted directly. That list is gone
// because it no longer applies — an authenticated administrator is allowed
// to create any role, including another administrator, and nobody else can
// create anything. The role a request asks for is still never trusted on the
// bootstrap path, where it is ignored entirely.

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

  // ── Registration status ──────────────────────────────────────────────────
  /**
   * Whether this deployment still has no users, i.e. whether the next
   * account created will be the bootstrap administrator. The signup screen
   * reads this to decide whether to show an open form or demand an
   * administrator's session.
   *
   * Deliberately says nothing beyond that one boolean — no counts, no
   * emails — so it can safely stay public.
   */
  async registrationStatus(): Promise<{ open: boolean }> {
    return { open: (await this.prisma.user.count()) === 0 };
  }

  // ── Create an account ────────────────────────────────────────────────────
  /**
   * Administrator-only, except when bootstrapping an empty instance.
   *
   * `requesterToken` is the raw bearer token of whoever is calling, when
   * there is one. It is verified here rather than by a route guard because
   * this endpoint has to serve both cases: an unauthenticated call is
   * legitimate on an empty database and forbidden on every other.
   *
   * Returns an accessToken ONLY on the bootstrap path, where the person who
   * just created the account is the one who should be signed in. When an
   * administrator creates an account for somebody else, issuing a token
   * would replace the administrator's own session with the new user's.
   */
  async register(
    fullName: string,
    email: string,
    password: string,
    role?: UserRole,
    requesterToken?: string,
  ): Promise<{
    bootstrap: boolean;
    accessToken?: string;
    tokenType?: 'Bearer';
    user: { id: string; fullName: string; email: string; role: string };
  }> {
    // Counted before anything else: this is what decides whether the call is
    // a legitimate bootstrap or needs an administrator behind it.
    const isBootstrap = (await this.prisma.user.count()) === 0;

    let effectiveRole: UserRole;
    if (isBootstrap) {
      // The requested role is ignored, not validated. Whoever creates the
      // first account on an empty instance becomes its administrator, and
      // the alternative — honouring a requested role — would leave the
      // instance with a first user who cannot create anybody else.
      effectiveRole = UserRole.ADMIN;
    } else {
      await this.assertRequesterCanCreateUsers(requesterToken);
      effectiveRole = role ?? UserRole.SALES_AGENT;
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { fullName, email, passwordHash, role: effectiveRole },
    });

    const created = { id: user.id, fullName: user.fullName, email: user.email, role: user.role };
    if (!isBootstrap) {
      return { bootstrap: false, user: created };
    }

    const payload: JwtUserPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      bootstrap: true,
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: created,
    };
  }

  /**
   * Throws unless `token` belongs to an active administrator (or the owner
   * account). The role is re-read from the database rather than trusted from
   * the token, so demoting or deactivating somebody takes effect immediately
   * instead of when their 90-day token happens to expire.
   */
  private async assertRequesterCanCreateUsers(token?: string): Promise<void> {
    if (!token) {
      throw new UnauthorizedException(
        'Creating an account requires an administrator. Please sign in as an administrator first.',
      );
    }

    let payload: JwtUserPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtUserPayload>(token);
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, role: true, isActive: true },
    });
    if (!requester || !requester.isActive) {
      throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    }

    if (requester.role !== UserRole.ADMIN && !isOwnerEmail(requester.email)) {
      throw new ForbiddenException('Only an administrator can create user accounts.');
    }
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
