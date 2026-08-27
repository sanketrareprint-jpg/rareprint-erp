// backend/src/whatsapp/whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';

const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
const AISENSY_API_KEY = process.env.AISENSY_API_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NzI3YmI2NzEyN2RmMGMyMDc5OGM1ZCIsIm5hbWUiOiJSQVJFUFJJTlQzIiwiYXBwTmFtZSI6IkFpU2Vuc3kiLCJjbGllbnRJZCI6IjYyMjZmOTA1MDFhNWM5NjdhMDBiMDRkNCIsImFjdGl2ZVBsYW4iOiJQUk9fWUVBUkxZIiwiaWF0IjoxNzU5MjM4OTQzfQ.FQpnJHJnplYIcwZc2FKOkJUrOkLvoF2jFTTx7GycoBE';
const TEMPLATE_NAME = 'order_updatess';
const AISENSY_AGENT_TAGS: Record<string, string> = {
  gulfam: 'gulfam',
  akansha: 'Akansha',
  sonali: 'sonali',
  samita: 'samita',
  ritu: 'ritu',
  divya: 'Divya',
  fiza: 'fiza',
  priya: 'priya',
  vaishali: 'Vaishali',
  nikita: 'nikita',
  shrawani: 'shrawani',
};

export interface WhatsAppOrderParams {
  customerName: string;
  customerPhone: string;
  orderNo: string;
  product: string;       // product name(s)
  status: string;        // human-readable status
  agentName: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private async sendCampaign(params: {
    campaignName: string;
    customerName: string;
    customerPhone: string;
    templateParams: string[];
    orderNo?: string;
    tags?: string[];
  }): Promise<boolean> {
    if (!params.customerPhone) {
      this.logger.warn(`No phone for order ${params.orderNo ?? 'unknown'}, skipping WhatsApp`);
      return false;
    }

    const phone = this.normalizePhone(params.customerPhone);
    if (!phone) {
      this.logger.warn(`Invalid phone ${params.customerPhone} for order ${params.orderNo ?? 'unknown'}`);
      return false;
    }

    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName: params.campaignName,
      destination: phone,
      userName: params.customerName,
      templateParams: params.templateParams,
      source: 'rareprint-erp',
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
      tags: params.tags ?? [],
    };

    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      this.logger.log(`AiSensy response [${res.status}] for ${params.campaignName} → ${phone}: ${JSON.stringify(data)}`);
      if (res.ok) {
        this.logger.log(`✅ WhatsApp ${params.campaignName} sent to ${phone} for order ${params.orderNo ?? 'unknown'}`);
        return true;
      }
      this.logger.error(`❌ WhatsApp ${params.campaignName} failed for ${params.orderNo ?? 'unknown'}: ${JSON.stringify(data)}`);
      return false;
    } catch (err) {
      this.logger.error(`❌ WhatsApp ${params.campaignName} error for ${params.orderNo ?? 'unknown'}: ${err}`);
      return false;
    }
  }

  async sendOrderUpdate(params: WhatsAppOrderParams): Promise<boolean> {
    if (!params.customerPhone) {
      this.logger.warn(`No phone for order ${params.orderNo}, skipping WhatsApp`);
      return false;
    }

    // Normalize phone — ensure it has country code
    const phone = this.normalizePhone(params.customerPhone);
    if (!phone) {
      this.logger.warn(`Invalid phone ${params.customerPhone} for order ${params.orderNo}`);
      return false;
    }

    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName: TEMPLATE_NAME,
      destination: phone,
      userName: params.customerName,
      templateParams: [
        params.customerName,   // {{1}} — customer name
        params.orderNo,        // {{2}} — invoice/order number
        params.product,        // {{3}} — product
        params.status,         // {{4}} — status
        params.agentName,      // {{5}} — agent name
      ],
      source: 'rareprint-erp',
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
    };

    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        this.logger.log(`✅ WhatsApp sent to ${phone} for order ${params.orderNo}`);
        return true;
      } else {
        this.logger.error(`❌ WhatsApp failed for ${params.orderNo}: ${JSON.stringify(data)}`);
        return false;
      }
    } catch (err) {
      this.logger.error(`❌ WhatsApp error for ${params.orderNo}: ${err}`);
      return false;
    }
  }

  // ── Status → human readable ──────────────────────────────────────────────

  async sendPaymentReceived(params: {
    customerName: string;
    customerPhone: string;
    orderNo: string;
    amountReceived: number;
    paymentMode: string;
    referenceNo: string;
    orderTotal: number;
    totalPaid: number;
    balanceRemaining: number;
  }): Promise<boolean> {
    if (!params.customerPhone) return false;
    const phone = this.normalizePhone(params.customerPhone);
    if (!phone) return false;

    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName: 'payment_received_erp',
      destination: phone,
      userName: params.customerName,
      templateParams: [
        params.customerName,
        params.orderNo,
        params.amountReceived.toFixed(2),
        params.paymentMode,
        params.referenceNo || 'N/A',
        params.orderTotal.toFixed(2),
        params.totalPaid.toFixed(2),
        params.balanceRemaining.toFixed(2),
      ],
      source: 'rareprint-erp',
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
    };

    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        this.logger.log('Payment WhatsApp sent to ' + phone + ' for order ' + params.orderNo);
        return true;
      } else {
        this.logger.error('Payment WhatsApp failed: ' + JSON.stringify(data));
        return false;
      }
    } catch (err) {
      this.logger.error('Payment WhatsApp error: ' + err);
      return false;
    }
  }

  async sendBalancePaymentReminder(params: {
    customerName: string;
    customerPhone: string;
    orderNos: string;
    balanceAmount: number;
    agentName: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_BALANCE_REMINDER_CAMPAIGN ?? 'balance_payment_reminder_erp',
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      orderNo: params.orderNos,
      templateParams: [
        params.customerName || 'Customer',
        params.orderNos,
        params.balanceAmount.toFixed(2),
        params.agentName || 'Rareprint Team',
      ],
    });
  }

  async sendInvoiceGenerated(params: {
    customerName: string;
    customerPhone: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: number;
    balanceAmount: number;
    gstAmount: number;
    agentName: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_INVOICE_CAMPAIGN ?? 'invoice_generated_erp',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      orderNo: params.invoiceNumber,
      templateParams: [
        params.customerName || 'Customer',
        params.invoiceNumber,
        params.invoiceDate,
        params.totalAmount.toFixed(2),
        params.gstAmount.toFixed(2),
        params.balanceAmount.toFixed(2),
        params.agentName || 'Rareprint Team',
      ],
    });
  }

  // ── Complaint/ticket updates — three distinct templates (assigned,
  // resolved, new reply) rather than one generic wrapper, so each reads
  // naturally instead of forcing unrelated events through the same copy.

  async sendComplaintAssigned(params: {
    customerName: string;
    customerPhone: string;
    ticketNumber: string;
    subject: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_COMPLAINT_ASSIGNED_CAMPAIGN ?? 'complaint_assigned_erp',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      templateParams: [
        params.customerName || 'Customer',
        params.ticketNumber,
        params.subject,
      ],
    });
  }

  async sendComplaintResolved(params: {
    customerName: string;
    customerPhone: string;
    ticketNumber: string;
    subject: string;
    resolutionSummary: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_COMPLAINT_RESOLVED_CAMPAIGN ?? 'complaint_resolved_erp',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      templateParams: [
        params.customerName || 'Customer',
        params.ticketNumber,
        params.subject,
        params.resolutionSummary,
      ],
    });
  }

  async sendComplaintReply(params: {
    customerName: string;
    customerPhone: string;
    ticketNumber: string;
    message: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_COMPLAINT_REPLY_CAMPAIGN ?? 'complaint_reply_erp',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      templateParams: [
        params.customerName || 'Customer',
        params.ticketNumber,
        params.message,
      ],
    });
  }

  async sendLoyaltyPointsEarned(params: {
    customerName: string;
    customerPhone: string;
    orderNo: string;
    pointsEarned: number;
    newBalance: number;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_LOYALTY_EARNED_CAMPAIGN ?? 'loyalty_points_earned_erp',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      orderNo: params.orderNo,
      templateParams: [
        params.customerName || 'Customer',
        params.orderNo,
        String(params.pointsEarned),
        String(params.newBalance),
      ],
    });
  }

  // ── Bulk "you have loyalty points" reminder — used by LoyaltyService's
  // bulk-send job to nudge every customer who has ever earned points,
  // regardless of current balance. Separate Aisensy campaign from the
  // per-order "just earned" one above since the copy/context differs.
  async sendLoyaltyReminder(params: {
    customerName: string;
    customerPhone: string;
    pointsBalance: number;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_LOYALTY_REMINDER_CAMPAIGN ?? 'loyalty_points_reminder_erp',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      templateParams: [
        params.customerName || 'Customer',
        String(params.pointsBalance),
      ],
    });
  }

  async sendOrderReassurance(params: {
    campaignName: string;
    customerName: string;
    customerPhone: string;
    orderNo: string;
    agentName: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: params.campaignName,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      orderNo: params.orderNo,
      templateParams: [
        params.customerName,
        params.orderNo,
        params.agentName || 'Rareprint Team',
      ],
    });
  }

  async sendLeadAssigned(params: {
    customerName: string;
    customerPhone: string;
    agentName: string;
    agentPhone: string;
  }): Promise<boolean> {
    const agentTag = this.getAgentTag(params.agentName);
    return this.sendCampaign({
      campaignName: process.env.AISENSY_LEAD_ASSIGNED_CAMPAIGN ?? 'lead_assigned_agent',
      customerName: params.customerName || 'Customer',
      customerPhone: params.customerPhone,
      templateParams: [
        params.customerName || 'Customer',
        params.agentName || 'Rareprint Team',
        params.agentPhone || '9637318960',
      ],
      tags: agentTag ? [agentTag] : [],
    });
  }

  static statusLabel(status: string): string {
    const map: Record<string, string> = {
      PENDING_APPROVAL:          'Pending Approval',
      APPROVED:                  'Approved ✅',
      IN_PRODUCTION:             'In Production 🏭',
      PENDING_DISPATCH_APPROVAL: 'Pending Dispatch Approval',
      READY_FOR_DISPATCH:        'Ready for Dispatch 📦',
      DISPATCHED:                'Dispatched 🚚',
      DELIVERED:                 'Delivered ✅',
      CANCELLED:                 'Cancelled ❌',
    };
    return map[status] ?? status.replace(/_/g, ' ');
  }

  // ── Normalize phone to E.164 with India +91 ──────────────────────────────
  // Public: reused by LoyaltyService to key wallets by phone the same way
  // every other WhatsApp send in this file does.
  normalizePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    if (digits.length > 10) return digits;
    return null;
  }

  private getAgentTag(agentName: string): string | null {
    const normalized = String(agentName || '').toLowerCase();
    const match = Object.entries(AISENSY_AGENT_TAGS).find(([name]) => normalized.includes(name));
    return match?.[1] ?? null;
  }

  // ── Order Created Notification (to owner + customer) ─────────────────────
  async sendOrderCreated(params: {
    customerName: string;
    customerPhone: string;
    orderNo: string;
    productDetails: string; // formatted: "ENVELOPE 4x7 70gsm Single 5000 @₹1/- = ₹5000"
    totalAmount: string;
    advancePaid: string;
    balanceDue: string;
    agentName: string;
  }): Promise<void> {
    const OWNER_PHONE = '919637318960';
    const TEMPLATE = 'order_created_erp';

    const destinations = [OWNER_PHONE];

    // Also send to customer if they have a phone
    if (params.customerPhone) {
      const customerPhone = this.normalizePhone(params.customerPhone);
      if (customerPhone && customerPhone !== OWNER_PHONE) {
        destinations.push(customerPhone);
      }
    }

    for (const destination of destinations) {
      const body = {
        apiKey: AISENSY_API_KEY,
        campaignName: TEMPLATE,
        destination,
        userName: params.customerName,
        templateParams: [
          params.customerName,    // {{1}} Hello [Customer Name]
          params.orderNo,         // {{2}} Order No
          params.customerName,    // {{3}} Customer Name (greeting)
          params.productDetails,  // {{4}} Product details
          params.totalAmount,     // {{5}} Total Amount
          params.advancePaid,     // {{6}} Advance Paid
          params.balanceDue,      // {{7}} Balance Due
          params.agentName,       // {{8}} Sales Agent Name
        ],
        source: 'rareprint-erp',
        media: {},
        buttons: [],
        carouselCards: [],
        location: {},
      };

      try {
        const res = await fetch(AISENSY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          this.logger.log(`✅ Order created WA sent to ${destination} for order ${params.orderNo}`);
        } else {
          this.logger.error(`❌ Order created WA failed for ${destination}: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        this.logger.error(`❌ Order created WA error: ${err}`);
      }
    }
  }

  // ── Vendor Job Work Notification ─────────────────────────────────────────
  async sendVendorJobWork(params: {
    vendorName: string;
    vendorPhone: string;
    orderNo: string;
    productName: string;
    size: string;
    gsm: string;
    sides: string;
    poNumber: string;
    quantity: string;
    scheduleDate: string;
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_VENDOR_JW_CAMPAIGN ?? 'vendor_job_work_erp',
      customerName: params.vendorName,
      customerPhone: params.vendorPhone,
      orderNo: params.orderNo,
      templateParams: [
        params.vendorName,    // {{1}} vendor name
        params.orderNo,       // {{2}} job work order #
        params.productName,   // {{3}} product
        params.size,          // {{4}} size
        params.gsm,           // {{5}} gsm
        params.sides,         // {{6}} sides
        params.poNumber,      // {{7}} PO / order number
        params.quantity,      // {{8}} quantity
        params.scheduleDate,  // {{9}} schedule date
      ],
    });
  }

  // Daily envelope pending list to Raza Envelope — uses approved raza_envelope_daily template
  // Template: "Hi Raza Envelope 👋\nPending envelope jobs as on *{{1}}*:\n\n{{2}}\n\nTotal: *{{3}} item(s) pending*\n..."
  async sendEnvelopeDailyList(params: {
    vendorName: string;
    vendorPhone: string;
    dateStr: string;       // {{1}}
    itemList: string;      // {{2}}
    totalCount: number | string;  // {{3}} e.g. "38 items | 2,45,000 pcs"
  }): Promise<boolean> {
    return this.sendCampaign({
      campaignName: process.env.AISENSY_ENVELOPE_CAMPAIGN ?? 'raza_envelope_daily',
      customerName: params.vendorName,
      customerPhone: params.vendorPhone,
      templateParams: [
        params.dateStr,
        params.itemList,
        String(params.totalCount),
      ],
    });
  }

  // ── Delivery → Rating/Review/Testimonial request ─────────────────────────
  // Sent once from Dispatch > History when staff click "Delivered". This is a
  // WhatsApp UTILITY-category template (post-purchase, not marketing) with an
  // IMAGE header. The header image + body copy must be created once in the
  // AiSensy template editor (see the template text this method assumes,
  // documented above sendCampaign's call site in dispatch.service.ts and in
  // the PR description) — campaignName here must exactly match whatever name
  // you give that template in AiSensy.
  //
  // Body variables (in order): {{1}} customer name, {{2}} order number,
  // {{3}} loyalty points already earned on this order. The Google rating/
  // review link and "share a testimonial" link/CTA should be added as a
  // static URL button on the template itself in AiSensy (they don't change
  // per-message, so they don't need to be template variables) — see
  // AISENSY_DELIVERY_REVIEW_IMAGE_URL below for the header image.
  async sendDeliveryReviewRequest(params: {
    customerName: string;
    customerPhone: string;
    orderNo: string;
    pointsBalance: number;
  }): Promise<boolean> {
    if (!params.customerPhone) {
      this.logger.warn(`No phone for order ${params.orderNo}, skipping delivery review WhatsApp`);
      return false;
    }
    const phone = this.normalizePhone(params.customerPhone);
    if (!phone) {
      this.logger.warn(`Invalid phone ${params.customerPhone} for order ${params.orderNo}`);
      return false;
    }

    const imageUrl = process.env.AISENSY_DELIVERY_REVIEW_IMAGE_URL;
    if (!imageUrl) {
      this.logger.warn(
        `AISENSY_DELIVERY_REVIEW_IMAGE_URL not set — skipping delivery review WhatsApp for order ${params.orderNo}. ` +
        `Set this env var to a public HTTPS image URL matching the approved template's header image.`,
      );
      return false;
    }

    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName: process.env.AISENSY_DELIVERY_REVIEW_CAMPAIGN ?? 'delivery_review_request_erp',
      destination: phone,
      userName: params.customerName || 'Customer',
      templateParams: [
        params.customerName || 'Customer', // {{1}}
        params.orderNo,                    // {{2}}
        String(params.pointsBalance ?? 0), // {{3}}
      ],
      source: 'rareprint-erp',
      media: { url: imageUrl, filename: 'delivery-review-request.jpg' },
      buttons: [],
      carouselCards: [],
      location: {},
    };

    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        this.logger.log(`✅ Delivery review WhatsApp sent to ${phone} for order ${params.orderNo}`);
        return true;
      }
      this.logger.error(`❌ Delivery review WhatsApp failed for ${params.orderNo}: ${JSON.stringify(data)}`);
      return false;
    } catch (err) {
      this.logger.error(`❌ Delivery review WhatsApp error for ${params.orderNo}: ${err}`);
      return false;
    }
  }

  // Plain text message (for Virtual CEO reports, internal alerts)
  async sendTextMessage(phone: string, message: string): Promise<boolean> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      this.logger.warn(`sendTextMessage: invalid phone ${phone}`);
      return false;
    }
    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName: 'virtual_ceo_report',
      destination: normalizedPhone,
      userName: 'Manager',
      templateParams: [message],
      source: 'rareprint-erp',
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
    };
    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        this.logger.log(`Virtual CEO report sent to ${normalizedPhone}`);
        return true;
      }
      this.logger.error(`Virtual CEO report failed to ${normalizedPhone}: ${JSON.stringify(data)}`);
      return false;
    } catch (err) {
      this.logger.error(`Virtual CEO report error: ${err}`);
      return false;
    }
  }

  // ── Events module (birthday / anniversary / festival flyer wishes) ───────
  // One shared AiSensy WhatsApp template is reused for every occasion type
  // (birthday, anniversary, every festival) — Sanket's choice, to minimise
  // how many separate templates need Meta/AiSensy approval. The real,
  // approved template (created + approved 2026-08-25, name "hellomomentwishes"
  // in AiSensy — set AISENSY_EVENTS_CAMPAIGN to that exact name, the
  // 'events_wish_erp' fallback below is just a pre-approval placeholder and
  // will never match a real template) has an IMAGE header (the generated
  // flyer, passed as `media.url` — AiSensy fetches it itself, never
  // uploaded directly) and three body variables, confirmed against the
  // actual approved template text ("Warm Wishes, {{1}}! ... Happy {{2}}! ...
  // Warm wishes from {{3}}"):
  //   {{1}} person's name
  //   {{2}} occasion label — "Birthday", "5th Anniversary" (years folded in
  //         when known, see EventsService.renderAndSend), or "Festival"
  //   {{3}} sign-off name shown as "Warm wishes from {{3}}" — hardcoded
  //         below as SIGNOFF_NAME, Sanket's explicit choice (2026-08-25) was
  //         "RarePrint", matching the OWNER_PHONE hardcoding convention
  //         already used in this method rather than pulling from
  //         SystemConfig/BusinessRules.
  // Until the template exists and is approved, every call here will fail at
  // AiSensy with an "unknown campaign" style error — this method still
  // returns cleanly (sentToPerson/sentToOwner both false) rather than
  // throwing, so a missing template never breaks the scheduler run for
  // every other person that day.
  async sendEventWish(params: {
    customerName: string;
    customerPhone: string;
    imageUrl: string;
    occasionLabel: string;
  }): Promise<{ sentToPerson: boolean; sentToOwner: boolean; personError?: string; ownerError?: string }> {
    const OWNER_PHONE = '919637318960';
    const SIGNOFF_NAME = 'RarePrint';
    const campaignName = process.env.AISENSY_EVENTS_CAMPAIGN ?? 'events_wish_erp';
    const personPhone = this.normalizePhone(params.customerPhone);

    const destinations: Array<{ phone: string; isOwner: boolean }> = [];
    if (personPhone) destinations.push({ phone: personPhone, isOwner: false });
    else this.logger.warn(`sendEventWish: invalid/missing WhatsApp number "${params.customerPhone}" for ${params.customerName}`);
    if (!personPhone || personPhone !== OWNER_PHONE) destinations.push({ phone: OWNER_PHONE, isOwner: true });

    let sentToPerson = false;
    let sentToOwner = false;
    // 2026-08-25: previously this method only logged the real AiSensy
    // rejection reason server-side (Railway logs) and returned nothing —
    // callers (EventsService.renderAndSend, then the frontend) had no way
    // to show *why* a send failed, only a generic fallback message. Now the
    // actual reason from AiSensy's own response (or the fetch error) is
    // captured and returned so it reaches the History tab / test-send
    // banner directly instead of requiring a trip through Railway logs.
    let personError: string | undefined;
    let ownerError: string | undefined;

    for (const dest of destinations) {
      const body = {
        apiKey: AISENSY_API_KEY,
        campaignName,
        destination: dest.phone,
        userName: params.customerName,
        templateParams: [params.customerName, params.occasionLabel, SIGNOFF_NAME],
        source: 'rareprint-erp',
        media: { url: params.imageUrl, filename: 'flyer.jpg' },
        buttons: [],
        carouselCards: [],
        location: {},
      };
      try {
        const res = await fetch(AISENSY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (dest.isOwner) sentToOwner = true; else sentToPerson = true;
          this.logger.log(`✅ Event wish (${params.occasionLabel}) sent to ${dest.phone}${dest.isOwner ? ' (owner)' : ''} for ${params.customerName}`);
        } else {
          const reason = (data && (data.message || data.error)) || `AiSensy HTTP ${res.status}: ${JSON.stringify(data)}`;
          this.logger.error(`❌ Event wish (${params.occasionLabel}) failed for ${dest.phone}: ${JSON.stringify(data)}`);
          if (dest.isOwner) ownerError = reason; else personError = reason;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`❌ Event wish (${params.occasionLabel}) error for ${dest.phone}: ${err}`);
        if (dest.isOwner) ownerError = reason; else personError = reason;
      }
    }

    return { sentToPerson, sentToOwner, personError, ownerError };
  }

  // ── Events module: client business festival wish cards (added 2026-08-28) ──
  // A SEPARATE AiSensy campaign from sendEventWish above — the message copy
  // here is fundamentally different ("here's your ready-to-share festival
  // wish card" to a B2B client, not a personal "Warm Wishes, {{name}}!" to an
  // individual), so it needs its own template submitted for Meta/AiSensy
  // approval rather than reusing "hellomomentwishes". Until that template is
  // created and approved in AiSensy, set AISENSY_CLIENT_WISH_CAMPAIGN to its
  // exact approved name — the 'client_wish_card_erp' fallback below is a
  // pre-approval placeholder and will never match a real template, so calls
  // will fail cleanly (sent:false, logged) exactly like sendEventWish does
  // before its own template exists. Suggested approval text (two body
  // variables): "Hi {{1}}, here's your ready-to-share {{2}} wish card —
  // download and share it with your customers!" — {{1}} businessName,
  // {{2}} occasion/festival label. Sent to ONE recipient only (the client
  // business's own WhatsApp) — no "and to the owner" branch like
  // sendEventWish, since this isn't a personal wish, it's a business handing
  // off a ready asset.
  async sendClientWishReady(params: {
    businessName: string;
    businessPhone: string;
    imageUrl: string;
    occasionLabel?: string;
  }): Promise<{ sent: boolean; errorMessage?: string }> {
    const campaignName = process.env.AISENSY_CLIENT_WISH_CAMPAIGN ?? 'client_wish_card_erp';
    const phone = this.normalizePhone(params.businessPhone);
    if (!phone) {
      const message = `Invalid/missing WhatsApp number "${params.businessPhone}" for ${params.businessName}`;
      this.logger.warn(`sendClientWishReady: ${message}`);
      return { sent: false, errorMessage: message };
    }

    const body = {
      apiKey: AISENSY_API_KEY,
      campaignName,
      destination: phone,
      userName: params.businessName,
      templateParams: [params.businessName, params.occasionLabel ?? 'Festival'],
      source: 'rareprint-erp',
      media: { url: params.imageUrl, filename: 'wish-card.jpg' },
      buttons: [],
      carouselCards: [],
      location: {},
    };
    try {
      const res = await fetch(AISENSY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        this.logger.log(`✅ Client wish card sent to ${phone} (${params.businessName})`);
        return { sent: true };
      }
      const reason = (data && (data.message || data.error)) || `AiSensy HTTP ${res.status}: ${JSON.stringify(data)}`;
      this.logger.error(`❌ Client wish card failed for ${phone}: ${JSON.stringify(data)}`);
      return { sent: false, errorMessage: reason };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Client wish card error for ${phone}: ${err}`);
      return { sent: false, errorMessage: reason };
    }
  }
}
