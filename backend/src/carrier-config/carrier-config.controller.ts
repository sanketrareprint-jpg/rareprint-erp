import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import axios from 'axios';
import { CarrierConfigService, type CarrierConfig } from './carrier-config.service';
import { BigshipService } from '../bigship/bigship.service';

@Controller('carrier-config')
@UseGuards(AuthGuard('jwt'))
export class CarrierConfigController {
  constructor(
    private readonly carrierConfig: CarrierConfigService,
    private readonly bigship: BigshipService,
  ) {}

  @Get()
  getConfig() {
    const cfg = this.carrierConfig.getConfig();
    // Mask passwords in response
    return {
      activeCarrier: cfg.activeCarrier,
      bigship: {
        username:          cfg.bigship.username,
        password:          cfg.bigship.password ? '••••••••' : '',
        accessKey:         cfg.bigship.accessKey ? '••••••••' : '',
        pickupWarehouseId: cfg.bigship.pickupWarehouseId,
        returnWarehouseId: cfg.bigship.returnWarehouseId,
        isConfigured:      !!(cfg.bigship.username && cfg.bigship.password && cfg.bigship.accessKey),
        tokenExpiresAt:    this.bigship.getTokenExpiry(),
      },
      shiprocket: {
        email:           cfg.shiprocket.email,
        password:        cfg.shiprocket.password ? '••••••••' : '',
        pickupLocation:  cfg.shiprocket.pickupLocation,
        pickupPincode:   cfg.shiprocket.pickupPincode,
        isConfigured:    !!(cfg.shiprocket.email && cfg.shiprocket.password),
      },
      fship: {
        clientKey:        cfg.fship.clientKey ? '••••••••' : '',
        pickupPincode:    cfg.fship.pickupPincode,
        pickupAddressId:  cfg.fship.pickupAddressId,
        isConfigured:     !!cfg.fship.clientKey,
      },
    };
  }

  /** GET /carrier-config/bigship-warehouses — live list of warehouses from Bigship Direct */
  @Get('bigship-warehouses')
  async getBigshipWarehouses() {
    const warehouses = await this.bigship.getWarehouseList();
    return { warehouses };
  }

  /** POST /carrier-config/test-bigship — validates credentials live against Bigship Direct API */
  @Post('test-bigship')
  async testBigship() {
    return this.bigship.testConnection();
  }

  /**
   * GET /carrier-config/debug-rates?delivery=440032
   * Calls Bigship step-by-step and returns raw API responses so we can see exactly what fails.
   * Remove this endpoint after debugging is done.
   * Note: No auth guard so it can be called directly in browser.
   */
  @Get('debug-rates')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // @UseGuards(AuthGuard('jwt')) — temporarily removed for debugging
  async debugRates(@Query('delivery') delivery = '110001') {
    const cfg = this.carrierConfig.getConfig().bigship;
    const warehouseId = cfg.pickupWarehouseId;
    if (!warehouseId) return { error: 'No pickupWarehouseId configured' };

    let token: string;
    try {
      token = await this.bigship.getAuthToken();
    } catch (e: unknown) {
      return { step: 'login', error: String(e) };
    }

    // Step 1: create draft order
    let createResp: unknown;
    let orderId: string | null = null;
    try {
      const { data } = await axios.post(
        'https://api.bigship.direct/api/outbound/create-order',
        {
          segment_type: 'domestic_b2c',
          MasterOrderPickUpLocation: warehouseId,
          MasterOrderReturnLocation: warehouseId,
          MasterOrderDate: new Date().toISOString().slice(0, 10),
          MasterOrderPaymentMode: 1,
          OrderInvoiceNo: `DBG-${Date.now()}`,
          MasterOrderInvoiceAmount: 1000,
          MasterOrderShippingName: 'Debug Rate Check',
          MasterOrderShippingMobileNo: '9999999999',
          MasterOrderShippingAddress: 'Debug Rate Check Address',
          MasterOrderShippingZipCode: delivery,
          MasterOrderShippingCity: 'DELHI',
          MasterOrderShippingState: 'DELHI',
          MasterOrderShippingCountry: 'India',
          totalNumOfBoxes: 1,
          boxes: [{
            weight_unit: 'kg', dimension_unit: 'cm', noOfBoxes: 1,
            dimensions: [{ length: 20, breadth: 15, height: 10, weight: 1 }],
            products: [{ productName: 'Test Product', qty: '1', amount: '1000', totalAmount: 1000, collectableAmount: 0, categoryId: '1' }],
          }],
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      createResp = data;
      orderId = data?.data?.CustomGlobalOrderId ?? null;
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown } };
      return { step: 'create-order', error: err.response?.data ?? String(e) };
    }

    if (!orderId) return { step: 'create-order', response: createResp, error: 'No CustomGlobalOrderId returned' };

    // Step 2: fetch rates
    try {
      const { data } = await axios.post(
        'https://api.bigship.direct/api/outbound/courier-wise-shipment-cost',
        { MasterCustomOrderId: orderId },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      return { step: 'success', orderId, createResp, ratesResp: data };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown } };
      return { step: 'rates', orderId, createResp, error: err.response?.data ?? String(e) };
    }
  }

  @Put()
  async updateConfig(@Body() body: Partial<CarrierConfig>) {
    const updated = await this.carrierConfig.updateConfig(body);
    // If BigShip credentials changed, clear the cached token
    if (body.bigship) {
      this.bigship.clearToken();
    }
    return { success: true, activeCarrier: updated.activeCarrier };
  }
}
