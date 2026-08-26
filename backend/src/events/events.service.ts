// backend/src/events/events.service.ts
//
// Events module: register people (customers/friends/anyone) with a
// DOB/anniversary date and WhatsApp number, design flyer templates, manage
// festival dates, and view send history. The actual daily birthday/
// anniversary/festival check runs in events-scheduler.service.ts — this
// service is the CRUD + on-demand send/preview surface the controller calls.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { renderFlyer, type FlyerField, type FlyerFieldAlign, type FlyerFieldVAlign } from './flyer-render';
import { isFlyerFontFamily, FLYER_FONT_FAMILIES } from './fonts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OCCASION_TYPES = ['BIRTHDAY', 'ANNIVERSARY', 'FESTIVAL'] as const;
export type OccasionType = (typeof OCCASION_TYPES)[number];

/** "1st"/"2nd"/"3rd"/"4th"... — used to fold anniversary years into the
 *  WhatsApp template's occasion-label variable, e.g. "5th Anniversary". */
function ordinalSuffix(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

interface RawFieldInput {
  key?: unknown; label?: unknown; type?: unknown;
  x?: unknown; y?: unknown; w?: unknown; h?: unknown;
  fontFamily?: unknown; fontSizePt?: unknown; bold?: unknown; color?: unknown;
  align?: unknown; verticalAlign?: unknown; circle?: unknown;
}

function normalizeFields(input: unknown): FlyerField[] {
  if (!Array.isArray(input) || !input.length) throw new BadRequestException('At least one field is required');
  const seenKeys = new Set<string>();
  return input.map((raw, i) => {
    const f = raw as RawFieldInput;
    if (typeof f.key !== 'string' || !f.key.trim()) throw new BadRequestException(`fields[${i}].key is required`);
    const key = f.key.trim();
    if (seenKeys.has(key)) throw new BadRequestException(`Duplicate field key "${key}"`);
    seenKeys.add(key);

    const type = f.type === 'PHOTO' ? 'PHOTO' : 'TEXT';
    const clamp01 = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
    };

    const base: FlyerField = {
      key,
      label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : key,
      type,
      x: clamp01(f.x, 0),
      y: clamp01(f.y, 0),
      w: Math.max(0.01, clamp01(f.w, 0.2)),
      h: Math.max(0.01, clamp01(f.h, 0.1)),
    };

    if (type === 'PHOTO') {
      base.circle = Boolean(f.circle);
      return base;
    }

    const fontFamily = isFlyerFontFamily(f.fontFamily) ? f.fontFamily : FLYER_FONT_FAMILIES[0];
    const align: FlyerFieldAlign = f.align === 'center' || f.align === 'right' ? f.align : 'left';
    const verticalAlign: FlyerFieldVAlign = f.verticalAlign === 'middle' || f.verticalAlign === 'bottom' ? f.verticalAlign : 'top';
    return {
      ...base,
      fontFamily,
      fontSizePt: Math.min(200, Math.max(6, Number(f.fontSizePt) || 32)),
      bold: Boolean(f.bold),
      color: typeof f.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(f.color) ? f.color : '#111111',
      align,
      verticalAlign,
    };
  });
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, 'base64');
}

function fileToDataUrl(file: Express.Multer.File): string {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function formatDateForFlyer(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ───────────────────────── Flyer templates ─────────────────────────

  async createTemplate(params: {
    name: string;
    occasionType: string;
    fields: unknown;
    file: Express.Multer.File;
    userId: string;
  }) {
    if (!params.name?.trim()) throw new BadRequestException('name is required');
    if (!OCCASION_TYPES.includes(params.occasionType as OccasionType)) {
      throw new BadRequestException(`occasionType must be one of ${OCCASION_TYPES.join(', ')}`);
    }
    if (!params.file) throw new BadRequestException('Template image is required (field: file)');
    if (!params.file.mimetype?.startsWith('image/')) throw new BadRequestException('Template must be an image file (JPG/PNG)');
    if (params.file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Template image too large (max 8MB)');

    const fields = normalizeFields(typeof params.fields === 'string' ? JSON.parse(params.fields) : params.fields);

    return this.prisma.eventFlyerTemplate.create({
      data: {
        name: params.name.trim(),
        occasionType: params.occasionType as OccasionType,
        imageDataUrl: fileToDataUrl(params.file),
        fields: fields as unknown as object,
        createdById: params.userId,
      },
    });
  }

  listTemplates(occasionType?: string) {
    return this.prisma.eventFlyerTemplate.findMany({
      where: occasionType ? { occasionType: occasionType as OccasionType } : undefined,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, occasionType: true, fields: true, isActive: true, createdAt: true, updatedAt: true },
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.eventFlyerTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async updateTemplate(id: string, params: { name?: string; fields?: unknown; isActive?: boolean }) {
    await this.getTemplate(id);
    const data: Record<string, unknown> = {};
    if (typeof params.name === 'string' && params.name.trim()) data.name = params.name.trim();
    if (params.fields !== undefined) data.fields = normalizeFields(params.fields) as unknown as object;
    if (typeof params.isActive === 'boolean') data.isActive = params.isActive;
    return this.prisma.eventFlyerTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    // Safe to delete unconditionally: EventSendLog.templateId and
    // Festival.templateId are both nullable with ON DELETE SET NULL (see the
    // migration), so history stays intact and any festival still pointing
    // at this template just falls back to "no template assigned" — visible
    // in the Festivals tab, where it can be reassigned.
    await this.prisma.eventFlyerTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** Preview render with arbitrary sample values (template designer "preview" button) — not tied to any real person. */
  async previewTemplate(id: string, values: Record<string, string>, samplePhotoDataUrl?: string): Promise<Buffer> {
    const template = await this.getTemplate(id);
    const fields = template.fields as unknown as FlyerField[];
    const templateImage = dataUrlToBuffer(template.imageDataUrl);
    const photoBuffer = samplePhotoDataUrl ? dataUrlToBuffer(samplePhotoDataUrl) : null;
    return renderFlyer({ templateImageBuffer: templateImage, fields, values: values ?? {}, photoBuffer });
  }

  // ───────────────────────── People ─────────────────────────

  async createPerson(params: {
    name: string;
    whatsappNumber: string;
    relation?: string;
    dob?: string;
    anniversaryDate?: string;
    notes?: string;
    file?: Express.Multer.File;
    userId: string;
  }) {
    if (!params.name?.trim()) throw new BadRequestException('name is required');
    const phone = this.whatsapp.normalizePhone(params.whatsappNumber ?? '');
    if (!phone) throw new BadRequestException('A valid WhatsApp number is required');
    if (params.file) {
      if (!params.file.mimetype?.startsWith('image/')) throw new BadRequestException('Photo must be an image file');
      if (params.file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Photo too large (max 8MB)');
    }

    return this.prisma.eventPerson.create({
      data: {
        name: params.name.trim(),
        whatsappNumber: phone,
        relation: params.relation?.trim() || 'CUSTOMER',
        dob: params.dob ? new Date(params.dob) : null,
        anniversaryDate: params.anniversaryDate ? new Date(params.anniversaryDate) : null,
        notes: params.notes?.trim() || null,
        photoDataUrl: params.file ? fileToDataUrl(params.file) : null,
        createdById: params.userId,
      },
    });
  }

  listPeople() {
    return this.prisma.eventPerson.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, whatsappNumber: true, relation: true, dob: true, anniversaryDate: true,
        photoDataUrl: true, notes: true, isActive: true, createdAt: true, updatedAt: true,
      },
    });
  }

  async getPerson(id: string) {
    const person = await this.prisma.eventPerson.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }

  async updatePerson(id: string, params: {
    name?: string; whatsappNumber?: string; relation?: string; dob?: string | null; anniversaryDate?: string | null;
    notes?: string; isActive?: boolean; file?: Express.Multer.File;
  }) {
    await this.getPerson(id);
    const data: Record<string, unknown> = {};
    if (typeof params.name === 'string' && params.name.trim()) data.name = params.name.trim();
    if (typeof params.whatsappNumber === 'string' && params.whatsappNumber.trim()) {
      const phone = this.whatsapp.normalizePhone(params.whatsappNumber);
      if (!phone) throw new BadRequestException('A valid WhatsApp number is required');
      data.whatsappNumber = phone;
    }
    if (typeof params.relation === 'string') data.relation = params.relation.trim() || 'CUSTOMER';
    if (params.dob !== undefined) data.dob = params.dob ? new Date(params.dob) : null;
    if (params.anniversaryDate !== undefined) data.anniversaryDate = params.anniversaryDate ? new Date(params.anniversaryDate) : null;
    if (typeof params.notes === 'string') data.notes = params.notes.trim() || null;
    if (typeof params.isActive === 'boolean') data.isActive = params.isActive;
    if (params.file) {
      if (!params.file.mimetype?.startsWith('image/')) throw new BadRequestException('Photo must be an image file');
      if (params.file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Photo too large (max 8MB)');
      data.photoDataUrl = fileToDataUrl(params.file);
    }
    return this.prisma.eventPerson.update({ where: { id }, data });
  }

  async deletePerson(id: string) {
    await this.getPerson(id);
    const logCount = await this.prisma.eventSendLog.count({ where: { personId: id } });
    if (logCount > 0) {
      throw new BadRequestException('This person has send history — deactivate them instead of deleting, so the history stays auditable');
    }
    await this.prisma.eventPerson.delete({ where: { id } });
    return { ok: true };
  }

  // ───────────────────────── Festivals ─────────────────────────
  // Recurring by month/day (added once, fires every year) — not a one-off
  // date re-added yearly. See docs/Events_Module_Context.md.

  private static readonly DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb allows 29 so leap-year festivals can be entered; the scheduler simply won't match on non-leap Feb 29s

  private validateMonthDay(month: unknown, day: unknown): { month: number; day: number } {
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new BadRequestException('month must be an integer 1-12');
    if (!Number.isInteger(d) || d < 1 || d > EventsService.DAYS_IN_MONTH[m - 1]) throw new BadRequestException(`day must be an integer 1-${EventsService.DAYS_IN_MONTH[m - 1]} for the given month`);
    return { month: m, day: d };
  }

  async createFestival(params: { name: string; month: unknown; day: unknown; templateId?: string; userId: string }) {
    if (!params.name?.trim()) throw new BadRequestException('name is required');
    const { month, day } = this.validateMonthDay(params.month, params.day);
    if (params.templateId) await this.getTemplate(params.templateId);
    return this.prisma.festival.create({
      data: {
        name: params.name.trim(),
        month,
        day,
        templateId: params.templateId || null,
        createdById: params.userId,
      },
    });
  }

  listFestivals() {
    return this.prisma.festival.findMany({ orderBy: [{ month: 'asc' }, { day: 'asc' }] });
  }

  async updateFestival(id: string, params: { name?: string; month?: unknown; day?: unknown; templateId?: string | null; isActive?: boolean }) {
    const existing = await this.prisma.festival.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Festival not found');
    const data: Record<string, unknown> = {};
    if (typeof params.name === 'string' && params.name.trim()) data.name = params.name.trim();
    if (params.month !== undefined || params.day !== undefined) {
      const { month, day } = this.validateMonthDay(params.month ?? existing.month, params.day ?? existing.day);
      data.month = month;
      data.day = day;
    }
    if (params.templateId !== undefined) {
      if (params.templateId) await this.getTemplate(params.templateId);
      data.templateId = params.templateId || null;
    }
    if (typeof params.isActive === 'boolean') data.isActive = params.isActive;
    return this.prisma.festival.update({ where: { id }, data });
  }

  async deleteFestival(id: string) {
    const existing = await this.prisma.festival.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Festival not found');
    await this.prisma.festival.delete({ where: { id } });
    return { ok: true };
  }

  // ───────────────────────── History ─────────────────────────

  listLogs(params: { personId?: string; limit?: number }) {
    return this.prisma.eventSendLog.findMany({
      where: params.personId ? { personId: params.personId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, params.limit ?? 100)),
      select: {
        id: true, personId: true, templateId: true, festivalId: true, occasionType: true, occasionYear: true,
        recipientPhone: true, sentToOwner: true, status: true, errorMessage: true, createdAt: true,
        person: { select: { name: true } },
        festival: { select: { name: true } },
      },
    });
  }

  // ───────────────────────── Rendering + sending (shared by scheduler and manual test-send) ─────────────────────────

  buildValuesForPerson(person: { name: string; dob: Date | null; anniversaryDate: Date | null }, occasionType: OccasionType, festivalDate?: Date): Record<string, string> {
    const relevantDate = occasionType === 'BIRTHDAY' ? person.dob : occasionType === 'ANNIVERSARY' ? person.anniversaryDate : festivalDate ?? null;
    const years = relevantDate && occasionType !== 'FESTIVAL' ? new Date().getFullYear() - relevantDate.getFullYear() : null;
    return {
      name: person.name,
      date: relevantDate ? formatDateForFlyer(relevantDate) : '',
      years: years != null && years > 0 ? String(years) : '',
    };
  }

  /** Renders + sends one flyer to one person for one occasion, and logs the
   *  result. Used by both the daily scheduler and the manual "send test"
   *  button — `persist` controls whether it's written to EventSendLog
   *  (manual test sends pass persist:false so they can't block a real
   *  scheduled send from firing later the same year). */
  async renderAndSend(params: {
    person: { id: string; name: string; whatsappNumber: string; dob: Date | null; anniversaryDate: Date | null; photoDataUrl: string | null };
    occasionType: OccasionType;
    template: { id: string; imageDataUrl: string; fields: unknown };
    festivalId?: string;
    festivalDate?: Date;
    persist: boolean;
  }): Promise<{ sent: boolean; sentToOwner?: boolean; errorMessage?: string }> {
    const fields = params.template.fields as unknown as FlyerField[];
    const templateImage = dataUrlToBuffer(params.template.imageDataUrl);
    const photoBuffer = params.person.photoDataUrl ? dataUrlToBuffer(params.person.photoDataUrl) : null;
    const values = this.buildValuesForPerson(params.person, params.occasionType, params.festivalDate);

    let flyerBuffer: Buffer;
    try {
      flyerBuffer = await renderFlyer({ templateImageBuffer: templateImage, fields, values, photoBuffer });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Flyer render failed for person ${params.person.id}: ${message}`);
      if (params.persist) {
        await this.logSend({ ...params, flyerImageDataUrl: null, status: 'FAILED', errorMessage: message, sentToOwner: false });
      }
      return { sent: false, errorMessage: message };
    }

    const flyerImageDataUrl = `data:image/jpeg;base64,${flyerBuffer.toString('base64')}`;
    let sendLogId: string | null = null;
    if (params.persist) {
      // Logged optimistically as SUCCESS before the WhatsApp call below even
      // runs (there's no PENDING status in EventSendStatus) — every exit
      // path after this point either leaves it SUCCESS or downgrades it to
      // FAILED with a reason, so the row always converges to the right
      // final state by the time this function returns.
      const log = await this.logSend({ ...params, flyerImageDataUrl, status: 'SUCCESS', errorMessage: null, sentToOwner: false });
      sendLogId = log.id;
    }

    const publicBaseUrl = process.env.BACKEND_PUBLIC_URL?.trim();
    if (!publicBaseUrl) {
      const message = 'BACKEND_PUBLIC_URL is not set — cannot build a public image link for AiSensy to fetch the flyer from';
      this.logger.warn(message);
      if (sendLogId) await this.prisma.eventSendLog.update({ where: { id: sendLogId }, data: { status: 'FAILED', errorMessage: message } });
      return { sent: false, errorMessage: message };
    }

    // The public flyer route needs a row to serve from — for a non-persisted
    // (test) send there's no EventSendLog row, so store the flyer inline in
    // a short-lived way is unnecessary complexity for a manual test click;
    // instead test sends always persist a minimal log row too, just not one
    // that participates in the scheduler's once-per-year idempotency check
    // (see logSend's occasionYear=0 sentinel below).
    if (!sendLogId) {
      const log = await this.logSend({ ...params, flyerImageDataUrl, status: 'SUCCESS', errorMessage: null, sentToOwner: false, testSentinel: true });
      sendLogId = log.id;
    }
    // sendLogId is always set by one of the two branches above — this check
    // only exists so TypeScript can narrow it from `string | null` to
    // `string` for the calls below (and guards against a future refactor
    // accidentally skipping both branches).
    if (!sendLogId) throw new Error('Internal error: sendLogId was not set before building the public flyer link');

    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h — plenty for AiSensy to fetch it once
    const token = this.signPublicToken(sendLogId, expiresAt);
    const imageUrl = `${publicBaseUrl.replace(/\/$/, '')}/events/flyer/${sendLogId}?token=${encodeURIComponent(token)}&expires=${expiresAt}`;

    // Anniversary years fold directly into the occasion label (e.g. "5th
    // Anniversary") rather than a separate template variable — the real
    // approved AiSensy template only has 3 body variables and the 3rd one
    // is the "Warm wishes from {{3}}" sign-off, not a years line. See
    // WhatsAppService.sendEventWish's header comment for the full template
    // variable mapping (confirmed 2026-08-25 against the actual approved
    // template).
    const occasionLabel =
      params.occasionType === 'BIRTHDAY'
        ? 'Birthday'
        : params.occasionType === 'ANNIVERSARY'
          ? (values.years ? `${values.years}${ordinalSuffix(Number(values.years))} Anniversary` : 'Anniversary')
          : 'Festival';
    // Sent to BOTH the person themselves AND the owner's own WhatsApp, per
    // the original request ("sent to the owner and to whose birthday or
    // anniversary is") — see WhatsAppService.sendEventWish.
    const result = await this.whatsapp.sendEventWish({
      customerName: params.person.name,
      customerPhone: params.person.whatsappNumber,
      imageUrl,
      occasionLabel,
    });

    // 2026-08-25: result.personError now carries the actual reason AiSensy
    // (or the fetch call) gave for the failure — see
    // WhatsAppService.sendEventWish. Previously this fell back to a generic
    // "see backend logs" message and never returned anything to the caller
    // at all, so the frontend's test-send banner always showed its own
    // generic fallback text no matter what actually went wrong.
    const failureMessage = result.personError
      ? `AiSensy: ${result.personError}`
      : 'AiSensy send to the person failed — see backend logs';

    if (sendLogId) {
      await this.prisma.eventSendLog.update({
        where: { id: sendLogId },
        data: result.sentToPerson
          ? { sentToOwner: result.sentToOwner }
          : { status: 'FAILED', errorMessage: failureMessage, sentToOwner: result.sentToOwner },
      });
    }

    return {
      sent: result.sentToPerson,
      sentToOwner: result.sentToOwner,
      errorMessage: result.sentToPerson ? undefined : failureMessage,
    };
  }

  private async logSend(params: {
    person: { id: string; whatsappNumber: string };
    occasionType: OccasionType;
    template: { id: string };
    festivalId?: string;
    flyerImageDataUrl: string | null;
    status: 'SUCCESS' | 'FAILED';
    errorMessage: string | null;
    sentToOwner: boolean;
    testSentinel?: boolean;
  }) {
    return this.prisma.eventSendLog.create({
      data: {
        personId: params.person.id,
        templateId: params.template.id,
        festivalId: params.festivalId ?? null,
        occasionType: params.occasionType,
        // occasionYear=0 marks a manual test send so it's excluded from the
        // scheduler's "already sent this person this occasion this year?"
        // check (which filters on the real calendar year) — it still shows
        // up in the History tab like any other row.
        occasionYear: params.testSentinel ? 0 : new Date().getFullYear(),
        recipientPhone: params.person.whatsappNumber,
        sentToOwner: params.sentToOwner,
        flyerImageDataUrl: params.flyerImageDataUrl,
        status: params.status,
        errorMessage: params.errorMessage,
      },
    });
  }

  // ───────────────────────── Manual "send test" ─────────────────────────

  async sendTestWish(personId: string, occasionType: string, templateId?: string) {
    if (!OCCASION_TYPES.includes(occasionType as OccasionType)) {
      throw new BadRequestException(`occasionType must be one of ${OCCASION_TYPES.join(', ')}`);
    }
    const person = await this.getPerson(personId);
    const template = templateId
      ? await this.getTemplate(templateId)
      : await this.prisma.eventFlyerTemplate.findFirst({ where: { occasionType: occasionType as OccasionType, isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!template) throw new BadRequestException(`No active flyer template found for ${occasionType} — create one first`);

    return this.renderAndSend({
      person,
      occasionType: occasionType as OccasionType,
      template,
      persist: false,
    });
  }

  // ───────────────────────── Public flyer image route (AiSensy fetches this — no auth) ─────────────────────────
  // Signed short-lived token, same HMAC-over-JWT_SECRET scheme already used
  // by BillingService.shareInvoiceViaWhatsapp's public invoice-PDF link —
  // reusing JWT_SECRET (already required at boot) instead of adding a new
  // secret env var.

  private signPublicToken(sendLogId: string, expiresAt: number): string {
    const secret = process.env.JWT_SECRET ?? '';
    return createHmac('sha256', secret).update(`${sendLogId}.${expiresAt}`).digest('hex');
  }

  verifyPublicToken(sendLogId: string, token: string, expiresAtStr: string): boolean {
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || !token || Date.now() > expiresAt) return false;
    const expected = this.signPublicToken(sendLogId, expiresAt);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async getFlyerImageForPublicRoute(sendLogId: string): Promise<Buffer> {
    const log = await this.prisma.eventSendLog.findUnique({ where: { id: sendLogId }, select: { flyerImageDataUrl: true } });
    if (!log?.flyerImageDataUrl) throw new NotFoundException('Flyer not found');
    return dataUrlToBuffer(log.flyerImageDataUrl);
  }
}
