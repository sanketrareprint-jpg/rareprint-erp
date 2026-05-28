import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type ActiveCarrier = 'shiprocket' | 'bigship';

export type BigshipCfg = {
  username: string;
  password: string;
  accessKey: string;
  pickupWarehouseId: number | null;
  returnWarehouseId: number | null;
};

export type ShiprocketCfg = {
  email: string;
  password: string;
  pickupLocation: string;
  pickupPincode: string;
};

export type CarrierConfig = {
  activeCarrier: ActiveCarrier;
  bigship: BigshipCfg;
  shiprocket: ShiprocketCfg;
};

const CONFIG_FILE = path.join(process.cwd(), 'carrier-config.json');

@Injectable()
export class CarrierConfigService {
  private readonly logger = new Logger(CarrierConfigService.name);
  private config: CarrierConfig;

  constructor() {
    this.config = this.loadConfig();
    // Sync env vars so existing services (Shiprocket) keep working
    this.applyToEnv(this.config);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getConfig(): CarrierConfig {
    return this.config;
  }

  getActiveCarrier(): ActiveCarrier {
    return this.config.activeCarrier;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  updateConfig(patch: Partial<CarrierConfig>): CarrierConfig {
    this.config = {
      ...this.config,
      ...patch,
      bigship:    { ...this.config.bigship,    ...(patch.bigship    ?? {}) },
      shiprocket: { ...this.config.shiprocket, ...(patch.shiprocket ?? {}) },
    };
    this.saveConfig();
    this.applyToEnv(this.config);
    return this.config;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private loadConfig(): CarrierConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as CarrierConfig;
        this.logger.log('Loaded carrier config from carrier-config.json');
        return parsed;
      }
    } catch (e) {
      this.logger.warn(`Could not load carrier-config.json, falling back to env vars: ${e}`);
    }

    // Bootstrap from .env
    return {
      activeCarrier: (process.env.ACTIVE_CARRIER as ActiveCarrier) ?? 'shiprocket',
      bigship: {
        username:          process.env.BIGSHIP_USERNAME          ?? '',
        password:          process.env.BIGSHIP_PASSWORD          ?? '',
        accessKey:         process.env.BIGSHIP_ACCESS_KEY        ?? '',
        pickupWarehouseId: process.env.BIGSHIP_PICKUP_WAREHOUSE_ID
          ? parseInt(process.env.BIGSHIP_PICKUP_WAREHOUSE_ID, 10) : null,
        returnWarehouseId: process.env.BIGSHIP_RETURN_WAREHOUSE_ID
          ? parseInt(process.env.BIGSHIP_RETURN_WAREHOUSE_ID, 10) : null,
      },
      shiprocket: {
        email:           process.env.SHIPROCKET_EMAIL            ?? '',
        password:        process.env.SHIPROCKET_PASSWORD         ?? '',
        pickupLocation:  process.env.SHIPROCKET_PICKUP_LOCATION  ?? 'Office',
        pickupPincode:   process.env.SHIPROCKET_PICKUP_PINCODE   ?? '110001',
      },
    };
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      this.logger.error(`Could not save carrier-config.json: ${e}`);
    }
  }

  /** Keep process.env in sync so ShiprocketService and BigshipService can read from it */
  private applyToEnv(cfg: CarrierConfig): void {
    process.env.ACTIVE_CARRIER              = cfg.activeCarrier;

    // BigShip
    process.env.BIGSHIP_USERNAME            = cfg.bigship.username;
    process.env.BIGSHIP_PASSWORD            = cfg.bigship.password;
    process.env.BIGSHIP_ACCESS_KEY          = cfg.bigship.accessKey;
    if (cfg.bigship.pickupWarehouseId != null)
      process.env.BIGSHIP_PICKUP_WAREHOUSE_ID = String(cfg.bigship.pickupWarehouseId);
    if (cfg.bigship.returnWarehouseId != null)
      process.env.BIGSHIP_RETURN_WAREHOUSE_ID = String(cfg.bigship.returnWarehouseId);

    // Shiprocket
    process.env.SHIPROCKET_EMAIL            = cfg.shiprocket.email;
    process.env.SHIPROCKET_PASSWORD         = cfg.shiprocket.password;
    process.env.SHIPROCKET_PICKUP_LOCATION  = cfg.shiprocket.pickupLocation;
    process.env.SHIPROCKET_PICKUP_PINCODE   = cfg.shiprocket.pickupPincode;
  }
}
