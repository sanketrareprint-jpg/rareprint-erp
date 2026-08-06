// backend/src/hr/hr.service.ts
//
// HR Employee Master — the single source of truth for pay/attendance
// calculations. Every employee (whether or not they have a login) gets one
// Employee row here: designation, base salary, required daily hours, paid
// leave quota, registration details (address, ID proof, bank, emergency
// contact), plus KRA/responsibilities and a leave ledger underneath it.
//
// Also owns the salary formula, which mirrors the legacy Google Sheet's
// VLOOKUP-based calculation exactly:
//
//   workingDays   = calendar days in the month that aren't the weekly off
//   leaveDays     = sum of EmployeeLeaveEntry.days recorded in that month
//                   (paid and unpaid both reduce the requirement — that's
//                   how the old sheet did it: leave of any kind lowers the
//                   bar, it doesn't separately dock pay on top of low hours)
//   netDays       = workingDays - leaveDays
//   requiredHours = netDays * employee.workingHoursPerDay
//   hoursWorked   = sum of AttendanceRecord.hoursWorked in that month
//   salary        = hoursWorked === 0
//                     ? 0
//                     : Math.min(baseSalary, (hoursWorked / requiredHours) * baseSalary)
//
// i.e. salary is prorated down when hours fall short of what was required,
// and capped at the full base salary (overtime doesn't multiply pay here —
// that mirrors the old sheet, which had a separate manual overtime add-on).
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Employee, EmployeeKraType, LeaveType, Prisma } from '@prisma/client';
import { GmailDraftService } from '../production/gmail-draft.service';

// The one person who can approve an employee's master record for payroll.
// Checked by email (not a new role tier) so it doesn't disturb the existing
// role === 'ADMIN' checks scattered through the app — any admin can add/edit
// an Employee, only this specific login can approve it.
export const SUPERADMIN_EMAIL = 'sanket.rareprint@gmail.com';

// Where the "employee accepted their HR agreement" confirmation email goes.
// Separate from SUPERADMIN_EMAIL (approval gating) — this is just an FYI
// notification, sent to the shared HR inbox rather than Sanket personally.
const HR_NOTIFY_EMAIL = 'hr.rareprint@gmail.com';

// Editing any of these on an already-approved employee means Sanket needs to
// re-approve before salary can be generated again — they all feed the salary
// formula directly. Contact/bank/ID-proof-number typo fixes don't reset it.
const PAYROLL_FIELDS = [
  'baseSalary', 'workingHoursPerDay', 'paidLeavePerMonth', 'annualPaidLeaveQuota',
  'designation', 'department', 'status', 'overtimeAllowed',
] as const;

export type EmployeeUpsertDto = Partial<{
  employeeCode: string;
  biometricId: string | null;
  userId: string | null;
  fullName: string;
  designation: string;
  department: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED';
  baseSalary: number;
  workingHoursPerDay: number;
  paidLeavePerMonth: number;
  annualPaidLeaveQuota: number | null;
  dateOfJoining: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  mobileNumber: string | null;
  alternateMobile: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  photoUrl: string | null;
  idProofDocUrl: string | null;
  offerLetterUrl: string | null;
  notes: string | null;
  email: string | null;
  overtimeAllowed: boolean;
}>;

/** Weekly off day used to derive "working days in month" (0 = Sunday). Every
 *  employee currently shares the same Mon–Sat schedule (see AttSetting.xls
 *  Schedule Setting sheet), so this is a single constant for now rather than
 *  a per-employee field. */
const WEEKLY_OFF_DOW = 0;

export function workingDaysInMonth(year: number, month: number, offDow = WEEKLY_OFF_DOW): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() !== offDow) count++;
  }
  return count;
}

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailDraftService,
  ) {}

  // ── Employees ──────────────────────────────────────────────────────────

  listEmployees(status?: string) {
    return this.prisma.employee.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { employeeCode: 'asc' },
      include: { _count: { select: { kras: true, leaveEntries: true } } },
    });
  }

  async getEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        kras: { orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] },
        leaveEntries: { orderBy: { date: 'desc' }, take: 50 },
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  /** Suggests the next sequential employee code, e.g. existing RP01..RP17 -> "RP18". */
  async nextEmployeeCode(prefix = 'RP') {
    const employees = await this.prisma.employee.findMany({
      where: { employeeCode: { startsWith: prefix } },
      select: { employeeCode: true },
    });
    const max = employees.reduce((acc, e) => {
      const match = e.employeeCode.slice(prefix.length).match(/^\d+$/);
      return match ? Math.max(acc, parseInt(match[0], 10)) : acc;
    }, 0);
    return { code: `${prefix}${String(max + 1).padStart(2, '0')}` };
  }

  private toDecimalOrUndefined(v: number | null | undefined) {
    if (v === undefined) return undefined;
    return v === null ? null : v;
  }

  async createEmployee(dto: EmployeeUpsertDto): Promise<Employee> {
    if (!dto.employeeCode?.trim()) throw new BadRequestException('employeeCode is required');
    if (!dto.fullName?.trim()) throw new BadRequestException('fullName is required');
    if (!dto.designation?.trim()) throw new BadRequestException('designation is required');
    if (dto.baseSalary === undefined || dto.baseSalary === null) {
      throw new BadRequestException('baseSalary is required');
    }
    try {
      return await this.prisma.employee.create({
        data: {
          employeeCode: dto.employeeCode.trim().toUpperCase(),
          biometricId: dto.biometricId || null,
          userId: dto.userId || null,
          fullName: dto.fullName.trim(),
          designation: dto.designation.trim(),
          department: dto.department ?? null,
          status: (dto.status as any) ?? 'ACTIVE',
          baseSalary: dto.baseSalary,
          workingHoursPerDay: dto.workingHoursPerDay ?? 8,
          paidLeavePerMonth: dto.paidLeavePerMonth ?? 2,
          annualPaidLeaveQuota: this.toDecimalOrUndefined(dto.annualPaidLeaveQuota) ?? null,
          dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender ?? null,
          address: dto.address ?? null,
          mobileNumber: dto.mobileNumber ?? null,
          alternateMobile: dto.alternateMobile ?? null,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          idProofType: dto.idProofType ?? null,
          idProofNumber: dto.idProofNumber ?? null,
          bankAccountNumber: dto.bankAccountNumber ?? null,
          bankIfsc: dto.bankIfsc ?? null,
          photoUrl: dto.photoUrl ?? null,
          idProofDocUrl: dto.idProofDocUrl ?? null,
          offerLetterUrl: dto.offerLetterUrl ?? null,
          notes: dto.notes ?? null,
          email: dto.email ?? null,
          overtimeAllowed: dto.overtimeAllowed ?? false,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(`Employee code, biometric ID, or linked user is already in use (${err.meta?.target})`);
      }
      throw err;
    }
  }

  async updateEmployee(id: string, dto: EmployeeUpsertDto): Promise<Employee> {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');

    const data: Prisma.EmployeeUncheckedUpdateInput = {};
    if (dto.employeeCode !== undefined) data.employeeCode = dto.employeeCode.trim().toUpperCase();
    if (dto.biometricId !== undefined) data.biometricId = dto.biometricId || null;
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.designation !== undefined) data.designation = dto.designation.trim();
    if (dto.department !== undefined) data.department = dto.department;
    if (dto.status !== undefined) data.status = dto.status as any;
    if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
    if (dto.workingHoursPerDay !== undefined) data.workingHoursPerDay = dto.workingHoursPerDay;
    if (dto.paidLeavePerMonth !== undefined) data.paidLeavePerMonth = dto.paidLeavePerMonth;
    if (dto.annualPaidLeaveQuota !== undefined) data.annualPaidLeaveQuota = dto.annualPaidLeaveQuota;
    if (dto.dateOfJoining !== undefined) data.dateOfJoining = dto.dateOfJoining ? new Date(dto.dateOfJoining) : null;
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.mobileNumber !== undefined) data.mobileNumber = dto.mobileNumber;
    if (dto.alternateMobile !== undefined) data.alternateMobile = dto.alternateMobile;
    if (dto.emergencyContactName !== undefined) data.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined) data.emergencyContactPhone = dto.emergencyContactPhone;
    if (dto.idProofType !== undefined) data.idProofType = dto.idProofType;
    if (dto.idProofNumber !== undefined) data.idProofNumber = dto.idProofNumber;
    if (dto.bankAccountNumber !== undefined) data.bankAccountNumber = dto.bankAccountNumber;
    if (dto.bankIfsc !== undefined) data.bankIfsc = dto.bankIfsc;
    if (dto.photoUrl !== undefined) data.photoUrl = dto.photoUrl;
    if (dto.idProofDocUrl !== undefined) data.idProofDocUrl = dto.idProofDocUrl;
    if (dto.offerLetterUrl !== undefined) data.offerLetterUrl = dto.offerLetterUrl;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.overtimeAllowed !== undefined) data.overtimeAllowed = dto.overtimeAllowed;
    if (dto.userId !== undefined) data.userId = dto.userId || null;

    // Any change to a payroll-relevant field re-locks salary generation until
    // Sanket approves the record again (see PAYROLL_FIELDS / approveEmployee).
    const touchesPayrollField = PAYROLL_FIELDS.some((f) => dto[f as keyof EmployeeUpsertDto] !== undefined);
    if (touchesPayrollField && existing.masterDataApproved) {
      data.masterDataApproved = false;
      data.approvedById = null;
      data.approvedAt = null;
    }

    try {
      return await this.prisma.employee.update({ where: { id }, data });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('Employee not found');
      if (err?.code === 'P2002') {
        throw new BadRequestException(`Employee code, biometric ID, or linked user is already in use (${err.meta?.target})`);
      }
      throw err;
    }
  }

  // ── Master-data approval (Sanket only — enforced in the controller) ─────

  async approveEmployee(id: string, approvedById: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id },
      data: { masterDataApproved: true, approvedById, approvedAt: new Date() },
    });
  }

  async unapproveEmployee(id: string) {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id },
      data: { masterDataApproved: false, approvedById: null, approvedAt: null },
    });
  }

  // KRAs, leave entries, and attendance records all cascade-delete via the
  // schema (onDelete: Cascade on Employee relations) — no manual cleanup
  // needed here.
  async deleteEmployee(id: string) {
    try {
      await this.prisma.employee.delete({ where: { id } });
      return { success: true };
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('Employee not found');
      throw err;
    }
  }

  async setEmployeeStatus(id: string, status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED') {
    const isActive = status === 'ACTIVE' || status === 'ON_LEAVE';
    return this.prisma.employee.update({
      where: { id },
      data: {
        status,
        isActive,
        resignedAt: status === 'RESIGNED' || status === 'TERMINATED' ? new Date() : null,
      },
    });
  }

  // ── KRA / Responsibilities ────────────────────────────────────────────

  listKras(employeeId: string) {
    return this.prisma.employeeKra.findMany({
      where: { employeeId },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  addKra(employeeId: string, dto: { type?: EmployeeKraType; title: string; description?: string; targetMetric?: string }) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    return this.prisma.employeeKra.create({
      data: {
        employeeId,
        type: dto.type ?? 'KRA',
        title: dto.title.trim(),
        description: dto.description ?? null,
        targetMetric: dto.targetMetric ?? null,
      },
    });
  }

  updateKra(kraId: string, dto: Partial<{ title: string; description: string | null; targetMetric: string | null; isActive: boolean; type: EmployeeKraType }>) {
    return this.prisma.employeeKra.update({ where: { id: kraId }, data: dto });
  }

  deleteKra(kraId: string) {
    return this.prisma.employeeKra.delete({ where: { id: kraId } });
  }

  // ── Leave ledger ──────────────────────────────────────────────────────

  listLeaveEntries(employeeId: string, year?: number) {
    return this.prisma.employeeLeaveEntry.findMany({
      where: {
        employeeId,
        ...(year ? { date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {}),
      },
      orderBy: { date: 'desc' },
      include: { recordedBy: { select: { id: true, fullName: true } } },
    });
  }

  addLeaveEntry(
    employeeId: string,
    dto: { date: string; endDate?: string; days?: number; type?: LeaveType; reason?: string },
    recordedById: string,
  ) {
    if (!dto.date) throw new BadRequestException('date is required');
    return this.prisma.employeeLeaveEntry.create({
      data: {
        employeeId,
        date: new Date(dto.date),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        days: dto.days ?? 1,
        type: dto.type ?? 'PAID',
        reason: dto.reason ?? null,
        recordedById,
      },
    });
  }

  deleteLeaveEntry(entryId: string) {
    return this.prisma.employeeLeaveEntry.delete({ where: { id: entryId } });
  }

  async leaveBalance(employeeId: string, year: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const entries = await this.prisma.employeeLeaveEntry.findMany({
      where: { employeeId, date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    });
    const takenByType: Record<string, number> = {};
    let takenTotal = 0;
    for (const e of entries) {
      const days = Number(e.days);
      takenTotal += days;
      takenByType[e.type] = (takenByType[e.type] ?? 0) + days;
    }
    const quota = employee.annualPaidLeaveQuota != null
      ? Number(employee.annualPaidLeaveQuota)
      : Number(employee.paidLeavePerMonth) * 12;
    return {
      year,
      quota,
      takenTotal,
      takenByType,
      balance: Math.max(0, quota - takenTotal),
    };
  }

  /** Looks up the Employee row linked to a login (User) account, if any — lets
   *  pages keyed by userId (e.g. Salary & Commission) find the matching HR record. */
  findByUserId(userId: string) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, employeeCode: true, fullName: true },
    });
  }

  async getEmployeeOwnerUserId(id: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { userId: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee.userId;
  }

  // ── Salary calculation (attendance-driven) ───────────────────────────

  async salaryForMonth(employeeId: string, year: number, month: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1); // exclusive

    const [records, leaveEntries] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { employeeId, date: { gte: monthStart, lt: monthEnd } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.employeeLeaveEntry.findMany({
        where: { employeeId, date: { gte: monthStart, lt: monthEnd } },
      }),
    ]);

    const workingDays = workingDaysInMonth(year, month);
    const leaveDays = leaveEntries.reduce((sum, e) => sum + Number(e.days), 0);
    const netDays = Math.max(0, workingDays - leaveDays);
    const workingHoursPerDay = Number(employee.workingHoursPerDay);
    const requiredHours = netDays * workingHoursPerDay;
    const hoursWorked = records.reduce((sum, r) => sum + Number(r.hoursWorked), 0);
    const absentHours = hoursWorked - requiredHours;
    const baseSalary = Number(employee.baseSalary);
    const hourlyRate = requiredHours > 0 ? baseSalary / requiredHours : 0;

    // Overtime: hours beyond what was required are paid at the same hourly
    // rate on top of the (uncapped-by-overtime) base — but only for
    // employees flagged overtimeAllowed. Everyone else keeps the old
    // behaviour: prorated when short, capped at baseSalary when not.
    let salary = 0;
    let overtimeHours = 0;
    let overtimePay = 0;
    if (hoursWorked > 0) {
      if (requiredHours > 0 && hoursWorked > requiredHours) {
        salary = baseSalary;
        if (employee.overtimeAllowed) {
          overtimeHours = hoursWorked - requiredHours;
          overtimePay = overtimeHours * hourlyRate;
          salary = baseSalary + overtimePay;
        }
      } else {
        salary = requiredHours > 0 ? (hoursWorked / requiredHours) * baseSalary : baseSalary;
      }
    }

    const daysMissingPunch = records.filter((r) => !r.timeIn && !r.timeOut && !r.isAbsent && !r.isPaidLeave).length;
    const daysInMonth = new Date(year, month, 0).getDate();
    const recordedDays = records.length;

    // Salary gate: master record must be approved by Sanket before a figure
    // is payable. We still return the full breakdown (useful for admins to
    // review before approving) but zero the payable salary and flag it.
    const approvalRequired = !employee.masterDataApproved;

    return {
      employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      designation: employee.designation,
      year,
      month,
      workingDays,
      leaveDays,
      netDays,
      workingHoursPerDay,
      requiredHours: round2(requiredHours),
      hoursWorked: round2(hoursWorked),
      absentHours: round2(absentHours),
      baseSalary: round2(baseSalary),
      overtimeAllowed: employee.overtimeAllowed,
      overtimeHours: round2(overtimeHours),
      overtimePay: round2(overtimePay),
      calculatedSalary: round2(salary),
      approvalRequired,
      salary: approvalRequired ? 0 : round2(salary),
      daysInMonth,
      recordedDays,
      daysMissingPunch,
      records: records.map((r) => ({
        date: r.date,
        timeIn: r.timeIn,
        timeOut: r.timeOut,
        hoursWorked: Number(r.hoursWorked),
        source: r.source,
        isAbsent: r.isAbsent,
        isPaidLeave: r.isPaidLeave,
        note: r.note,
      })),
    };
  }

  async salarySummary(year: number, month: number, status = 'ACTIVE') {
    const employees = await this.prisma.employee.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { employeeCode: 'asc' },
    });
    const rows = await Promise.all(employees.map((e) => this.salaryForMonth(e.id, year, month)));
    return {
      year,
      month,
      totalSalary: round2(rows.reduce((s, r) => s + r.salary, 0)),
      pendingApprovalCount: rows.filter((r) => r.approvalRequired).length,
      employees: rows,
    };
  }

  // ── Company Terms & Conditions (versioned) ───────────────────────────────

  listTerms() {
    return this.prisma.companyTerms.findMany({ orderBy: { version: 'desc' } });
  }

  getActiveTerms() {
    return this.prisma.companyTerms.findFirst({ where: { isActive: true }, orderBy: { version: 'desc' } });
  }

  async createTerms(dto: { title: string; content: string }, createdById: string) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (!dto.content?.trim()) throw new BadRequestException('content is required');
    const last = await this.prisma.companyTerms.findFirst({ orderBy: { version: 'desc' } });
    const nextVersion = (last?.version ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      await tx.companyTerms.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.companyTerms.create({
        data: {
          version: nextVersion,
          title: dto.title.trim(),
          content: dto.content,
          isActive: true,
          createdById,
        },
      });
    });
  }

  // ── Digital HR agreement (tokenized accept link, clickwrap e-signature) ──

  async sendAgreement(employeeId: string, sentByUserId: string, frontendOrigin: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!employee.email?.trim()) {
      throw new BadRequestException('This employee has no email on file — add one on the Master Record first.');
    }
    const terms = await this.getActiveTerms();
    if (!terms) {
      throw new BadRequestException('No company Terms & Conditions have been set up yet — add one in the Terms & Conditions section first.');
    }

    const token = randomBytes(24).toString('hex');
    const link = `${frontendOrigin.replace(/\/$/, '')}/hr-agreement/${token}`;
    const body =
      `Hi ${employee.fullName},\n\n` +
      `Please review and accept the RarePrint HR agreement (${terms.title}) using the secure link below:\n\n` +
      `${link}\n\n` +
      `This link is unique to you — no login or OTP needed, just review the terms and confirm by typing your name.\n\n` +
      `Regards,\nRarePrint`;

    // Send first, persist second — if Gmail fails (expired token, quota,
    // etc.) we must not mark this as "sent" in the DB, or the UI will show
    // "awaiting acceptance" for a link that was never actually delivered.
    await this.gmail.sendMail(employee.email, `RarePrint HR Agreement — ${terms.title}`, body);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        agreementToken: token,
        agreementTermsId: terms.id,
        agreementSentAt: new Date(),
        agreementAcceptedAt: null,
        agreementAcceptedIp: null,
        agreementSignatureName: null,
      },
    });

    return { sent: true, link };
  }

  async getAgreementByToken(token: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { agreementToken: token },
      include: { agreementTerms: true },
    });
    if (!employee) throw new NotFoundException('Invalid or expired agreement link');
    return {
      employeeName: employee.fullName,
      termsTitle: employee.agreementTerms?.title ?? '',
      termsContent: employee.agreementTerms?.content ?? '',
      alreadyAccepted: !!employee.agreementAcceptedAt,
      acceptedAt: employee.agreementAcceptedAt,
      signatureName: employee.agreementSignatureName,
    };
  }

  async acceptAgreement(token: string, dto: { signatureName: string; ip?: string; idProofDocUrl: string }) {
    if (!dto.signatureName?.trim()) throw new BadRequestException('Please type your full name to accept.');
    if (!dto.idProofDocUrl) throw new BadRequestException('Please attach a scan or photo of your ID proof.');
    const employee = await this.prisma.employee.findUnique({
      where: { agreementToken: token },
      include: { agreementTerms: true },
    });
    if (!employee) throw new NotFoundException('Invalid or expired agreement link');
    if (employee.agreementAcceptedAt) {
      return { alreadyAccepted: true, acceptedAt: employee.agreementAcceptedAt };
    }
    const updated = await this.prisma.employee.update({
      where: { agreementToken: token },
      data: {
        agreementAcceptedAt: new Date(),
        agreementAcceptedIp: dto.ip ?? null,
        agreementSignatureName: dto.signatureName.trim(),
        idProofDocUrl: dto.idProofDocUrl,
      },
    });

    // Best-effort notification — the acceptance itself is already committed
    // above, so a Gmail hiccup here must not fail the employee's request.
    const notifyBody =
      `${employee.fullName} (${employee.employeeCode}) just accepted the RarePrint HR agreement` +
      `${employee.agreementTerms?.title ? ` (${employee.agreementTerms.title})` : ''}.\n\n` +
      `Signed as: ${updated.agreementSignatureName}\n` +
      `Accepted at: ${updated.agreementAcceptedAt?.toLocaleString('en-IN')}\n` +
      `IP address: ${updated.agreementAcceptedIp ?? 'unknown'}\n\n` +
      `An ID proof scan was uploaded and attached to their HR record — check the Employee Master in the ERP (HR section) to view it.`;
    this.gmail
      .sendMail(HR_NOTIFY_EMAIL, `HR Agreement Accepted — ${employee.fullName}`, notifyBody)
      .catch((err) => this.logger.warn(`Failed to send agreement-acceptance notification: ${err?.message ?? err}`));

    return { alreadyAccepted: false, acceptedAt: updated.agreementAcceptedAt };
  }
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
