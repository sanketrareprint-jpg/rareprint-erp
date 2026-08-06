// backend/src/attendance/attendance.service.ts
//
// Imports the biometric in/out machine's monthly export and turns it into
// AttendanceRecord rows (one per employee per day), which HrService.salaryForMonth
// then reads to calculate pay.
//
// The machine (ZKTeco-style) exports a multi-sheet .xls workbook. The sheet
// worth parsing is the "Exception Statistic Report" — one row per employee
// per day, with clean columns (ID, Name, Department, Date, On-duty, Off-duty,
// second time zone, Late/Early/Absence minutes). It's usually named
// "Exception Stat.", but it's sometimes re-exported with that tab deleted
// (to avoid two sheets that look like they mean the same thing), leaving the
// same data on whatever sheet remains — e.g. literally named "Sheet1". So
// findExceptionSheet() below matches by CONTENT (the report's own title
// text, then its header-row shape) rather than trusting the sheet's name.
// The other sheets ("Att.log report") pack every punch of the day into a
// single concatenated string per cell (e.g. "10:56 18:42 18:44" with no
// separator) and are not used here.
//
// hoursWorked is always computed here from the On-duty/Off-duty columns
// (computeHoursWorked, below) — the report's own "Total(Min)" column is
// intentionally never read. That column is baked in at export time, so if a
// day gets hand-corrected afterwards (thumb reader missed a punch, on-duty/
// off-duty edited manually) it would go stale; recomputing from the actual
// times avoids that entirely.
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

// Excel stores a time-only cell as a fraction of 24h (e.g. 0.3854166... =
// 09:15) whenever the cell isn't explicitly typed as text. Some rows in a
// given export are formatted as text ("09:15") and some as an actual time
// value — xlsx's raw:true read returns the fraction as a plain JS number for
// the latter, and cellStr() was just stringifying that number as-is, which
// is exactly the "0.3854166" showing up on the Attendance page instead of a
// real time. Handles both forms (and HH:MM:SS, just in case) and always
// normalizes to "HH:MM".
function parseTimeCell(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    const fraction = v - Math.floor(v); // ignore any whole-day part
    let totalMinutes = Math.round(fraction * 24 * 60);
    totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/); // HH:MM or HH:MM:SS
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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

// Finds the "Exception Statistic Report"-shaped sheet by its CONTENT, not
// its name. Previously this only matched a sheet literally named
// "Exception Stat." — but the report is sometimes re-exported with that tab
// deleted (to avoid having two sheets that look like they mean the same
// thing) and the same data ends up on whatever sheet is left, e.g. one
// literally named "Sheet1". Matching by content means it keeps working no
// matter what the tab happens to be called.
function findExceptionSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  // 1. Look for the report's own title text in the first few rows of any sheet.
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }).slice(0, 10);
    const text = aoa.map((row) => (row ?? []).map(cellStr).join(' ')).join(' ').toLowerCase();
    if (text.includes('exception statistic report')) return sheet;
  }
  // 2. Fall back to the actual header-row shape (ID / Name / Date / On-duty),
  //    in case the title text got trimmed but the data itself is still there.
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }).slice(0, 10);
    for (const row of aoa) {
      const cells = row ?? [];
      const joined = cells.map(cellStr).join(' | ').toLowerCase();
      if (cellStr(cells[0]).toLowerCase() === 'id' && joined.includes('name') && joined.includes('date') && joined.includes('on-duty')) {
        return sheet;
      }
    }
  }
  // 3. Last resort: name-based match, covering both the original export name
  //    and the common "data ended up on Sheet1" case.
  const name = wb.SheetNames.find((n) => /exception/i.test(n) || /^sheet\s*1$/i.test(n.trim()));
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
      onDuty1: parseTimeCell(r[4]),
      offDuty1: parseTimeCell(r[5]),
      onDuty2: parseTimeCell(r[6]),
      offDuty2: parseTimeCell(r[7]),
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
        `Could not find an "Exception Statistic Report" sheet in ${fileName} (checked every tab by name and by content, including a plain "Sheet1"). Export the "Exception Statistic Report" from the attendance machine software and upload that .xls file.`,
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

  // Marks one import session as the authoritative sheet for whatever month(s)
  // its period overlaps. Only one session can be final per overlapping
  // period — marking a new one final automatically un-finals any other
  // session that overlaps the same period, so "final" always means exactly
  // one sheet per month, not a growing pile of them.
  async finalizeImportSession(sessionId: string) {
    const session = await this.prisma.attendanceImportSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Import session not found');
    await this.prisma.attendanceImportSession.updateMany({
      where: {
        id: { not: sessionId },
        isFinal: true,
        periodStart: { lte: session.periodEnd },
        periodEnd: { gte: session.periodStart },
      },
      data: { isFinal: false },
    });
    return this.prisma.attendanceImportSession.update({ where: { id: sessionId }, data: { isFinal: true } });
  }

  async unfinalizeImportSession(sessionId: string) {
    const session = await this.prisma.attendanceImportSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Import session not found');
    return this.prisma.attendanceImportSession.update({ where: { id: sessionId }, data: { isFinal: false } });
  }

  /** The session flagged final for a given month, if any. Shared by the grid and salaryForMonth so both agree on what's "the" sheet. */
  async getFinalSessionForMonth(monthStart: Date, monthEnd: Date) {
    return this.prisma.attendanceImportSession.findFirst({
      where: { isFinal: true, periodStart: { lt: monthEnd }, periodEnd: { gte: monthStart } },
    });
  }

  // ── Monthly grid (editable) ──────────────────────────────────────────

  async getMonthGrid(employeeId: string, year: number, month: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);

    // If a sheet's been marked Final for this month, only its rows (plus any
    // hand-corrected days, which always take precedence regardless of which
    // sheet they came from) are shown — any other import for the same month
    // is ignored. Before anything's finalized, everything imported/edited so
    // far is shown, same as before this feature existed.
    const finalSession = await this.getFinalSessionForMonth(monthStart, monthEnd);
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        date: { gte: monthStart, lt: monthEnd },
        ...(finalSession
          ? { OR: [{ importSessionId: finalSession.id }, { source: { in: ['MANUAL', 'EDITED'] } }] }
          : {}),
      },
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
        // Flag on hoursWorked===0 alone (not "both timeIn and timeOut missing") —
        // a punch-in with no matching punch-out (e.g. thumb missed the second
        // scan) still has a timeIn, so the old condition let it through as 0
        // hours with no review flag. Confirmed against real data: 2 rows in a
        // real import had exactly this shape and were silently paid as 0 hours.
        needsReview: !!r && !r.isAbsent && !r.isPaidLeave && Number(r.hoursWorked) === 0,
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
      finalSessionId: finalSession?.id ?? null,
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
