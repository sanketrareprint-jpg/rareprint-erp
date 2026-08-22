// backend/src/certificate-generator/certificate-generator.service.ts
//
// Bulk certificate generation: template CRUD, Excel/CSV upload + column
// mapping + row validation, single-certificate preview, and the actual
// print-ready PDF generation (imposed onto sheets via imposition.ts,
// rendered via render.ts). No Redis/BullMQ in this codebase (see
// docs/plan) — generation runs as a fire-and-forget async call from
// startGeneration(), updating row counters on the CertificateJob row as it
// goes; the frontend polls getJobStatus() for progress, the same shape
// already used by long-running Excel imports like BankImportSession.
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { registerCertificateFonts, FONT_FAMILIES, isFontFamily } from './fonts';
import { drawCertificate, type CertificateField, type FieldAlign, type FieldVAlign } from './render';
import { computeImposition, computeSheetCount, type ImpositionInput } from './imposition';

const MAX_TEMPLATE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
const ALLOWED_DPI = [72, 150, 200, 300, 600];

const DEFAULT_SHEET_SETTINGS = {
  sheetWidthIn: 12,
  sheetHeightIn: 18,
  marginIn: 0.25,
  gapIn: 0.1,
  allowRotation: true,
};

type SheetSettings = Omit<ImpositionInput, 'certWidthIn' | 'certHeightIn'>;

interface RawFieldInput {
  key?: unknown;
  label?: unknown;
  x?: unknown; y?: unknown; w?: unknown; h?: unknown;
  fontFamily?: unknown;
  fontSizePt?: unknown;
  bold?: unknown;
  color?: unknown;
  align?: unknown;
  verticalAlign?: unknown;
}

function normalizeFields(input: unknown): CertificateField[] {
  if (!Array.isArray(input) || !input.length) throw new BadRequestException('At least one field is required');
  const seenKeys = new Set<string>();
  return input.map((raw, i) => {
    const f = raw as RawFieldInput;
    if (typeof f.key !== 'string' || !f.key.trim()) throw new BadRequestException(`fields[${i}].key is required`);
    const key = f.key.trim();
    if (seenKeys.has(key)) throw new BadRequestException(`Duplicate field key "${key}"`);
    seenKeys.add(key);

    const fontFamily = isFontFamily(f.fontFamily) ? f.fontFamily : FONT_FAMILIES[0];
    const align: FieldAlign = f.align === 'center' || f.align === 'right' ? f.align : 'left';
    const verticalAlign: FieldVAlign = f.verticalAlign === 'middle' || f.verticalAlign === 'bottom' ? f.verticalAlign : 'top';

    return {
      key,
      label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : key,
      xIn: Number(f.x) || 0,
      yIn: Number(f.y) || 0,
      wIn: Math.max(0.1, Number(f.w) || 1),
      hIn: Math.max(0.05, Number(f.h) || 0.3),
      fontFamily,
      fontSizePt: Math.min(144, Math.max(6, Number(f.fontSizePt) || 18)),
      bold: Boolean(f.bold),
      color: typeof f.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(f.color) ? f.color : '#111111',
      align,
      verticalAlign,
    };
  });
}

function normalizeSheetSettings(input: unknown): SheetSettings {
  const raw = (input ?? {}) as Partial<Record<keyof typeof DEFAULT_SHEET_SETTINGS, unknown>>;
  const sheetWidthIn = Number(raw.sheetWidthIn);
  const sheetHeightIn = Number(raw.sheetHeightIn);
  return {
    sheetWidthIn: sheetWidthIn > 0 ? sheetWidthIn : DEFAULT_SHEET_SETTINGS.sheetWidthIn,
    sheetHeightIn: sheetHeightIn > 0 ? sheetHeightIn : DEFAULT_SHEET_SETTINGS.sheetHeightIn,
    marginIn: Math.max(0, Number(raw.marginIn) || 0),
    gapIn: Math.max(0, Number(raw.gapIn) || 0),
    allowRotation: raw.allowRotation !== false,
  };
}

function normalizeHeader(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, 'base64');
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => String(v ?? '').trim() === '');
}

async function bufferFromPdfDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

@Injectable()
export class CertificateGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────── Templates ─────────────────────────

  async createTemplate(params: {
    name: string;
    widthIn: number;
    heightIn: number;
    dpi?: number;
    fields: unknown;
    file: Express.Multer.File;
    userId: string;
  }) {
    if (!params.name?.trim()) throw new BadRequestException('name is required');
    if (!params.file) throw new BadRequestException('Template image is required (field: file)');
    if (!params.file.mimetype?.startsWith('image/')) throw new BadRequestException('Template must be an image file (JPG/PNG)');
    if (params.file.size > MAX_TEMPLATE_IMAGE_BYTES) throw new BadRequestException('Template image too large (max 8MB)');

    const widthIn = Number(params.widthIn);
    const heightIn = Number(params.heightIn);
    if (!(widthIn > 0) || !(heightIn > 0)) throw new BadRequestException('widthIn/heightIn must be positive numbers');
    const dpi = ALLOWED_DPI.includes(Number(params.dpi)) ? Number(params.dpi) : 300;
    const fields = normalizeFields(typeof params.fields === 'string' ? JSON.parse(params.fields) : params.fields);
    const imageDataUrl = `data:${params.file.mimetype};base64,${params.file.buffer.toString('base64')}`;

    return this.prisma.certificateTemplate.create({
      data: {
        name: params.name.trim(),
        imageDataUrl,
        widthIn,
        heightIn,
        dpi,
        fields: fields as unknown as object,
        createdById: params.userId,
      },
    });
  }

  listTemplates() {
    return this.prisma.certificateTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, widthIn: true, heightIn: true, dpi: true, fields: true, createdAt: true, updatedAt: true },
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.certificateTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async updateTemplate(id: string, params: { name?: string; fields?: unknown }) {
    await this.getTemplate(id);
    const data: Record<string, unknown> = {};
    if (typeof params.name === 'string' && params.name.trim()) data.name = params.name.trim();
    if (params.fields !== undefined) data.fields = normalizeFields(params.fields) as unknown as object;
    return this.prisma.certificateTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    const jobCount = await this.prisma.certificateJob.count({ where: { templateId: id } });
    if (jobCount > 0) {
      throw new BadRequestException('This template has generation jobs against it — its history stays auditable, so it cannot be deleted');
    }
    await this.prisma.certificateTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ───────────────────────── Preview ─────────────────────────

  async previewCertificate(templateId: string, sampleValues: Record<string, string>): Promise<Buffer> {
    const template = await this.getTemplate(templateId);
    const widthIn = Number(template.widthIn);
    const heightIn = Number(template.heightIn);
    const templateImage = dataUrlToBuffer(template.imageDataUrl);
    const fields = template.fields as unknown as CertificateField[];

    const doc = new PDFDocument({ size: [widthIn * 72, heightIn * 72], margin: 0 });
    registerCertificateFonts(doc);
    const pending = bufferFromPdfDoc(doc);
    drawCertificate(doc, 0, 0, widthIn, heightIn, false, templateImage, fields, sampleValues ?? {});
    doc.end();
    return pending;
  }

  // ───────────────────────── Excel upload / mapping ─────────────────────────

  async createJobFromUpload(params: { templateId: string; file: Express.Multer.File; userId: string }) {
    const template = await this.getTemplate(params.templateId);
    if (!params.file) throw new BadRequestException('Excel/CSV file is required (field: file)');
    if (params.file.size > MAX_EXCEL_BYTES) throw new BadRequestException('File too large (max 10MB)');

    let rows: Record<string, unknown>[];
    let columns: string[];
    try {
      const workbook = XLSX.read(params.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, unknown>[];
      columns = rows.length ? Object.keys(rows[0]) : [];
    } catch {
      throw new BadRequestException('Could not read this file — please upload a valid .xlsx, .xls, or .csv file');
    }
    if (!rows.length) throw new BadRequestException('No data rows found in this file');

    const fields = template.fields as unknown as CertificateField[];
    const suggestedMapping: Record<string, string> = {};
    for (const field of fields) {
      const match = columns.find(
        (c) => normalizeHeader(c) === normalizeHeader(field.label) || normalizeHeader(c) === normalizeHeader(field.key),
      );
      if (match) suggestedMapping[field.key] = match;
    }

    const { valid, invalid } = this.validateRows(fields, suggestedMapping, rows);

    const job = await this.prisma.certificateJob.create({
      data: {
        templateId: template.id,
        fileName: params.file.originalname,
        rawRows: rows as unknown as object,
        columnMapping: suggestedMapping as unknown as object,
        sheetSettings: DEFAULT_SHEET_SETTINGS as unknown as object,
        rowsTotal: rows.length,
        status: 'DRAFT',
        createdById: params.userId,
      },
    });

    return {
      jobId: job.id,
      columns,
      suggestedMapping,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 3),
      validation: { validCount: valid.length, invalidCount: invalid.length, invalid: invalid.slice(0, 20) },
    };
  }

  // ───────────────────────── Validation ─────────────────────────

  private validateRows(fields: CertificateField[], columnMapping: Record<string, string>, rawRows: Record<string, unknown>[]) {
    const requiredKeys = fields.map((f) => f.key);
    const valid: Array<Record<string, string>> = [];
    const invalid: Array<{ rowIndex: number; reason: string }> = [];

    rawRows.forEach((row, idx) => {
      if (isEmptyRow(row)) {
        invalid.push({ rowIndex: idx, reason: 'empty row' });
        return;
      }
      const values: Record<string, string> = {};
      let missingKey: string | null = null;
      for (const key of requiredKeys) {
        const column = columnMapping[key];
        const str = String((column ? row[column] : '') ?? '').trim();
        if (!str && !missingKey) missingKey = key;
        values[key] = str;
      }
      if (missingKey) {
        invalid.push({ rowIndex: idx, reason: `missing value for "${missingKey}"` });
        return;
      }
      valid.push(values);
    });

    return { valid, invalid };
  }

  async previewValidation(jobId: string, columnMapping: Record<string, string>) {
    const job = await this.getJob(jobId);
    const template = await this.getTemplate(job.templateId);
    const fields = template.fields as unknown as CertificateField[];
    const rawRows = job.rawRows as unknown as Record<string, unknown>[];
    const { valid, invalid } = this.validateRows(fields, columnMapping ?? (job.columnMapping as Record<string, string>), rawRows);
    return { totalRows: rawRows.length, validCount: valid.length, invalidCount: invalid.length, invalid: invalid.slice(0, 50) };
  }

  // ───────────────────────── Generate ─────────────────────────

  async startGeneration(
    jobId: string,
    body: { columnMapping: Record<string, string>; sheetSettings?: unknown; invalidRowMode?: 'SKIP' | 'BLANK' },
  ) {
    const job = await this.getJob(jobId);
    if (job.status === 'PROCESSING') throw new BadRequestException('This job is already generating');
    if (!body.columnMapping || typeof body.columnMapping !== 'object') {
      throw new BadRequestException('columnMapping is required');
    }

    const sheetSettings = normalizeSheetSettings(body.sheetSettings);
    const invalidRowMode = body.invalidRowMode === 'BLANK' ? 'BLANK' : 'SKIP';

    await this.prisma.certificateJob.update({
      where: { id: jobId },
      data: {
        columnMapping: body.columnMapping as unknown as object,
        sheetSettings: sheetSettings as unknown as object,
        invalidRowMode,
        status: 'PROCESSING',
        rowsGenerated: 0,
        rowsFailed: 0,
        errorMessage: null,
      },
    });

    // Fire-and-forget: intentionally not awaited so the HTTP request returns
    // immediately and the frontend polls getJobStatus() for progress — see
    // the plan's "Background processing" section (no Redis/BullMQ here).
    void this.runGeneration(jobId, sheetSettings, body.columnMapping, invalidRowMode).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.certificateJob
        .update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: message.slice(0, 2000) } })
        .catch(() => undefined);
    });

    return { jobId, status: 'PROCESSING' as const };
  }

  private async runGeneration(
    jobId: string,
    sheetSettings: SheetSettings,
    columnMapping: Record<string, string>,
    invalidRowMode: 'SKIP' | 'BLANK',
  ): Promise<void> {
    const job = await this.getJob(jobId);
    const template = await this.getTemplate(job.templateId);
    const fields = template.fields as unknown as CertificateField[];
    const templateImage = dataUrlToBuffer(template.imageDataUrl);
    const certWidthIn = Number(template.widthIn);
    const certHeightIn = Number(template.heightIn);
    const rawRows = job.rawRows as unknown as Record<string, unknown>[];

    const { valid, invalid } = this.validateRows(fields, columnMapping, rawRows);
    // Rows genuinely excluded from the output — used for the final
    // rowsFailed count. In SKIP mode that's every row validateRows flagged
    // (missing fields or empty). In BLANK mode, a row with some missing
    // fields is still rendered (with blanks) so it must NOT be counted as
    // failed — only fully empty rows are excluded either way.
    let rowsToRender = valid;
    let excludedCount = invalid.length;
    if (invalidRowMode === 'BLANK') {
      const nonEmptyRows = rawRows.filter((row) => !isEmptyRow(row));
      excludedCount = rawRows.length - nonEmptyRows.length; // only truly empty rows are excluded
      rowsToRender = nonEmptyRows.map((row) => {
        const values: Record<string, string> = {};
        for (const field of fields) {
          const column = columnMapping[field.key];
          values[field.key] = String((column ? row[column] : '') ?? '').trim();
        }
        return values;
      });
    }

    if (!rowsToRender.length) {
      throw new BadRequestException('No valid rows to generate — check the column mapping');
    }

    const imposition = computeImposition({
      sheetWidthIn: sheetSettings.sheetWidthIn,
      sheetHeightIn: sheetSettings.sheetHeightIn,
      certWidthIn,
      certHeightIn,
      marginIn: sheetSettings.marginIn,
      gapIn: sheetSettings.gapIn,
      allowRotation: sheetSettings.allowRotation,
    });
    if (imposition.perSheet === 0) {
      throw new BadRequestException(
        `The certificate (${certWidthIn}×${certHeightIn}in) does not fit on the sheet (${sheetSettings.sheetWidthIn}×${sheetSettings.sheetHeightIn}in) with the current margin/gap settings`,
      );
    }

    const pageSize: [number, number] = [sheetSettings.sheetWidthIn * 72, sheetSettings.sheetHeightIn * 72];
    const doc = new PDFDocument({ size: pageSize, margin: 0, bufferPages: true });
    registerCertificateFonts(doc);
    const pending = bufferFromPdfDoc(doc);

    let rendered = 0;
    let failed = 0;
    const totalSheets = computeSheetCount(rowsToRender.length, imposition.perSheet);

    for (let sheetIndex = 0; sheetIndex < totalSheets; sheetIndex++) {
      if (sheetIndex > 0) doc.addPage({ size: pageSize, margin: 0 });
      const sheetRows = rowsToRender.slice(sheetIndex * imposition.perSheet, (sheetIndex + 1) * imposition.perSheet);
      sheetRows.forEach((values, slotIndex) => {
        const slot = imposition.slots[slotIndex];
        try {
          drawCertificate(doc, slot.xIn, slot.yIn, certWidthIn, certHeightIn, imposition.rotated, templateImage, fields, values);
          rendered++;
        } catch {
          failed++;
        }
      });
      // Persist progress once per sheet (not per certificate) so polling
      // reflects real movement on large batches without hammering the DB.
      await this.prisma.certificateJob
        .update({ where: { id: jobId }, data: { rowsGenerated: rendered, rowsFailed: failed } })
        .catch(() => undefined);
    }

    doc.end();
    const pdfBuffer = await pending;
    const resultPdfUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

    await this.prisma.certificateJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', rowsGenerated: rendered, rowsFailed: failed + excludedCount, resultPdfUrl },
    });
  }

  async getJob(jobId: string) {
    const job = await this.prisma.certificateJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async getJobStatus(jobId: string) {
    const job = await this.getJob(jobId);
    return {
      id: job.id,
      status: job.status,
      rowsTotal: job.rowsTotal,
      rowsGenerated: job.rowsGenerated,
      rowsFailed: job.rowsFailed,
      errorMessage: job.errorMessage,
    };
  }

  async downloadJob(jobId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const job = await this.getJob(jobId);
    if (job.status !== 'COMPLETED' || !job.resultPdfUrl) {
      throw new BadRequestException('This job has not finished generating yet');
    }
    return { buffer: dataUrlToBuffer(job.resultPdfUrl), fileName: `certificates-${job.id}.pdf` };
  }
}
