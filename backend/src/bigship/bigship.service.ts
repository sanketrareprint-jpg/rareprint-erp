import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

// ─── Base URL ────────────────────────────────────────────────────────────────
// Bigship Direct (new unified outbound API — v1.3, April 2026)
const BIGSHIP_BASE = 'https://api.bigship.direct';

export type BigshipWarehouse = {
  bigshipWarehouseId: number;
  name: string;
  pincode: string;
  city: string;
  state: string;
  address: string;
  contactPerson: string;
  phone: string;
  isActive: boolean;
};

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
  private tokenExpiresAt?: string; // ISO string from API

  // ── HTTP client ─────────────────────────────────────────────────────────────

  private api(): AxiosInstance {
    return axios.create({
      baseURL: BIGSHIP_BASE,
      timeout: 25_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Config check ────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return !!(
      process.env.BIGSHIP_USERNAME?.trim() &&
      process.env.BIGSHIP_PASSWORD?.trim() &&
      process.env.BIGSHIP_ACCESS_KEY?.trim()
    );
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  /**
   * POST /api/outbound/login
   * Returns a Bearer token valid for ~12 h.
   * Token is cached in memory; re-login happens automatically on expiry or 401.
   */
  async getAuthToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenUntil) {
      return this.token;
    }
    const { data } = await this.api().post('/api/outbound/login', {
      username:   process.env.BIGSHIP_USERNAME!.trim(),
      password:   process.env.BIGSHIP_PASSWORD!.trim(),
      access_key: process.env.BIGSHIP_ACCESS_KEY!.trim(),
    });

    const token     = data?.data?.token as string | undefined;
    const expiresAt = data?.data?.tokenExpiringAt as string | undefined;
    if (!token) throw new Error(`Bigship Direct auth failed: ${JSON.stringify(data)?.slice(0, 200)}`);

    this.token          = token;
    this.tokenExpiresAt = expiresAt;
    // Cache for 11 h (API says 12 h; keep 1 h buffer)
    this.tokenUntil     = expiresAt
      ? new Date(expiresAt).getTime() - 60 * 60 * 1000
      : Date.now() + 11 * 60 * 60 * 1000;

    this.logger.log(`Bigship Direct: token refreshed, expires ${expiresAt ?? 'unknown'}`);
    return token;
  }

  /** Returns current token expiry ISO string (or null if not yet logged in) */
  getTokenExpiry(): string | null {
    return this.tokenExpiresAt ?? null;
  }

  // ── Test connection ─────────────────────────────────────────────────────────

  /**
   * Attempts login and returns a status object — used by the Settings panel
   * "Test Connection" button.
   */
  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    walletBalance?: string;
    tokenExpiresAt?: string;
  }> {
    if (!this.isConfigured()) {
      return { ok: false, message: 'API credentials are not configured.' };
    }
    try {
      // Force a fresh login to validate credentials
      this.clearToken();
      const { data } = await this.api().post('/api/outbound/login', {
        username:   process.env.BIGSHIP_USERNAME!.trim(),
        password:   process.env.BIGSHIP_PASSWORD!.trim(),
        access_key: process.env.BIGSHIP_ACCESS_KEY!.trim(),
      });

      const token     = data?.data?.token as string | undefined;
      const expiresAt = data?.data?.tokenExpiringAt as string | undefined;
      const balance   = data?.data?.userWallet?.Balance as string | undefined;

      if (!token) {
        return { ok: false, message: data?.message ?? 'Login failed — no token returned.' };
      }

      // Persist the fresh token
      this.token          = token;
      this.tokenExpiresAt = expiresAt;
      this.tokenUntil     = expiresAt
        ? new Date(expiresAt).getTime() - 60 * 60 * 1000
        : Date.now() + 11 * 60 * 60 * 1000;

      return {
        ok: true,
        message: 'Connected successfully.',
        walletBalance: balance,
        tokenExpiresAt: expiresAt,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message ?? err.message ?? 'Connection failed.';
      return { ok: false, message: msg };
    }
  }

  // ── Courier rates ───────────────────────────────────────────────────────────

  /**
   * New 2-step rate fetch (Bigship Direct):
   *   1. POST /api/outbound/create-order  → CustomGlobalOrderId  (draft)
   *   2. POST /api/outbound/courier-wise-shipment-cost → rates
   *
   * The draft order is NOT manifested, so no charges are incurred.
   */
  async fetchCourierRates(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    weightKg: number;
    codAmount?: number;
    pickupWarehouseId?: number;
  }): Promise<BigshipRateRow[]> {
    if (!this.isConfigured()) return [];

    const warehouseId = params.pickupWarehouseId
      ?? (process.env.BIGSHIP_PICKUP_WAREHOUSE_ID
          ? parseInt(process.env.BIGSHIP_PICKUP_WAREHOUSE_ID, 10)
          : null);

    if (!warehouseId) {
      this.logger.warn('Bigship: fetchCourierRates — no pickup warehouse ID configured');
      return [];
    }

    const token  = await this.getAuthToken();
    const weight = Math.max(0.1, Number(params.weightKg) || 0.1);

    let orderId: string | null = null;
    try {
      // Step 1 — create draft order (domestic B2C)
      const { data: createData } = await this.api().post(
        '/api/outbound/create-order',
        {
          segment_type:               'domestic_b2c',
          MasterOrderPickUpLocation:  warehouseId,
          MasterOrderReturnLocation:  warehouseId,
          MasterOrderDate:            new Date().toISOString().slice(0, 10),
          MasterOrderPaymentMode:     1,
          OrderInvoiceNo:             `RATE-${Date.now()}`,
          MasterOrderInvoiceAmount:   1000,
          MasterOrderShippingName:    'Rate Check',
          MasterOrderShippingMobileNo: '9999999999',
          MasterOrderShippingAddress: 'Rate Check Address',
          MasterOrderShippingZipCode: params.deliveryPostcode.trim(),
          MasterOrderShippingCity:    'DELHI',
          MasterOrderShippingState:   'DELHI',
          MasterOrderShippingCountry: 'India',
          totalNumOfBoxes: 1,
          boxes: [{
            weight_unit:    'kg',
            dimension_unit: 'cm',
            noOfBoxes: 1,
            dimensions: [{ length: 20, breadth: 15, height: 10, weight }],
            products: [{
              productName:        'Product',
              qty:                '1',
              amount:             '1000',
              totalAmount:        1000,
              collectableAmount:  params.codAmount ?? 0,
              categoryId:         '1',
            }],
          }],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      orderId = createData?.data?.CustomGlobalOrderId as string | null ?? null;
    } catch (e) {
      this.logger.warn(`Bigship fetchCourierRates — create draft failed: ${e}`);
      return [];
    }

    if (!orderId) return [];

    try {
      // Step 2 — fetch rates for the draft order
      const { data: rateData } = await this.api().post(
        '/api/outbound/courier-wise-shipment-cost',
        { MasterCustomOrderId: orderId },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const list = rateData?.data?.calculatedRates;
      if (!Array.isArray(list)) return [];

      return list
        .map((c: Record<string, unknown>) => ({
          rateId:        `bs-${c.courierId}`,
          carrierName:   String(c.courierName ?? c.planName ?? 'Courier'),
          amount:        Math.round(Number(c.total_freight ?? c.total ?? 0) * 100) / 100,
          currency:      'INR',
          estimatedDays: Number(c.tat ?? 3),
          courierId:     Number(c.courierId),
        }))
        .filter((r) => r.courierId > 0 && r.amount >= 0);
    } catch (e) {
      this.logger.warn(`Bigship fetchCourierRates — rates fetch failed: ${e}`);
      return [];
    }
  }

  // ── Order creation ──────────────────────────────────────────────────────────

  /**
   * 3-step order booking (Bigship Direct):
   *   1. POST /api/outbound/create-order              → CustomGlobalOrderId
   *   2. POST /api/outbound/courier-wise-shipment-cost → confirm courier available
   *   3. POST /api/outbound/place-order               → AWB
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
    pickupWarehouseId?: number;  // override; falls back to env var if omitted
  }): Promise<{ bigshipOrderId?: string; awbNumber?: string; message?: string }> {
    if (!this.isConfigured()) return {};

    const pickupWarehouseId = input.pickupWarehouseId
      ?? (process.env.BIGSHIP_PICKUP_WAREHOUSE_ID
          ? parseInt(process.env.BIGSHIP_PICKUP_WAREHOUSE_ID, 10)
          : null);

    if (!pickupWarehouseId) {
      this.logger.warn('Bigship: BIGSHIP_PICKUP_WAREHOUSE_ID not set — skipping order creation');
      return { message: 'Bigship warehouse ID not configured' };
    }

    const token         = await this.getAuthToken();
    const declaredValue = Math.max(1, Math.round(input.subTotal));
    const codAmount     = input.isCod ? Math.max(1, Math.round(input.codAmount ?? input.subTotal)) : 0;
    const invoiceNo     = input.orderNumber.replace(/[^a-zA-Z0-9\-/]/g, '').slice(0, 25) || `ORD-${Date.now()}`;

    try {
      // ── Step 1: Create draft order ────────────────────────────────────────
      const { data: createData } = await this.api().post(
        '/api/outbound/create-order',
        {
          segment_type:               'domestic_b2c',
          MasterOrderPickUpLocation:  pickupWarehouseId,
          MasterOrderReturnLocation:  pickupWarehouseId,
          MasterOrderDate:            new Date().toISOString().slice(0, 10),
          MasterOrderPaymentMode:     input.isCod ? 2 : 1,  // 1=Prepaid, 2=COD
          OrderInvoiceNo:             invoiceNo,
          MasterOrderInvoiceAmount:   declaredValue,
          MasterOrderCollectableAmount: input.isCod ? String(codAmount) : '',
          MasterOrderShippingName:    input.customerName.slice(0, 60) || 'Customer',
          MasterOrderShippingEmail:   input.customerEmail || '',
          MasterOrderShippingMobileNo: input.customerPhone.replace(/\D/g, '').slice(0, 10) || '9999999999',
          MasterOrderShippingAddress: input.billingAddress.slice(0, 100) || 'Address',
          MasterOrderShippingAddress2: '',
          MasterOrderShippingLandmark: '',
          MasterOrderShippingZipCode: input.billingPincode,
          MasterOrderShippingCity:    input.billingCity.toUpperCase() || 'DELHI',
          MasterOrderShippingState:   input.billingState.toUpperCase() || 'DELHI',
          MasterOrderShippingCountry: 'India',
          totalNumOfBoxes: 1,
          boxes: [{
            weight_unit:    'kg',
            dimension_unit: 'cm',
            noOfBoxes: 1,
            dimensions: [{
              length:  20,
              breadth: 15,
              height:  10,
              weight:  Math.max(0.1, input.weightKg),
            }],
            products: [{
              productName:       'Print order',
              qty:               '1',
              amount:            String(declaredValue),
              totalAmount:       declaredValue,
              collectableAmount: codAmount,
              categoryId:        '1',
            }],
          }],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const customOrderId = createData?.data?.CustomGlobalOrderId as string | undefined;
      if (!customOrderId) {
        this.logger.warn(`Bigship: create-order returned no ID: ${JSON.stringify(createData)?.slice(0, 200)}`);
        return { message: JSON.stringify(createData)?.slice(0, 200) };
      }

      // ── Step 2: Place / manifest order ───────────────────────────────────
      const { data: placeData } = await this.api().post(
        '/api/outbound/place-order',
        { MasterCustomOrderId: customOrderId, courierId: input.courierId },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const awb = String(placeData?.data?.awb_assigned ?? placeData?.data?.reference_number ?? '');
      return {
        bigshipOrderId: customOrderId,
        awbNumber:      awb || undefined,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown }; message?: string };
      this.logger.warn(`Bigship order failed: ${JSON.stringify(err.response?.data)?.slice(0, 300)}`);
      return { message: err.message };
    }
  }

  // ── Warehouse list ──────────────────────────────────────────────────────────

  /**
   * Fetches all saved pickup warehouses from Bigship Direct.
   * GET /api/outbound/get-warehouse-list
   * Paginates automatically (max 25 per page) until all pages are fetched.
   */
  async getWarehouseList(): Promise<BigshipWarehouse[]> {
    if (!this.isConfigured()) return [];
    const token = await this.getAuthToken();

    // Bigship stores warehouses per segment_type.
    // Try all known types and merge, deduplicating by warehouseId.
    const segmentTypes = ['local', 'hyperlocal', 'domestic_b2b', 'domestic_b2c'];
    const seen = new Set<number>();
    const results: BigshipWarehouse[] = [];

    for (const segmentType of segmentTypes) {
      let page = 1;
      const perPage = 25;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          // Bigship GET endpoints expect JSON body (not query params)
          const { data } = await this.api().get('/api/outbound/get-warehouse-list', {
            headers: { Authorization: `Bearer ${token}` },
            data: { page: String(page), perPage: String(perPage), segment_type: segmentType },
          });

          const list = data?.data?.warehouse;
          if (!Array.isArray(list) || list.length === 0) break;

          for (const w of list as Record<string, unknown>[]) {
            const id = Number(w.warehouseId);
            if (!seen.has(id)) {
              seen.add(id);
              results.push({
                bigshipWarehouseId: id,
                name:          String(w.warehouseName         ?? w.warehouseContactPerson ?? `Warehouse ${id}`),
                pincode:       String(w.pincode               ?? ''),
                city:          String(w.city                  ?? ''),
                state:         String(w.state                 ?? ''),
                address:       String(w.warehouseAddressLine1 ?? ''),
                contactPerson: String(w.warehouseContactPerson ?? ''),
                phone:         String(w.warehouseAddressPhone  ?? ''),
                isActive:      w.isActive === '1' || w.isActive === true,
              });
            }
          }

          const total = Number(data?.data?.total ?? 0);
          if (results.length >= total || list.length < perPage) break;
          page++;
        } catch (e) {
          // segment type may not be supported — just skip it
          this.logger.debug(`Bigship getWarehouseList segment=${segmentType} page=${page}: ${e}`);
          break;
        }
      }
    }

    this.logger.log(`Bigship getWarehouseList: found ${results.length} warehouse(s) across all segment types`);
    return results;
  }

  // ── Token management ────────────────────────────────────────────────────────

  /** Call this after updating credentials so the cached token is re-fetched */
  clearToken(): void {
    this.token          = undefined;
    this.tokenUntil     = 0;
    this.tokenExpiresAt = undefined;
  }
}
