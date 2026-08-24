// backend/src/events/events-scheduler.service.ts
//
// Daily job: for every active EventPerson, check whether today (in
// Asia/Kolkata) is their birthday or anniversary; for every active,
// not-yet-sent Festival, check whether today is its date. Each match
// renders a flyer and sends it via WhatsAppService.sendEventWish (to the
// person and to the owner), logging the result to EventSendLog.
//
// Idempotency: birthdays/anniversaries are guarded by "does a SUCCESS
// EventSendLog already exist for this person+occasion+calendar year?" so a
// server restart mid-day (or the job somehow firing twice) never double-
// sends. Festivals are guarded by their own `sentAt` column instead, since a
// festival occurrence is a single dated row, not a yearly-recurring check.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import type { EventPerson, EventFlyerTemplate } from '@prisma/client';

@Injectable()
export class EventsSchedulerService {
  private readonly logger = new Logger(EventsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'events-daily-wishes', timeZone: 'Asia/Kolkata' })
  async runDailyChecks(): Promise<void> {
    this.logger.log('Events daily check starting');
    try {
      await this.sendBirthdaysAndAnniversaries();
    } catch (err) {
      this.logger.error(`Birthday/anniversary check failed: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await this.sendFestivals();
    } catch (err) {
      this.logger.error(`Festival check failed: ${err instanceof Error ? err.message : err}`);
    }
    this.logger.log('Events daily check finished');
  }

  private todayIST(): { month: number; day: number; year: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  // dob/anniversaryDate/Festival.date are all @db.Date columns — Prisma
  // returns these as a UTC-midnight Date representing the calendar date, so
  // month/day must be read with the UTC getters here, not the local ones
  // (which would shift the day depending on the server's own timezone).
  private matchesMonthDay(date: Date | null, month: number, day: number): boolean {
    if (!date) return false;
    return date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
  }

  private async sendBirthdaysAndAnniversaries(): Promise<void> {
    const { month, day, year } = this.todayIST();
    const people = await this.prisma.eventPerson.findMany({ where: { isActive: true } });
    if (!people.length) return;

    const birthdayPeople = people.filter((p) => this.matchesMonthDay(p.dob, month, day));
    const anniversaryPeople = people.filter((p) => this.matchesMonthDay(p.anniversaryDate, month, day));
    if (!birthdayPeople.length && !anniversaryPeople.length) return;

    const birthdayTemplate = birthdayPeople.length
      ? await this.prisma.eventFlyerTemplate.findFirst({ where: { occasionType: 'BIRTHDAY', isActive: true }, orderBy: { createdAt: 'desc' } })
      : null;
    const anniversaryTemplate = anniversaryPeople.length
      ? await this.prisma.eventFlyerTemplate.findFirst({ where: { occasionType: 'ANNIVERSARY', isActive: true }, orderBy: { createdAt: 'desc' } })
      : null;

    if (birthdayPeople.length && !birthdayTemplate) this.logger.warn(`${birthdayPeople.length} birthday(s) today but no active BIRTHDAY flyer template exists — skipped`);
    if (anniversaryPeople.length && !anniversaryTemplate) this.logger.warn(`${anniversaryPeople.length} anniversary(ies) today but no active ANNIVERSARY flyer template exists — skipped`);

    if (birthdayTemplate) {
      for (const person of birthdayPeople) await this.sendIfNotAlready(person, 'BIRTHDAY', birthdayTemplate, year);
    }
    if (anniversaryTemplate) {
      for (const person of anniversaryPeople) await this.sendIfNotAlready(person, 'ANNIVERSARY', anniversaryTemplate, year);
    }
  }

  private async sendIfNotAlready(
    person: EventPerson,
    occasionType: 'BIRTHDAY' | 'ANNIVERSARY',
    template: EventFlyerTemplate,
    year: number,
  ): Promise<void> {
    const already = await this.prisma.eventSendLog.findFirst({
      where: { personId: person.id, occasionType, occasionYear: year, status: 'SUCCESS' },
    });
    if (already) return;
    try {
      const result = await this.eventsService.renderAndSend({ person, occasionType, template, persist: true });
      if (!result.sent) this.logger.warn(`${occasionType} wish to ${person.name} did not reach them: ${result.errorMessage ?? 'unknown reason'}`);
    } catch (err) {
      this.logger.error(`Failed sending ${occasionType} wish to ${person.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async sendFestivals(): Promise<void> {
    const { month, day } = this.todayIST();
    const candidates = await this.prisma.festival.findMany({ where: { isActive: true, sentAt: null } });
    const todaysFestivals = candidates.filter((f) => this.matchesMonthDay(f.date, month, day));
    if (!todaysFestivals.length) return;

    const people = await this.prisma.eventPerson.findMany({ where: { isActive: true } });

    for (const festival of todaysFestivals) {
      if (!festival.templateId) {
        this.logger.warn(`Festival "${festival.name}" has no flyer template assigned — skipping today's send`);
        continue;
      }
      const template = await this.prisma.eventFlyerTemplate.findUnique({ where: { id: festival.templateId } });
      if (!template || !template.isActive) {
        this.logger.warn(`Festival "${festival.name}"'s assigned template is missing or inactive — skipping today's send`);
        continue;
      }

      for (const person of people) {
        try {
          await this.eventsService.renderAndSend({
            person,
            occasionType: 'FESTIVAL',
            template,
            festivalId: festival.id,
            festivalDate: festival.date,
            persist: true,
          });
        } catch (err) {
          this.logger.error(`Failed sending festival "${festival.name}" wish to ${person.name}: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Marked sent even if some individual sends above failed — this row
      // represents "today's broadcast already ran", not "every recipient
      // succeeded" (per-recipient outcomes are in EventSendLog). Retrying a
      // partially-failed festival broadcast is a manual admin action, same
      // as any other WhatsApp send failure in this app.
      await this.prisma.festival.update({ where: { id: festival.id }, data: { sentAt: new Date() } });
    }
  }
}
