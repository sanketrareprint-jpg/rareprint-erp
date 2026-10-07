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

// ── B2B (LTL / multi-box freight) ─────────────────────────────────────────
// Separate API surface under /b2bapi, built from Fship's "B2B Client API
// Integration Guide v1.0.0.0" (2026-10-06). Where that PDF and the live QC
// API disagreed, the live behaviour (probed 2026-10-07) wins and is noted
// inline. rateId scheme: "fsb-<serviceProviderId>-<mode>" -- distinct from
// B2C's "fs-<courierId>" so bookItems routes each to the right API.
export type FshipB2BBox = { noOfBoxes: number; length: number; breadth: number; height: number; weight: number };

export type FshipB2BDocument = { fileName: string; content: Buffer };

export type FshipB2BLabel = { labelUrl?: string; manifestUrl?: string; invoiceUrl?: string; message?: string };

export function parseFshipB2BRateId(rateId: string): { courierId: number; mode: string } | null {
  const m = /^fsb-(\d+)(?:-(.+))?$/.exec(rateId);
  if (!m) return null;
  const courierId = Number(m[1]);
  if (!Number.isFinite(courierId) || courierId <= 0) return null;
  return { courierId, mode: m[2] || 'surface' };
}

function fshipErrorMessage(e: unknown): string {
  return axios.isAxiosError(e)
    ? String(e.response?.data?.response ?? e.response?.data?.message ?? e.message)
    : e instanceof Error ? e.message : String(e);
}

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

  private baseUrl(): string {
    // FSHIP_ENV=staging switches to the sandbox base URL for testing against
    // Fship's QC environment; defaults to production, matching the "Client
    // Key" terminology used for the key Sanket provided (the PDF's
    // Production section, not Staging's "Security Key").
    return process.env.FSHIP_ENV?.trim().toLowerCase() === 'staging'
      ? FSHIP_STAGING_BASE
      : FSHIP_PRODUCTION_BASE;
  }

  private client(): AxiosInstance {
    const cfg = this.carrierConfig.getConfig().fship;
    return axios.create({
      baseURL: this.baseUrl(),
      timeout: 20000,
      headers: { 'Content-Type': 'application/json', signature: cfg.clientKey },
    });
  }

  /** B2B Create Forward Order is multipart/form-data. Must NOT reuse
   *  client() above: with a JSON Content-Type default, axios 1.x silently
   *  converts a FormData body to JSON (defaults/index.js formDataToJSON). */
  private multipartClient(): AxiosInstance {
    const cfg = this.carrierConfig.getConfig().fship;
    return axios.create({
      baseURL: this.baseUrl(),
      timeout: 60000,
      headers: { signature: cfg.clientKey },
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
      const rates: Array<{ courier_name?: string; shipping_charge?: number; cod_charge?: number }> =
        Array.isArray(data?.shipment_rates) ? data.shipment_rates : [];
      return rates
        .map((r) => {
          const name = String(r.courier_name ?? 'Fship Courier');
          const match = courierList.find((c) => c.name.toLowerCase() === name.toLowerCase());
          // Fship's Rate Calculator (PDF p.16) returns shipping_charge and
          // cod_charge as separate fields on every courier -- cod_charge is
          // that courier's COD handling fee, only actually payable when this
          // shipment is COD. Bigship/Shiprocket's `amount` here is already
          // the single all-inclusive total the dispatcher gets charged (see
          // bigship.service.ts's totalCharge/courierCharge), so fold
          // cod_charge in for parity on COD quotes -- before this fix, a
          // COD quote from Fship showed only the shipping_charge portion,
          // silently leaving out the COD fee.
          const shippingCharge = Number(r.shipping_charge) || 0;
          const codCharge = params.isCod ? (Number(r.cod_charge) || 0) : 0;
          return {
            // No match -> rateId carries courierId 0, which bookItems'
            // Fship branch below rejects with a clear error instead of
            // silently booking the wrong (or no) courier.
            rateId: `fs-${match?.id ?? 0}`,
            carrierName: name,
            amount: shippingCharge + codCharge,
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
    // Real courier freight charge for this shipment, sent as Fship's
    // extra_Charges field so their invoice/label has a correct standalone
    // freight figure instead of Rs 0 or the COD balance. Optional/defaults
    // to 0 for any other caller.
    extraCharges?: number;
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
        extra_Charges: input.extraCharges ?? 0,
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
      // Fship support (2026-08-31) confirmed the real endpoint is
      // /api/shipmentcurrentstatus -- the PDF's documented
      // /api/shipmentsummary 404s. Payload/response shape is unchanged per
      // their confirmation.
      const { data } = await this.client().post('/api/shipmentcurrentstatus', { waybill });
      if (data?.status === true && data?.summary) {
        return {
          status: data.summary.status ? String(data.summary.status) : undefined,
          location: data.summary.location ? String(data.summary.location) : undefined,
          // Real response field is "remarks" (plural) -- confirmed against a
          // live staging call 2026-08-31; the PDF's sample used "remark".
          remark: data.summary.remarks ? String(data.summary.remarks) : undefined,
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

  // ── B2B ───────────────────────────────────────────────────────────────────

  /** B2B RATE CALCULATOR (B2B PDF §4.8). Unlike B2C, the response carries
   *  serviceProviderId directly, so no courier-list name matching is needed.
   *  Returns Fship's own message when nothing comes back (e.g. "Pickup/
   *  Desitination pincode not servicable.") so the dispatcher sees why,
   *  instead of an empty list. */
  async fetchB2BRates(params: {
    pickupPincode: string;
    deliveryPincode: string;
    boxes: FshipB2BBox[];
    isCod: boolean;
    codAmount: number;
    invoiceAmount: number;
  }): Promise<{ rates: FshipRateQuote[]; message?: string }> {
    if (!this.isConfigured()) return { rates: [], message: 'Fship not configured' };
    try {
      const { data } = await this.client().post('/b2bapi/ratecalculator', {
        // PDF marks the codes "to be confirmed"; uses the same 1=COD /
        // 2=Prepaid coding as Fship's B2C API (Create Forward Order below
        // confirmed 2 = Prepaid against QC).
        paymentType: params.isCod ? 1 : 2,
        pickUpPinCode: params.pickupPincode,
        deliveryPinCode: params.deliveryPincode,
        invoiceAmount: params.invoiceAmount,
        codAmount: params.isCod ? params.codAmount : 0,
        isInsuranceAvail: false,
        toPay: false,
        isAppointment: false,
        boxDimensions: params.boxes.map((b) => ({
          boxCount: b.noOfBoxes,
          length: b.length,
          width: b.breadth,
          height: b.height,
          weight: b.weight,
        })),
      });
      const providers: Array<{
        serviceProviderId?: number;
        serviceProviderName?: string;
        serviceProviderMode?: string;
        totalCharges?: number;
        expectedDeliveryDate?: string;
      }> = Array.isArray(data?.providers) ? data.providers : [];
      const rates = providers
        .map((p) => {
          const name = String(p.serviceProviderName ?? 'Fship B2B');
          const mode = String(p.serviceProviderMode ?? 'surface').trim() || 'surface';
          const eta = p.expectedDeliveryDate ? new Date(p.expectedDeliveryDate).getTime() : NaN;
          const days = Number.isFinite(eta) ? Math.ceil((eta - Date.now()) / 86_400_000) : NaN;
          return {
            rateId: `fsb-${Number(p.serviceProviderId) || 0}-${mode}`,
            carrierName: /b2b/i.test(name) ? name : `${name} B2B`,
            // totalCharges = sum of rateComponents' amountWithTax (freight,
            // COD, risk, handling), i.e. the full amount Fship bills.
            amount: Math.round((Number(p.totalCharges) || 0) * 100) / 100,
            currency: 'INR',
            estimatedDays: days > 0 ? days : 3,
          };
        })
        // Courier id 0 can't be booked -- drop it here rather than failing at booking.
        .filter((r) => r.amount > 0 && !r.rateId.startsWith('fsb-0-'));
      return { rates, message: rates.length ? undefined : String(data?.message || 'Fship returned no B2B rates') };
    } catch (e) {
      const message = fshipErrorMessage(e);
      this.logger.warn(`Fship fetchB2BRates failed: ${message}`);
      return { rates: [], message };
    }
  }

  /** B2B CREATE FORWARD ORDER (B2B PDF §4.2). multipart/form-data. Live QC
   *  validation (2026-10-07) requires: Customer_Name, Customer_Mobile,
   *  Customer_Emailid, Customer_Address, Customer_PinCode, Customer_City,
   *  Customer_Address_Type, b2BProductName.ProductName -- the invoice and
   *  e-way bill files are optional as far as the API is concerned. */
  async createB2BForwardOrder(input: {
    customerName: string;
    customerMobile: string;
    customerEmail: string;
    address: string;
    pincode: string;
    city: string;
    externalOrderId: string;
    invoiceNumber: string;
    isCod: boolean;
    collectableAmount: number;
    invoiceAmount: number;
    courierId: number;
    expressType: string;
    pickAddressId: number;
    productName: string;
    boxes: FshipB2BBox[];
    ewayBillNumber?: string;
    invoiceFile?: FshipB2BDocument;
    ewayBillFile?: FshipB2BDocument;
  }): Promise<{ apiOrderId?: number; lrNumber?: string; waybills: string[]; message?: string }> {
    if (!this.isConfigured()) return { waybills: [], message: 'Fship not configured' };
    const form = new FormData();
    const fields: Record<string, string> = {
      Customer_Name: input.customerName,
      Customer_Mobile: input.customerMobile,
      Customer_Emailid: input.customerEmail,
      Customer_Address: input.address,
      LandMark: '',
      Customer_Address_Type: 'Home',
      Customer_PinCode: input.pincode,
      Customer_City: input.city,
      OrderId: input.externalOrderId,
      Invoice_Number: input.invoiceNumber,
      Payment_Mode: input.isCod ? '1' : '2', // 1=COD, 2=Prepaid (see fetchB2BRates)
      Express_Type: input.expressType,
      CollectableAmount: String(input.isCod ? input.collectableAmount : 0),
      InvoiceAmount: String(input.invoiceAmount),
      CourierId: String(input.courierId),
      Pick_Address_ID: String(input.pickAddressId),
      Return_Address_ID: String(input.pickAddressId),
      IsPayTo: 'false',
      IsSelfDrop: 'false',
      IsInsuranceAvail: 'false',
      'b2BProductName.ProductName': input.productName,
      'b2BProductName.TotalNoOfBoxes': String(input.boxes.reduce((sum, b) => sum + b.noOfBoxes, 0)),
      BoxDetails: JSON.stringify(input.boxes.map((b) => ({
        NumberOfBoxes: b.noOfBoxes,
        Weight: b.weight,
        Length: b.length,
        Width: b.breadth,
        Height: b.height,
      }))),
    };
    if (input.ewayBillNumber?.trim()) fields.EwayBillNumber = input.ewayBillNumber.trim();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (input.invoiceFile) {
      form.append('B2BInVoiceFile', new Blob([new Uint8Array(input.invoiceFile.content)], { type: 'application/pdf' }), input.invoiceFile.fileName);
    }
    if (input.ewayBillFile) {
      form.append('EwayBillFile', new Blob([new Uint8Array(input.ewayBillFile.content)], { type: 'application/pdf' }), input.ewayBillFile.fileName);
    }
    try {
      const { data } = await this.multipartClient().post('/b2bapi/createforwardorder', form);
      const waybills: string[] = Array.isArray(data?.mps_waybills)
        ? data.mps_waybills.map((w: unknown) => String(w).trim()).filter(Boolean)
        : [];
      if (data?.status === true && waybills.length > 0) {
        return {
          apiOrderId: Number(data.apiorderid) || undefined,
          lrNumber: data.lr_no ? String(data.lr_no) : undefined,
          waybills,
        };
      }
      return { waybills: [], message: String(data?.response ?? 'Fship did not return any waybills') };
    } catch (e) {
      const message = fshipErrorMessage(e);
      this.logger.warn(`Fship createB2BForwardOrder failed: ${message}`);
      return { waybills: [], message };
    }
  }

  /** B2B REGISTER PICKUP (B2B PDF §4.3). The returned pickupOrderId is the
   *  only key the label/manifest endpoint accepts. */
  async registerB2BPickup(waybills: string[]): Promise<{ pickupOrderId?: number; pickupDate?: string; message?: string }> {
    if (!this.isConfigured()) return { message: 'Fship not configured' };
    try {
      const { data } = await this.client().post('/b2bapi/registerpickup', { waybills });
      const first = Array.isArray(data?.apipickuporderids) ? data.apipickuporderids[0] : undefined;
      if (data?.status === true && first?.pickupOrderId) {
        const date = first.pickupDate ? String(first.pickupDate).slice(0, 10) : '';
        return {
          pickupOrderId: Number(first.pickupOrderId),
          pickupDate: [date, first.pickupTime ? String(first.pickupTime) : ''].filter(Boolean).join(' ') || undefined,
        };
      }
      return { message: String(data?.response ?? 'Fship did not confirm pickup registration') };
    } catch (e) {
      const message = fshipErrorMessage(e);
      this.logger.warn(`Fship registerB2BPickup failed: ${message}`);
      return { message };
    }
  }

  /** B2B SHIPPING LABEL BY PICKUP ID (B2B PDF §4.6). Fship answers
   *  status "Success" even for an invalid id (live QC check) -- the real
   *  signal is whether the per-pickup row carries any file URL. */
  async getB2BLabel(pickupOrderId: number): Promise<FshipB2BLabel> {
    if (!this.isConfigured()) return { message: 'Fship not configured' };
    try {
      const { data } = await this.client().post('/b2bapi/shippinglabelbypickupid', { pickupOrderId: [pickupOrderId] });
      const row = Array.isArray(data?.shipmentData) ? data.shipmentData[0] : undefined;
      const label: FshipB2BLabel = {
        labelUrl: row?.labelfile ? String(row.labelfile) : undefined,
        manifestUrl: row?.manifestfile ? String(row.manifestfile) : undefined,
        invoiceUrl: row?.invoicefile ? String(row.invoicefile) : undefined,
      };
      if (label.labelUrl || label.manifestUrl || label.invoiceUrl) return label;
      return { message: String(row?.remark ?? 'Fship returned no label') };
    } catch (e) {
      const message = fshipErrorMessage(e);
      this.logger.warn(`Fship getB2BLabel failed: ${message}`);
      return { message };
    }
  }

  /** B2B SHIPMENT CURRENT STATUS (B2B PDF §4.4). The PDF documents
   *  { waybills: [..] } but the live API rejects that with "Waybill is
   *  required." -- it actually takes { waybill: "<string>" } (QC, 2026-10-07). */
  async getB2BShipmentStatus(waybill: string): Promise<{ status?: string; remark?: string } | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data } = await this.client().post('/b2bapi/shipmentcurrentstatus', { waybill });
      if (data?.status === true && data?.summary) {
        return {
          status: data.summary.status ? String(data.summary.status) : undefined,
          remark: data.summary.remarks ? String(data.summary.remarks) : undefined,
        };
      }
      return null;
    } catch (e) {
      this.logger.warn(`Fship getB2BShipmentStatus failed: ${fshipErrorMessage(e)}`);
      return null;
    }
  }
}
