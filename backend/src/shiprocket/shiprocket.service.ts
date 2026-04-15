import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export type ShiprocketRateRow = {
  rateId: string;
  carrierName: string;
  amount: number;
  currency: string;
  estimatedDays: number;
  courierCompanyId: number;
};

@Injectable()
export class ShiprocketService {
  private readonly logger = new Logger(ShiprocketService.name);
  private token?: string;
  private tokenUntil = 0;

  private api(): AxiosInstance {
    return axios.create({
      baseURL: 'https://apiv2.shiprocket.in',
      timeout: 25_000,
    });
  }

  isConfigured(): boolean {
    return !!(
      process.env.SHIPROCKET_EMAIL?.trim() &&
      process.env.SHIPROCKET_PASSWORD?.trim()
    );
  }

  async getAuthToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenUntil) {
      return this.token;
    }
    const email = process.env.SHIPROCKET_EMAIL!.trim();
    const password = process.env.SHIPROCKET_PASSWORD!.trim();
    const { data } = await this.api().post('/v1/external/auth/login', {
      email,
      password,
    });
    const token = data?.token as string | undefined;
    if (!token) {
      throw new Error('Shiprocket auth: missing token in response');
    }
    this.token = token;
    this.tokenUntil = Date.now() + 36 * 60 * 60 * 1000;
    return token;
  }

  /**
   * Courier serviceability / rates. Tries GET then POST (Shiprocket variants differ).
   */
  async fetchCourierRates(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    weightKg: number;
    codAmount?: number;
  }): Promise<ShiprocketRateRow[]> {
    const token = await this.getAuthToken();
    const headers = { Authorization: `Bearer ${token}` };
    const weight = String(Math.max(0.1, Number(params.weightKg) || 0.1));
    const cod = String(params.codAmount ?? 0);
    const pickup = params.pickupPostcode.trim();
    const delivery = params.deliveryPostcode.trim();

    let raw: unknown;
    try {
      const q = new URLSearchParams({
        pickup_postcode: pickup,
        delivery_postcode: delivery,
        weight,
        cod,
      });
      const res = await this.api().get(
        `/v1/external/courier/serviceability/?${q.toString()}`,
        { headers },
      );
      raw = res.data;
    } catch (e) {
      this.logger.debug(`Shiprocket GET serviceability failed, trying POST: ${e}`);
      const res = await this.api().post(
        '/v1/external/courier/serviceability/',
        {
          pickup_postcode: pickup,
          delivery_postcode: delivery,
          weight,
          cod_amount: cod,
        },
        { headers },
      );
      raw = res.data;
    }

    const data = raw as Record<string, unknown>;
    const list =
      (data?.data as Record<string, unknown>)?.available_courier_companies ??
      data?.available_courier_companies;

    if (!Array.isArray(list)) {
      this.logger.warn(
        `Shiprocket: unexpected serviceability payload: ${JSON.stringify(raw)?.slice(0, 400)}`,
      );
      return [];
    }

    return list
      .map((c: Record<string, unknown>) => {
        const id = Number(c.courier_company_id ?? c.courierCompanyId ?? 0);
        const rate = Number(
          c.rate ?? c.freight_charge ?? c.estimated_delivery_charges ?? 0,
        );
        const name = String(c.courier_name ?? c.courierName ?? 'Courier');
        const etdRaw = c.estimated_delivery_days ?? c.etd ?? '3';
        const etd =
          typeof etdRaw === 'number'
            ? etdRaw
            : parseInt(String(etdRaw), 10) || 3;
        return {
          rateId: `sr-${id}`,
          carrierName: name,
          amount: Math.round(rate * 100) / 100,
          currency: 'INR',
          estimatedDays: etd,
          courierCompanyId: id,
        };
      })
      .filter((r) => r.courierCompanyId > 0 && r.amount >= 0);
  }

  /**
   * Best-effort Shiprocket order creation (adhoc). Returns Shiprocket order id or null.
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
    courierCompanyId: number;
  }): Promise<{ shiprocketOrderId?: string; message?: string }> {
    if (!this.isConfigured()) return {};
    const token = await this.getAuthToken();
    const pickupLocation =
      process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || 'Primary';
    const orderDate = new Date().toISOString().slice(0, 10);

    const body = {
      order_id: input.orderNumber,
      order_date: orderDate,
      pickup_location: pickupLocation,
      billing_customer_name: input.customerName.slice(0, 50),
      billing_last_name: '.',
      billing_address: input.billingAddress.slice(0, 200) || 'Address',
      billing_city: input.billingCity.slice(0, 50) || 'City',
      billing_pincode: input.billingPincode,
      billing_state: input.billingState.slice(0, 50) || 'State',
      billing_country: 'India',
      billing_email: input.customerEmail || 'noreply@example.com',
      billing_phone: input.customerPhone.replace(/\D/g, '').slice(0, 15) || '9999999999',
      shipping_is_billing: true,
      order_items: [
        {
          name: 'Print order',
          sku: input.orderNumber,
          units: 1,
          selling_price: Math.max(1, Math.round(input.subTotal)),
        },
      ],
      payment_method: 'Prepaid',
      sub_total: Math.max(1, Math.round(input.subTotal)),
      length: 20,
      breadth: 15,
      height: 10,
      weight: Math.max(0.1, input.weightKg),
    };

    try {
      const { data } = await this.api().post(
        '/v1/external/orders/create/adhoc',
        body,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = data?.payload ?? data;
      const shipmentId = Number(
        payload?.shipment_id ?? data?.shipment_id ?? 0,
      );
      const srOrderId =
        payload?.order_id ?? data?.order_id ?? data?.id ?? shipmentId;
      if (shipmentId > 0) {
        await this.tryAssignCourier(
          token,
          shipmentId,
          input.courierCompanyId,
        );
        return { shiprocketOrderId: String(srOrderId ?? shipmentId) };
      }
      return { message: JSON.stringify(data)?.slice(0, 200) };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown } };
      this.logger.warn(
        `Shiprocket create/adhoc failed: ${JSON.stringify(err.response?.data)?.slice(0, 300)}`,
      );
      return {};
    }
  }

  private async tryAssignCourier(
    token: string,
    shipmentId: number,
    courierCompanyId: number,
  ): Promise<void> {
    if (!courierCompanyId || !Number.isFinite(shipmentId)) return;
    try {
      await this.api().post(
        '/v1/external/courier/assign/awb',
        {
          shipment_id: shipmentId,
          courier_id: courierCompanyId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown } };
      this.logger.debug(
        `Shiprocket assign AWB skipped/failed: ${JSON.stringify(err.response?.data)?.slice(0, 200)}`,
      );
    }
  }
}
