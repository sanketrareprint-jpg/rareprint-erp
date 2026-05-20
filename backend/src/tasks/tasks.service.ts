import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type JwtUser = { id: string; role: string };

const ADMIN_ROLES = new Set(['ADMIN']);

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private taskSelect() {
    return {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      createdBy: { select: { id: true, fullName: true, role: true } },
      assignedTo: { select: { id: true, fullName: true, role: true } },
    } satisfies Prisma.TaskSelect;
  }

  async list(user: JwtUser, view: string, status?: TaskStatus | 'ALL') {
    const where: Prisma.TaskWhereInput = {};
    if (status && status !== 'ALL') where.status = status;

    if (view === 'created') {
      where.createdById = user.id;
    } else if (view === 'all' && ADMIN_ROLES.has(user.role)) {
      // Admin can see all tasks.
    } else {
      where.assignedToId = user.id;
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      select: this.taskSelect(),
      take: 300,
    });
  }

  async listAssignableUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, email: true, role: true },
    });
  }

  async create(createdById: string, body: {
    title: string;
    description?: string;
    assignedToId?: string;
    dueDate?: string;
    priority?: TaskPriority;
  }) {
    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Task title is required');

    const assignedToId = body.assignedToId || createdById;
    const assignee = await this.prisma.user.findFirst({ where: { id: assignedToId, isActive: true } });
    if (!assignee) throw new BadRequestException('Assigned user not found');

    return this.prisma.task.create({
      data: {
        title,
        description: body.description?.trim() || null,
        assignedToId,
        createdById,
        priority: body.priority ?? TaskPriority.NORMAL,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
      select: this.taskSelect(),
    });
  }

  async update(id: string, user: JwtUser, body: {
    title?: string;
    description?: string | null;
    assignedToId?: string;
    dueDate?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (!ADMIN_ROLES.has(user.role) && task.createdById !== user.id && task.assignedToId !== user.id) {
      throw new ForbiddenException('You can update only your assigned or created tasks');
    }

    const data: Prisma.TaskUpdateInput = {};
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) throw new BadRequestException('Task title is required');
      data.title = title;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assignedToId !== undefined) {
      const assignee = await this.prisma.user.findFirst({ where: { id: body.assignedToId, isActive: true } });
      if (!assignee) throw new BadRequestException('Assigned user not found');
      data.assignedTo = { connect: { id: body.assignedToId } };
    }
    if (body.status !== undefined) {
      data.status = body.status;
      data.completedAt = body.status === TaskStatus.DONE ? new Date() : null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
      select: this.taskSelect(),
    });
  }
}
