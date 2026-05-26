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
  private normalizePhone(raw: string): string | null {
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
}
