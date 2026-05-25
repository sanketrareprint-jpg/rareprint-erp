// backend/src/crm/meta-sheets-poller.service.ts
//
// Polls a Google Sheet that Meta Lead Ads is writing to, and creates
// CRM leads for every new row. This sidesteps the Meta leads_retrieval
// approval delay — once approval lands you can disable this poller and
// switch back to the direct Graph API flow in crm.service.ts.
//
// Setup:
//   1. In Meta Business Suite → Instant Forms → connect your form to
//      a Google Sheet (built-in feature, no third party).
//   2. Open the sheet → File → Share → "Anyone with the link can view".
//   3. File → Share → Publish to web → choose the right tab → "Comma-
//      separated values (.csv)" → Publish. Copy that CSV URL.
//   4. Set env vars on Railway:
//        META_SHEETS_CSV_URL  = <the published CSV URL>
//        META_SHEETS_POLL_MIN = 2          (how often to poll, minutes)
//        META_SHEETS_AUTO_AISENSY = true   (auto-send WA template?)
//        META_SHEETS_ENABLED  = true       (master switch)
//
// The sheet must have these column headers (case-insensitive, any order):
//   name, phone, email, business_name, city, product_interest,
//   estimated_qty, estimated_value, notes
// Meta lets you map form fields to column names when you connect the sheet.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';

type SheetRow = Record<string, string>;

@Injectable()
export class MetaSheetsPollerService implements OnModuleInit {
  private readonly logger = new Logger(MetaSheetsPollerService.name);
  private polling = false;
  private lastPollAt: Date | null = null;
  private lastPollStatus: 'ok' | 'error' | 'idle' = 'idle';
  private lastPollMessage = '';
  private leadsPulledTotal = 0;
  private leadsPulledToday = 0;
  private todayKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
  ) {}

  onModuleInit() {
    const url = process.env.META_SHEETS_CSV_URL;
    const enabled = process.env.META_SHEETS_ENABLED === 'true';
    if (!enabled) {
      this.logger.log('Meta Sheets poller disabled (META_SHEETS_ENABLED != true)');
      return;
    }
    if (!url) {
      this.logger.warn('META_SHEETS_CSV_URL not set — poller will skip until configured');
      return;
    }
    this.logger.log(`Meta Sheets poller active. Polling every ${process.env.META_SHEETS_POLL_MIN ?? 2} min.`);
  }

  // Run every 2 minutes by default. The @Cron expression is fixed; we
  // gate inside the method so we can change cadence via env without a
  // redeploy by simply restarting.
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledPoll() {
    if (process.env.META_SHEETS_ENABLED !== 'true') return;
    const intervalMin = Math.max(1, parseInt(process.env.META_SHEETS_POLL_MIN ?? '2', 10) || 2);
    // Only run on the configured interval (every-minute cron + manual gate).
    const minuteOfHour = new Date().getMinutes();
    if (minuteOfHour % intervalMin !== 0) return;
    await this.pollOnce();
  }

  // Public manual-trigger entry point (for admin button or test)
  async pollOnce(): Promise<{
    ok: boolean;
    newLeads: number;
    skipped: number;
    error?: string;
    pulledAt: string;
  }> {
    if (this.polling) {
      return { ok: false, newLeads: 0, skipped: 0, error: 'already_polling', pulledAt: new Date().toISOString() };
    }
    this.polling = true;
    const url = process.env.META_SHEETS_CSV_URL;
    const autoAisensy = process.env.META_SHEETS_AUTO_AISENSY === 'true';

    try {
      if (!url) throw new Error('META_SHEETS_CSV_URL not configured');

      // Append cache-buster so Google's CDN doesn't serve stale CSV
      const fetchUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
      const res = await fetch(fetchUrl, { redirect: 'follow' });
      if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
      const csv = await res.text();

      const rows = parseCsv(csv);
      let newLeads = 0;
      let skipped = 0;

      for (const row of rows) {
        const name  = pick(row, 'name', 'full_name', 'lead_name');
        const phone = pick(row, 'phone', 'phone_number', 'mobile', 'whatsapp');
        if (!name || !phone) { skipped++; continue; }

        const normPhone = normalizePhone(phone);
        // Dedupe: skip if we already imported this phone from sheets
        const exists = await this.prisma.lead.findFirst({ where: { phone: normPhone } });
        if (exists) { skipped++; continue; }

        try {
          const created = await this.crmService.receiveMetaLead({
            name,
            phone: normPhone,
            email: pick(row, 'email'),
            businessName: pick(row, 'business_name', 'businessname', 'company', 'company_name'),
            city: pick(row, 'city'),
            productInterest: pick(row, 'product_interest', 'productinterest', 'product', 'interested_in'),
            estimatedQty: toIntOrUndef(pick(row, 'estimated_qty', 'estimatedqty', 'quantity', 'qty')),
            estimatedValue: toFloatOrUndef(pick(row, 'estimated_value', 'estimatedvalue', 'budget', 'value')),
            notes: pick(row, 'notes', 'comments', 'message'),
          });
          newLeads++;

          // Auto-trigger AiSensy WhatsApp template if enabled
          if (autoAisensy && created?.lead?.id) {
            try {
              // userId for activity log — use the assigned agent's id
              await this.crmService.sendLeadToAisensy(created.lead.id, created.lead.agentId);
            } catch (e: any) {
              this.logger.warn(`AiSensy send failed for lead ${created.lead.id}: ${e?.message}`);
            }
          }
        } catch (e: any) {
          this.logger.error(`Lead create failed for "${name}" ${normPhone}: ${e?.message}`);
          skipped++;
        }
      }

      this.bumpDailyCounter(newLeads);
      this.lastPollAt = new Date();
      this.lastPollStatus = 'ok';
      this.lastPollMessage = `Pulled ${newLeads} new, skipped ${skipped}`;
      if (newLeads > 0) this.logger.log(`[META-SHEETS] ${this.lastPollMessage}`);
      return { ok: true, newLeads, skipped, pulledAt: this.lastPollAt.toISOString() };

    } catch (err: any) {
      this.lastPollAt = new Date();
      this.lastPollStatus = 'error';
      this.lastPollMessage = err?.message ?? 'unknown error';
      this.logger.error(`[META-SHEETS] poll error: ${this.lastPollMessage}`);
      return { ok: false, newLeads: 0, skipped: 0, error: this.lastPollMessage, pulledAt: this.lastPollAt.toISOString() };
    } finally {
      this.polling = false;
    }
  }

  getStatus() {
    return {
      enabled: process.env.META_SHEETS_ENABLED === 'true',
      configured: !!process.env.META_SHEETS_CSV_URL,
      pollIntervalMin: parseInt(process.env.META_SHEETS_POLL_MIN ?? '2', 10) || 2,
      autoAisensy: process.env.META_SHEETS_AUTO_AISENSY === 'true',
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
      lastPollStatus: this.lastPollStatus,
      lastPollMessage: this.lastPollMessage,
      leadsPulledTotal: this.leadsPulledTotal,
      leadsPulledToday: this.leadsPulledToday,
    };
  }

  private bumpDailyCounter(n: number) {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.todayKey) {
      this.todayKey = today;
      this.leadsPulledToday = 0;
    }
    this.leadsPulledToday += n;
    this.leadsPulledTotal += n;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (intentionally local — keeps the module self-contained, zero deps).
// ─────────────────────────────────────────────────────────────────────────────

function parseCsv(text: string): SheetRow[] {
  // Simple but robust CSV parser: handles quoted cells with commas/newlines.
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(cell); cell = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
      else cell += ch;
    }
  }
  if (cell.length > 0 || cur.length > 0) { cur.push(cell); rows.push(cur); }

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter(r => r.some(c => c.trim() !== ''))
    .map(r => {
      const obj: SheetRow = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
      return obj;
    });
}

function pick(row: SheetRow, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits.startsWith('+') ? raw : `+${digits}`;
}

function toIntOrUndef(s?: string): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function toFloatOrUndef(s?: string): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
