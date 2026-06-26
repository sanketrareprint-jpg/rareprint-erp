import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BusinessRulesService, CreateRuleDto, UpdateRuleDto } from './business-rules.service';
import { BUSINESS_RULES_SEED } from './business-rules.seed';

@Controller('business-rules')
@UseGuards(AuthGuard('jwt'))
export class BusinessRulesController {
  constructor(private readonly svc: BusinessRulesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: CreateRuleDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  /** One-time seed — call once after migration to populate the 13 default rules */
  @Post('seed')
  seed() {
    return this.svc.seed(BUSINESS_RULES_SEED);
  }
}
