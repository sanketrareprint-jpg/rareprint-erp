import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BigshipService } from '../bigship/bigship.service';
import { FshipService } from '../fship/fship.service';
import { CarrierConfigService } from '../carrier-config/carrier-config.service';
import { applyCourierMarkup, type CourierPaymentMode } from './courier-markup';

export const COURIER_CALCULATOR_PLATFORMS = ['bigship', 'fship'] as const;
export type CourierCalculatorPlatform = (typeof COURIER_CALCULATOR_PLATFORMS)[number];

const PLATFORM_LABELS: Record<CourierCalculatorPlatform, string> = { bigship: 'Bigship', fship: 'Fship' };

// Admin's choice of which platforms show in the Courier Calculator dropdown.
// Its own SystemConfig key (not part of carrier_config) so it can't disturb
// carrier credentials or the Dispatch default carrier.
const CONFIG_KEY = 'courier_calculator_config';

// Declared parcel value sent with PREPAID quotes, where the calculator has no
// order value to declare. Same value Bigship's fetchCourierRates already
// falls back to when no invoice amount is given. COD quotes declare the COD
// amount instead.
const PREPAID_DECLARED_VALUE = 1000;

export type CourierPickupAddress = { id: string; name: string; pincode: string; location?: string };

export type CourierCalculatorLineInput = { productId: string; quantity: number; weightKg: number };

export type CourierCalculateInput = {
  platform: string;
  pickupId: string;
  deliveryPincode: string;
  paymentMode: string;
  codAmount?: number;
  items: CourierCalculatorLineInput[];
};

type CalculatorUser = { id: string; fullName?: string | null; email?: string | null; role?: string };

@Injectable()
export class CourierCalculatorService {
  private readonly logger = new Logger(CourierCalculatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bigship: BigshipService,
    private readonly fship: FshipService,
    private readonly carrierConfig: CarrierConfigService,
  ) {}

  // ── Platform visibility (admin-controlled) ─────────────────────────────────

  private async getEnabledPlatforms(): Promise<CourierCalculatorPlatform[]> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (!row?.value) return [...COURIER_CALCULATOR_PLATFORMS];
    try {
      const parsed = JSON.parse(row.value) as { enabledPlatforms?: unknown };
      if (!Array.isArray(parsed.enabledPlatforms)) return [...COURIER_CALCULATOR_PLATFORMS];
      return COURIER_CALCULATOR_PLATFORMS.filter((p) => (parsed.enabledPlatforms as unknown[]).includes(p));
    } catch {
      return [...COURIER_CALCULATOR_PLATFORMS];
    }
  }

  private isPlatformConfigured(platform: CourierCalculatorPlatform): boolean {
    return platform === 'bigship' ? this.bigship.isConfigured() : this.fship.isConfigured();
  }

  async getPlatforms() {
    const enabled = await this.getEnabledPlatforms();
    return COURIER_CALCULATOR_PLATFORMS.map((key) => ({
      key,
      label: PLATFORM_LABELS[key],
      enabled: enabled.includes(key),
      configured: this.isPlatformConfigured(key),
    }));
  }

  async updateEnabledPlatforms(enabledPlatforms: unknown) {
    if (!Array.isArray(enabledPlatforms)) throw new BadRequestException('enabledPlatforms must be a list');
    const enabled = COURIER_CALCULATOR_PLATFORMS.filter((p) => enabledPlatforms.includes(p));
    const value = JSON.stringify({ enabledPlatforms: enabled });
    await this.prisma.systemConfig.upsert({
      where: { key: CONFIG_KEY },
      update: { value },
      create: { key: CONFIG_KEY, value },
    });
    return this.getPlatforms();
  }

  // ── Pickup addresses already saved in the ERP / platform ──────────────────

  async getPickupAddresses(platform: string): Promise<CourierPickupAddress[]> {
    if (platform === 'bigship') {
      if (!this.bigship.isConfigured()) return [];
      const warehouses = await this.bigship.getCachedWarehouses();
      return warehouses
        .filter((w) => w.isActive !== false && /^\d{6}$/.test(String(w.pincode ?? '').trim()))
        .map((w) => ({
          id: String(w.bigshipWarehouseId),
          name: w.name,
          pincode: String(w.pincode).trim(),
          location: [w.city, w.state].filter(Boolean).join(', '),
        }));
    }
    if (platform === 'fship') {
      if (!this.fship.isConfigured()) return [];
      const cfg = this.carrierConfig.getConfig().fship;
      const saved = (cfg.pickupAddresses ?? []).map((a) => ({ id: String(a.id), name: a.name, pincode: String(a.pincode).trim() }));
      if (saved.length > 0) return saved;
      // No per-address list saved yet -- offer the single configured Fship
      // pickup pincode (Settings > Carrier Config) so the platform is usable.
      return cfg.pickupPincode ? [{ id: 'default', name: 'Default pickup', pincode: cfg.pickupPincode }] : [];
    }
    throw new BadRequestException('Unknown platform');
  }

  // ── Calculate ─────────────────────────────────────────────────────────────

  async calculate(input: CourierCalculateInput, user: CalculatorUser) {
    const platform = input.platform as CourierCalculatorPlatform;
    if (!COURIER_CALCULATOR_PLATFORMS.includes(platform)) throw new BadRequestException('Select a platform');
    if (!(await this.getEnabledPlatforms()).includes(platform)) {
      throw new BadRequestException(`${PLATFORM_LABELS[platform]} is not enabled for the Courier Calculator`);
    }
    if (!this.isPlatformConfigured(platform)) {
      throw new BadRequestException(`${PLATFORM_LABELS[platform]} API credentials are not configured`);
    }

    const deliveryPincode = String(input.deliveryPincode ?? '').trim();
    if (!/^\d{6}$/.test(deliveryPincode)) throw new BadRequestException('Delivery pincode must be 6 digits');

    const paymentMode = input.paymentMode as CourierPaymentMode;
    if (paymentMode !== 'PREPAID' && paymentMode !== 'COD') throw new BadRequestException('Select Prepaid or COD');
    const codAmount = paymentMode === 'COD' ? Number(input.codAmount) : null;
    if (codAmount !== null && !(Number.isFinite(codAmount) && codAmount > 0)) {
      throw new BadRequestException('Enter the COD amount');
    }

    // Pickup is resolved from its id only -- never from a client-sent pincode.
    const pickup = (await this.getPickupAddresses(platform)).find((p) => p.id === String(input.pickupId ?? ''));
    if (!pickup) throw new BadRequestException('Select a pickup address');

    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('Add at least one product');
    const productIds = input.items.map((i) => String(i?.productId ?? ''));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name: true, weightPerUnitGrams: true },
    });
    const items = input.items.map((line, idx) => {
      const product = products.find((p) => p.id === String(line?.productId ?? ''));
      if (!product) throw new BadRequestException(`Line ${idx + 1}: select a product`);
      const quantity = Number(line.quantity);
      if (!(Number.isInteger(quantity) && quantity > 0)) throw new BadRequestException(`Line ${idx + 1}: quantity must be a whole number above 0`);
      const weightKg = Number(line.weightKg);
      if (!(Number.isFinite(weightKg) && weightKg > 0)) throw new BadRequestException(`Line ${idx + 1} (${product.name}): enter the weight`);
      const unitGrams = product.weightPerUnitGrams != null ? Number(product.weightPerUnitGrams) : null;
      const productWeightKg = unitGrams && unitGrams > 0 ? Math.round(quantity * unitGrams) / 1000 : null;
      return {
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        quantity,
        weightKg: Math.round(weightKg * 1000) / 1000,
        productWeightKg,
        weightEdited: productWeightKg === null || Math.abs(productWeightKg - weightKg) > 0.0005,
      };
    });
    const totalWeightKg = Math.round(items.reduce((sum, i) => sum + i.weightKg, 0) * 1000) / 1000;
    const declaredValue = codAmount ?? PREPAID_DECLARED_VALUE;

    let platformRates: Array<{ carrierName: string; amount: number; estimatedDays: number | null }>;
    if (platform === 'bigship') {
      try {
        const rows = await this.bigship.fetchCourierRates({
          pickupPostcode: pickup.pincode,
          deliveryPostcode: deliveryPincode,
          weightKg: totalWeightKg,
          isCod: paymentMode === 'COD',
          codAmount: codAmount ?? undefined,
          invoiceAmount: declaredValue,
          pickupWarehouseId: Number(pickup.id),
        });
        platformRates = rows.map((r) => ({ carrierName: r.carrierName, amount: r.amount, estimatedDays: r.estimatedDays || null }));
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Bigship rates fetch failed');
      }
    } else {
      const rows = await this.fship.fetchRates({
        pickupPincode: pickup.pincode,
        deliveryPincode,
        weightKg: totalWeightKg,
        isCod: paymentMode === 'COD',
        amount: declaredValue,
      });
      // Fship's rate calculator has no ETA field (fetchRates fills a
      // placeholder 3), so no delivery estimate is shown for Fship.
      platformRates = rows.map((r) => ({ carrierName: r.carrierName, amount: r.amount, estimatedDays: null }));
    }

    const rates = platformRates
      .filter((r) => Number.isFinite(r.amount) && r.amount > 0)
      .map((r) => ({ carrierName: r.carrierName, estimatedDays: r.estimatedDays, cost: r.amount, ...applyCourierMarkup(r.amount, paymentMode) }))
      .sort((a, b) => a.chargeAmount - b.chargeAmount);
    if (rates.length === 0) {
      throw new BadRequestException(`${PLATFORM_LABELS[platform]} returned no courier rates for ${pickup.pincode} → ${deliveryPincode} at ${totalWeightKg} kg`);
    }

    const saved = await this.prisma.courierRateQuote.create({
      data: {
        platform,
        pickupId: pickup.id,
        pickupName: pickup.name,
        pickupPincode: pickup.pincode,
        deliveryPincode,
        paymentMode,
        codAmount: codAmount !== null ? new Prisma.Decimal(codAmount.toFixed(2)) : null,
        totalWeightKg: new Prisma.Decimal(totalWeightKg.toFixed(3)),
        items: items as unknown as Prisma.InputJsonValue,
        rates: rates as unknown as Prisma.InputJsonValue,
        createdById: user.id,
        createdByName: user.fullName || user.email || null,
      },
    });
    this.logger.log(`Courier quote ${saved.id}: ${platform} ${pickup.pincode}→${deliveryPincode} ${totalWeightKg}kg ${paymentMode}, ${rates.length} rate(s)`);
    return this.toResponse(saved);
  }

  // ── History ───────────────────────────────────────────────────────────────

  async listHistory(user: CalculatorUser, limit = 100) {
    const rows = await this.prisma.courierRateQuote.findMany({
      where: user.role === 'ADMIN' ? {} : { createdById: user.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 200),
    });
    return rows.map((r) => this.toResponse(r));
  }

  private toResponse(row: Prisma.CourierRateQuoteGetPayload<object>) {
    return {
      ...row,
      platformLabel: PLATFORM_LABELS[row.platform as CourierCalculatorPlatform] ?? row.platform,
      codAmount: row.codAmount != null ? Number(row.codAmount) : null,
      totalWeightKg: Number(row.totalWeightKg),
    };
  }
}
