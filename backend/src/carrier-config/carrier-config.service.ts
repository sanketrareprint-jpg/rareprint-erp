import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 'fship' added 2026-08-20. Unlike bigship/shiprocket, this "active carrier"
// no longer means "the only carrier every shipment uses" -- Sanket wants
// per-shipment carrier choice (a dropdown in Book Shipment), so this field
// now just decides the *default* pre-selected option in that dropdown. See
// docs/Fship_Integration_Build_Prompt.md.
export type ActiveCarrier = 'shiprocket' | 'bigship' | 'fship';

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

export type FshipCfg = {
  // Called "signature" in Fship's API docs, sent as the `signature` request
  // header on every call. Obtained from Fship Dashboard > Settings > API
  // Details > Client Key (production) — Fship also has a separate Staging
  // security key, but this codebase defaults to production (see
  // fship.service.ts's FSHIP_ENV handling).
  clientKey: string;
  // Plain pincode used only for rate-quote calls (Fship's Rate Calculator
  // takes source_Pincode as a bare string, no address-id needed for a
  // quote).
  pickupPincode: string;
  // Fship's numeric pickup Address Id, required by Create Forward Order
  // (pick_Address_ID). Fship's API has no "list warehouses" endpoint (only
  // Add/Update), so this can't be looked up dynamically like Bigship's
  // warehouse cache -- it has to be created once in Fship's own dashboard
  // (Manage Warehouse) and the resulting id pasted in here.
  pickupAddressId: number | null;
};

export type CarrierConfig = {
  activeCarrier: ActiveCarrier;
  bigship: BigshipCfg;
  shiprocket: ShiprocketCfg;
  fship: FshipCfg;
};

const DB_KEY = 'carrier_config';

@Injectable()
export class CarrierConfigService implements OnModuleInit {
  private readonly logger = new Logger(CarrierConfigService.name);
  private config: CarrierConfig = this.buildDefault();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Priority order:
    // 1. Environment variables (set in Railway/Vercel dashboard) — always win
    // 2. Database (saved via Settings UI)
    // 3. Built-in defaults
    await this.loadFromDb();      // load DB first as base
    this.overlayEnvVars();        // env vars override anything from DB
    this.applyToEnv(this.config); // sync everything to process.env
    this.logger.log(`Carrier config ready — active: ${this.config.activeCarrier}`);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getConfig(): CarrierConfig { return this.config; }
  getActiveCarrier(): ActiveCarrier { return this.config.activeCarrier; }

  // ── Write ─────────────────────────────────────────────────────────────────

  async updateConfig(patch: Partial<CarrierConfig>): Promise<CarrierConfig> {
    this.config = {
      ...this.config,
      ...patch,
      bigship:    { ...this.config.bigship,    ...(patch.bigship    ?? {}) },
      shiprocket: { ...this.config.shiprocket, ...(patch.shiprocket ?? {}) },
      fship:      { ...this.config.fship,      ...(patch.fship      ?? {}) },
    };
    await this.saveToDb();
    this.applyToEnv(this.config);
    return this.config;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildDefault(): CarrierConfig {
    return {
      activeCarrier: 'shiprocket',
      bigship:    { username: '', password: '', accessKey: '', pickupWarehouseId: null, returnWarehouseId: null },
      shiprocket: { email: '', password: '', pickupLocation: 'Office', pickupPincode: '110001' },
      fship:      { clientKey: '', pickupPincode: '440032', pickupAddressId: null },
    };
  }

  private async loadFromDb(): Promise<void> {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: DB_KEY } });
      if (row?.value) {
        const parsed = JSON.parse(row.value) as Partial<CarrierConfig>;
        this.config = {
          ...this.config,
          ...parsed,
          bigship:    { ...this.config.bigship,    ...(parsed.bigship    ?? {}) },
          shiprocket: { ...this.config.shiprocket, ...(parsed.shiprocket ?? {}) },
          fship:      { ...this.config.fship,      ...(parsed.fship      ?? {}) },
        };
        this.logger.log('Carrier config loaded from database');
      }
    } catch (e) {
      this.logger.warn(`DB load failed, using defaults: ${e}`);
    }
  }

  /**
   * Environment variables ALWAYS override the database.
   * Set these in Railway / Vercel dashboard and they'll never be lost.
   *
   * ACTIVE_CARRIER=bigship
   * BIGSHIP_USERNAME=your@email.com
   * BIGSHIP_PASSWORD=yourpassword
   * BIGSHIP_ACCESS_KEY=youraccesskey
   * BIGSHIP_PICKUP_WAREHOUSE_ID=111809
   * BIGSHIP_RETURN_WAREHOUSE_ID=111809
   * SHIPROCKET_EMAIL=...
   * SHIPROCKET_PASSWORD=...
   * SHIPROCKET_PICKUP_LOCATION=Office
   * SHIPROCKET_PICKUP_PINCODE=442402
   * FSHIP_CLIENT_KEY=...
   * FSHIP_PICKUP_PINCODE=440032
   * FSHIP_PICKUP_ADDRESS_ID=12345
   * FSHIP_ENV=staging   (optional -- omit for production, Fship's default)
   */
  private overlayEnvVars(): void {
    const e = process.env;

    if (e.ACTIVE_CARRIER) {
      this.config.activeCarrier = e.ACTIVE_CARRIER as ActiveCarrier;
    } else if (e.BIGSHIP_USERNAME && e.BIGSHIP_PASSWORD && e.BIGSHIP_ACCESS_KEY) {
      // Auto-detect: if Bigship credentials are present in env, use bigship
      // (avoids needing a separate ACTIVE_CARRIER var in Railway)
      this.config.activeCarrier = 'bigship';
    }

    if (e.BIGSHIP_USERNAME)             this.config.bigship.username         = e.BIGSHIP_USERNAME;
    if (e.BIGSHIP_PASSWORD)             this.config.bigship.password         = e.BIGSHIP_PASSWORD;
    if (e.BIGSHIP_ACCESS_KEY)           this.config.bigship.accessKey        = e.BIGSHIP_ACCESS_KEY;
    if (e.BIGSHIP_PICKUP_WAREHOUSE_ID)  this.config.bigship.pickupWarehouseId = parseInt(e.BIGSHIP_PICKUP_WAREHOUSE_ID, 10);
    if (e.BIGSHIP_RETURN_WAREHOUSE_ID)  this.config.bigship.returnWarehouseId = parseInt(e.BIGSHIP_RETURN_WAREHOUSE_ID, 10);

    if (e.SHIPROCKET_EMAIL)             this.config.shiprocket.email          = e.SHIPROCKET_EMAIL;
    if (e.SHIPROCKET_PASSWORD)          this.config.shiprocket.password       = e.SHIPROCKET_PASSWORD;
    if (e.SHIPROCKET_PICKUP_LOCATION)   this.config.shiprocket.pickupLocation = e.SHIPROCKET_PICKUP_LOCATION;
    if (e.SHIPROCKET_PICKUP_PINCODE)    this.config.shiprocket.pickupPincode  = e.SHIPROCKET_PICKUP_PINCODE;

    if (e.FSHIP_CLIENT_KEY)             this.config.fship.clientKey       = e.FSHIP_CLIENT_KEY;
    if (e.FSHIP_PICKUP_PINCODE)         this.config.fship.pickupPincode   = e.FSHIP_PICKUP_PINCODE;
    if (e.FSHIP_PICKUP_ADDRESS_ID)      this.config.fship.pickupAddressId = parseInt(e.FSHIP_PICKUP_ADDRESS_ID, 10);
  }

  private async saveToDb(): Promise<void> {
    try {
      await this.prisma.systemConfig.upsert({
        where:  { key: DB_KEY },
        update: { value: JSON.stringify(this.config) },
        create: { key: DB_KEY, value: JSON.stringify(this.config) },
      });
    } catch (e) {
      this.logger.error(`DB save failed: ${e}`);
    }
  }

  private applyToEnv(cfg: CarrierConfig): void {
    process.env.ACTIVE_CARRIER              = cfg.activeCarrier;
    process.env.BIGSHIP_USERNAME            = cfg.bigship.username;
    process.env.BIGSHIP_PASSWORD            = cfg.bigship.password;
    process.env.BIGSHIP_ACCESS_KEY          = cfg.bigship.accessKey;
    if (cfg.bigship.pickupWarehouseId != null)
      process.env.BIGSHIP_PICKUP_WAREHOUSE_ID = String(cfg.bigship.pickupWarehouseId);
    if (cfg.bigship.returnWarehouseId != null)
      process.env.BIGSHIP_RETURN_WAREHOUSE_ID = String(cfg.bigship.returnWarehouseId);
    process.env.SHIPROCKET_EMAIL            = cfg.shiprocket.email;
    process.env.SHIPROCKET_PASSWORD         = cfg.shiprocket.password;
    process.env.SHIPROCKET_PICKUP_LOCATION  = cfg.shiprocket.pickupLocation;
    process.env.SHIPROCKET_PICKUP_PINCODE   = cfg.shiprocket.pickupPincode;
    process.env.FSHIP_CLIENT_KEY            = cfg.fship.clientKey;
    process.env.FSHIP_PICKUP_PINCODE        = cfg.fship.pickupPincode;
    if (cfg.fship.pickupAddressId != null)
      process.env.FSHIP_PICKUP_ADDRESS_ID   = String(cfg.fship.pickupAddressId);
  }
}
