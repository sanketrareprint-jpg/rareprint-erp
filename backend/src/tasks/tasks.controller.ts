import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TaskPriority, TaskStatus } from '@prisma/client';
import type { Request } from 'express';
import { TasksService } from './tasks.service';

type JwtUser = { id: string; role: string };

@Controller('tasks')
@UseGuards(AuthGuard('jwt'))
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(
    @Req() req: Request & { user: JwtUser },
    @Query('view') view = 'assigned',
    @Query('status') status?: TaskStatus | 'ALL',
  ) {
    return this.tasksService.list(req.user, view, status);
  }

  @Get('users')
  users() {
    return this.tasksService.listAssignableUsers();
  }

  @Post()
  create(
    @Req() req: Request & { user: JwtUser },
    @Body() body: {
      title: string;
      description?: string;
      assignedToId?: string;
      dueDate?: string;
      priority?: TaskPriority;
    },
  ) {
    return this.tasksService.create(req.user.id, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
    @Body() body: {
      title?: string;
      description?: string | null;
      assignedToId?: string;
      dueDate?: string | null;
      priority?: TaskPriority;
      status?: TaskStatus;
    },
  ) {
    return this.tasksService.update(id, req.user, body);
  }
}
