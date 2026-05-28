import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export type BigshipRateRow = {
  rateId: string;
  carrierName: string;
  amount: number;
  currency: string;
  estimatedDays: number;
  courierId: number;
};

@Injectable()
export class BigshipService {
  private readonly logger = new Logger(BigshipService.name);
  private token?: string;
  private tokenUntil = 0;

  private api(): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.bigship.in',
      timeout: 25_000,
    });
  }

  isConfigured(): boolean {
    return !!(
      process.env.BIGSHIP_USERNAME?.trim() &&
      process.env.BIGSHIP_PASSWORD?.trim() &&
      process.env.BIGSHIP_ACCESS_KEY?.trim()
    );
  }

  async getAuthToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenUntil) {
      return this.token;
    }
    const { data } = await this.api().post('/api/login/user', {
      user_name: process.env.BIGSHIP_USERNAME!.trim(),
      password:  process.env.BIGSHIP_PASSWORD!.trim(),
      access_key: process.env.BIGSHIP_ACCESS_KEY!.trim(),
    });
    const token = data?.data?.token as string | undefined;
    if (!token) throw new Error('BigShip auth: missing token in response');
    this.token = token;
    this.tokenUntil = Date.now() + 11 * 60 * 60 * 1000; // 11h (API gives 12h)
    return token;
  }

  /** Fetch courier rates via POST /api/calculator (no order needed) */
  async fetchCourierRates(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    weightKg: number;
    codAmount?: number;
  }): Promise<BigshipRateRow[]> {
    const token = await this.getAuthToken();
    const weight = Math.max(0.1, Number(params.weightKg) || 0.1);
    const isCod  = (params.codAmount ?? 0) > 0;

    let raw: unknown;
    try {
      const { data } = await this.api().post(
        '/api/calculator',
        {
          shipment_category: 'B2C',
          payment_type: isCod ? 'COD' : 'Prepaid',
          pickup_pincode: parseInt(params.pickupPostcode.trim(), 10),
          destination_pincode: parseInt(params.deliveryPostcode.trim(), 10),
          shipment_invoice_amount: 1000,
          risk_type: '',
          box_details: [{
            each_box_dead_weight: weight,
            each_box_length: 20,
            each_box_width: 15,
            each_box_height: 10,
            box_count: 1,
          }],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      raw = data;
    } catch (e) {
      this.logger.warn(`BigShip fetchCourierRates failed: ${e}`);
      return [];
    }

    const data = raw as Record<string, unknown>;
    const list = data?.data;
    if (!Array.isArray(list)) {
      this.logger.warn(`BigShip: unexpected calculator payload: ${JSON.stringify(raw)?.slice(0, 400)}`);
      return [];
    }

    return list
      .map((c: Record<string, unknown>) => ({
        rateId:       `bs-${c.courier_id}`,
        carrierName:  String(c.courier_name ?? 'Courier'),
        amount:       Math.round(Number(c.total_shipping_charges ?? 0) * 100) / 100,
        currency:     'INR',
        estimatedDays: Number(c.tat ?? 3),
        courierId:    Number(c.courier_id),
      }))
      .filter((r) => r.courierId > 0 && r.amount >= 0);
  }

  /**
   * 3-step order booking:
   * 1. POST /api/order/add/single       → system_order_id
   * 2. POST /api/order/manifest/single  → assign courier
   * 3. GET  /api/shipment/data          → AWB number
   */
  async tryCreateAdhocOrder(input: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    billingAddress: string;
    billingCity: string;
    billingPincode: string;
    billingState: string;
    weightKg: number;
    subTotal: number;
    courierId: number;
    isCod?: boolean;
    codAmount?: number;
  }): Promise<{ bigshipOrderId?: string; awbNumber?: string; message?: string }> {
    if (!this.isConfigured()) return {};

    const pickupWarehouseId = process.env.BIGSHIP_PICKUP_WAREHOUSE_ID
      ? parseInt(process.env.BIGSHIP_PICKUP_WAREHOUSE_ID, 10)
      : null;
    const returnWarehouseId = process.env.BIGSHIP_RETURN_WAREHOUSE_ID
      ? parseInt(process.env.BIGSHIP_RETURN_WAREHOUSE_ID, 10)
      : pickupWarehouseId;

    if (!pickupWarehouseId) {
      this.logger.warn('BigShip: BIGSHIP_PICKUP_WAREHOUSE_ID not set — skipping order creation');
      return { message: 'BigShip warehouse ID not configured' };
    }

    const token = await this.getAuthToken();
    const declaredValue = Math.max(1, Math.round(input.subTotal));
    const codAmount     = input.isCod ? Math.max(1, Math.round(input.codAmount ?? input.subTotal)) : 0;

    // BigShip requires first_name 3-25 alpha chars, last_name 3-25 alpha chars
    const nameParts  = input.customerName.trim().replace(/[^a-zA-Z\s.]/g, '').split(/\s+/);
    const firstName  = (nameParts[0] ?? 'Customer').slice(0, 25).padEnd(3, 'x');
    const lastName   = (nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User').slice(0, 25).padEnd(3, 'x');

    // address_line1: 10-50 alphanumeric chars; clean and pad if too short
    const rawAddr    = input.billingAddress.replace(/[^a-zA-Z0-9\s'.,\-/]/g, '').slice(0, 50);
    const address1   = rawAddr.length >= 10 ? rawAddr : rawAddr.padEnd(10, ' ');

    const body = {
      shipment_category: 'b2c',
      warehouse_detail: {
        pickup_location_id: pickupWarehouseId,
        return_location_id: returnWarehouseId,
      },
      consignee_detail: {
        first_name: firstName,
        last_name:  lastName,
        company_name: '',
        contact_number_primary: input.customerPhone.replace(/\D/g, '').slice(0, 12) || '9999999999',
        contact_number_secondary: '',
        email_id: input.customerEmail || '',
        consignee_address: {
          address_line1: address1,
          address_line2: (input.billingCity ?? '').slice(0, 50),
          address_landmark: '',
          pincode: input.billingPincode,
        },
      },
      order_detail: {
        invoice_date: new Date().toISOString(),
        invoice_id:   input.orderNumber.replace(/[^a-zA-Z0-9\-/]/g, '').slice(0, 25),
        payment_type: input.isCod ? 'COD' : 'Prepaid',
        shipment_invoice_amount: declaredValue,
        total_collectable_amount: codAmount,
        box_details: [{
          each_box_dead_weight:          Math.max(0.1, input.weightKg),
          each_box_length:               20,
          each_box_width:                15,
          each_box_height:               10,
          each_box_invoice_amount:       declaredValue,
          each_box_collectable_amount:   codAmount,
          box_count: 1,
          product_details: [{
            product_category:                'Others',
            product_sub_category:            'Print',
            product_name:                    'Print order',
            product_quantity:                1,
            each_product_invoice_amount:     declaredValue,
            each_product_collectable_amount: codAmount,
            hsn: '',
          }],
        }],
        ewaybill_number: '',
        document_detail: { invoice_document_file: '', ewaybill_document_file: '' },
      },
    };

    try {
      // Step 1 — create order
      const { data: createData } = await this.api().post('/api/order/add/single', body, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const orderIdMatch = String(createData?.data ?? '').match(/(\d{7,})/);
      const systemOrderId = orderIdMatch ? parseInt(orderIdMatch[1], 10) : null;

      if (!systemOrderId) {
        this.logger.warn(`BigShip: could not extract system_order_id: ${JSON.stringify(createData)?.slice(0, 200)}`);
        return { message: JSON.stringify(createData)?.slice(0, 200) };
      }

      // Step 2 — manifest (assign courier)
      await this.tryManifestOrder(token, systemOrderId, input.courierId);

      // Step 3 — get AWB
      const awb = await this.tryGetAwb(token, systemOrderId);

      return { bigshipOrderId: String(systemOrderId), awbNumber: awb ?? undefined };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown } };
      this.logger.warn(`BigShip order failed: ${JSON.stringify(err.response?.data)?.slice(0, 300)}`);
      return {};
    }
  }

  private async tryManifestOrder(token: string, systemOrderId: number, courierId: number): Promise<void> {
    try {
      await this.api().post(
        '/api/order/manifest/single',
        { system_order_id: systemOrderId, courier_id: courierId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown } };
      this.logger.debug(`BigShip manifest failed: ${JSON.stringify(err.response?.data)?.slice(0, 200)}`);
    }
  }

  private async tryGetAwb(token: string, systemOrderId: number): Promise<string | null> {
    try {
      const { data } = await this.api().get(
        `/api/shipment/data?shipment_data_id=1&system_order_id=${systemOrderId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return (data?.data?.master_awb as string | null | undefined) ?? null;
    } catch (e) {
      this.logger.debug(`BigShip get AWB failed: ${e}`);
      return null;
    }
  }

  /** Call this after updating env vars so the cached token is refreshed */
  clearToken(): void {
    this.token = undefined;
    this.tokenUntil = 0;
  }
}
