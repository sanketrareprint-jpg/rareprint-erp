import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('crm/leads/meta-webhook')
  verifyMetaWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && token === 'rareprint2024') return challenge;
    return 'Verification failed';
  }

  @Post('crm/leads/meta-webhook')
  async receiveMetaWebhook(@Body() body: any) {
    try {
      const PAGE_ACCESS_TOKEN = 'EAALuc4VndWcBRdAbNtsifQ2qMeZAwBZCBoxhIjTi5wg90Q8BoqYaNtMYoXTKz12mZAWJBVtBGUDhV9JgJOeK09kQAdMJcRJtoE1m7AAu7L59uWUr8uKGTeMUhUxo08C0zyR8D8EyZCAC2z6VE4s1wfQKoJupF6RLbRixqY9TtbC4DcjOhqlGiUE7P3FsJjZBzMPHzKojZCC5YNqmK2rY2j8DzygR4cuFRhB2J8w3oZD';
      
      // Handle Meta webhook format
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const leadgenId = change?.value?.leadgen_id;
      
      if (!leadgenId) return { status: 'no_leadgen_id' };

      // Fetch lead details from Meta Graph API
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${leadgenId}?fields=field_data,created_time&access_token=${PAGE_ACCESS_TOKEN}`
      );
      const leadData = await res.json();
      
      if (!leadData.field_data) {
        // Fallback: create lead with minimal info from webhook
        const agentsFallback = await this.prisma.user.findMany({
          where: { role: 'SALES_AGENT', isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (agentsFallback.length) {
          const countsFallback = await Promise.all(
            agentsFallback.map(async (a) => ({
              id: a.id,
              count: await this.prisma.lead.count({ where: { agentId: a.id } }),
            }))
          );
          countsFallback.sort((a, b) => a.count - b.count);
          const agentIdFallback = countsFallback[0].id;
          const leadFallback = await this.prisma.lead.create({
            data: {
              name: 'Facebook Lead',
              phone: '',
              source: 'WHATSAPP' as any,
              status: 'NEW' as any,
              agentId: agentIdFallback,
              score: 30,
              notes: `Meta leadgen_id: ${leadgenId}`,
            },
          });
          await this.prisma.leadFollowUp.createMany({
            data: [1,3,7].map((d) => ({
              leadId: leadFallback.id,
              scheduledAt: new Date(Date.now() + d * 24 * 60 * 60 * 1000),
              note: `Day ${d} follow-up`,
            })),
          });
          return { status: 'lead_created_fallback', leadId: leadFallback.id };
        }
        return { status: 'no_field_data', leadData };
      }

      // Parse field_data into key-value pairs
      const fields: Record<string, string> = {};
      for (const f of leadData.field_data) {
        fields[f.name] = f.values?.[0] ?? '';
      }

      // Extract name and phone
      const name = fields['full_name'] || fields['first_name'] 
        ? `${fields['first_name'] || ''} ${fields['last_name'] || ''}`.trim()
        : fields['full_name'] || 'Facebook Lead';
      const phone = fields['phone_number'] || fields['phone'] || '';
      const email = fields['email'] || '';
      const city = fields['city'] || '';
      const productInterest = fields['product_interest'] || fields['what_product_are_you_interested_in'] || '';

      // Create lead in CRM via receiveMetaLead
      const { CrmService } = await import('./crm/crm.service');
      
      // Use prisma directly to create lead with round robin
      const agents = await this.prisma.user.findMany({
        where: { role: 'SALES_AGENT', isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (!agents.length) return { status: 'no_agents' };

      const counts = await Promise.all(
        agents.map(async (a) => ({
          id: a.id,
          count: await this.prisma.lead.count({ where: { agentId: a.id } }),
        }))
      );
      counts.sort((a, b) => a.count - b.count);
      const agentId = counts[0].id;

      const lead = await this.prisma.lead.create({
        data: {
          name,
          phone,
          email: email || null,
          city: city || null,
          productInterest: productInterest || null,
          source: 'WHATSAPP' as any,
          status: 'NEW' as any,
          agentId,
          score: 30,
        },
      });

      // Schedule follow-ups
      const days = [1, 3, 7, 14, 30];
      await this.prisma.leadFollowUp.createMany({
        data: days.map((d) => ({
          leadId: lead.id,
          scheduledAt: new Date(Date.now() + d * 24 * 60 * 60 * 1000),
          note: `Day ${d} follow-up`,
        })),
      });

      return { status: 'lead_created', leadId: lead.id, name, phone };
    } catch (err) {
      console.error('Meta webhook error:', err);
      return { status: 'error', message: String(err) };
    }
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

}


