// backend/src/complaints/dto/create-complaint.dto.ts
//
// Plain TS interfaces, not @prisma/client enum imports — this sandbox can't
// run `npx prisma generate` (network blocked), so newly-added enums aren't
// in the generated client yet. Same convention as backend/src/loyalty/*.
import { ComplaintPriority } from '../complaints.calc';

export type ComplaintChannel = 'WHATSAPP' | 'CALL' | 'EMAIL' | 'WEB_PORTAL' | 'WALK_IN' | 'SALES_AGENT';

export type ComplaintCategory =
  | 'PRODUCT_QUALITY'
  | 'DELIVERY_DELAY'
  | 'WRONG_ITEM'
  | 'DAMAGED_IN_TRANSIT'
  | 'DESIGN_ERROR'
  | 'PRODUCTION_DEFECT'
  | 'BILLING_DISPUTE'
  | 'PAYMENT_ISSUE'
  | 'VENDOR_ISSUE'
  | 'SERVICE_COMPLAINT'
  | 'OTHER';

export interface CreateComplaintDto {
  // Either customerId (an existing customer picked from search) or
  // customerName (free text, for a customer who isn't in the directory yet —
  // a lightweight Customer record is auto-created for them) must be provided.
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  orderId?: string;
  orderItemId?: string;
  productId?: string;
  channel: ComplaintChannel;
  category: ComplaintCategory;
  priority?: ComplaintPriority;
  subject: string;
  description: string;
}
