// backend/src/attendance/attendance.service.ts
//
// Imports the biometric in/out machine's monthly export and turns it into
// AttendanceRecord rows (one per employee per day), which HrService.salaryForMonth
// then reads to calculate pay.
//
// The machine (ZKTeco-style) exports a multi-sheet .xls workbook. The sheet
// worth parsing is "Exception Stat." — one row per employee per day, with
// clean columns (ID, Name, Department, Date, On-duty, Off-duty, second time
// zone, Late/Early/Absence minutes). The other sheets ("Att.log report") pack
// every punch of the day into a single concatenated string per cell (e.g.
// "10:56 18:42 18:44" with no separator) and are not used here.
//
// The machine's own numeric ID (e.g. "1", "2"...) is NOT the same as the
// employeeCode used elsewhere in the ERP (e.g. "RP02") — it's whatever order
// the employee was enrolled on the device. Employee.biometricId stores that
// mapping; rows for an unmapped ID are skipped and reported back so an admin
// can fill in the mapping once (Employee edit form) and re-import.
//
// Manual edits always win: if a day was already hand-corrected (source
// MANUAL or EDITED), re-importing the same month will not overwrite it.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

type ParsedRow = {
  biometricId: string;
  name: string;
  date: Date;
  onDuty1: string | null;
  offDuty1: string | null;
  onDuty2: string | null;
  offDuty2: string | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  absenceMinutes: number | null;
};

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function timeToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Hours worked from up to two in/out pairs (first shift + post-lunch second shift). */
export function computeHoursWorked(onDuty1: string | null, offDuty1: string | null, onDuty2: string | null, offDuty2: string | null): number {
  let minutes = 0;
  const i1 = timeToMinutes(onDuty1);
  const o1 = timeToMinutes(offDuty1);
  if (i1 !== null && o1 !== null && o1 > i1) minutes += o1 - i1;
  const i2 = timeToMinutes(onDuty2);
  const o2 = timeToMinutes(offDuty2);
  if (i2 !== null && o2 !== null && o2 > i2) minutes += o2 - i2;
  return Math.round((minutes / 60) * 100) / 100;
}

function parseCellDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    // Excel serial date (days since 1899-12-30)
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  const s = cellStr(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function findExceptionSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  const name = wb.SheetNames.find((n) => /exception/i.test(n));
  return name ? wb.Sheets[name] : null;
}

function parseExceptionSheet(sheet: XLSX.WorkSheet): { rows: ParsedRow[]; periodStart: Date | null; periodEnd: Date | null } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i] ?? [];
    const joined = row.map(cellStr).join(' | ').toLowerCase();
    const dateRangeMatch = joined.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    if (dateRangeMatch) {
      periodStart = parseCellDate(dateRangeMatch[1]);
      periodEnd = parseCellDate(dateRangeMatch[2]);
    }
    if (cellStr(row[0]).toLowerCase() === 'id' && joined.includes('name') && joined.includes('date')) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new BadRequestException(
      'Could not find the "ID / Name / Date" header row in the "Exception Stat." sheet — is this the right machine export?',
    );
  }

  const rows: ParsedRow[] = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const biometricId = cellStr(r[0]);
    const date = parseCellDate(r[3]);
    if (!biometricId || biometricId.toLowerCase() === 'id' || !date) continue; // subheader / blank rows
    rows.push({
      biometricId,
      name: cellStr(r[1]),
      date,
      onDuty1: cellStr(r[4]) || null,
      offDuty1: cellStr(r[5]) || null,
      onDuty2: cellStr(r[6]) || null,
      offDuty2: cellStr(r[7]) || null,
      lateMinutes: r[8] != null && r[8] !== '' ? Number(r[8]) : null,
      earlyLeaveMinutes: r[9] != null && r[9] !== '' ? Number(r[9]) : null,
      absenceMinutes: r[10] != null && r[10] !== '' ? Number(r[10]) : null,
    });
  }

  if (!periodStart || !periodEnd) {
    const dates = rows.map((r) => r.date.getTime());
    if (dates.length) {
      periodStart = new Date(Math.min(...dates));
      periodEnd = new Date(Math.max(...dates));
    }
  }

  return { rows, periodStart, periodEnd };
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async importFromMachineReport(buffer: Buffer, fileName: string, importedById: string) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheet = findExceptionSheet(wb);
    if (!sheet) {
      throw new BadRequestException(
        `No "Exception Stat." sheet found in ${fileName}. Export the "Exception Statistic Report" from the attendance machine software and upload that .xls file.`,
      );
    }
    const { rows, periodStart, periodEnd } = parseExceptionSheet(sheet);
    if (!periodStart || !periodEnd) {
      throw new BadRequestException('Could not determine the report period (no dates found in the sheet).');
    }

    const employees = await this.prisma.employee.findMany({ where: { biometricId: { not: null } } });
    const byBiometricId = new Map(employees.map((e) => [e.biometricId as string, e]));

    const session = await this.prisma.attendanceImportSession.create({
      data: { fileName, periodStart, periodEnd, importedById, rowsFound: rows.length },
    });

    let rowsImported = 0;
    let rowsSkipped = 0;
    const unmatched = new Map<string, string>(); // biometricId -> name

    // Was doing one findUnique + one upsert PER ROW, sequentially awaited —
    // for a full month (employees × ~30 days) that's hundreds of one-at-a-time
    // round trips to the remote DB, which is what made the import spin for a
    // long time. Fetch every existing record for the period in a single query
    // up front, then fire the upserts concurrently instead of one at a time.
    const existingRecords = employees.length
      ? await this.prisma.attendanceRecord.findMany({
          where: { employeeId: { in: employees.map((e) => e.id) }, date: { gte: periodStart, lte: periodEnd } },
        })
      : [];
    const existingByKey = new Map(existingRecords.map((r) => [`${r.employeeId}|${r.date.getTime()}`, r]));

    const upserts: Promise<unknown>[] = [];
    for (const row of rows) {
      const employee = byBiometricId.get(row.biometricId);
      if (!employee) {
        unmatched.set(row.biometricId, row.name);
        rowsSkipped++;
        continue;
      }

      const existing = existingByKey.get(`${employee.id}|${row.date.getTime()}`);
      if (existing && (existing.source === 'MANUAL' || existing.source === 'EDITED')) {
        rowsSkipped++; // a human already corrected this day — never clobber it on re-import
        continue;
      }

      const hoursWorked = computeHoursWorked(row.onDuty1, row.offDuty1, row.onDuty2, row.offDuty2);
      const hasAnyPunch = !!(row.onDuty1 || row.offDuty1 || row.onDuty2 || row.offDuty2);
      const isAbsent = !hasAnyPunch;

      upserts.push(
        this.prisma.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: employee.id, date: row.date } },
          create: {
            employeeId: employee.id,
            date: row.date,
            timeIn: row.onDuty1,
            timeOut: row.offDuty2 || row.offDuty1, // last punch of the day
            secondTimeIn: row.offDuty1 && row.onDuty2 ? row.onDuty2 : null,
            secondTimeOut: row.offDuty1 && row.onDuty2 ? row.offDuty2 : null,
            hoursWorked,
            lateMinutes: row.lateMinutes,
            earlyLeaveMinutes: row.earlyLeaveMinutes,
            isAbsent,
            source: 'IMPORTED',
            importSessionId: session.id,
          },
          update: {
            timeIn: row.onDuty1,
            timeOut: row.offDuty2 || row.offDuty1,
            secondTimeIn: row.offDuty1 && row.onDuty2 ? row.onDuty2 : null,
            secondTimeOut: row.offDuty1 && row.onDuty2 ? row.offDuty2 : null,
            hoursWorked,
            lateMinutes: row.lateMinutes,
            earlyLeaveMinutes: row.earlyLeaveMinutes,
            isAbsent,
            source: 'IMPORTED',
            importSessionId: session.id,
          },
        }).then(() => { rowsImported++; }),
      );
    }
    await Promise.all(upserts);

    const unmatchedIds = Array.from(unmatched.entries()).map(([id, name]) => ({ id, name }));
    await this.prisma.attendanceImportSession.update({
      where: { id: session.id },
      data: { rowsImported, rowsSkipped, unmatchedIds: JSON.stringify(unmatchedIds) },
    });

    return {
      sessionId: session.id,
      periodStart,
      periodEnd,
      rowsFound: rows.length,
      rowsImported,
      rowsSkipped,
      unmatchedIds,
    };
  }

  listImportSessions() {
    return this.prisma.attendanceImportSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { importedBy: { select: { fullName: true } } },
    });
  }

  // ── Monthly grid (editable) ──────────────────────────────────────────

  async getMonthGrid(employeeId: string, year: number, month: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: monthStart, lt: monthEnd } },
    });
    const byDate = new Map(records.map((r) => [r.date.toISOString().slice(0, 10), r]));

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const key = date.toISOString().slice(0, 10);
      const r = byDate.get(key);
      days.push({
        date: key,
        day: d,
        dow: date.getDay(),
        timeIn: r?.timeIn ?? null,
        timeOut: r?.timeOut ?? null,
        hoursWorked: r ? Number(r.hoursWorked) : 0,
        isAbsent: r?.isAbsent ?? false,
        isPaidLeave: r?.isPaidLeave ?? false,
        source: r?.source ?? null,
        note: r?.note ?? null,
        needsReview: !!r && !r.isAbsent && !r.isPaidLeave && !r.timeIn && !r.timeOut && Number(r.hoursWorked) === 0,
      });
    }

    return {
      employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      workingHoursPerDay: Number(employee.workingHoursPerDay),
      year,
      month,
      days,
    };
  }

  /** Manual entry/correction for a single day — used when the thumb reader misses a punch. */
  async upsertDay(
    employeeId: string,
    date: string,
    dto: { timeIn?: string | null; timeOut?: string | null; hoursWorked?: number; isAbsent?: boolean; isPaidLeave?: boolean; note?: string },
    editedById: string,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const parsedDate = parseCellDate(date) ?? new Date(date);
    if (isNaN(parsedDate.getTime())) throw new BadRequestException('Invalid date');

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: parsedDate } },
    });

    const timeIn = dto.timeIn !== undefined ? dto.timeIn : existing?.timeIn ?? null;
    const timeOut = dto.timeOut !== undefined ? dto.timeOut : existing?.timeOut ?? null;
    const hoursWorked = dto.hoursWorked !== undefined
      ? dto.hoursWorked
      : (dto.timeIn !== undefined || dto.timeOut !== undefined)
        ? computeHoursWorked(timeIn, timeOut, null, null)
        : existing
          ? Number(existing.hoursWorked)
          : 0;

    const source = existing && existing.source === 'IMPORTED' ? 'EDITED' : existing ? existing.source : 'MANUAL';

    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: parsedDate } },
      create: {
        employeeId,
        date: parsedDate,
        timeIn,
        timeOut,
        hoursWorked,
        isAbsent: dto.isAbsent ?? false,
        isPaidLeave: dto.isPaidLeave ?? false,
        note: dto.note ?? null,
        source: 'MANUAL',
        editedById,
      },
      update: {
        timeIn,
        timeOut,
        hoursWorked,
        isAbsent: dto.isAbsent ?? existing?.isAbsent ?? false,
        isPaidLeave: dto.isPaidLeave ?? existing?.isPaidLeave ?? false,
        note: dto.note !== undefined ? dto.note : existing?.note ?? null,
        source,
        editedById,
      },
    });
  }
}
