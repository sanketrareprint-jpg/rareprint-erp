import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

// ─── Base URL ────────────────────────────────────────────────────────────────
// Bigship Direct (new unified outbound API — v1.3, April 2026)
const BIGSHIP_BASE = 'https://api.bigship.direct';

// ─── India pincode prefix → state lookup ─────────────────────────────────────
// First 2 digits of a 6-digit pincode identify the postal circle / state.
const PINCODE_STATE: Record<string, string> = {
  '11': 'DELHI',        '12': 'HARYANA',       '13': 'HARYANA',
  '14': 'PUNJAB',       '15': 'PUNJAB',        '16': 'PUNJAB',
  '17': 'HIMACHAL PRADESH', '18': 'JAMMU AND KASHMIR', '19': 'JAMMU AND KASHMIR',
  '20': 'UTTAR PRADESH', '21': 'UTTAR PRADESH', '22': 'UTTAR PRADESH',
  '23': 'UTTAR PRADESH', '24': 'UTTAR PRADESH', '25': 'UTTAR PRADESH',
  '26': 'UTTAR PRADESH', '27': 'UTTAR PRADESH', '28': 'UTTAR PRADESH',
  '30': 'RAJASTHAN',    '31': 'RAJASTHAN',     '32': 'RAJASTHAN',
  '33': 'RAJASTHAN',    '34': 'RAJASTHAN',
  '36': 'GUJARAT',      '37': 'GUJARAT',       '38': 'GUJARAT',       '39': 'GUJARAT',
  '40': 'MAHARASHTRA',  '41': 'MAHARASHTRA',   '42': 'MAHARASHTRA',
  '43': 'MAHARASHTRA',  '44': 'MAHARASHTRA',
  '45': 'MADHYA PRADESH', '46': 'MADHYA PRADESH', '47': 'MADHYA PRADESH',
  '48': 'MADHYA PRADESH', '49': 'CHHATTISGARH',
  '50': 'TELANGANA',    '51': 'TELANGANA',     '52': 'TELANGANA',
  '53': 'ANDHRA PRADESH', '54': 'ANDHRA PRADESH', '55': 'ANDHRA PRADESH',
  '56': 'KARNATAKA',    '57': 'KARNATAKA',     '58': 'KARNATAKA',     '59': 'KARNATAKA',
  '60': 'TAMIL NADU',   '61': 'TAMIL NADU',    '62': 'TAMIL NADU',    '63': 'TAMIL NADU',
  '64': 'TAMIL NADU',
  '67': 'KERALA',       '68': 'KERALA',        '69': 'KERALA',
  '70': 'WEST BENGAL',  '71': 'WEST BENGAL',   '72': 'WEST BENGAL',   '73': 'WEST BENGAL',
  '74': 'WEST BENGAL',
  '75': 'ODISHA',       '76': 'ODISHA',        '77': 'ODISHA',
  '78': 'ASSAM',        '79': 'ASSAM',
  '80': 'BIHAR',        '81': 'BIHAR',         '82': 'BIHAR',         '83': 'BIHAR',
  '84': 'JHARKHAND',    '85': 'JHARKHAND',
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function limitText(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = (value ?? fallback).replace(/\s+/g, ' ').trim() || fallback;
  return cleaned.slice(0, maxLength);
}

/** Look up Indian state name from a 6-digit pincode */
function stateFromPincode(pin: string): string {
  const prefix = pin.trim().slice(0, 2);
  return titleCase(PINCODE_STATE[prefix] ?? 'DELHI');
}

/** Look up a plausible city from pincode — used only when no city is in the address */
function cityFromPincode(pin: string, fallback?: string): string {
  const prefix2 = pin.trim().slice(0, 2);
  const prefix3 = pin.trim().slice(0, 3);
  const CITY_MAP: Record<string, string> = {
    '110': 'DELHI',          '400': 'MUMBAI',          '401': 'MUMBAI',
    '411': 'PUNE',           '422': 'NASHIK',          '440': 'NAGPUR',
    '442': 'CHANDRAPUR',     '380': 'AHMEDABAD',       '560': 'BANGALORE',
    '600': 'CHENNAI',        '500': 'HYDERABAD',       '700': 'KOLKATA',
    '302': 'JAIPUR',         '208': 'KANPUR',          '226': 'LUCKNOW',
    '262': 'LAKHIMPUR KHERI','482': 'JABALPUR',        '452': 'INDORE',
    '462': 'BHOPAL',
  };
  return titleCase(CITY_MAP[prefix3] ?? CITY_MAP[prefix2] ?? fallback ?? 'Delhi');
}

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
  bigshipOrderId: string;
};

export type BigshipPackageBox = {
  noOfBoxes: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
};

function normalizePackageBoxes(boxes?: BigshipPackageBox[], fallbackWeightKg = 0.5): BigshipPackageBox[] {
  const normalized = (boxes ?? [])
    .map((box) => ({
      noOfBoxes: Math.max(1, Math.floor(Number(box.noOfBoxes) || 1)),
      length: Math.max(1, Number(box.length) || 0),
      breadth: Math.max(1, Number(box.breadth) || 0),
      height: Math.max(1, Number(box.height) || 0),
      weight: Math.max(0.1, Number(box.weight) || 0),
    }))
    .filter((box) => box.length > 0 && box.breadth > 0 && box.height > 0 && box.weight > 0);

  return normalized.length > 0
    ? normalized
    : [{ noOfBoxes: 1, length: 20, breadth: 15, height: 10, weight: Math.max(0.1, fallbackWeightKg) }];
}

function toBigshipBoxes(boxes?: BigshipPackageBox[], fallbackWeightKg = 0.5) {
  const normalized = normalizePackageBoxes(boxes, fallbackWeightKg);
  return {
    totalNumOfBoxes: normalized.reduce((sum, box) => sum + box.noOfBoxes, 0),
    boxes: normalized.map((box) => ({
      weight_unit: 'kg',
      dimension_unit: 'cm',
      noOfBoxes: box.noOfBoxes,
      dimensions: [{
        length: box.length,
        breadth: box.breadth,
        height: box.height,
        weight: box.weight,
      }],
    })),
  };
}

@Injectable()
export class BigshipService {
  private readonly logger = new Logger(BigshipService.name);
  private token?: string;
  private tokenUntil = 0;
  private tokenExpiresAt?: string; // ISO string from API

  // ── Warehouse cache ──────────────────────────────────────────────────────────
  warehouseCache: BigshipWarehouse[] = []; // public so DispatchService can read it
  private warehouseCacheAt = 0; // timestamp of last fetch
  private static WAREHOUSE_CACHE_TTL = 30 * 60 * 1000; // 30 min

  /** Returns cached warehouses, refreshing if stale. Non-blocking version available via refreshWarehouseCache(). */
  async getCachedWarehouses(): Promise<BigshipWarehouse[]> {
    if (this.warehouseCache.length > 0 && Date.now() - this.warehouseCacheAt < BigshipService.WAREHOUSE_CACHE_TTL) {
      return this.warehouseCache;
    }
    return this.refreshWarehouseCache();
  }

  /** Fetches fresh warehouse list, stores in cache and returns it */
  async refreshWarehouseCache(): Promise<BigshipWarehouse[]> {
    try {
      const list = await this.getWarehouseList();
      if (list.length > 0) {
        this.warehouseCache = list;
        this.warehouseCacheAt = Date.now();
      }
    } catch (e) {
      this.logger.warn(`Warehouse cache refresh failed: ${e}`);
    }
    return this.warehouseCache;
  }

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
    orderNumber?: string;
    invoiceAmount?: number;
    shippingName?: string;
    shippingMobile?: string;
    shippingEmail?: string;
    shippingAddress?: string;
    shippingCity?: string;
    shippingState?: string;
    isCod?: boolean;
    packageBoxes?: BigshipPackageBox[];
  }): Promise<BigshipRateRow[]> {
    if (!this.isConfigured()) return [];

    const warehouseId = params.pickupWarehouseId
      ?? (process.env.BIGSHIP_PICKUP_WAREHOUSE_ID
          ? parseInt(process.env.BIGSHIP_PICKUP_WAREHOUSE_ID, 10)
          : null);

    if (!warehouseId) {
      this.logger.warn('Bigship fetchCourierRates — no pickup warehouse ID. Set BIGSHIP_PICKUP_WAREHOUSE_ID or select a warehouse in Settings.');
      return [];
    }

    const token  = await this.getAuthToken();
    const weight = Math.max(0.1, Number(params.weightKg) || 0.1);

    // Ensure we have a valid delivery pincode — fall back to pickup pincode or a default
    const deliveryPostcode = params.deliveryPostcode?.trim() ||
                             params.pickupPostcode?.trim()   ||
                             '110001'; // last-resort default (Delhi)
    const declaredValue = Math.max(1, Math.round(Number(params.invoiceAmount) || 1000));
    const codAmount = params.isCod ? Math.max(1, Math.round(Number(params.codAmount) || declaredValue)) : 0;
    const invoiceNo = (params.orderNumber ?? `RATE-${Date.now()}`).replace(/[^a-zA-Z0-9\-/]/g, '').slice(0, 25) || `RATE-${Date.now()}`;
    const packagePayload = toBigshipBoxes(params.packageBoxes, weight);
    const shippingCity = cityFromPincode(deliveryPostcode, params.shippingCity);
    const shippingState = stateFromPincode(deliveryPostcode);

    this.logger.log(`Bigship fetchCourierRates — warehouseId=${warehouseId} pickup=${params.pickupPostcode} delivery=${deliveryPostcode} weight=${weight}kg`);

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
          MasterOrderPaymentMode:     params.isCod ? 2 : 1,
          OrderInvoiceNo:             invoiceNo,
          MasterOrderInvoiceAmount:   declaredValue,
          MasterOrderCollectableAmount: params.isCod ? String(codAmount) : '',
          MasterOrderShippingName:    limitText(params.shippingName, 'Rate Check', 25),
          MasterOrderShippingEmail:   params.shippingEmail ?? '',
          MasterOrderShippingMobileNo: (params.shippingMobile ?? '9999999999').replace(/\D/g, '').slice(0, 10) || '9999999999',
          MasterOrderShippingAddress: limitText(params.shippingAddress, 'Rate Check Address', 75),
          MasterOrderShippingZipCode: deliveryPostcode,
          MasterOrderShippingCity:    shippingCity,
          MasterOrderShippingState:   shippingState,
          MasterOrderShippingCountry: 'India',
          totalNumOfBoxes: packagePayload.totalNumOfBoxes,
          boxes: packagePayload.boxes.map((box) => ({
            ...box,
            products: [{
              productName:        'Product',
              qty:                '1',
              amount:             String(declaredValue),
              totalAmount:        declaredValue,
              collectableAmount:  codAmount,
              categoryId:         '1',
            }],
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      orderId = createData?.data?.CustomGlobalOrderId as string | null ?? null;
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown }; message?: string };
      this.logger.warn(`Bigship fetchCourierRates — create draft failed: ${JSON.stringify(err.response?.data ?? err.message)}`);
      return [];
    }

    if (!orderId) {
      this.logger.warn('Bigship fetchCourierRates — draft order returned no CustomGlobalOrderId');
      return [];
    }
    this.logger.log(`Bigship fetchCourierRates — draft orderId=${orderId}, fetching rates...`);

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
          rateId:        `bs:${encodeURIComponent(orderId)}:${c.courierId}`,
          carrierName:   String(c.courierName ?? c.planName ?? 'Courier'),
          amount:        Math.round(Number(c.total_freight ?? c.total ?? 0) * 100) / 100,
          currency:      'INR',
          estimatedDays: Number(c.tat ?? 3),
          courierId:     Number(c.courierId),
          bigshipOrderId: orderId,
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
    packageBoxes?: BigshipPackageBox[];
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
    const packagePayload = toBigshipBoxes(input.packageBoxes, input.weightKg);
    const shippingCity = cityFromPincode(input.billingPincode, input.billingCity);
    const shippingState = stateFromPincode(input.billingPincode);

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
          MasterOrderShippingName:    limitText(input.customerName, 'Customer', 25),
          MasterOrderShippingEmail:   input.customerEmail || '',
          MasterOrderShippingMobileNo: input.customerPhone.replace(/\D/g, '').slice(0, 10) || '9999999999',
          MasterOrderShippingAddress: limitText(input.billingAddress, 'Address', 75),
          MasterOrderShippingAddress2: '',
          MasterOrderShippingLandmark: '',
          MasterOrderShippingZipCode: input.billingPincode,
          MasterOrderShippingCity:    shippingCity,
          MasterOrderShippingState:   shippingState,
          MasterOrderShippingCountry: 'India',
          totalNumOfBoxes: packagePayload.totalNumOfBoxes,
          boxes: packagePayload.boxes.map((box) => ({
            ...box,
            products: [{
              productName:       'Print order',
              qty:               '1',
              amount:            String(declaredValue),
              totalAmount:       declaredValue,
              collectableAmount: codAmount,
              categoryId:        '1',
            }],
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const customOrderId = createData?.data?.CustomGlobalOrderId as string | undefined;
      if (!customOrderId) {
        this.logger.warn(`Bigship: create-order returned no ID: ${JSON.stringify(createData)?.slice(0, 200)}`);
        return { message: JSON.stringify(createData)?.slice(0, 200) };
      }

      // ── Step 2: Place / manifest order ───────────────────────────────────
      return this.placeExistingOrder({
        masterCustomOrderId: customOrderId,
        courierId: input.courierId,
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown }; message?: string };
      this.logger.warn(`Bigship order failed: ${JSON.stringify(err.response?.data)?.slice(0, 300)}`);
      return { message: err.message };
    }
  }

  async placeExistingOrder(input: {
    masterCustomOrderId: string;
    courierId: number;
  }): Promise<{ bigshipOrderId?: string; awbNumber?: string; message?: string }> {
    if (!this.isConfigured()) return { message: 'Bigship API credentials are not configured' };
    const token = await this.getAuthToken();

    try {
      const { data: placeData } = await this.api().post(
        '/api/outbound/place-order',
        { MasterCustomOrderId: input.masterCustomOrderId, courierId: input.courierId },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const awb = String(placeData?.data?.awb_assigned ?? placeData?.data?.reference_number ?? '');
      return {
        bigshipOrderId: input.masterCustomOrderId,
        awbNumber: awb || undefined,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown }; message?: string };
      const response = err.response?.data ?? err.message ?? 'Bigship place-order failed';
      this.logger.warn(`Bigship place-order failed: ${JSON.stringify(response)?.slice(0, 300)}`);
      return {
        message: typeof response === 'string' ? response : JSON.stringify(response)?.slice(0, 300),
      };
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
      let fetchedForSegment = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          // Bigship documents this as GET with JSON body — send via URL params to be safe
          const url = `/api/outbound/get-warehouse-list?page=${page}&perPage=${perPage}&segment_type=${segmentType}`;
          const { data } = await this.api().get(url, {
            headers: { Authorization: `Bearer ${token}` },
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

          fetchedForSegment += list.length;
          // Use per-segment total so cross-segment accumulation doesn't break pagination
          const total = Number(data?.data?.total ?? 0);
          if (fetchedForSegment >= total || list.length < perPage) break;
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
