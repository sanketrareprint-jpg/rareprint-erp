import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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

  @Put()
  updateConfig(@Body() body: Partial<CarrierConfig>) {
    const updated = this.carrierConfig.updateConfig(body);
    // If BigShip credentials changed, clear the cached token
    if (body.bigship) {
      this.bigship.clearToken();
    }
    return { success: true, activeCarrier: updated.activeCarrier };
  }
}
