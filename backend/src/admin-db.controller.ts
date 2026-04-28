import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('admin/db')
export class AdminDbController {
  constructor(private prisma: PrismaService) {}

  @Get('tables')
  async getTables() {
    const tableRows = await this.prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const tables: string[] = [];
    const counts: Record<string, number> = {};
    for (const t of (tableRows as any[])) {
      const name = t.tablename;
      tables.push(name);
      try {
        const cnt = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${name}"`);
        counts[name] = Number((cnt as any)[0].count);
      } catch { counts[name] = 0; }
    }
    return { tables, counts };
  }

  @Get('table/:name')
  async getTable(@Param('name') name: string, @Query('page') page = '1', @Query('limit') limit = '50') {
    const p = Math.max(1, parseInt(page));
    const l = parseInt(limit);
    const offset = (p - 1) * l;
    const [rows, totalArr] = await Promise.all([
      this.prisma.$queryRawUnsafe(`SELECT * FROM "${name}" LIMIT ${l} OFFSET ${offset}`),
      this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${name}"`),
    ]);
    return { rows, total: Number((totalArr as any)[0].count) };
  }

  @Post('table/:name/:id')
  async updateRow(@Param('name') name: string, @Param('id') id: string, @Body() body: any) {
    try {
      const sets = Object.keys(body).map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const vals = Object.values(body);
      await this.prisma.$queryRawUnsafe(`UPDATE "${name}" SET ${sets} WHERE id = $1`, id, ...vals);
      return { success: true };
    } catch (e: any) { return { success: false, error: e.message }; }
  }

  @Post('query')
  async runQuery(@Body('sql') sql: string) {
    const blocked = /drop|truncate|alter/i.test(sql);
    if (blocked) return { error: 'DROP, TRUNCATE, ALTER are not allowed.' };
    try {
      const rows = await this.prisma.$queryRawUnsafe(sql);
      return { rows, count: Array.isArray(rows) ? rows.length : 0 };
    } catch (e: any) { return { error: e.message }; }
  }
}
