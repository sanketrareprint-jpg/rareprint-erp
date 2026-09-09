// backend/src/policies/policies.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Same super-admin convention already used in orders.service.ts / accounts.service.ts.
const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';

interface JwtUser {
  id: string;
  email: string;
}

interface PolicyInput {
  title: string;
  content: string;
  modules?: string[];
}

@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSuperAdmin(user: JwtUser) {
    if (user.email !== SUPER_ADMIN_EMAIL) {
      throw new ForbiddenException('Only the super-admin can manage policies');
    }
  }

  /** Open to every authenticated user. Only active policies; optionally filtered
   *  to those tagged for a given module (an empty `modules` array on a policy
   *  means "show everywhere", so it always matches). */
  async list(moduleTag?: string) {
    const policies = await this.prisma.policyDocument.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true } } },
    });
    if (!moduleTag) return policies;
    return policies.filter((p) => p.modules.length === 0 || p.modules.includes(moduleTag));
  }

  /** Super-admin only: full list including inactive, for the management page. */
  async listAllForAdmin(user: JwtUser) {
    this.assertSuperAdmin(user);
    return this.prisma.policyDocument.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  async create(body: PolicyInput, user: JwtUser) {
    this.assertSuperAdmin(user);
    if (!body.title?.trim()) throw new BadRequestException('Title is required');
    if (!body.content?.trim()) throw new BadRequestException('Content is required');
    return this.prisma.policyDocument.create({
      data: {
        title: body.title.trim(),
        content: body.content,
        modules: body.modules ?? [],
        createdById: user.id,
      },
    });
  }

  async update(id: string, body: Partial<PolicyInput> & { isActive?: boolean }, user: JwtUser) {
    this.assertSuperAdmin(user);
    const existing = await this.prisma.policyDocument.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Policy not found');
    return this.prisma.policyDocument.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.modules !== undefined ? { modules: body.modules } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
  }

  async remove(id: string, user: JwtUser) {
    this.assertSuperAdmin(user);
    const existing = await this.prisma.policyDocument.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Policy not found');
    await this.prisma.policyDocument.delete({ where: { id } });
    return { success: true };
  }
}
