import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

const DB_KEY = 'carrier_config';

@Injectable()
export class CarrierConfigService implements OnModuleInit {
  private readonly logger = new Logger(CarrierConfigService.name);
  private config: CarrierConfig = this.envBootstrap();

  constructor(private readonly prisma: PrismaService) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit() {
    // Load from DB on startup; if nothing there yet, env bootstrap is already set
    await this.loadFromDb();
    this.applyToEnv(this.config);
    this.logger.log(`Carrier config loaded — active: ${this.config.activeCarrier}`);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getConfig(): CarrierConfig {
    return this.config;
  }

  getActiveCarrier(): ActiveCarrier {
    return this.config.activeCarrier;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async updateConfig(patch: Partial<CarrierConfig>): Promise<CarrierConfig> {
    this.config = {
      ...this.config,
      ...patch,
      bigship:    { ...this.config.bigship,    ...(patch.bigship    ?? {}) },
      shiprocket: { ...this.config.shiprocket, ...(patch.shiprocket ?? {}) },
    };
    await this.saveToDb();
    this.applyToEnv(this.config);
    return this.config;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Load from SystemConfig table; leaves in-memory config untouched if nothing found */
  private async loadFromDb(): Promise<void> {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: DB_KEY } });
      if (row?.value) {
        const parsed = JSON.parse(row.value) as CarrierConfig;
        // Deep merge so new fields added in code don't get lost
        this.config = {
          ...this.config,
          ...parsed,
          bigship:    { ...this.config.bigship,    ...(parsed.bigship    ?? {}) },
          shiprocket: { ...this.config.shiprocket, ...(parsed.shiprocket ?? {}) },
        };
        this.logger.log('Carrier config loaded from database (SystemConfig)');
      } else {
        this.logger.log('No carrier config in database — using env var bootstrap');
      }
    } catch (e) {
      this.logger.warn(`Failed to load carrier config from database: ${e}`);
    }
  }

  /** Persist current in-memory config to SystemConfig table */
  private async saveToDb(): Promise<void> {
    try {
      await this.prisma.systemConfig.upsert({
        where:  { key: DB_KEY },
        update: { value: JSON.stringify(this.config) },
        create: { key: DB_KEY, value: JSON.stringify(this.config) },
      });
      this.logger.log('Carrier config saved to database');
    } catch (e) {
      this.logger.error(`Failed to save carrier config to database: ${e}`);
    }
  }

  /** Bootstrap from environment variables (used before DB is available) */
  private envBootstrap(): CarrierConfig {
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
        email:           process.env.SHIPROCKET_EMAIL           ?? '',
        password:        process.env.SHIPROCKET_PASSWORD        ?? '',
        pickupLocation:  process.env.SHIPROCKET_PICKUP_LOCATION ?? 'Office',
        pickupPincode:   process.env.SHIPROCKET_PICKUP_PINCODE  ?? '110001',
      },
    };
  }

  /** Keep process.env in sync so BigshipService / ShiprocketService can read from it */
  private applyToEnv(cfg: CarrierConfig): void {
    process.env.ACTIVE_CARRIER             = cfg.activeCarrier;

    process.env.BIGSHIP_USERNAME           = cfg.bigship.username;
    process.env.BIGSHIP_PASSWORD           = cfg.bigship.password;
    process.env.BIGSHIP_ACCESS_KEY         = cfg.bigship.accessKey;
    if (cfg.bigship.pickupWarehouseId != null)
      process.env.BIGSHIP_PICKUP_WAREHOUSE_ID = String(cfg.bigship.pickupWarehouseId);
    if (cfg.bigship.returnWarehouseId != null)
      process.env.BIGSHIP_RETURN_WAREHOUSE_ID = String(cfg.bigship.returnWarehouseId);

    process.env.SHIPROCKET_EMAIL           = cfg.shiprocket.email;
    process.env.SHIPROCKET_PASSWORD        = cfg.shiprocket.password;
    process.env.SHIPROCKET_PICKUP_LOCATION = cfg.shiprocket.pickupLocation;
    process.env.SHIPROCKET_PICKUP_PINCODE  = cfg.shiprocket.pickupPincode;
  }
}
