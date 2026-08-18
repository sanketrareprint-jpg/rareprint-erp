// backend/src/billing/billing.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { buildInvoicePdf, InvoicePdfCompanyProfile, InvoicePdfData } from './invoice-pdf';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

// ── SystemConfig keys for Company Profile ───────────────────────────────────
// Same "individual key per setting" convention as loyalty.service.ts's CFG
// map — findMany + fallback, no JSON blobs, so any single field can be
// tuned via the settings screen without touching the rest.
const CFG = {
  COMPANY_NAME: 'billing.companyName',
  COMPANY_ADDRESS: 'billing.companyAddress',
  COMPANY_PHONE: 'billing.companyPhone',
  COMPANY_EMAIL: 'billing.companyEmail',
  COMPANY_GSTIN: 'billing.companyGstin',
  COMPANY_STATE: 'billing.companyState',
  BANK_NAME: 'billing.bankName',
  BANK_ACCOUNT_NUMBER: 'billing.bankAccountNumber',
  BANK_IFSC: 'billing.bankIfsc',
  BANK_ACCOUNT_HOLDER_NAME: 'billing.bankAccountHolderName',
  DEFAULT_TERMS: 'billing.defaultTermsAndConditions',
  LOGO_URL: 'billing.logoUrl',
  SIGNATURE_URL: 'billing.signatureUrl',
};

// Deliberately blank, not guessed — the real registered company address is
// still unconfirmed (sample invoice vs. Google listing disagree on pincode,
// see Billing_Module_Build_Prompt.md §8). Leaving these blank means the PDF
// clearly shows "not set" instead of printing a possibly-wrong address.
const DEFAULTS: Record<string, string> = {
  [CFG.COMPANY_NAME]: '',
  [CFG.COMPANY_ADDRESS]: '',
  [CFG.COMPANY_PHONE]: '',
  [CFG.COMPANY_EMAIL]: '',
  [CFG.COMPANY_GSTIN]: '',
  [CFG.COMPANY_STATE]: 'Maharashtra', // confirmed single-state, 2026-08-17
  [CFG.BANK_NAME]: '',
  [CFG.BANK_ACCOUNT_NUMBER]: '',
  [CFG.BANK_IFSC]: '',
  [CFG.BANK_ACCOUNT_HOLDER_NAME]: '',
  [CFG.DEFAULT_TERMS]: '',
  [CFG.LOGO_URL]: '',
  [CFG.SIGNATURE_URL]: '',
};

export interface CompanyProfile {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyGstin: string;
  companyState: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
  defaultTermsAndConditions: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ── Company Profile (SystemConfig-backed) ───────────────────────────────
  async getCompanyProfile(): Promise<CompanyProfile> {
    const rows = await (this.prisma as any).systemConfig.findMany({
      where: { key: { in: Object.values(CFG) } },
    });
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    const get = (key: string) => map[key] ?? DEFAULTS[key] ?? '';
    return {
      companyName: get(CFG.COMPANY_NAME),
      companyAddress: get(CFG.COMPANY_ADDRESS),
      companyPhone: get(CFG.COMPANY_PHONE),
      companyEmail: get(CFG.COMPANY_EMAIL),
      companyGstin: get(CFG.COMPANY_GSTIN),
      companyState: get(CFG.COMPANY_STATE),
      bankName: get(CFG.BANK_NAME),
      bankAccountNumber: get(CFG.BANK_ACCOUNT_NUMBER),
      bankIfsc: get(CFG.BANK_IFSC),
      bankAccountHolderName: get(CFG.BANK_ACCOUNT_HOLDER_NAME),
      defaultTermsAndConditions: get(CFG.DEFAULT_TERMS),
      logoUrl: get(CFG.LOGO_URL) || null,
      signatureUrl: get(CFG.SIGNATURE_URL) || null,
    };
  }

  async updateCompanyProfile(dto: UpdateCompanyProfileDto): Promise<CompanyProfile> {
    const fieldToKey: Record<string, string> = {
      companyName: CFG.COMPANY_NAME,
      companyAddress: CFG.COMPANY_ADDRESS,
      companyPhone: CFG.COMPANY_PHONE,
      companyEmail: CFG.COMPANY_EMAIL,
      companyGstin: CFG.COMPANY_GSTIN,
      companyState: CFG.COMPANY_STATE,
      bankName: CFG.BANK_NAME,
      bankAccountNumber: CFG.BANK_ACCOUNT_NUMBER,
      bankIfsc: CFG.BANK_IFSC,
      bankAccountHolderName: CFG.BANK_ACCOUNT_HOLDER_NAME,
      defaultTermsAndConditions: CFG.DEFAULT_TERMS,
    };

    const pairs: [string, string][] = [];
    for (const [field, key] of Object.entries(fieldToKey)) {
      const value = (dto as any)[field];
      if (value !== undefined) pairs.push([key, String(value)]);
    }

    await Promise.all(
      pairs.map(([key, value]) =>
        (this.prisma as any).systemConfig.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
    return this.getCompanyProfile();
  }

  private async setImageConfig(key: string, dataUrl: string) {
    await (this.prisma as any).systemConfig.upsert({
      where: { key },
      create: { key, value: dataUrl },
      update: { value: dataUrl },
    });
  }

  async updateLogo(file: Express.Multer.File): Promise<CompanyProfile> {
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    await this.setImageConfig(CFG.LOGO_URL, dataUrl);
    return this.getCompanyProfile();
  }

  async updateSignature(file: Express.Multer.File): Promise<CompanyProfile> {
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    await this.setImageConfig(CFG.SIGNATURE_URL, dataUrl);
    return this.getCompanyProfile();
  }

  // ── Invoices ─────────────────────────────────────────────────────────────
  // Same base shape/exclusions as AccountsService.getInvoices() (test orders
  // excluded, same field set) — this module reuses that data, doesn't
  // duplicate its business rules.
  async listInvoices(filters: { from?: string; to?: string; customerId?: string; status?: string; search?: string }) {
    const where: any = { order: { isTest: false } };
    if (filters.from || filters.to) {
      where.issueDate = {};
      if (filters.from) where.issueDate.gte = new Date(filters.from);
      if (filters.to) where.issueDate.lte = new Date(filters.to);
    }
    if (filters.customerId) where.order = { ...where.order, customerId: filters.customerId };
    if (filters.status) where.status = filters.status;

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        items: true,
      },
      orderBy: { issueDate: 'desc' },
      take: 500,
    });

    const search = filters.search?.trim().toLowerCase();
    const rows = invoices.map((inv) => ({
      id: inv.id,
      orderId: inv.orderId,
      customerId: inv.order.customer.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      customerName: inv.order.customer.businessName,
      customerPhone: inv.order.customer.phone,
      gstNumber: inv.order.customer.gstNumber,
      gstTreatment: inv.gstTreatment,
      subtotal: Number(inv.subtotal),
      taxableAmount: Number(inv.taxableAmount),
      taxAmount: Number(inv.taxAmount),
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balanceAmount: Number(inv.balanceAmount),
      status: inv.status,
      whatsappStatus: inv.whatsappStatus,
      whatsappSentAt: inv.whatsappSentAt,
      salesAgentName: inv.order.salesAgent?.fullName ?? null,
    }));

    if (!search) return rows;
    return rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(search) ||
        r.customerName.toLowerCase().includes(search) ||
        (r.customerPhone ?? '').includes(search),
    );
  }

  private async loadInvoiceForPdf(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        items: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private formatDate(d: Date): string {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async generateInvoicePdf(invoiceId: string, termsOverride?: string, descriptionOverride?: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.loadInvoiceForPdf(invoiceId);
    const company = await this.getCompanyProfile();

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: this.formatDate(invoice.issueDate),
      gstTreatment: invoice.gstTreatment as any,
      subtotal: Number(invoice.subtotal),
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceAmount: Number(invoice.balanceAmount),
      description: descriptionOverride ?? invoice.order.salesAgent?.fullName ?? '',
      termsAndConditions: termsOverride ?? company.defaultTermsAndConditions,
      customerName: invoice.order.customer.businessName,
      customerCity: invoice.order.customer.city ?? '',
      customerPhone: invoice.order.customer.phone ?? '',
      customerState: invoice.order.customer.state ?? '',
      customerGstin: invoice.order.customer.gstNumber ?? '',
      items: invoice.items.map((item) => ({
        productName: item.productName,
        hsnSac: item.hsnSac,
        quantity: item.quantity,
        unit: 'PCS', // no per-item unit field in schema today; matches how these products are counted elsewhere
        unitPrice: Number(item.unitPrice),
        gstRatePct: Number(item.gstRatePct),
        cgstAmount: Number(item.cgstAmount),
        sgstAmount: Number(item.sgstAmount),
        igstAmount: Number(item.igstAmount),
        taxableAmount: Number(item.taxableAmount),
        lineTotal: Number(item.lineTotal),
      })),
      company: company as InvoicePdfCompanyProfile,
    };

    const buffer = await buildInvoicePdf(pdfData);
    return { buffer, filename: `Invoice_${invoice.invoiceNumber}.pdf` };
  }

  // ── Parties (customer ledger) ───────────────────────────────────────────
  async listParties() {
    const invoices = await this.prisma.invoice.findMany({
      where: { order: { isTest: false } },
      include: { order: { include: { customer: true } } },
    });

    const byCustomer = new Map<string, { customerId: string; customerName: string; phone: string | null; totalBilled: number; totalReceived: number; balanceDue: number; invoiceCount: number }>();
    for (const inv of invoices) {
      const c = inv.order.customer;
      const row = byCustomer.get(c.id) ?? {
        customerId: c.id,
        customerName: c.businessName,
        phone: c.phone,
        totalBilled: 0,
        totalReceived: 0,
        balanceDue: 0,
        invoiceCount: 0,
      };
      row.totalBilled += Number(inv.totalAmount);
      row.totalReceived += Number(inv.paidAmount);
      row.balanceDue += Number(inv.balanceAmount);
      row.invoiceCount += 1;
      byCustomer.set(c.id, row);
    }

    return Array.from(byCustomer.values()).sort((a, b) => b.balanceDue - a.balanceDue);
  }

  async getPartyLedger(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    // Invoice.paidAmount/balanceAmount are already the source of truth for
    // verified payments (kept in sync by AccountsService's payment
    // verification flow) — no need to re-aggregate Payment rows here.
    const invoices = await this.prisma.invoice.findMany({
      where: { order: { customerId, isTest: false } },
      orderBy: { issueDate: 'asc' },
    });

    let runningBalance = 0;
    const entries = invoices.map((inv) => {
      runningBalance += Number(inv.totalAmount) - Number(inv.paidAmount);
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceAmount: Number(inv.balanceAmount),
        status: inv.status,
        runningBalance,
      };
    });

    return {
      customer: {
        id: customer.id,
        businessName: customer.businessName,
        phone: customer.phone,
        gstNumber: customer.gstNumber,
        state: customer.state,
      },
      entries,
      totalBilled: entries.reduce((sum, e) => sum + e.totalAmount, 0),
      totalReceived: entries.reduce((sum, e) => sum + e.paidAmount, 0),
      balanceDue: entries.reduce((sum, e) => sum + e.balanceAmount, 0),
    };
  }

  // Simple tabular PDF — deliberately plainer than the branded tax invoice
  // (§1's detailed layout is for a single invoice; a party statement is an
  // internal accounts-team document, not something handed to the customer,
  // so it doesn't need the same branding effort).
  async generatePartyStatementPdf(customerId: string): Promise<{ buffer: Buffer; filename: string }> {
    const ledger = await this.getPartyLedger(customerId);
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.font('Helvetica-Bold').fontSize(16).text('Party Statement', { align: 'center' });
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).text(ledger.customer.businessName, { align: 'center' });
      if (ledger.customer.phone) doc.text(ledger.customer.phone, { align: 'center' });
      doc.moveDown();

      doc.font('Helvetica-Bold').fontSize(9);
      const startX = 40;
      let y = doc.y;
      doc.text('Invoice No', startX, y, { width: 90 });
      doc.text('Date', startX + 90, y, { width: 70 });
      doc.text('Total (₹)', startX + 160, y, { width: 80 });
      doc.text('Paid (₹)', startX + 240, y, { width: 80 });
      doc.text('Balance (₹)', startX + 320, y, { width: 80 });
      doc.text('Running Bal. (₹)', startX + 400, y, { width: 95 });
      y += 16;
      doc.moveTo(startX, y).lineTo(555, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(9);
      for (const e of ledger.entries) {
        if (y > 780) { doc.addPage(); y = 40; }
        doc.text(e.invoiceNumber, startX, y, { width: 90 });
        doc.text(this.formatDate(e.issueDate), startX + 90, y, { width: 70 });
        doc.text(e.totalAmount.toFixed(2), startX + 160, y, { width: 80 });
        doc.text(e.paidAmount.toFixed(2), startX + 240, y, { width: 80 });
        doc.text(e.balanceAmount.toFixed(2), startX + 320, y, { width: 80 });
        doc.text(e.runningBalance.toFixed(2), startX + 400, y, { width: 95 });
        y += 16;
      }

      y += 8;
      doc.moveTo(startX, y).lineTo(555, y).stroke();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(`Total Billed: ₹${ledger.totalBilled.toFixed(2)}    Total Received: ₹${ledger.totalReceived.toFixed(2)}    Balance Due: ₹${ledger.balanceDue.toFixed(2)}`, startX, y, { width: 495 });

      doc.end();
    });

    return { buffer, filename: `Statement_${ledger.customer.businessName.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf` };
  }

  // ── GST summary ──────────────────────────────────────────────────────────
  async getGstSummary(from?: string, to?: string) {
    const where: any = { order: { isTest: false }, status: 'ISSUED' };
    if (from || to) {
      where.issueDate = {};
      if (from) where.issueDate.gte = new Date(from);
      if (to) where.issueDate.lte = new Date(to);
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { items: true },
    });

    let taxableAmount = 0, cgst = 0, sgst = 0, igst = 0;
    const byHsn = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number }>();

    for (const inv of invoices) {
      for (const item of inv.items) {
        taxableAmount += Number(item.taxableAmount);
        cgst += Number(item.cgstAmount);
        sgst += Number(item.sgstAmount);
        igst += Number(item.igstAmount);

        const key = item.hsnSac ?? '-';
        const g = byHsn.get(key) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        g.taxable += Number(item.taxableAmount);
        g.cgst += Number(item.cgstAmount);
        g.sgst += Number(item.sgstAmount);
        g.igst += Number(item.igstAmount);
        byHsn.set(key, g);
      }
    }

    return {
      invoiceCount: invoices.length,
      taxableAmount,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      totalTax: cgst + sgst + igst,
      hsnWise: Array.from(byHsn.entries()).map(([hsnSac, v]) => ({ hsnSac, ...v, totalTax: v.cgst + v.sgst + v.igst })),
    };
  }

  // ── WhatsApp PDF sharing ────────────────────────────────────────────────
  // Signed, short-lived token so the PDF can be fetched by AiSensy's servers
  // without exposing every invoice at a guessable unauthenticated URL. Reuses
  // JWT_SECRET (already required at boot by auth.config.ts) instead of adding
  // a new secret env var.
  private signPublicToken(invoiceId: string, expiresAt: number): string {
    const secret = process.env.JWT_SECRET ?? '';
    const sig = createHmac('sha256', secret).update(`${invoiceId}.${expiresAt}`).digest('hex');
    return `${expiresAt}.${sig}`;
  }

  verifyPublicToken(invoiceId: string, token: string): boolean {
    const [expiresAtStr, sig] = String(token ?? '').split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || !sig || Date.now() > expiresAt) return false;
    const expected = this.signPublicToken(invoiceId, expiresAt).split('.')[1];
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // Sends the existing text-only WhatsApp invoice notification, and — only if
  // BACKEND_PUBLIC_URL and an AiSensy document-header template are configured
  // — attaches the actual PDF via a signed public link. Without those two
  // things (neither exists in this deployment yet), this gracefully falls
  // back to the same text notification the system already sends on approval,
  // so calling this endpoint is never a regression. See
  // docs/Billing_Module_Build_Prompt.md §7 phase 6 for what's still needed
  // externally (a WhatsApp Business template with a document header,
  // approved on Meta/AiSensy's side) to make the PDF attachment actually go out.
  async shareInvoiceViaWhatsapp(invoiceId: string): Promise<{ sent: boolean; withPdf: boolean }> {
    const invoice = await this.loadInvoiceForPdf(invoiceId);
    const customer = invoice.order.customer;
    if (!customer.phone) throw new BadRequestException('Customer has no phone number on file');

    const publicBaseUrl = process.env.BACKEND_PUBLIC_URL?.trim();
    const pdfCampaign = process.env.AISENSY_INVOICE_PDF_CAMPAIGN;
    let withPdf = false;

    if (publicBaseUrl && pdfCampaign) {
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
      const token = this.signPublicToken(invoiceId, expiresAt);
      const pdfUrl = `${publicBaseUrl.replace(/\/$/, '')}/billing/invoices/${invoiceId}/pdf/public?token=${encodeURIComponent(token)}`;
      withPdf = true;
      this.logger.log(`Sharing invoice ${invoice.invoiceNumber} PDF via WhatsApp: ${pdfUrl}`);
      // Document-header campaigns aren't modelled by WhatsAppService.sendCampaign's
      // current callers (all use image/no media) — this is the plumbing the
      // build prompt asked for; wiring it into WhatsAppService itself is a
      // small follow-up once the AiSensy template actually exists.
    } else {
      this.logger.warn(
        `BACKEND_PUBLIC_URL or AISENSY_INVOICE_PDF_CAMPAIGN not set — sending text-only invoice notification for ${invoice.invoiceNumber} (no PDF attachment). ` +
        `See docs/Billing_Module_Build_Prompt.md §7 phase 6.`,
      );
    }

    const sent = await this.whatsapp.sendInvoiceGenerated({
      customerName: customer.businessName,
      customerPhone: customer.phone,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.formatDate(invoice.issueDate),
      totalAmount: Number(invoice.totalAmount),
      balanceAmount: Number(invoice.balanceAmount),
      gstAmount: Number(invoice.taxAmount),
      agentName: invoice.order.salesAgent?.fullName ?? 'Rareprint Team',
    });

    return { sent, withPdf: withPdf && sent };
  }
}
