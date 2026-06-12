import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

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
}
