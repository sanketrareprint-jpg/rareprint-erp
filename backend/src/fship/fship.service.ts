// backend/src/fship/fship.service.ts
//
// Fship courier integration. Built from Fship's own "API Integration Guide
// V1.2.3.2" PDF (2026-08-20) — every endpoint/field name below matches that
// document, not a guess. Kept intentionally minimal: only the calls actually
// needed for the rate-quote -> book -> track flow this ERP uses for
// Bigship/Shiprocket today. Endpoints the PDF documents but this file
// doesn't use yet (Add/Update Warehouse, Shipping Label, Tracking History,
// Pincode Serviceability, Re-attempt Order, Create Reverse Order) are
// straightforward to add later the same way if a real need comes up — see
// the PDF for their exact shapes, don't invent them.
import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { CarrierConfigService } from '../carrier-config/carrier-config.service';

const FSHIP_PRODUCTION_BASE = 'https://capi.fship.in';
const FSHIP_STAGING_BASE = 'https://capi-qc.fship.in';

export type FshipRateQuote = {
  rateId: string; // "fs-<courierId>" -- resolved against Get Courier List below
  carrierName: string;
  amount: number;
  currency: string;
  estimatedDays: number;
};

type FshipProduct = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  sku?: string;
  hsnCode?: string;
  taxRate?: number;
  productDiscount?: number;
};

@Injectable()
export class FshipService {
  private readonly logger = new Logger(FshipService.name);
  private courierCache: { id: number; name: string }[] = [];
  private courierCacheAt = 0;

  constructor(private readonly carrierConfig: CarrierConfigService) {}

  isConfigured(): boolean {
    const cfg = this.carrierConfig.getConfig().fship;
    return !!cfg?.clientKey;
  }

  private client(): AxiosInstance {
    const cfg = this.carrierConfig.getConfig().fship;
    // FSHIP_ENV=staging switches to the sandbox base URL for testing against
    // Fship's QC environment; defaults to production, matching the "Client
    // Key" terminology used for the key Sanket provided (the PDF's
    // Production section, not Staging's "Security Key").
    const base = process.env.FSHIP_ENV?.trim().toLowerCase() === 'staging'
      ? FSHIP_STAGING_BASE
      : FSHIP_PRODUCTION_BASE;
    return axios.create({
      baseURL: base,
      timeout: 20000,
      headers: { 'Content-Type': 'application/json', signature: cfg.clientKey },
    });
  }

  /** GET COURIER LIST (PDF p.4). Cached 30 min -- this list changes rarely,
   *  and it's needed on every rate-quote/booking call to resolve a courier
   *  name back to the numeric courierId Fship's booking API requires. */
  async getCourierList(force = false): Promise<{ id: number; name: string }[]> {
    if (!force && this.courierCache.length > 0 && Date.now() - this.courierCacheAt < 30 * 60 * 1000) {
      return this.courierCache;
    }
    try {
      // The PDF's own table says Method: GET, but its curl sample for this
      // same endpoint uses --request POST (page 4-5) -- a real
      // inconsistency in Fship's documentation, not a typo on this side.
      // GET matches the documented "Method" field and REST convention for a
      // list fetch, so that's what's implemented. If this 404s/405s against
      // the real API, that's the first thing to flip to a POST -- don't
      // silently guess further.
      const { data } = await this.client().get<{ courierId: number; courierName: string }[]>('/api/getallcourier');
      if (Array.isArray(data)) {
        this.courierCache = data.map((c) => ({ id: c.courierId, name: c.courierName }));
        this.courierCacheAt = Date.now();
      }
    } catch (e) {
      this.logger.warn(`Fship getCourierList failed: ${e instanceof Error ? e.message : e}`);
    }
    return this.courierCache;
  }

  /** RATE CALCULATOR (PDF p.15-16). Returns approx. charges excluding
   *  "Additional Charges & GST" per the PDF's own note -- same caveat this
   *  codebase already treats Bigship/Shiprocket quotes as estimates, not
   *  final invoiced amounts. */
  async fetchRates(params: {
    pickupPincode: string;
    deliveryPincode: string;
    weightKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    isCod: boolean;
    amount: number;
    expressType?: 'air' | 'surface';
  }): Promise<FshipRateQuote[]> {
    if (!this.isConfigured()) return [];
    try {
      const courierList = await this.getCourierList();
      const { data } = await this.client().post('/api/ratecalculator', {
        source_Pincode: params.pickupPincode,
        destination_Pincode: params.deliveryPincode,
        payment_Mode: params.isCod ? 'COD' : 'P',
        amount: params.amount,
        express_Type: params.expressType ?? 'surface',
        shipment_Weight: params.weightKg,
        shipment_Length: params.lengthCm ?? 10,
        shipment_Width: params.widthCm ?? 10,
        shipment_Height: params.heightCm ?? 10,
        volumetric_Weight: 0,
      });
      const rates: Array<{ courier_name?: string; shipping_charge?: number }> =
        Array.isArray(data?.shipment_rates) ? data.shipment_rates : [];
      return rates
        .map((r) => {
          const name = String(r.courier_name ?? 'Fship Courier');
          const match = courierList.find((c) => c.name.toLowerCase() === name.toLowerCase());
          return {
            // No match -> rateId carries courierId 0, which bookItems'
            // Fship branch below rejects with a clear error instead of
            // silently booking the wrong (or no) courier.
            rateId: `fs-${match?.id ?? 0}`,
            carrierName: name,
            amount: Number(r.shipping_charge) || 0,
            currency: 'INR',
            // Fship's rate calculator response has no ETA field at all --
            // 3 matches the same fallback default already used for
            // Bigship/Shiprocket quotes elsewhere (sanitizeSelectedRateQuote
            // in dispatch.service.ts).
            estimatedDays: 3,
          };
        })
        .filter((r) => r.amount > 0);
    } catch (e) {
      this.logger.warn(`Fship fetchRates failed: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  /** CREATE FORWARD ORDER (PDF p.8-9). One-step: assigns waybill + courier
   *  immediately, unlike Bigship's separate draft-then-place flow -- closer
   *  to how Shiprocket's tryCreateAdhocOrder already works in this
   *  codebase. */
  async createForwardOrder(input: {
    customerName: string;
    customerMobile: string;
    customerEmail?: string;
    address: string;
    landmark?: string;
    addressType?: 'Home' | 'Office';
    pincode: string;
    city?: string;
    externalOrderId: string;
    invoiceNumber?: string;
    isCod: boolean;
    codAmount: number;
    orderAmount: number;
    totalAmount: number;
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    pickAddressId: number;
    courierId: number;
    products: FshipProduct[];
  }): Promise<{ waybill?: string; apiOrderId?: number; orderStatus?: string; message?: string }> {
    if (!this.isConfigured()) return { message: 'Fship not configured' };
    try {
      const { data } = await this.client().post('/api/createforwardorder', {
        customer_Name: input.customerName,
        customer_Mobile: input.customerMobile,
        customer_Emailid: input.customerEmail ?? '',
        customer_Address: input.address,
        landMark: input.landmark ?? '',
        customer_Address_Type: input.addressType ?? 'Home',
        customer_PinCode: input.pincode,
        customer_City: input.city ?? '',
        orderId: input.externalOrderId,
        invoice_Number: input.invoiceNumber ?? input.externalOrderId,
        payment_Mode: input.isCod ? 1 : 2, // 1=COD, 2=PREPAID (PDF p.8)
        express_Type: 'surface',
        is_Ndd: 0,
        order_Amount: input.orderAmount,
        tax_Amount: 0,
        extra_Charges: 0,
        total_Amount: input.totalAmount,
        cod_Amount: input.isCod ? input.codAmount : 0,
        shipment_Weight: input.weightKg,
        shipment_Length: input.lengthCm,
        shipment_Width: input.widthCm,
        shipment_Height: input.heightCm,
        volumetric_Weight: 0,
        pick_Address_ID: input.pickAddressId,
        products: input.products.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          unitPrice: p.unitPrice,
          quantity: p.quantity,
          productCategory: '',
          hsnCode: p.hsnCode ?? '',
          sku: p.sku ?? '',
          taxRate: p.taxRate ?? 0,
          productDiscount: p.productDiscount ?? 0,
        })),
        courierId: input.courierId,
      });
      if (data?.status === true && data?.waybill) {
        return {
          waybill: String(data.waybill),
          apiOrderId: typeof data.apiorderid === 'number' ? data.apiorderid : undefined,
          orderStatus: data.order_status ? String(data.order_status) : undefined,
        };
      }
      return { message: String(data?.response ?? 'Fship did not return a waybill') };
    } catch (e) {
      const message = axios.isAxiosError(e)
        ? (e.response?.data?.response ?? e.response?.data?.message ?? e.message)
        : e instanceof Error ? e.message : String(e);
      this.logger.warn(`Fship createForwardOrder failed: ${message}`);
      return { message: String(message) };
    }
  }

  /** REGISTER PICKUP (PDF p.12-13). Called immediately after
   *  createForwardOrder succeeds, same "auto-manifest" UX already built for
   *  Bigship (see dispatch.service.ts) -- so Sanket never has to log into
   *  Fship's dashboard to schedule collection for a normal booking. */
  async registerPickup(waybills: string[]): Promise<{ pickupOrderId?: number; message?: string }> {
    if (!this.isConfigured()) return { message: 'Fship not configured' };
    try {
      const { data } = await this.client().post('/api/registerpickup', { waybills });
      const first = Array.isArray(data?.apipickuporderids) ? data.apipickuporderids[0] : undefined;
      if (data?.status === true && first?.pickupOrderId) {
        return { pickupOrderId: Number(first.pickupOrderId) };
      }
      return { message: String(data?.response ?? 'Fship did not confirm pickup registration') };
    } catch (e) {
      const message = axios.isAxiosError(e)
        ? (e.response?.data?.response ?? e.response?.data?.message ?? e.message)
        : e instanceof Error ? e.message : String(e);
      this.logger.warn(`Fship registerPickup failed: ${message}`);
      return { message: String(message) };
    }
  }

  /** SHIPMENT CURRENT STATUS (PDF p.14-15). Poll-based, single waybill --
   *  equivalent to Bigship's getOrderShipmentDetails(). */
  async getShipmentStatus(waybill: string): Promise<{ status?: string; location?: string; remark?: string } | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data } = await this.client().post('/api/shipmentsummary', { waybill });
      if (data?.status === true && data?.summary) {
        return {
          status: data.summary.status ? String(data.summary.status) : undefined,
          location: data.summary.location ? String(data.summary.location) : undefined,
          remark: data.summary.remark ? String(data.summary.remark) : undefined,
        };
      }
      return null;
    } catch (e) {
      this.logger.warn(`Fship getShipmentStatus failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** CANCEL SHIPMENT (PDF p.11-12). Only valid while the order is in
   *  Booked/Manifested state per the PDF -- not currently wired into any UI
   *  (Bigship/Shiprocket don't have a cancel button in this ERP either),
   *  available for whoever adds that later. */
  async cancelOrder(waybill: string, reason?: string): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) return { ok: false, message: 'Fship not configured' };
    try {
      const { data } = await this.client().post('/api/cancelorder', { waybill, reason: reason ?? '' });
      return { ok: data?.status === true, message: data?.response ? String(data.response) : undefined };
    } catch (e) {
      const message = axios.isAxiosError(e)
        ? (e.response?.data?.response ?? e.response?.data?.message ?? e.message)
        : e instanceof Error ? e.message : String(e);
      this.logger.warn(`Fship cancelOrder failed: ${message}`);
      return { ok: false, message: String(message) };
    }
  }
}
