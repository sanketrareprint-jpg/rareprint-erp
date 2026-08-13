import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

export const DEFAULT_MODULES: ModuleConfig[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', enabled: true },
  { key: 'orders', label: 'Orders', href: '/orders', fixed: true, enabled: true },
  { key: 'accounts', label: 'Accounts', href: '/accounts', fixed: true, enabled: true },
  { key: 'production', label: 'Production', href: '/production', fixed: true, enabled: true },
  { key: 'dispatch', label: 'Dispatch', href: '/dispatch', fixed: true, enabled: true },
  { key: 'reports', label: 'Reports', href: '/reports', enabled: true },
  { key: 'crm', label: 'CRM', href: '/crm', enabled: true },
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
    SALES_AGENT: ['dashboard', 'orders', 'tasks', 'storefront', 'marketing', 'customers', 'crm', 'rate-calculator', 'design', 'loyalty'],
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
export class ErpConfigService {
  constructor(private readonly prisma: PrismaService) {}

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
