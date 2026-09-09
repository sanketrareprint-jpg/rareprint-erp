// backend/src/machine-readings/machine-readings.service.ts
//
// Workshop machine readings (currently: the envelope-making machine). The
// operator pays the shop ₹50 per 1000 units produced, settled in batches —
// marking a reading "paid" freezes the units produced and amount owed since
// the last paid reading (or the very first reading, if nothing has been paid
// yet) as a permanent record.
//
// The machine's counter rolls over at 1,000,000 — whoever records a reading
// right after a physical reset ticks `wasReset`, and the diff from the
// previous reading is computed as (1,000,000 - previous) + this reading
// instead of a plain subtraction.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RESET_THRESHOLD = 1_000_000;
const RATE_PER_THOUSAND = 50;

@Injectable()
export class MachineReadingsService {
  constructor(private readonly prisma: PrismaService) {}

  private diffBetween(prevValue: number, currValue: number, wasReset: boolean): number {
    if (wasReset) return (RESET_THRESHOLD - prevValue) + currValue;
    return currValue - prevValue;
  }

  private amountFor(units: number): number {
    return Number(((units / 1000) * RATE_PER_THOUSAND).toFixed(2));
  }

  // ── List — newest first, each row annotated with its diff/amount from the
  // immediately preceding reading (independent of payment checkpoints, purely
  // informational for the table). ─────────────────────────────────────────
  async list() {
    const readings = await (this.prisma as any).machineReading.findMany({
      orderBy: { readingDate: 'asc' },
      include: {
        recordedBy: { select: { fullName: true } },
        paidBy: { select: { fullName: true } },
      },
    });

    let prev: any = null;
    const annotated = readings.map((r: any) => {
      const diff = prev ? this.diffBetween(Number(prev.readingValue), Number(r.readingValue), r.wasReset) : null;
      const suspiciousReset = prev != null && !r.wasReset && r.readingValue < prev.readingValue;
      const row = {
        ...r,
        paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
        diffFromPrevious: diff,
        amountFromPrevious: diff != null ? this.amountFor(diff) : null,
        suspiciousReset,
      };
      prev = r;
      return row;
    });
    return annotated.reverse();
  }

  async create(
    dto: { readingDate: string; readingValue: number; wasReset?: boolean; notes?: string },
    userId?: string,
  ) {
    if (dto.readingValue == null || Number.isNaN(Number(dto.readingValue))) {
      throw new BadRequestException('Reading value is required');
    }
    if (dto.readingValue < 0 || dto.readingValue > RESET_THRESHOLD) {
      throw new BadRequestException(`Reading must be between 0 and ${RESET_THRESHOLD}`);
    }
    if (!dto.readingDate) {
      throw new BadRequestException('Reading date is required');
    }
    return (this.prisma as any).machineReading.create({
      data: {
        readingDate: new Date(dto.readingDate),
        readingValue: dto.readingValue,
        wasReset: dto.wasReset ?? false,
        notes: dto.notes?.trim() || null,
        recordedById: userId ?? null,
      },
    });
  }

  // Only the single most recent reading can be deleted (and only if unpaid) —
  // deleting one from the middle would silently corrupt every diff computed
  // after it.
  async delete(id: string) {
    const reading = await (this.prisma as any).machineReading.findUnique({ where: { id } });
    if (!reading) throw new NotFoundException('Reading not found');
    if (reading.isPaid) throw new BadRequestException('Cannot delete a reading that has already been marked paid');
    const latest = await (this.prisma as any).machineReading.findFirst({ orderBy: { readingDate: 'desc' } });
    if (latest?.id !== id) throw new BadRequestException('Only the most recently recorded reading can be deleted');
    await (this.prisma as any).machineReading.delete({ where: { id } });
    return { success: true };
  }

  // Index of the last-paid reading in a chronologically-sorted list, or 0
  // (the very first reading) if nothing has ever been paid — either way, the
  // return value is the "anchor" to start summing diffs from.
  private anchorIndex(readings: any[]): number {
    for (let i = readings.length - 1; i >= 0; i--) {
      if (readings[i].isPaid) return i;
    }
    return 0;
  }

  // ── Pending payment summary — units produced & amount owed since the last
  // paid checkpoint. This is what the "mark as paid" box shows before you
  // confirm it. ─────────────────────────────────────────────────────────
  async getPendingSummary() {
    const readings = await (this.prisma as any).machineReading.findMany({ orderBy: { readingDate: 'asc' } });
    if (readings.length === 0) {
      return { hasReadings: false, lastPaidReading: null, latestReading: null, unitsProduced: 0, amountDue: 0 };
    }

    const anchorIdx = this.anchorIndex(readings);
    let units = 0;
    for (let i = anchorIdx + 1; i < readings.length; i++) {
      units += this.diffBetween(Number(readings[i - 1].readingValue), Number(readings[i].readingValue), readings[i].wasReset);
    }

    const anchor = readings[anchorIdx];
    const latest = readings[readings.length - 1];
    return {
      hasReadings: true,
      lastPaidReading: anchor.isPaid
        ? { id: anchor.id, readingDate: anchor.readingDate, readingValue: anchor.readingValue }
        : null,
      latestReading: { id: latest.id, readingDate: latest.readingDate, readingValue: latest.readingValue, isPaid: latest.isPaid },
      unitsProduced: units,
      amountDue: this.amountFor(units),
    };
  }

  // ── Mark a reading as the new paid checkpoint. Computes units/amount owed
  // since the last checkpoint (sum of every diff in between, resets included)
  // and freezes it on the row, along with an optional description/bill
  // number and an optional manual amount override (real payments get
  // rounded). ────────────────────────────────────────────────────────────
  async markPaid(id: string, dto: { paidAmount?: number; paidNote?: string }, userId?: string) {
    const readings = await (this.prisma as any).machineReading.findMany({ orderBy: { readingDate: 'asc' } });
    const idx = readings.findIndex((r: any) => r.id === id);
    if (idx === -1) throw new NotFoundException('Reading not found');
    if (readings[idx].isPaid) throw new BadRequestException('This reading has already been marked as paid');

    // anchorIndex() scans for the LAST paid reading — restrict the search to
    // readings before `idx` so a later (still-unpaid) row is never treated
    // as the anchor.
    const anchorIdxBeforeThis = this.anchorIndex(readings.slice(0, idx));
    if (idx <= anchorIdxBeforeThis) {
      throw new BadRequestException('This reading is at or before the last paid checkpoint');
    }

    let units = 0;
    for (let i = anchorIdxBeforeThis + 1; i <= idx; i++) {
      units += this.diffBetween(Number(readings[i - 1].readingValue), Number(readings[i].readingValue), readings[i].wasReset);
    }
    if (units < 0) {
      throw new BadRequestException(
        'Computed a negative units-produced for this period — check whether a reset was missed on one of these readings (tick "machine was reset" on the reading right after it happened).',
      );
    }

    const computedAmount = this.amountFor(units);
    const finalAmount = dto.paidAmount != null && !Number.isNaN(Number(dto.paidAmount)) ? Number(dto.paidAmount) : computedAmount;

    return (this.prisma as any).machineReading.update({
      where: { id },
      data: {
        isPaid: true,
        unitsProduced: units,
        paidAmount: finalAmount,
        paidAt: new Date(),
        paidNote: dto.paidNote?.trim() || null,
        paidById: userId ?? null,
      },
    });
  }

  // Undo — only allowed on the most-recently-paid reading, so the checkpoint
  // chain never gets a hole in the middle.
  async unmarkPaid(id: string) {
    const reading = await (this.prisma as any).machineReading.findUnique({ where: { id } });
    if (!reading) throw new NotFoundException('Reading not found');
    if (!reading.isPaid) throw new BadRequestException('This reading is not marked as paid');
    const laterPaid = await (this.prisma as any).machineReading.findFirst({
      where: { isPaid: true, readingDate: { gt: reading.readingDate } },
    });
    if (laterPaid) throw new BadRequestException('Cannot undo — a later reading has already been marked paid');
    return (this.prisma as any).machineReading.update({
      where: { id },
      data: { isPaid: false, unitsProduced: null, paidAmount: null, paidAt: null, paidNote: null, paidById: null },
    });
  }

  // ── Monthly production — each reading's diff (from the reading right
  // before it, resets included) is attributed to the calendar month of the
  // LATER reading. Informational only — actual payments are settled via the
  // checkpoint system above, not tied to calendar months. ─────────────────
  async getMonthlyReadings() {
    const readings = await (this.prisma as any).machineReading.findMany({ orderBy: { readingDate: 'asc' } });
    const byMonth = new Map<string, { unitsProduced: number; readingsCount: number }>();
    for (let i = 1; i < readings.length; i++) {
      const diff = this.diffBetween(Number(readings[i - 1].readingValue), Number(readings[i].readingValue), readings[i].wasReset);
      const d = new Date(readings[i].readingDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = byMonth.get(key) ?? { unitsProduced: 0, readingsCount: 0 };
      entry.unitsProduced += diff;
      entry.readingsCount += 1;
      byMonth.set(key, entry);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, v]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          monthKey: key,
          label: new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          unitsProduced: v.unitsProduced,
          readingsCount: v.readingsCount,
          estimatedAmount: this.amountFor(v.unitsProduced),
        };
      });
  }
}
