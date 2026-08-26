// backend/src/policies/policies.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PoliciesService } from './policies.service';

type JwtUser = { id: string; role: string; email: string };

@UseGuards(AuthGuard('jwt'))
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  /** Open to every authenticated user. ?module=PRODUCTION filters to policies tagged for that module. */
  @Get()
  list(@Query('module') moduleTag?: string) {
    return this.policiesService.list(moduleTag);
  }

  /** Super-admin only: management page — includes inactive policies. */
  @Get('admin')
  listAllForAdmin(@Req() req: Request & { user: JwtUser }) {
    return this.policiesService.listAllForAdmin(req.user);
  }

  @Post()
  create(
    @Body() body: { title: string; content: string; modules?: string[] },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.policiesService.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; modules?: string[]; isActive?: boolean },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.policiesService.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.policiesService.remove(id, req.user);
  }
}
