import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { setBrandSettingsName } from '../common/brand';

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export type CustomFieldConfig = {
  id: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  options?: string[];
};

export type ProductionStageConfig = {
  id: string;
  label: string;
  substages: string[];
};

export type ModuleConfig = {
  key: string;
  label: string;
  href: string;
  fixed?: boolean;
  enabled: boolean;
};

export type VirtualCeoTagConfig = {
  id: string;
  label: string;
  color: string;
};

export type ErpConfig = {
  orderFields: CustomFieldConfig[];
  itemFields: CustomFieldConfig[];
  productionStages: ProductionStageConfig[];
  productionFlow: Array<{ from: string; to: string }>;
  modules: ModuleConfig[];
  roleAccess: Record<string, string[]>;
  virtualCeoTags: VirtualCeoTagConfig[];
  virtualCeoCardTags: Record<string, string>;
};

const DB_KEY = 'erp_saas_config';

// Sidebar categories. Kept under their own key, not inside erp_saas_config:
// PUT /erp-config has no admin check and Settings / Virtual CEO save that
// whole blob, while categories are admin-only (PUT /erp-config/nav-groups).
// No row = the frontend's built-in defaults (frontend/lib/navGroups.ts).
const NAV_GROUPS_KEY = 'sidebar_nav_groups';
const MAX_NAV_GROUPS = 30;
const MAX_NAV_LABEL = 40;
const MAX_NAV_HREFS = 200;

export type NavGroupConfig = { id: string; label: string; hrefs: string[] };

// App branding set by an admin in Settings — the name and logo shown in the
// app shell and on the login pages. No row = the deployment's own default
// (NEXT_PUBLIC_BRAND_NAME on the frontend, set per customer at approve time,
// else "RarePrint"). Two rows so saving the name never rewrites the logo.
const BRANDING_NAME_KEY = 'app_branding_name';
const BRANDING_LOGO_KEY = 'app_branding_logo';
export const MAX_BRAND_NAME = 60;
export const MAX_BRAND_LOGO_BYTES = 300 * 1024;
// Raster only: an SVG data URL is safe inside <img>, but the logo is also
// served to the public login page, so keep it to formats that cannot carry
// markup at all.
const BRAND_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export type AppBranding = { appName: string | null; logoUrl: string | null };

/** Validates admin-submitted sidebar categories. Each link may sit in one category only. */
export function normalizeNavGroups(input: unknown): NavGroupConfig[] {
  if (!Array.isArray(input)) throw new BadRequestException('groups must be an array');
  if (input.length > MAX_NAV_GROUPS) throw new BadRequestException(`At most ${MAX_NAV_GROUPS} categories`);
  const ids = new Set<string>();
  const placed = new Map<string, string>();
  return input.map((raw: any) => {
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new BadRequestException(`Invalid category id "${id}"`);
    if (ids.has(id)) throw new BadRequestException(`Duplicate category id "${id}"`);
    ids.add(id);
    if (!label || label.length > MAX_NAV_LABEL) {
      throw new BadRequestException(`Category name must be 1-${MAX_NAV_LABEL} characters`);
    }
    if (!Array.isArray(raw?.hrefs)) throw new BadRequestException(`Category "${label}" has no link list`);
    const hrefs = raw.hrefs.map((href: unknown) => {
      if (typeof href !== 'string' || !/^\/[a-z0-9\-/]{0,99}$/i.test(href) || href.startsWith('//')) {
        throw new BadRequestException(`Invalid link "${String(href)}" in "${label}"`);
      }
      const other = placed.get(href);
      if (other) throw new BadRequestException(`${href} is in both "${other}" and "${label}"`);
      placed.set(href, label);
      return href;
    });
    if (placed.size > MAX_NAV_HREFS) throw new BadRequestException('Too many links');
    return { id, label, hrefs };
  });
}

export const DEFAULT_MODULES: ModuleConfig[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', enabled: true },
  { key: 'orders', label: 'Orders', href: '/orders', fixed: true, enabled: true },
  { key: 'accounts', label: 'Accounts', href: '/accounts', fixed: true, enabled: true },
  { key: 'production', label: 'Production', href: '/production', fixed: true, enabled: true },
  { key: 'dispatch', label: 'Dispatch', href: '/dispatch', fixed: true, enabled: true },
  { key: 'reports', label: 'Reports', href: '/reports', enabled: true },
  { key: 'crm', label: 'CRM', href: '/crm', enabled: true },
  // Auto dialer — the page itself only works inside the Android app.
  { key: 'dialer', label: 'Dialer', href: '/dialer', enabled: true },
  { key: 'tasks', label: 'Tasks', href: '/tasks', enabled: true },
  { key: 'storefront', label: 'Storefront', href: '/storefront', enabled: true },
  { key: 'marketing', label: 'Marketing', href: '/marketing', enabled: true },
  { key: 'customers', label: 'Customers', href: '/customer-directory', enabled: true },
  { key: 'design', label: 'Design', href: '/design-studio', enabled: true },
  { key: 'paper-stock', label: 'Paper Stock', href: '/paper-inventory', enabled: true },
  { key: 'sticker', label: 'Sticker', href: '/sticker-sheet', enabled: true },
  { key: 'sheet-layout', label: 'Sheet Layout', href: '/sheet-layout', enabled: true },
  { key: 'database', label: 'Database', href: '/admin/database', enabled: true },
  { key: 'sales-learning', label: 'Sales Academy', href: '/sales-learning', enabled: true },
  { key: 'manage-academy', label: 'Manage Academy', href: '/admin/sales-learning', enabled: true },
  { key: 'rate-calculator', label: 'Rate Calc', href: '/rate-calculator', enabled: true },
  { key: 'cost-table', label: 'Cost Table', href: '/cost-table', enabled: true },
  { key: 'bank-statement', label: 'Bank Stmt', href: '/bank-statement', enabled: true },
  { key: 'remittance-import', label: 'COD Remittance', href: '/remittance-import', enabled: true },
  { key: 'loyalty', label: 'Loyalty', href: '/loyalty', enabled: true },
  { key: 'settings', label: 'Settings', href: '/settings', enabled: true },
  { key: 'virtual-ceo', label: 'Virtual CEO', href: '/virtual-ceo', enabled: true },
];

export const DEFAULT_ERP_CONFIG: ErpConfig = {
  orderFields: [],
  itemFields: [],
  productionStages: [
    { id: 'NOT_PRINTED', label: 'Not Printed', substages: [] },
    { id: 'PRINTING', label: 'Printing', substages: ['Plate', 'Print', 'Drying'] },
    { id: 'PROCESSING', label: 'Processing', substages: ['Cutting', 'Lamination', 'Packing'] },
    { id: 'READY_FOR_DISPATCH', label: 'Ready For Dispatch', substages: [] },
  ],
  productionFlow: [
    { from: 'NOT_PRINTED', to: 'PRINTING' },
    { from: 'PRINTING', to: 'PROCESSING' },
    { from: 'PROCESSING', to: 'READY_FOR_DISPATCH' },
  ],
  modules: DEFAULT_MODULES,
  roleAccess: {
    ADMIN: DEFAULT_MODULES.map((m) => m.key),
    AGENT: ['dashboard', 'orders', 'tasks', 'storefront', 'marketing', 'customers', 'crm', 'rate-calculator'],
    SALES_AGENT: ['dashboard', 'orders', 'tasks', 'storefront', 'marketing', 'customers', 'crm', 'dialer', 'rate-calculator', 'design', 'loyalty'],
    ACCOUNTS: ['dashboard', 'orders', 'accounts', 'tasks', 'storefront', 'cost-table', 'bank-statement', 'remittance-import', 'reports', 'loyalty'],
    PRODUCTION: ['dashboard', 'orders', 'production', 'design', 'paper-stock', 'tasks', 'storefront', 'sticker', 'sheet-layout'],
    DISPATCH: ['dashboard', 'orders', 'dispatch', 'tasks', 'storefront'],
    INHOUSE: ['orders', 'production', 'dispatch'],
    DESIGNER: ['production', 'sticker', 'sheet-layout'],
  },
  virtualCeoTags: [
    { id: 'job_on_hold', label: 'Job on hold', color: '#f59e0b' },
    { id: 'design_not_received', label: 'Design not received', color: '#ef4444' },
  ],
  virtualCeoCardTags: {},
};

@Injectable()
export class ErpConfigService implements OnModuleInit {
  private readonly logger = new Logger(ErpConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Outgoing WhatsApp/email/PDF text reads the brand name synchronously
  // (common/brand.ts), so load the Settings name once at startup; every
  // change goes through setBrandingName below, which refreshes it too.
  async onModuleInit() {
    try {
      setBrandSettingsName((await this.getBranding()).appName);
    } catch (err) {
      this.logger.warn(`Could not load the app branding name: ${err instanceof Error ? err.message : err}`);
    }
  }

  async getConfig(): Promise<ErpConfig> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: DB_KEY } });
    if (!row?.value) return DEFAULT_ERP_CONFIG;
    try {
      const parsed = JSON.parse(row.value) as Partial<ErpConfig>;
      return this.mergeConfig(parsed);
    } catch {
      return DEFAULT_ERP_CONFIG;
    }
  }

  async updateConfig(patch: Partial<ErpConfig>): Promise<ErpConfig> {
    const current = await this.getConfig();
    const next = this.mergeConfig({ ...current, ...patch });
    await this.prisma.systemConfig.upsert({
      where: { key: DB_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: DB_KEY, value: JSON.stringify(next) },
    });
    return next;
  }

  /** groups: null means "use the built-in default categories". */
  async getNavGroups(): Promise<{ groups: NavGroupConfig[] | null }> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: NAV_GROUPS_KEY } });
    if (!row?.value) return { groups: null };
    try {
      return { groups: normalizeNavGroups(JSON.parse(row.value)) };
    } catch {
      return { groups: null };
    }
  }

  /** null resets to the built-in defaults. */
  async setNavGroups(input: unknown): Promise<{ groups: NavGroupConfig[] | null }> {
    if (input === null) {
      await this.prisma.systemConfig.deleteMany({ where: { key: NAV_GROUPS_KEY } });
      return { groups: null };
    }
    const groups = normalizeNavGroups(input);
    const value = JSON.stringify(groups);
    await this.prisma.systemConfig.upsert({
      where: { key: NAV_GROUPS_KEY },
      update: { value },
      create: { key: NAV_GROUPS_KEY, value },
    });
    return { groups };
  }

  async getBranding(): Promise<AppBranding> {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { in: [BRANDING_NAME_KEY, BRANDING_LOGO_KEY] } },
    });
    const value = (key: string) => rows.find((r) => r.key === key)?.value?.trim() || null;
    return { appName: value(BRANDING_NAME_KEY), logoUrl: value(BRANDING_LOGO_KEY) };
  }

  /** Empty or null clears it, so the deployment's default name shows again. */
  async setBrandingName(input: unknown): Promise<AppBranding> {
    if (input !== null && typeof input !== 'string') throw new BadRequestException('appName must be text');
    // typeof, not `?? ''`: Railway's nest build has no strictNullChecks, so
    // the null check above does not narrow `unknown` there.
    const appName = typeof input === 'string' ? input.trim() : '';
    if (appName.length > MAX_BRAND_NAME) throw new BadRequestException(`Name must be at most ${MAX_BRAND_NAME} characters`);
    await this.setOrClear(BRANDING_NAME_KEY, appName);
    setBrandSettingsName(appName || null);
    return this.getBranding();
  }

  /** null file clears it, so the default logo shows again. */
  async setBrandingLogo(file: Express.Multer.File | null): Promise<AppBranding> {
    if (file) {
      if (!BRAND_LOGO_TYPES.has(file.mimetype)) throw new BadRequestException('Logo must be a PNG, JPG or WebP image');
      if (file.size > MAX_BRAND_LOGO_BYTES) throw new BadRequestException('Logo must be 300 KB or smaller');
    }
    await this.setOrClear(BRANDING_LOGO_KEY, file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : '');
    return this.getBranding();
  }

  private async setOrClear(key: string, value: string) {
    if (!value) {
      await this.prisma.systemConfig.deleteMany({ where: { key } });
      return;
    }
    await this.prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  private mergeConfig(input: Partial<ErpConfig>): ErpConfig {
    const modules = DEFAULT_MODULES.map((base) => {
      const saved = input.modules?.find((m) => m.key === base.key);
      return { ...base, ...saved, fixed: base.fixed, enabled: base.fixed ? true : saved?.enabled ?? base.enabled };
    });
    const moduleKeys = new Set(modules.map((m) => m.key));

    // A module key that appears in NONE of the saved per-role lists was
    // added to DEFAULT_MODULES after the Settings page was last saved (it
    // saves every role's full list as one blob, so a module unknown at save
    // time is simply absent everywhere) -- nobody has ever had the chance to
    // grant or revoke it, so it isn't safe to treat that absence as an
    // intentional removal. Restore it per role from the shipped defaults,
    // same as a fresh install would have it. A module that DOES appear for
    // at least one role but was deliberately left out of another is untouched.
    const savedRoleAccess = input.roleAccess ?? {};
    const keysPresentAnywhere = new Set(Object.values(savedRoleAccess).flat());
    const orphanedKeys = new Set([...moduleKeys].filter((key) => !keysPresentAnywhere.has(key)));

    const roleAccess = { ...DEFAULT_ERP_CONFIG.roleAccess, ...savedRoleAccess };
    for (const role of Object.keys(roleAccess)) {
      const restored = (DEFAULT_ERP_CONFIG.roleAccess[role] ?? []).filter((key) => orphanedKeys.has(key));
      roleAccess[role] = Array.from(new Set([
        ...roleAccess[role].filter((key) => moduleKeys.has(key)),
        ...restored,
        'orders', 'accounts', 'production', 'dispatch',
      ]));
    }
    return {
      orderFields: input.orderFields ?? DEFAULT_ERP_CONFIG.orderFields,
      itemFields: input.itemFields ?? DEFAULT_ERP_CONFIG.itemFields,
      productionStages: input.productionStages ?? DEFAULT_ERP_CONFIG.productionStages,
      productionFlow: input.productionFlow ?? DEFAULT_ERP_CONFIG.productionFlow,
      modules,
      roleAccess,
      virtualCeoTags: input.virtualCeoTags ?? DEFAULT_ERP_CONFIG.virtualCeoTags,
      virtualCeoCardTags: input.virtualCeoCardTags ?? DEFAULT_ERP_CONFIG.virtualCeoCardTags,
    };
  }
}
