import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from '../common/tenant';

export interface CreateRuleDto {
  ruleCode: string;
  module: string;
  title: string;
  description: string;
  example: string;
  severity: string;
  testedBy?: string;
  active?: boolean;
}

export interface UpdateRuleDto extends Partial<CreateRuleDto> {}

@Injectable()
export class BusinessRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.businessRule.findMany({
      orderBy: [{ module: 'asc' }, { ruleCode: 'asc' }],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.businessRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  async create(dto: CreateRuleDto) {
    const existing = await this.prisma.businessRule.findUnique({
      where: { tenantId_ruleCode: { tenantId: DEFAULT_TENANT_ID, ruleCode: dto.ruleCode } },
    });
    if (existing) throw new ConflictException(`Rule code "${dto.ruleCode}" already exists`);

    return this.prisma.businessRule.create({ data: { ...dto, tenantId: DEFAULT_TENANT_ID } });
  }

  async update(id: string, dto: UpdateRuleDto) {
    await this.findOne(id); // throws if not found
    return this.prisma.businessRule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id); // throws if not found
    return this.prisma.businessRule.delete({ where: { id } });
  }

  async seed(rules: CreateRuleDto[]) {
    let created = 0;
    let skipped = 0;
    for (const rule of rules) {
      const exists = await this.prisma.businessRule.findUnique({
        where: { tenantId_ruleCode: { tenantId: DEFAULT_TENANT_ID, ruleCode: rule.ruleCode } },
      });
      if (!exists) {
        await this.prisma.businessRule.create({ data: { ...rule, tenantId: DEFAULT_TENANT_ID } });
        created++;
      } else {
        skipped++;
      }
    }
    return { created, skipped };
  }
}
