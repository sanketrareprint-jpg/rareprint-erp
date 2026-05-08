// backend/src/whatsapp/whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';

const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';
const AISENSY_API_KEY = process.env.AISENSY_API_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NzI3YmI2NzEyN2RmMGMyMDc5OGM1ZCIsIm5hbWUiOiJSQVJFUFJJTlQzIiwiYXBwTmFtZSI6IkFpU2Vuc3kiLCJjbGllbnRJZCI6IjYyMjZmOTA1MDFhNWM5NjdhMDBiMDRkNCIsImFjdGl2ZVBsYW4iOiJQUk9fWUVBUkxZIiwiaWF0IjoxNzU5MjM4OTQzfQ.FQpnJHJnplYIcwZc2FKOkJUrOkLvoF2jFTTx7GycoBE';
const TEMPLATE_NAME = 'order_updatess';

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
}