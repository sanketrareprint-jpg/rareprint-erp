import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

const CUTS: Record<string, Record<string, number>> = {
  // file = 12x18 inch (rotated, fits 2 per 19x25); visiting = 3.5x2 inch
  // envelope open size formula: openW = closed_W*2+0.5, openH = closed_H+1
  //   env4x5    : 4x5 medicine pouch    -> open 8.5x6"   -> 18x23: 6/sheet, 19x25: 8/sheet
  //   env425x925: 4.25x9.25 office      -> open 9x10.25" -> 4/sheet both
  //   env425x45 : 4.25x4.5 small        -> open 9x5.5"   -> 8/sheet both
  //   env425x63 : 4.25x6.3 medium       -> open 9x7.3"   -> 6/sheet both
  //   env525x75 : 5.25x7.5 document     -> open 11x8.5"  -> 4/sheet both (rotated)
  //   env85x11  : 8.5x11 A4-size        -> 2/18x23, 2/19x25
  //   env9x12   : 9x12 catalog          -> open 18.5x13" -> 1/15x20 only (rotated 13x18.5)
  //   env11x17  : 11x17 large           -> open 22.5x18" -> 1/18x23 only (22.5 along 23" side)
  '1823': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 32, file: 1,
            env4x5: 6, env425x925: 4, env425x45: 8, env425x63: 6, env525x75: 4, env85x11: 2, env11x17: 1 },
  '1925': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 40, file: 2,
            env4x5: 8, env425x925: 4, env425x45: 8, env425x63: 6, env525x75: 4, env85x11: 2 },
  '1520': { env9x12: 1 }, // 15x20 parent — catalog envelope only
};

const SHEET_AREA: Record<string, number> = {
  '1823': 18 * 23,
  '1925': 19 * 25,
  '1520': 15 * 20,
};

// ── Calendar production rules ────────────────────────────────────────────────
// A calendar is costed as a list of sheet "forms". A form is one imposition
// printed as its own run: `sheetsPerCalendar` physical sheets per finished
// calendar, printed on `sides` sides (1 = front only, 2 = front + back).
// Every printed side is one plate set and one press run, no matter how many
// calendar designs are imposed on it — so designs ≠ plates ≠ sheets.
// No wastage is added anywhere (business rule: wastage = 0%).
const CALENDAR_COLORS = 4;
type CalendarForm = { sheetsPerCalendar: number; sides: 1 | 2; note: string };
type CalendarPages = '1' | '3' | '6';

function calendarLeafForms(leaves: number): CalendarForm[] {
  return Array.from({ length: leaves }, (_, i) => ({ sheetsPerCalendar: 1, sides: 2 as const, note: `Leaf ${i + 1}: front + back` }));
}

const CALENDAR_SIZES: Record<string, { label: string; parent: string; parentLabel: string; forms: Record<CalendarPages, CalendarForm[]> }> = {
  // 11×17 is imposed 2-up on 18×23: 2 designs per sheet side.
  '11x17': {
    label: '11×17 inch', parent: '1823', parentLabel: '18×23 inch',
    forms: {
      '1': [{ sheetsPerCalendar: 0.5, sides: 1, note: '2 calendars per 18×23 sheet, front only' }],
      '3': [
        { sheetsPerCalendar: 1, sides: 2, note: 'Leaves 1+2: 2 designs per side, front + back' },
        { sheetsPerCalendar: 0.5, sides: 2, note: 'Leaf 3: 2-up (2 calendars per sheet), front + back' },
      ],
      '6': [
        { sheetsPerCalendar: 1, sides: 2, note: 'Leaves 1+2: 2 months per side, front + back' },
        { sheetsPerCalendar: 1, sides: 2, note: 'Leaves 3+4: 2 months per side, front + back' },
        { sheetsPerCalendar: 1, sides: 2, note: 'Leaves 5+6: 2 months per side, front + back' },
      ],
    },
  },
  '15x20': {
    label: '15×20 inch', parent: '1520', parentLabel: '15×20 inch',
    forms: {
      '1': [{ sheetsPerCalendar: 1, sides: 1, note: '1 calendar per sheet, front only' }],
      '3': calendarLeafForms(3),
      '6': calendarLeafForms(6),
    },
  },
  '18x23': {
    label: '18×23 inch', parent: '1823', parentLabel: '18×23 inch',
    forms: {
      '1': [{ sheetsPerCalendar: 1, sides: 1, note: '1 calendar per sheet, front only' }],
      '3': calendarLeafForms(3),
      '6': calendarLeafForms(6),
    },
  },
};

// Unique calendar designs per page option (1 page = all 12 months on one design).
const CALENDAR_DESIGNS: Record<CalendarPages, number> = { '1': 1, '3': 6, '6': 12 };

const CALENDAR_TINNING: Record<string, string> = { top: 'Top', topBottom: 'Top + Bottom' };

// Calendar paper must be Maplitho ("map") or Art ("art") — e.g. map100, art170.
const CALENDAR_PAPER_TYPE = /^(map|art)(\d+(?:\.\d+)?)$/i;

function calendarPaperLabel(type: string): string {
  const m = type.match(CALENDAR_PAPER_TYPE);
  return m ? `${m[2]} GSM ${m[1].toLowerCase() === 'map' ? 'Maplitho' : 'Art Paper'}` : type;
}

// Roles allowed to see Rate Calc costs/rates and edit master rates — the same
// roles the frontend treats as admin (rate-calculator/page.tsx `adminRoles`).
export const RATE_COST_ROLES = ['ADMIN', 'INHOUSE', 'ACCOUNTS'];
export function canSeeRateCosts(role?: string | null): boolean {
  return !!role && RATE_COST_ROLES.includes(role);
}

// ── Cost redaction for roles that may only see prices ───────────────────────
// Request fields that set a ₹ cost or the multiplier directly. Comparing two
// prices with different values would reveal the multiplier (and so the cost),
// so they are ignored for roles that can't see costs.
const COST_OVERRIDE_FIELDS = ['multiplier', 'nonWovenPerPlateRate', 'nonWovenRatePerKg', 'nonWovenPrintingCostPerBag'];

function withoutCostOverrides(dto: any): any {
  const safe = { ...(dto ?? {}) };
  for (const f of COST_OVERRIDE_FIELDS) delete safe[f];
  return safe;
}

// Master rates with every value removed but every key kept, so dropdowns built
// from the keys (paper types, bag sizes, keychain/pen numbers, ...) still work.
// `tiers` arrays are quantity thresholds, not money, and are kept.
function stripRateValues(value: any, key?: string): any {
  if (Array.isArray(value)) return key === 'tiers' ? value : value.map(v => stripRateValues(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripRateValues(v, k)]));
  }
  return typeof value === 'number' || typeof value === 'string' ? null : value;
}

// Drops description segments ("a | b | c") that carry a ₹ amount.
function stripMoneyFromDescription(description: any): any {
  if (typeof description !== 'string') return description;
  return description.split(' | ').filter(part => !/Rs\.|₹/.test(part)).join(' | ');
}

const STICKER_PUBLIC_FIELDS = [
  'width', 'height', 'area', 'usableSheet', 'openSheet', 'columns', 'rows', 'rotated', 'stickersPerSheet', 'sheetsNeeded',
  'selectedType', 'halfCut', 'halfCutPct', 'dieCutting', 'dieCuttingApplies', 'dieW', 'dieH', 'dieArea',
  'clubbingEligible', 'clubbingBlockColumns', 'clubbingBlockRows', 'clubbingStickersPerBlock', 'clubbingBlockArea',
  'clubbingSets', 'clubbingUnavailableReason', 'plainTotal', 'nonTearableTotal', 'clubbingTotal',
];

// Forward/Reverse result → price + production quantities only.
function redactQuoteResult(r: any): any {
  const out: any = {
    breakdown: [],
    total: r.total,
    perPiece: r.perPiece,
    totalPieces: r.totalPieces,
    totalQty: r.totalQty,
    totalParentSheets: r.totalParentSheets,
    cutsPerSheet: r.cutsPerSheet,
    description: stripMoneyFromDescription(r.description),
    customer: r.customer,
    job: r.job,
    costsVisible: false,
  };
  if (r.sticker) out.sticker = Object.fromEntries(STICKER_PUBLIC_FIELDS.map(f => [f, r.sticker[f]]));
  return out;
}

// History row → no cost, breakdown, multiplier or cost-override inputs.
function redactHistoryRow(h: any): any {
  const inputParams = withoutCostOverrides(h.inputParams);
  return { ...h, breakdown: [], subtotal: null, multiplier: null, inputParams };
}

const DEFAULT_RATES: any = {
  paper: {
    '1823-bond70': 850, '1823-bond80': 950,
    '1925-bond70': 950, '1925-bond80': 1050,
    '1823-map90': 1100, '1925-map90': 1200,
    '1823-map100': 1260, '1925-map100': 1500,
  },
  printing: {
    '4color': { first1k: 900, nextK: 300 },
    '1color': { flat: 150 },
    '2color': { flat: 300 },
  },
  plate: 250,
  padBinding: { A4: 15, A5: 10, A6: 7, A8: 5, '1/3A4': 8 },
  billBookBinding: { A4: 25, A8: 15 },
  punch: 2,
  fileClip: 1,
  filePocket: 2.2,
  lamination: { gloss: 0.34, matt: 0.50 },
  envelopeWindow: 0.20,  // ₹ per envelope for window cutting (₹200/1000)
  envelope: {
    env4x5:     2,    // 4x5 medicine pouch
    env425x925: 2.5,  // 4.25x9.25 office (DL style)
    env425x45:  2,    // 4.25x4.5 small
    env425x63:  2,    // 4.25x6.3 medium
    env525x75:  2.5,  // 5.25x7.5 document
    env85x11:   4,    // 8.5x11 A4 size
    env9x12:    5,    // 9x12 catalog
    env11x17:   6,    // 11x17 large
  },
  sticker: { vendorRate: 0.035, minQty: 1000, transport: 100, halfCutPct: 30, dieRatePerSqIn: 6, punchingRatePer1000: 500 },
  ppFiles: {
    gstPct: 18,
    clip: 1.25,
    pocketOneSide: 2.5,
    multiplier: 1.67,
    tiers: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000],
    baseCosts: {
      'single-single-300': { 1000: 12.91, 2000: 11.40, 3000: 10.77, 4000: 10.35, 5000: 9.82, 6000: 9.73, 7000: 9.67, 8000: 9.23, 9000: 9.19, 10000: 9.16 },
      'single-double-300': { 1000: 15.98, 2000: 13.19, 3000: 12.13, 4000: 11.49, 5000: 10.84, 6000: 10.66, 7000: 10.54, 8000: 10.05, 9000: 9.98, 10000: 9.92 },
      'single-single-350': { 1000: 14.10, 2000: 12.59, 3000: 11.95, 4000: 11.53, 5000: 11.00, 6000: 10.91, 7000: 10.85, 8000: 10.40, 9000: 10.37, 10000: 10.34 },
      'single-double-350': { 1000: 17.18, 2000: 14.38, 3000: 13.31, 4000: 12.68, 5000: 12.02, 6000: 11.84, 7000: 11.72, 8000: 11.23, 9000: 11.15, 10000: 11.10 },
      'double-single-300': { 1000: 13.75, 2000: 12.24, 3000: 11.60, 4000: 11.19, 5000: 10.66, 6000: 10.57, 7000: 10.51, 8000: 10.06, 9000: 10.02, 10000: 9.99 },
      'double-double-300': { 1000: 16.83, 2000: 14.03, 3000: 12.96, 4000: 12.33, 5000: 11.67, 6000: 11.50, 7000: 11.37, 8000: 10.88, 9000: 10.81, 10000: 10.75 },
      'double-single-350': { 1000: 15.08, 2000: 13.56, 3000: 12.93, 4000: 12.51, 5000: 11.97, 6000: 11.89, 7000: 11.82, 8000: 11.38, 9000: 11.34, 10000: 11.31 },
      'double-double-350': { 1000: 18.18, 2000: 15.36, 3000: 14.29, 4000: 13.65, 5000: 12.99, 6000: 12.82, 7000: 12.69, 8000: 12.20, 9000: 12.13, 10000: 12.07 },
    },
  },
  diagnosticBags: {
    gstPct: 18,
    multiplier: 1.67,
    tiers: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000],
    baseCosts: {
      small: { 1000: 10.65, 2000: 9.4, 3000: 8.9833, 4000: 8.775, 5000: 8.65, 6000: 8.5666, 7000: 8.50714, 8000: 8.4625, 9000: 8.42777, 10000: 8.4 },
      big: { 1000: 19, 2000: 16.5, 3000: 15.666, 4000: 15.25, 5000: 15, 6000: 14.833, 7000: 14.7142, 8000: 14.625, 9000: 14.5555, 10000: 14.5 },
    },
  },
  nonWovenBag: {
    multiplier: 1.67,
    multicolorExtraPerBag: 2,
    // How many bags of this size make up 1kg of fabric — drives the fabric
    // cost calc: (qty ÷ bagsPerKg) × ratePerKg. Larger bags weigh more, so
    // fewer of them fit in a kg.
    bagsPerKg: {
      '9x12': 60,
      '10x14': 50,
      '12x15': 40,
      '12x18': 35,
      '16x21': 25,
    },
    ratePerKg: 120,
    printingCostPerBag: 1,
    perPlateRate: 500,
    // Multicolor printing needs a costlier plate than single color.
    multicolorPerPlateRate: 1000,
  },
  handleBag: {
    multiplier: 1.67,
    // ₹/kg — the only value edited in the Rates tab; the rest are fixed per-bag charges.
    fabricRatePerKg: 120,
    // 1550 sq inch per m² × 1000 g per kg: converts sq inch × GSM into kg.
    sqInchGsmPerKg: 1550000,
    gussetSeamAllowanceInch: 1.5,
    stitchingWithGusset: 2.25,
    stitchingWithoutGusset: 1.25,
    cuttingWastagePerBag: 0.5,
    // ₹/bag by qty slab: below 2000 → '1000' slab, 2000–4999 → '2000', 5000+ → '5000'.
    printingPerBag: {
      single: { 1000: 1.5, 2000: 1.25, 5000: 1 },
      multicolor: { 1000: 3.2, 2000: 2.25, 5000: 1.75 },
    },
  },
  dotMatrixBill: {
    multiplier: 1.67,
    carbonCopyExtraPerBook: 8,
    sizeRates: {
      '4x6': { 60: 18, 70: 20, 80: 22, 100: 25 },
      '7.5x4': { 60: 20, 70: 22, 80: 24, 100: 28 },
      '8.5x11': { 60: 35, 70: 38, 80: 42, 100: 48 },
    },
  },
  keychain: {
    multiplier: 1.67,
    numberRates: {
      KC1: 12,
      KC2: 14,
      KC3: 16,
      KC4: 18,
      KC5: 20,
    },
  },
  pen: {
    multiplier: 1.67,
    numberRates: {
      PEN1: 6,
      PEN2: 7,
      PEN3: 8,
      PEN4: 9,
      PEN5: 10,
    },
  },
  multiplier: 1.67,
};

const RATES_FILE = path.join(__dirname, '..', '..', 'data', 'rates.json');

function readRatesFile(): any | null {
  try {
    if (fs.existsSync(RATES_FILE)) return JSON.parse(fs.readFileSync(RATES_FILE, 'utf8'));
  } catch {}
  return null;
}

function writeRatesFile(rates: any): void {
  try {
    const dir = path.dirname(RATES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RATES_FILE, JSON.stringify(rates, null, 2), 'utf8');
  } catch {}
}

function mergeRates(defaults: any, saved: any): any {
  if (!saved || typeof saved !== 'object') return defaults;
  const merged: any = { ...defaults, ...saved };
  for (const key of Object.keys(defaults)) {
    if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      merged[key] = mergeRates(defaults[key], saved[key]);
    }
  }
  return merged;
}

@Injectable()
export class RateCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async getRates(): Promise<any> {
    try {
      const rows = await (this.prisma as any).$queryRawUnsafe(
        `SELECT value FROM "SystemConfig" WHERE key = 'rate_calculator_rates' LIMIT 1`
      );
      if (rows && rows[0]?.value) return mergeRates(DEFAULT_RATES, JSON.parse(rows[0].value));
    } catch {}
    const fromFile = readRatesFile();
    if (fromFile) return mergeRates(DEFAULT_RATES, fromFile);
    return DEFAULT_RATES;
  }

  // GET /rates for the UI. Roles that can't see costs get the keys only (for
  // dropdowns) with every rate value removed; calendar tinning is dropped.
  async getRatesForRole(role?: string): Promise<any> {
    const rates = await this.getRates();
    if (canSeeRateCosts(role)) return rates;
    const { calendarTinning: _t, ...rest } = rates;
    return stripRateValues(rest);
  }

  // Role-aware entry points for POST /forward and /reverse: non-cost roles
  // can't override costs/multiplier and get price + production data only.
  async calcForwardForRole(dto: any, role?: string) {
    if (canSeeRateCosts(role)) return { ...(await this.calcForward(dto)), costsVisible: true };
    return redactQuoteResult(await this.calcForward(withoutCostOverrides(dto)));
  }

  async calcReverseForRole(dto: any, role?: string) {
    if (canSeeRateCosts(role)) return { ...(await this.calcReverse(dto)), costsVisible: true };
    return redactQuoteResult(await this.calcReverse(withoutCostOverrides(dto)));
  }

  async saveRates(rates: any): Promise<{ success: boolean }> {
    const json = JSON.stringify(rates);
    try {
      await (this.prisma as any).$queryRawUnsafe(
        `INSERT INTO "SystemConfig" (key, value, "updatedAt") VALUES ('rate_calculator_rates', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
        json
      );
    } catch {}
    writeRatesFile(rates);
    return { success: true };
  }

  // ── Clubbing Vendor Rates (stored in SystemConfig) ───────────────────────
  async getClubbingRates(): Promise<any> {
    try {
      const rows = await (this.prisma as any).$queryRawUnsafe(
        `SELECT value FROM "SystemConfig" WHERE key = 'clubbing_vendor_rates' LIMIT 1`
      );
      if (rows && rows[0]?.value) return JSON.parse(rows[0].value);
    } catch {}
    return { vendorName: '', rates: {} };
  }

  async saveClubbingRates(data: any): Promise<{ success: boolean }> {
    const json = JSON.stringify(data);
    try {
      await (this.prisma as any).$queryRawUnsafe(
        `INSERT INTO "SystemConfig" (key, value, "updatedAt") VALUES ('clubbing_vendor_rates', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
        json
      );
    } catch {}
    return { success: true };
  }

  // ── Sequential quotation numbers (1, 2, 3, ... forever) ──────────────────
  // Stored as a single counter row in SystemConfig (same table already used
  // for rates/clubbing config above) so numbering survives restarts and stays
  // consistent across every user/device — a client-side counter can't do
  // that since two people quoting at once would both start from their own
  // last-seen number. The INSERT ... ON CONFLICT ... RETURNING is one atomic
  // statement, so concurrent requests can never be handed the same number.
  async nextQuotationNumber(): Promise<number> {
    const rows: any = await (this.prisma as any).$queryRawUnsafe(
      `INSERT INTO "SystemConfig" (key, value, "updatedAt") VALUES ('rate_calculator_quotation_counter', '1', NOW())
       ON CONFLICT (key) DO UPDATE SET value = (CAST("SystemConfig".value AS INTEGER) + 1)::text, "updatedAt" = NOW()
       RETURNING value`
    );
    return Number(rows?.[0]?.value ?? 1);
  }

  // ── Quote History ────────────────────────────────────────────────────────
  async saveHistory(dto: any, role?: string): Promise<{ success: boolean; id: string }> {
    // Never trust client-sent amounts: recompute from the saved inputs so the
    // history cost/total are authoritative. Roles that can't see costs never
    // receive a cost to send, and can't record a custom multiplier/cost.
    const showCosts = canSeeRateCosts(role);
    const p = showCosts ? (dto?.inputParams ?? {}) : withoutCostOverrides(dto?.inputParams);
    let full: any;
    if (dto?.calcType === 'calendar') {
      full = await this.computeCalendar(
        { qty: p.qty, size: p.calendarSize, paper: p.paper, pages: p.calendarPages, tinning: p.calendarTinning, multiplier: p.multiplier },
        showCosts,
      );
    } else if (dto?.calcType === 'reverse') {
      full = await this.calcReverse(p);
    } else if (dto?.calcType === 'forward') {
      full = await this.calcForward(p);
    } else {
      throw new BadRequestException('Unknown quote type');
    }
    dto = {
      ...dto,
      inputParams: { ...(dto.inputParams ?? {}), ...p },
      breakdown: full.breakdown,
      subtotal: full.subtotal,
      total: full.total,
      perPiece: full.perPiece ?? null,
      multiplier: full.multiplier,
    };
    if (!showCosts) {
      // Keep the stored inputs free of overrides the server ignored.
      for (const f of COST_OVERRIDE_FIELDS) delete dto.inputParams[f];
    }
    try {
      const rec = await (this.prisma as any).quoteHistory.create({
        data: {
          calcType:    dto.calcType    ?? 'forward',
          customer:    dto.customer    ?? null,
          job:         dto.job         ?? null,
          product:     dto.product     ?? null,
          qty:         dto.qty         ? Number(dto.qty) : null,
          breakdown:   dto.breakdown   ?? [],
          subtotal:    Number(dto.subtotal  ?? 0),
          total:       Number(dto.total     ?? 0),
          perPiece:    dto.perPiece != null ? Number(dto.perPiece) : null,
          multiplier:  Number(dto.multiplier ?? 1.67),
          inputParams: dto.inputParams ?? {},
        },
      });
      return { success: true, id: rec.id };
    } catch (e: any) {
      console.error('saveHistory error', e?.message);
      return { success: false, id: '' };
    }
  }

  async listHistory(limit = 100, role?: string): Promise<any[]> {
    try {
      const rows = await (this.prisma as any).quoteHistory.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      if (canSeeRateCosts(role)) return rows;
      // Roles that may only see the price get no cost data on any quote.
      return rows.map(redactHistoryRow);
    } catch (e: any) {
      console.error('listHistory error', e?.message);
      return [];
    }
  }

  async deleteHistory(id: string): Promise<{ success: boolean }> {
    try {
      await (this.prisma as any).quoteHistory.delete({ where: { id } });
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────
  private getPrintCost(rates: any, colors: number, parentSheets: number, cutsPerSheet: number, sidesMult = 1): number {
    if (colors === 4) {
      const first1k = rates.printing?.['4color']?.first1k ?? DEFAULT_RATES.printing['4color'].first1k;
      const nextK   = rates.printing?.['4color']?.nextK   ?? DEFAULT_RATES.printing['4color'].nextK;
      const base = parentSheets <= 1000
        ? first1k
        : first1k + Math.ceil((parentSheets - 1000) / 1000) * nextK;
      return base * sidesMult;
    } else {
      const totalPieces = parentSheets * cutsPerSheet;
      const flat = colors === 1
        ? (rates.printing?.['1color']?.flat ?? DEFAULT_RATES.printing['1color'].flat)
        : (rates.printing?.['2color']?.flat ?? DEFAULT_RATES.printing['2color'].flat);
      const blocks = Math.max(Math.ceil(totalPieces / 1000), 1);
      return blocks * flat * sidesMult;
    }
  }

  private getPaperRatePerSheet(rates: any, psize: string, gsm: string): number {
    const key = `${psize}-${gsm}`;
    const reamRate = rates.paper?.[key] ?? DEFAULT_RATES.paper[key] ?? 1000;
    return reamRate / 500;
  }

  private getPlateCost(rates: any, colors: number, sidesMult: number): number {
    return colors * (rates.plate ?? DEFAULT_RATES.plate) * sidesMult;
  }

  private getPadRate(rates: any, size: string): number {
    return rates.padBinding?.[size] ?? DEFAULT_RATES.padBinding[size] ?? 10;
  }

  private getBillBookRate(rates: any, size: string): number {
    return rates.billBookBinding?.[size] ?? DEFAULT_RATES.billBookBinding[size] ?? 20;
  }

  private getLamCost(rates: any, lamType: string, psize: string, sheets: number): number {
    if (!lamType || lamType === 'none') return 0;
    const sqIn = SHEET_AREA[psize] ?? 414;
    const parts = lamType.split('-');
    const finish  = parts[0];
    const sideMul = parts[1] === 'double' ? 2 : 1;
    const rateKey = finish === 'matt' ? 'matt' : 'gloss';
    const ratePer100 = rates.lamination?.[rateKey] ?? DEFAULT_RATES.lamination[rateKey] ?? 0.34;
    return (sqIn / 100) * ratePer100 * sheets * sideMul;
  }

  private getPpFileBaseRate(rates: any, creasing: string, sides: string, micron: number, qty: number): { rate: number; tier: number; key: string } {
    const pp = rates.ppFiles ?? DEFAULT_RATES.ppFiles;
    const tiers = (pp.tiers ?? DEFAULT_RATES.ppFiles.tiers).map(Number).sort((a: number, b: number) => b - a);
    const tier = tiers.find((t: number) => qty >= t) ?? tiers[tiers.length - 1] ?? 1000;
    const key = `${creasing === 'double' ? 'double' : 'single'}-${sides === 'double' ? 'double' : 'single'}-${micron === 350 ? 350 : 300}`;
    const rate = pp.baseCosts?.[key]?.[tier] ?? DEFAULT_RATES.ppFiles.baseCosts[key]?.[tier] ?? 0;
    return { rate, tier, key };
  }

  private getDiagnosticBagBaseRate(rates: any, bagSize: string, qty: number): { rate: number; tier: number; key: string } {
    const bag = rates.diagnosticBags ?? DEFAULT_RATES.diagnosticBags;
    const tiers = (bag.tiers ?? DEFAULT_RATES.diagnosticBags.tiers).map(Number).sort((a: number, b: number) => b - a);
    const tier = tiers.find((t: number) => qty >= t) ?? tiers[tiers.length - 1] ?? 1000;
    const key = bagSize === 'big' ? 'big' : 'small';
    const rate = bag.baseCosts?.[key]?.[tier] ?? DEFAULT_RATES.diagnosticBags.baseCosts[key]?.[tier] ?? 0;
    return { rate, tier, key };
  }

  private getStickerSheetFit(width: number, height: number): { perSheet: number; columns: number; rows: number; rotated: boolean } {
    const usableW = 11.5;
    const usableH = 17.5;
    const normalCols = Math.floor(usableW / width);
    const normalRows = Math.floor(usableH / height);
    const rotatedCols = Math.floor(usableW / height);
    const rotatedRows = Math.floor(usableH / width);
    const normal = normalCols * normalRows;
    const rotated = rotatedCols * rotatedRows;
    if (rotated > normal) return { perSheet: rotated, columns: rotatedCols, rows: rotatedRows, rotated: true };
    return { perSheet: normal, columns: normalCols, rows: normalRows, rotated: false };
  }

  private getStickerClubbingBlock(width: number, height: number, qty: number): { columns: number; rows: number; stickers: number; area: number } {
    const stickerArea = width * height;

    // Number of stickers per sheet: print 1000 sheets, need ceil(qty/1000) stickers each
    const n = Math.max(1, Math.ceil(qty / 1000));

    // Find all factor pairs (cols × rows = n), pick the one whose block dimensions
    // are closest to square (minimises aspect ratio deviation)
    let bestCols = 1, bestRows = n, bestRatio = Infinity;
    for (let c = 1; c <= n; c++) {
      if (n % c === 0) {
        const r = n / c;
        const blockW = c * width;
        const blockH = r * height;
        const ratio = blockW > 0 && blockH > 0 ? Math.max(blockW / blockH, blockH / blockW) : Infinity;
        if (ratio < bestRatio) {
          bestRatio = ratio;
          bestCols = c;
          bestRows = r;
        }
      }
    }

    return { columns: bestCols, rows: bestRows, stickers: n, area: stickerArea * n };
  }

  private getStickerMultiplier(cost: number): number {
    if (cost < 500) return 4;
    if (cost < 1000) return 3;
    if (cost < 3000) return 2;
    return 1.67;
  }

  // ── Clubbing vendor cost lookup ──────────────────────────────────────────
  private getClubbingCost(clubbing: any, fsize: string, sides: string, qty: number): number | null {
    const sizeRates = clubbing?.rates?.[fsize];
    if (!sizeRates) return null;
    const sidesRates = sizeRates[sides === 'double' ? 'double' : 'single'];
    if (!sidesRates) return null;
    // Find nearest qty tier (round down to nearest 1000, min 1000)
    const tier = Math.max(1000, Math.floor(qty / 1000) * 1000);
    // Check exact tier, then walk down to find the closest
    const tiers = Object.keys(sidesRates).map(Number).sort((a, b) => b - a);
    const matched = tiers.find(t => t <= tier);
    if (matched == null) return null;
    const ratePerPiece = sidesRates[String(matched)];
    if (ratePerPiece == null) return null;
    return ratePerPiece * qty;
  }

  async calcForward(dto: any) {
    const rates = await this.getRates();
    const { layers = [], lam = 'none', padSize, pads = 0, punch, envelope, multiplier: dtoMult, customer, job } = dto;
    const multiplier = dtoMult ?? rates.multiplier ?? DEFAULT_RATES.multiplier;
    let subtotal = 0;
    const breakdown: any[] = [];
    let totalQty = 0;
    let totalParentSheets = 0;
    let mainPsize = '1823';

    for (let i = 0; i < layers.length; i++) {
      const { psize = '1823', gsm, qty, fsize, colors, sides } = layers[i];
      mainPsize = psize;
      const cutsPerSheet = CUTS[psize]?.[fsize] ?? 4;
      const parentSheets = Math.ceil(qty / cutsPerSheet);
      const sidesMult = sides === 'double' ? 2 : 1;
      const paperRate = this.getPaperRatePerSheet(rates, psize, gsm);
      const paperCost = parentSheets * paperRate;
      const printCost = this.getPrintCost(rates, colors, parentSheets, cutsPerSheet, sidesMult);
      const plateCost = this.getPlateCost(rates, colors, sidesMult);
      subtotal += paperCost + printCost + plateCost;
      totalQty = Math.max(totalQty, qty);
      totalParentSheets = Math.max(totalParentSheets, parentSheets);
      const printLabel = colors === 4
        ? ('Layer ' + (i+1) + ': Printing (' + parentSheets.toLocaleString() + ' sheets, 4-color' + (sidesMult===2 ? ' x2 sides' : '') + ')')
        : ('Layer ' + (i+1) + ': Printing (' + (parentSheets*cutsPerSheet).toLocaleString() + ' impressions, ' + colors + '-color' + (sidesMult===2 ? ' x2 sides' : '') + ')');
      breakdown.push(
        { label: 'Layer ' + (i+1) + ': Paper (' + parentSheets.toLocaleString() + ' sheets x Rs.' + paperRate.toFixed(2) + ')', amount: paperCost },
        { label: printLabel, amount: printCost },
        { label: 'Layer ' + (i+1) + ': Plates (' + (colors * sidesMult) + ' plate' + (colors*sidesMult>1?'s':'') + ')', amount: plateCost },
      );
    }

    if (lam && lam !== 'none') {
      const lc = this.getLamCost(rates, lam, mainPsize, totalParentSheets);
      subtotal += lc;
      breakdown.push({ label: 'Lamination (' + lam + ', ' + totalParentSheets.toLocaleString() + ' sheets)', amount: lc });
    }
    if (pads > 0 && padSize) {
      const pr = this.getPadRate(rates, padSize);
      const pc = pr * pads;
      subtotal += pc;
      breakdown.push({ label: 'Pad Binding (' + pads + ' pads x Rs.' + pr + '/pad)', amount: pc });
    }
    if (punch) {
      const pu = (rates.punch ?? DEFAULT_RATES.punch) * totalQty;
      subtotal += pu;
      breakdown.push({ label: 'File Punching (' + totalQty.toLocaleString() + ' pcs)', amount: pu });
    }
    if (envelope && envelope !== 'none') {
      const er = rates.envelope?.[envelope] ?? DEFAULT_RATES.envelope[envelope] ?? 3;
      const ec = er * totalQty;
      subtotal += ec;
      breakdown.push({ label: 'Envelope Making (' + envelope + ', ' + totalQty.toLocaleString() + ' pcs)', amount: ec });
    }
    const total = subtotal * multiplier;
    return { breakdown, subtotal, total, perPiece: totalQty > 0 ? total / totalQty : 0, totalQty, multiplier, customer, job };
  }

  async calcReverse(dto: any) {
    const rates = await this.getRates();
    const { product, qty, sheetsPerUnit = 100, fsize, paper, parent: psize = '1823', colors, sides, lam = 'none', multiplier: dtoMult, customer, envelopeWindow = false } = dto;

    if (product === 'sticker') {
      const stickerQty = Number(qty ?? 0);
      const width = Number(dto.stickerW ?? 0);
      const height = Number(dto.stickerH ?? 0);
      const selectedType = dto.stickerType === 'nontearable' ? 'nontearable' : 'plain';
      const stickerRates = rates.sticker ?? DEFAULT_RATES.sticker;
      const halfCut = dto.halfCut === true;
      const halfCutPct = Number(stickerRates.halfCutPct ?? DEFAULT_RATES.sticker.halfCutPct ?? 30);
      const fit = width > 0 && height > 0 ? this.getStickerSheetFit(width, height) : { perSheet: 0, columns: 0, rows: 0, rotated: false };
      const sheetsNeeded = fit.perSheet > 0 ? Math.ceil(stickerQty / fit.perSheet) : 0;
      const plainSheetRate = 13;
      const nonTearableSheetRate = 19;
      const plainBaseSubtotal = sheetsNeeded * plainSheetRate;
      const nonTearableBaseSubtotal = sheetsNeeded * nonTearableSheetRate;
      const plainHalfCutCost = halfCut ? plainBaseSubtotal * halfCutPct / 100 : 0;
      const nonTearableHalfCutCost = halfCut ? nonTearableBaseSubtotal * halfCutPct / 100 : 0;
      const plainSubtotal = plainBaseSubtotal + plainHalfCutCost;
      const nonTearableSubtotal = nonTearableBaseSubtotal + nonTearableHalfCutCost;
      const subtotal = selectedType === 'nontearable' ? nonTearableSubtotal : plainSubtotal;
      const multiplier = this.getStickerMultiplier(subtotal);
      const total = subtotal * multiplier;
      const area = width * height;
      const clubbingBlock = width > 0 && height > 0 ? this.getStickerClubbingBlock(width, height, stickerQty) : null;
      // Always print 1000 sheets per clubbing run; stickers/sheet = ceil(qty/1000)
      const clubbingSets = 1000;
      const clubbingEligible = stickerQty >= 1000 && !!clubbingBlock && clubbingBlock.area >= 6;

      // ── Die Cutting (shaped stickers) ────────────────────────────────────
      // Only offered on the Clubbing (vendor) route, not in-house plain or
      // non tearable sticker — custom die-cut shapes aren't produced through
      // the in-house sheet printing path. A punching die is needed to cut a
      // custom shape out of the clubbing block, and it must be 1" larger
      // than the block on every side so there's room to punch cleanly, so:
      // die W/H = block W/H + 2". Die is a one-time tool cost (area × ₹/sq
      // in); punching is a running cost per 1000 sheets fed through it.
      const dieCutting = dto.dieCutting === true;
      const dieRatePerSqIn = Number(stickerRates.dieRatePerSqIn ?? DEFAULT_RATES.sticker.dieRatePerSqIn ?? 6);
      const punchingRatePer1000 = Number(stickerRates.punchingRatePer1000 ?? DEFAULT_RATES.sticker.punchingRatePer1000 ?? 500);
      const dieBlockW = clubbingBlock ? clubbingBlock.columns * width : 0;
      const dieBlockH = clubbingBlock ? clubbingBlock.rows * height : 0;
      const dieW = dieBlockW > 0 ? dieBlockW + 2 : 0;
      const dieH = dieBlockH > 0 ? dieBlockH + 2 : 0;
      const dieArea = dieW * dieH;
      const dieCuttingApplies = dieCutting && clubbingEligible;
      const dieCost = dieCuttingApplies ? dieArea * dieRatePerSqIn : 0;
      const punchingCost = dieCuttingApplies ? clubbingSets / 1000 * punchingRatePer1000 : 0;
      const dieCuttingCost = dieCost + punchingCost;

      const clubbingBaseCost = clubbingEligible && clubbingBlock ? (clubbingBlock.area * clubbingSets * 0.035) + 150 : null;
      const clubbingCost = clubbingBaseCost != null ? clubbingBaseCost + dieCuttingCost : null;
      const clubbingMultiplier = clubbingCost != null ? this.getStickerMultiplier(clubbingCost) : null;
      const clubbingTotal = clubbingCost != null && clubbingMultiplier != null ? clubbingCost * clubbingMultiplier : null;
      const breakdown: any[] = [
        { label: `Sticker layout (${fit.columns} x ${fit.rows} = ${fit.perSheet}/sheet on 11.5x17.5 usable area${fit.rotated ? ', rotated' : ''})`, amount: 0 },
        { label: `Plain sticker (${sheetsNeeded.toLocaleString()} sheets x Rs.${plainSheetRate})`, amount: plainBaseSubtotal },
        { label: `Non tearable sticker (${sheetsNeeded.toLocaleString()} sheets x Rs.${nonTearableSheetRate})`, amount: nonTearableBaseSubtotal },
      ];
      if (halfCut) {
        breakdown.push({ label: `Half Cutting (${halfCutPct}% on ${selectedType === 'nontearable' ? 'non tearable' : 'plain'} sticker cost)`, amount: selectedType === 'nontearable' ? nonTearableHalfCutCost : plainHalfCutCost });
      }
      if (clubbingBaseCost != null) {
        const blockLabel = clubbingBlock && clubbingBlock.stickers > 1
          ? `${clubbingBlock.columns} x ${clubbingBlock.rows} = ${clubbingBlock.stickers} stickers/block, ${clubbingSets.toLocaleString()} blocks`
          : `${stickerQty.toLocaleString()} stickers`;
        breakdown.push({ label: `Clubbing plain sticker (${blockLabel}, ${clubbingBlock?.area.toFixed(2)} sq in x Rs.0.035 + Rs.150)`, amount: clubbingBaseCost });
      }
      if (dieCuttingApplies) {
        breakdown.push({ label: `Die Cutting — die, clubbing only (${dieW.toFixed(1)}x${dieH.toFixed(1)} in = ${dieArea.toFixed(1)} sq in x Rs.${dieRatePerSqIn})`, amount: dieCost });
        breakdown.push({ label: `Die Cutting — punching (${clubbingSets.toLocaleString()} sheets @ Rs.${punchingRatePer1000}/1000 sheets)`, amount: punchingCost });
      } else if (dieCutting) {
        breakdown.push({ label: `Die Cutting requested but not applied — needs Clubbing eligibility (min 1000 pcs, 6 sq in block)`, amount: 0 });
      }
      return {
        breakdown,
        subtotal,
        total,
        perPiece: stickerQty > 0 ? total / stickerQty : 0,
        totalPieces: stickerQty,
        description: `${stickerQty.toLocaleString()} stickers | ${width}x${height} inch | ${fit.perSheet}/sheet | ${sheetsNeeded.toLocaleString()} sheets | ${selectedType === 'nontearable' ? 'non tearable' : 'plain'}${halfCut ? ' | half cutting' : ''}${dieCuttingApplies ? ' | die cutting (clubbing)' : ''}`,
        multiplier,
        customer,
        sticker: {
          width,
          height,
          area,
          usableSheet: '11.5x17.5',
          openSheet: '12x18',
          columns: fit.columns,
          rows: fit.rows,
          rotated: fit.rotated,
          stickersPerSheet: fit.perSheet,
          sheetsNeeded,
          selectedType,
          halfCut,
          halfCutPct,
          dieCutting,
          dieCuttingApplies,
          dieRatePerSqIn,
          punchingRatePer1000,
          dieBlockW,
          dieBlockH,
          dieW,
          dieH,
          dieArea,
          dieCost,
          punchingCost,
          dieCuttingCost,
          plainBaseSubtotal,
          nonTearableBaseSubtotal,
          plainHalfCutCost,
          nonTearableHalfCutCost,
          plainSheetRate,
          nonTearableSheetRate,
          plainSubtotal,
          nonTearableSubtotal,
          plainMultiplier: this.getStickerMultiplier(plainSubtotal),
          nonTearableMultiplier: this.getStickerMultiplier(nonTearableSubtotal),
          plainTotal: plainSubtotal * this.getStickerMultiplier(plainSubtotal),
          nonTearableTotal: nonTearableSubtotal * this.getStickerMultiplier(nonTearableSubtotal),
          clubbingEligible,
          clubbingBlockColumns: clubbingBlock?.columns ?? 0,
          clubbingBlockRows: clubbingBlock?.rows ?? 0,
          clubbingStickersPerBlock: clubbingBlock?.stickers ?? 0,
          clubbingBlockArea: clubbingBlock?.area ?? 0,
          clubbingSets,
          clubbingMultiplier,
          clubbingCost,
          clubbingTotal,
          clubbingUnavailableReason: clubbingEligible ? null : (stickerQty < 1000 ? 'Minimum 1000 pcs required for clubbing' : 'Minimum 6 sq inch sticker block area required for clubbing'),
        },
      };
    }

    if (product === 'ppfile') {
      const pp = rates.ppFiles ?? DEFAULT_RATES.ppFiles;
      const fileQty = Number(qty ?? 0);
      const creasing = dto.creasing === 'double' ? 'double' : 'single';
      const printSide = dto.printSide === 'double' || sides === 'double' ? 'double' : 'single';
      const micron = Number(dto.micron) === 350 ? 350 : 300;
      const pocketSides = dto.pocketSides === 2 ? 2 : dto.pocketSides === 1 ? 1 : 0;
      const clipSelected = dto.clip !== false;
      const { rate: baseRate, tier } = this.getPpFileBaseRate(rates, creasing, printSide, micron, fileQty);
      const clipRate = clipSelected ? Number(pp.clip ?? DEFAULT_RATES.ppFiles.clip) : 0;
      const pocketRate = pocketSides * Number(pp.pocketOneSide ?? DEFAULT_RATES.ppFiles.pocketOneSide);
      const perFileBeforeGst = baseRate + clipRate + pocketRate;
      const baseCost = baseRate * fileQty;
      const clipCost = clipRate * fileQty;
      const pocketCost = pocketRate * fileQty;
      const beforeGst = perFileBeforeGst * fileQty;
      const gstPct = Number(pp.gstPct ?? DEFAULT_RATES.ppFiles.gstPct);
      const gstAmount = beforeGst * gstPct / 100;
      const subtotal = beforeGst + gstAmount;
      const multiplier = dtoMult ?? pp.multiplier ?? DEFAULT_RATES.ppFiles.multiplier;
      const total = subtotal * multiplier;
      const breakdown: any[] = [
        { label: `PP File Base (${micron} micron, ${printSide === 'double' ? 'double side' : 'single side'}, ${creasing === 'double' ? 'double creasing' : 'single creasing'}, tier ${tier})`, amount: baseCost },
      ];
      if (clipSelected) breakdown.push({ label: `Clip (${fileQty.toLocaleString()} files x Rs.${clipRate.toFixed(2)})`, amount: clipCost });
      if (pocketSides > 0) breakdown.push({ label: `Pocket (${pocketSides === 2 ? '2 side' : '1 side'}, ${fileQty.toLocaleString()} files x Rs.${pocketRate.toFixed(2)})`, amount: pocketCost });
      breakdown.push({ label: `GST (${gstPct}%)`, amount: gstAmount });
      return {
        breakdown,
        subtotal,
        total,
        perPiece: fileQty > 0 ? total / fileQty : 0,
        totalPieces: fileQty,
        description: `${fileQty.toLocaleString()} PP files | ${micron} micron | ${printSide === 'double' ? 'double side' : 'single side'} | ${creasing === 'double' ? 'double creasing' : 'single creasing'} | ${clipSelected ? 'clip' : 'no clip'} | ${pocketSides === 0 ? 'no pocket' : pocketSides + ' side pocket'}`,
        multiplier,
        customer,
      };
    }

    if (product === 'diagnosticbag') {
      const bag = rates.diagnosticBags ?? DEFAULT_RATES.diagnosticBags;
      const bagQty = Number(qty ?? 0);
      const { rate: baseRate, tier, key } = this.getDiagnosticBagBaseRate(rates, dto.bagSize, bagQty);
      const baseCost = baseRate * bagQty;
      const gstPct = Number(bag.gstPct ?? DEFAULT_RATES.diagnosticBags.gstPct);
      const gstAmount = baseCost * gstPct / 100;
      const subtotal = baseCost + gstAmount;
      const multiplier = dtoMult ?? bag.multiplier ?? DEFAULT_RATES.diagnosticBags.multiplier;
      const total = subtotal * multiplier;
      const bagLabel = key === 'big' ? 'CT Scan Bag (16x21 inch)' : 'X-ray Bag (10.5x16 inch)';
      const breakdown: any[] = [
        { label: `${bagLabel} Base (tier ${tier}, Rs.${baseRate}/bag)`, amount: baseCost },
        { label: `GST (${gstPct}%)`, amount: gstAmount },
      ];
      return {
        breakdown,
        subtotal,
        total,
        perPiece: bagQty > 0 ? total / bagQty : 0,
        totalPieces: bagQty,
        description: `${bagQty.toLocaleString()} ${bagLabel}s | tier ${tier}`,
        multiplier,
        customer,
      };
    }

    if (product === 'nonwovenbag') {
      const nw = rates.nonWovenBag ?? DEFAULT_RATES.nonWovenBag;
      const bagQty = Number(qty ?? 0);

      const size = String(dto.nonWovenSize ?? '12x15');
      const printMode = dto.nonWovenPrintMode === 'multicolor' ? 'multicolor' : 'single';
      // Plate Design: "1" = both sides share the same design; "2" =
      // different design front & back, which needs a second plate made —
      // a flat one-time charge, not per-bag.
      const plates = dto.nonWovenPlateMode === '2' ? 2 : 1;
      const defaultPlateRate = printMode === 'multicolor'
        ? (nw.multicolorPerPlateRate ?? DEFAULT_RATES.nonWovenBag.multicolorPerPlateRate)
        : (nw.perPlateRate ?? DEFAULT_RATES.nonWovenBag.perPlateRate);
      const perPlateRate = Number(dto.nonWovenPerPlateRate ?? defaultPlateRate);
      const plateCost = plates * perPlateRate;

      // Weight-based fabric costing: how many bags of this size make up 1kg
      // (bagsPerKg, set per size in the Rates tab) tells us the total fabric
      // weight needed for the requested quantity, which is then priced at a
      // single ₹/kg rate — plus a flat printing charge per bag and the plate
      // cost above, all before the usual multiplier.
      const bagsPerKg = Number(nw.bagsPerKg?.[size] ?? DEFAULT_RATES.nonWovenBag.bagsPerKg[size] ?? DEFAULT_RATES.nonWovenBag.bagsPerKg['12x15']);
      const ratePerKg = Number(dto.nonWovenRatePerKg ?? nw.ratePerKg ?? DEFAULT_RATES.nonWovenBag.ratePerKg);
      const printingCostPerBag = Number(dto.nonWovenPrintingCostPerBag ?? nw.printingCostPerBag ?? DEFAULT_RATES.nonWovenBag.printingCostPerBag);
      const totalKg = bagsPerKg > 0 ? bagQty / bagsPerKg : 0;
      const fabricCost = totalKg * ratePerKg;
      const printingCost = printingCostPerBag * bagQty;

      const extraRate = printMode === 'multicolor' ? Number(nw.multicolorExtraPerBag ?? DEFAULT_RATES.nonWovenBag.multicolorExtraPerBag) : 0;
      const extraCost = extraRate * bagQty;
      const subtotal = fabricCost + printingCost + extraCost + plateCost;
      const multiplier = dtoMult ?? nw.multiplier ?? DEFAULT_RATES.nonWovenBag.multiplier;
      const total = subtotal * multiplier;
      const breakdown: any[] = [
        { label: `Fabric (${bagQty.toLocaleString()} bags ÷ ${bagsPerKg}/kg = ${totalKg.toFixed(2)} kg x Rs.${ratePerKg}/kg)`, amount: fabricCost },
        { label: `Printing (Rs.${printingCostPerBag}/bag x ${bagQty.toLocaleString()} bags)`, amount: printingCost },
      ];
      if (extraCost > 0) breakdown.push({ label: `Multicolor extra (${bagQty.toLocaleString()} bags x Rs.${extraRate})`, amount: extraCost });
      breakdown.push({ label: `Plate${plates > 1 ? 's' : ''} (${plates} x Rs.${perPlateRate}) — ${plates > 1 ? 'both sides different design' : 'both sides same design'}`, amount: plateCost });
      return {
        breakdown,
        subtotal,
        total,
        perPiece: bagQty > 0 ? total / bagQty : 0,
        totalPieces: bagQty,
        description: `${bagQty.toLocaleString()} non woven bags | ${size} | ${totalKg.toFixed(2)}kg @ Rs.${ratePerKg}/kg | ${plates} plate${plates > 1 ? 's' : ''}`,
        multiplier,
        customer,
      };
    }

    if (product === 'handlebag') {
      const hb = rates.handleBag ?? DEFAULT_RATES.handleBag;
      const hbDefaults = DEFAULT_RATES.handleBag;
      const bagQty = Number(qty ?? 0);
      const length = Number(dto.handleBagLength ?? 0);
      const height = Number(dto.handleBagHeight ?? 0);
      const gusset = Number(dto.handleBagGusset ?? 0);
      const gsm = Number(dto.handleBagGsm ?? 0);
      const wallGsm = Number(dto.handleBagWallGsm ?? 0);
      const printMode = dto.handleBagPrintMode === 'multicolor' ? 'multicolor' : 'single';

      if (!(bagQty > 0)) throw new BadRequestException('Quantity must be greater than 0');
      if (!(length > 0) || !(height > 0)) throw new BadRequestException('Length and Height must be greater than 0');
      if (!(gsm > 0)) throw new BadRequestException('GSM must be greater than 0');
      if (!(gusset >= 0)) throw new BadRequestException('Gazzette cannot be negative');
      if (gusset > 0 && !(wallGsm > 0)) throw new BadRequestException('Wall GSM must be greater than 0 when Gazzette is given');

      const fabricRate = Number(hb.fabricRatePerKg ?? hbDefaults.fabricRatePerKg);
      const divisor = Number(hb.sqInchGsmPerKg ?? hbDefaults.sqInchGsmPerKg);
      const seam = Number(hb.gussetSeamAllowanceInch ?? hbDefaults.gussetSeamAllowanceInch);

      // Per-bag costs (₹). Fabric: 2 × L × H × GSM × rate ÷ 1550000.
      // Gazzette strip: (wall + 1.5) wide, running down both sides and across
      // the bottom (2H + L) long, at the wall fabric's GSM.
      const fabricPerBag = 2 * length * height * gsm * fabricRate / divisor;
      const gussetStripLength = 2 * height + length;
      const gussetPerBag = gusset > 0 ? (gusset + seam) * gussetStripLength * wallGsm * fabricRate / divisor : 0;
      const stitchingPerBag = Number(gusset > 0
        ? (hb.stitchingWithGusset ?? hbDefaults.stitchingWithGusset)
        : (hb.stitchingWithoutGusset ?? hbDefaults.stitchingWithoutGusset));
      const slab = bagQty >= 5000 ? 5000 : bagQty >= 2000 ? 2000 : 1000;
      const printingPerBag = Number(hb.printingPerBag?.[printMode]?.[slab] ?? hbDefaults.printingPerBag[printMode][slab]);
      const cuttingPerBag = Number(hb.cuttingWastagePerBag ?? hbDefaults.cuttingWastagePerBag);
      const costPerBag = fabricPerBag + gussetPerBag + stitchingPerBag + printingPerBag + cuttingPerBag;

      const subtotal = costPerBag * bagQty;
      const multiplier = dtoMult ?? hb.multiplier ?? hbDefaults.multiplier;
      const total = subtotal * multiplier;
      const q = bagQty.toLocaleString();
      const slabLabel = slab === 5000 ? '5000+' : slab === 2000 ? '2000-4999' : 'up to 1999';
      const breakdown: any[] = [
        { label: `2 sides fabric (2 x ${length} x ${height} in x ${gsm} GSM x Rs.${fabricRate}/kg ÷ ${divisor} = Rs.${fabricPerBag.toFixed(4)}/bag x ${q})`, amount: fabricPerBag * bagQty },
      ];
      if (gusset > 0) {
        breakdown.push({ label: `Gazzette ((${gusset} + ${seam}) x (2 x ${height} + ${length}) in x ${wallGsm} GSM x Rs.${fabricRate}/kg ÷ ${divisor} = Rs.${gussetPerBag.toFixed(4)}/bag x ${q})`, amount: gussetPerBag * bagQty });
      }
      breakdown.push(
        { label: `Stitching (${gusset > 0 ? 'with' : 'without'} gazzette, Rs.${stitchingPerBag}/bag x ${q})`, amount: stitchingPerBag * bagQty },
        { label: `Printing (${printMode === 'multicolor' ? 'Multicolor' : 'Single Color'}, ${slabLabel} bags, Rs.${printingPerBag}/bag x ${q})`, amount: printingPerBag * bagQty },
        { label: `Cutting & Wastage (Rs.${cuttingPerBag}/bag x ${q})`, amount: cuttingPerBag * bagQty },
      );
      return {
        breakdown,
        subtotal,
        total,
        perPiece: total / bagQty,
        totalPieces: bagQty,
        description: `${q} handle bags | ${length}x${height} in | gazzette ${gusset} in | ${gsm} GSM${gusset > 0 ? ` | wall ${wallGsm} GSM` : ''} | ${printMode === 'multicolor' ? 'multicolor' : 'single color'} | cost Rs.${costPerBag.toFixed(2)}/bag`,
        multiplier,
        customer,
      };
    }

    if (product === 'dotmatrixbill') {
      const dm =rates.dotMatrixBill ?? DEFAULT_RATES.dotMatrixBill;
      const billQty = Number(qty ?? 0);
      const size = String(dto.dotMatrixSize ?? '4x6');
      const gsm = Number(dto.dotMatrixGsm ?? 70);
      const carbonCopy = dto.carbonCopy === true;
      const baseRate = Number(dm.sizeRates?.[size]?.[gsm] ?? DEFAULT_RATES.dotMatrixBill.sizeRates[size]?.[gsm] ?? 20);
      const carbonRate = carbonCopy ? Number(dm.carbonCopyExtraPerBook ?? DEFAULT_RATES.dotMatrixBill.carbonCopyExtraPerBook) : 0;
      const baseCost = baseRate * billQty;
      const carbonCost = carbonRate * billQty;
      const subtotal = baseCost + carbonCost;
      const multiplier = dtoMult ?? dm.multiplier ?? DEFAULT_RATES.dotMatrixBill.multiplier;
      const total = subtotal * multiplier;
      const breakdown: any[] = [
        { label: `Dot matrix bill ${size}, ${gsm} GSM (${billQty.toLocaleString()} books x Rs.${baseRate})`, amount: baseCost },
      ];
      if (carbonCopy) breakdown.push({ label: `Carbon copy extra (${billQty.toLocaleString()} books x Rs.${carbonRate})`, amount: carbonCost });
      return {
        breakdown,
        subtotal,
        total,
        perPiece: billQty > 0 ? total / billQty : 0,
        totalPieces: billQty,
        description: `${billQty.toLocaleString()} dot matrix bills | ${size} | ${gsm} GSM | ${carbonCopy ? 'carbon copy' : 'without carbon copy'}`,
        multiplier,
        customer,
      };
    }

    if (product === 'keychain') {
      const kc = rates.keychain ?? DEFAULT_RATES.keychain;
      const keychainQty = Number(qty ?? 0);
      const number = String(dto.keychainNumber ?? 'KC1');
      const baseRate = Number(kc.numberRates?.[number] ?? DEFAULT_RATES.keychain.numberRates[number] ?? 12);
      const subtotal = baseRate * keychainQty;
      const multiplier = dtoMult ?? kc.multiplier ?? DEFAULT_RATES.keychain.multiplier;
      const total = subtotal * multiplier;
      return {
        breakdown: [{ label: `Keychain ${number} (${keychainQty.toLocaleString()} pcs x Rs.${baseRate})`, amount: subtotal }],
        subtotal,
        total,
        perPiece: keychainQty > 0 ? total / keychainQty : 0,
        totalPieces: keychainQty,
        description: `${keychainQty.toLocaleString()} keychains | ${number}`,
        multiplier,
        customer,
      };
    }

    if (product === 'pen') {
      const pen = rates.pen ?? DEFAULT_RATES.pen;
      const penQty = Number(qty ?? 0);
      const number = String(dto.penNumber ?? 'PEN1');
      const baseRate = Number(pen.numberRates?.[number] ?? DEFAULT_RATES.pen.numberRates[number] ?? 6);
      const subtotal = baseRate * penQty;
      const multiplier = dtoMult ?? pen.multiplier ?? DEFAULT_RATES.pen.multiplier;
      const total = subtotal * multiplier;
      return {
        breakdown: [{ label: `Pen ${number} (${penQty.toLocaleString()} pcs x Rs.${baseRate})`, amount: subtotal }],
        subtotal,
        total,
        perPiece: penQty > 0 ? total / penQty : 0,
        totalPieces: penQty,
        description: `${penQty.toLocaleString()} pens | ${number}`,
        multiplier,
        customer,
      };
    }

    const multiplier = dtoMult ?? rates.multiplier ?? DEFAULT_RATES.multiplier;
    const cutsPerSheet = CUTS[psize]?.[fsize] ?? 4;
    const sidesMult = sides === 'double' ? 2 : 1;

    let totalPieces: number;
    let description: string;
    if (product === 'pads' || product === 'billbook') {
      totalPieces = qty * sheetsPerUnit;
      description = qty + ' ' + (product === 'billbook' ? 'bill books' : 'pads') + ' x ' + sheetsPerUnit + ' sheets = ' + totalPieces.toLocaleString() + ' total pieces';
    } else {
      totalPieces = qty;
      description = qty.toLocaleString() + ' ' + product;
    }

    const totalParentSheets = Math.ceil(totalPieces / cutsPerSheet);

    const paperRate  = this.getPaperRatePerSheet(rates, psize, paper);
    const paperCost  = totalParentSheets * paperRate;
    const printCost  = this.getPrintCost(rates, colors, totalParentSheets, cutsPerSheet, sidesMult);
    const plateCost  = this.getPlateCost(rates, colors, sidesMult);

    const printLabel = colors === 4
      ? ('Printing (' + totalParentSheets.toLocaleString() + ' sheets, 4-color' + (sidesMult===2 ? ' x2 sides' : '') + ')')
      : ('Printing (' + (totalParentSheets * cutsPerSheet).toLocaleString() + ' impressions, ' + colors + '-color' + (sidesMult===2 ? ' x2 sides' : '') + ')');

    let subtotal = paperCost + printCost + plateCost;
    const breakdown: any[] = [
      { label: 'Paper (' + totalParentSheets.toLocaleString() + ' parent sheets x Rs.' + paperRate.toFixed(2) + ')', amount: paperCost },
      { label: printLabel, amount: printCost },
      { label: 'Plates (' + (colors * sidesMult) + ' plate' + (colors*sidesMult>1?'s':'') + ')', amount: plateCost },
    ];

    if (product === 'pads') {
      const pr = this.getPadRate(rates, fsize);
      const pc = pr * qty;
      subtotal += pc;
      breakdown.push({ label: 'Pad Binding (' + qty + ' pads x Rs.' + pr + '/pad)', amount: pc });
    }
    if (product === 'billbook') {
      const br = this.getBillBookRate(rates, fsize);
      const bc = br * qty;
      subtotal += bc;
      breakdown.push({ label: 'Bill Book Binding (' + qty + ' books x Rs.' + br + '/book)', amount: bc });
    }
    if (product === 'file') {
      const pu = (rates.punch ?? DEFAULT_RATES.punch) * qty;
      subtotal += pu;
      breakdown.push({ label: 'File Punching (' + qty.toLocaleString() + ' pcs)', amount: pu });

      const clipSelected = dto.clip !== false;
      if (clipSelected) {
        const clipRate = Number(rates.fileClip ?? DEFAULT_RATES.fileClip ?? 1);
        const clipCost = clipRate * qty;
        subtotal += clipCost;
        breakdown.push({ label: 'File Clip (' + qty.toLocaleString() + ' pcs x Rs.' + clipRate + ')', amount: clipCost });
      }

      const pocketSelected = dto.filePocket === true;
      if (pocketSelected) {
        const pocketRate = Number(rates.filePocket ?? DEFAULT_RATES.filePocket ?? 2.2);
        const pocketCost = pocketRate * qty;
        subtotal += pocketCost;
        breakdown.push({ label: 'Pocket (' + qty.toLocaleString() + ' pcs x Rs.' + pocketRate + ')', amount: pocketCost });
      }
    }
    if (product === 'envelope') {
      const ec = (rates.envelope?.[fsize] ?? DEFAULT_RATES.envelope[fsize] ?? 3) * qty;
      subtotal += ec;
      breakdown.push({ label: 'Envelope Making (' + qty.toLocaleString() + ' pcs)', amount: ec });
      if (envelopeWindow) {
        const windowRate = rates.envelopeWindow ?? DEFAULT_RATES.envelopeWindow ?? 0.20;
        const wc = windowRate * qty;
        subtotal += wc;
        breakdown.push({ label: 'Window Cutting (' + qty.toLocaleString() + ' pcs)', amount: wc });
      }
    }
    if (lam && lam !== 'none') {
      const lc = this.getLamCost(rates, lam, psize, totalParentSheets);
      subtotal += lc;
      breakdown.push({ label: 'Lamination (' + lam + ', ' + totalParentSheets.toLocaleString() + ' sheets)', amount: lc });
    }

    // Clubbing comparison (4-color only)
    let clubbing: any = null;
    if (colors === 4) {
      try {
        const cRates = await this.getClubbingRates();
        const vendorCost = this.getClubbingCost(cRates, fsize, sides, totalPieces);
        if (vendorCost !== null) {
          // Vendor cost = paper+print+plate absorbed; additional costs computed below
          let ourSubtotal = subtotal;
          const total = ourSubtotal * multiplier;
          clubbing = {
            vendorName: cRates.vendorName ?? 'Vendor',
            vendorCost,
            vendorTotal: vendorCost * multiplier,
            ourCost: ourSubtotal,
            ourTotal: total,
            winner: vendorCost < ourSubtotal ? 'vendor' : 'ours',
          };
        }
      } catch {}
    }

    const total = subtotal * multiplier;
    return { breakdown, subtotal, total, perPiece: qty > 0 ? total / qty : 0, totalPieces, totalParentSheets, cutsPerSheet, description, multiplier, customer, clubbing };
  }

  // ── Calendar Cost Calculator ─────────────────────────────────────────────
  // Cost = Paper + Plate + Printing + Tinning only. Every rate comes from the
  // master rates; a missing/zero rate is an error, never a silent ₹0.

  // Single source of truth for the calculator's dropdowns: sizes (with their
  // printing sheet) and the Maplitho/Art papers that have a rate for that
  // sheet. Returns names only — no rates — so it is safe for every role.
  async getCalendarOptions() {
    const rates = await this.getRates();
    const paperKeys = Object.keys(rates.paper ?? {}).filter(k => Number(rates.paper[k]) > 0);
    const gsm = (t: string) => parseFloat(t.replace(/^\D+/, ''));
    const sizes = Object.entries(CALENDAR_SIZES).map(([value, cfg]) => {
      const seen = new Set<string>();
      const papers = paperKeys
        .filter(k => k.startsWith(cfg.parent + '-'))
        .map(k => k.slice(cfg.parent.length + 1))
        .filter(t => CALENDAR_PAPER_TYPE.test(t) && !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
        .sort((a, b) => a.replace(/\d.*/, '').toLowerCase().localeCompare(b.replace(/\d.*/, '').toLowerCase()) || gsm(a) - gsm(b))
        .map(t => ({ value: t, label: calendarPaperLabel(t) }));
      return { value, label: cfg.label, printingPaper: cfg.parentLabel, papers };
    });
    return {
      sizes,
      pages: (Object.keys(CALENDAR_DESIGNS) as CalendarPages[]).map(p => ({ value: p, label: `${p} Page${p === '1' ? '' : 's'}` })),
      tinning: Object.entries(CALENDAR_TINNING).map(([value, label]) => ({ value, label })),
    };
  }

  // Role-aware entry point for POST /rate-calculator/calendar. Roles that may
  // not see costs get production quantities + the quote price only, and can't
  // override the multiplier (otherwise ×1 would reveal the exact cost).
  async calcCalendar(dto: any, role?: string) {
    const showCosts = canSeeRateCosts(role);
    const full = await this.computeCalendar(dto, showCosts);
    if (showCosts) return { ...full, costsVisible: true };
    const c = full.calendar;
    return {
      breakdown: [],
      total: full.total,
      perPiece: full.perPiece,
      totalPieces: full.totalPieces,
      customer: full.customer,
      description: full.description,
      costsVisible: false,
      calendar: {
        qty: c.qty, size: c.size, sizeLabel: c.sizeLabel, printingPaper: c.printingPaper, paper: c.paper, paperLabel: c.paperLabel,
        pages: c.pages, designs: c.designs, tinning: c.tinning, tinningLabel: c.tinningLabel,
        forms: c.forms.map(f => ({ note: f.note, sheets: f.sheets, sides: f.sides, impressions: f.impressions })),
        totalSheets: c.totalSheets, printedSides: c.printedSides, plateSets: c.plateSets, colors: c.colors,
        totalImpressions: c.totalImpressions, wastagePct: c.wastagePct,
      },
    };
  }

  private async computeCalendar(dto: any, allowMultiplierOverride: boolean) {
    const rates = await this.getRates();
    const qty = Number(dto.qty);
    const size = String(dto.size ?? '');
    const pages = String(dto.pages ?? '') as CalendarPages;
    const paper = String(dto.paper ?? '').trim();
    const tinning = String(dto.tinning ?? '');

    if (!Number.isInteger(qty) || qty <= 0) throw new BadRequestException('Quantity must be a whole number greater than 0');
    const sizeCfg = CALENDAR_SIZES[size];
    if (!sizeCfg) throw new BadRequestException('Select a valid calendar size');
    const forms = sizeCfg.forms[pages];
    if (!forms) throw new BadRequestException('Select 1, 3 or 6 pages');
    const paperMatch = paper.match(CALENDAR_PAPER_TYPE);
    if (!paperMatch) throw new BadRequestException('Select a Maplitho or Art paper');
    if (!CALENDAR_TINNING[tinning]) throw new BadRequestException('Select a tinning option');

    const isRate = (v: any) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
    const paperLabel = calendarPaperLabel(paper);

    // Paper keys are "<parent>-<type>"; match case-insensitively (e.g. "1823-ART90").
    const wantedKey = `${sizeCfg.parent}-${paper}`.toLowerCase();
    const paperKey = Object.keys(rates.paper ?? {}).find(k => k.toLowerCase() === wantedKey);
    const paperReamRate = paperKey ? rates.paper[paperKey] : undefined;
    if (!isRate(paperReamRate)) {
      throw new BadRequestException(`Paper rate not configured for ${sizeCfg.parentLabel.replace(' inch', '')} / ${paperLabel}. Please update the Rates module.`);
    }
    if (!isRate(rates.plate)) throw new BadRequestException('Plate rate not configured. Please update the Rates module.');
    const print4 = rates.printing?.['4color'];
    if (!isRate(print4?.first1k) || !isRate(print4?.nextK)) {
      throw new BadRequestException('Printing rate not configured for this paper size/impression quantity.');
    }
    const tinningRate = rates.calendarTinning?.[tinning];
    if (!isRate(tinningRate)) throw new BadRequestException('Tinning rate not configured. Please update the Tinning Rates in the Rates module.');
    const override = allowMultiplierOverride && dto.multiplier !== undefined && dto.multiplier !== null && dto.multiplier !== '' ? dto.multiplier : undefined;
    const multiplier = Number(override ?? rates.multiplier ?? DEFAULT_RATES.multiplier);
    if (!(multiplier > 0)) throw new BadRequestException('Multiplier must be greater than 0');

    // 1) Imposition → physical sheets, printed sides, impressions per form.
    const paperRatePerSheet = Number(paperReamRate) / 500;
    const formRows = forms.map(f => {
      const sheets = Math.ceil(qty * f.sheetsPerCalendar);
      // Existing 4-colour slab, charged once per printed side of this run.
      const printCost = this.getPrintCost(rates, CALENDAR_COLORS, sheets, 1, f.sides);
      return { note: f.note, sheets, sides: f.sides, impressions: sheets * f.sides, printCost };
    });
    const totalSheets = formRows.reduce((s, f) => s + f.sheets, 0);
    const printedSides = formRows.reduce((s, f) => s + f.sides, 0);
    const totalImpressions = formRows.reduce((s, f) => s + f.impressions, 0);

    // 2) Costs.
    const paperCost = totalSheets * paperRatePerSheet;
    const plateRate = Number(rates.plate);
    const plateSetRate = CALENDAR_COLORS * plateRate;
    const plateCost = this.getPlateCost(rates, CALENDAR_COLORS, printedSides); // 1 plate set per printed side
    const printingCost = formRows.reduce((s, f) => s + f.printCost, 0);
    const tinningCost = qty * Number(tinningRate); // per finished calendar, never per sheet
    const subtotal = paperCost + plateCost + printingCost + tinningCost;
    const total = subtotal * multiplier;

    const q = qty.toLocaleString('en-IN');
    const breakdown = [
      { label: `Paper (${totalSheets.toLocaleString('en-IN')} sheets x Rs.${paperRatePerSheet.toFixed(2)})`, amount: paperCost },
      { label: `Plates (${printedSides} printed side${printedSides > 1 ? 's' : ''} x Rs.${plateSetRate} = ${CALENDAR_COLORS} colours x Rs.${plateRate})`, amount: plateCost },
      { label: `Printing (${printedSides} printed side${printedSides > 1 ? 's' : ''}, ${totalImpressions.toLocaleString('en-IN')} impressions, 4-colour slab)`, amount: printingCost },
      { label: `Tinning ${CALENDAR_TINNING[tinning]} (${q} calendars x Rs.${Number(tinningRate)})`, amount: tinningCost },
    ];

    return {
      breakdown,
      subtotal,
      total,
      perPiece: total / qty,
      totalPieces: qty,
      multiplier,
      customer: dto.customer,
      description: `${q} calendars | ${sizeCfg.label} | ${paperLabel} | ${pages} page${pages === '1' ? '' : 's'} | Tinning ${CALENDAR_TINNING[tinning]}`,
      calendar: {
        qty,
        size,
        sizeLabel: sizeCfg.label,
        printingPaper: sizeCfg.parentLabel,
        paper: paperKey,
        paperLabel,
        pages: Number(pages),
        designs: CALENDAR_DESIGNS[pages],
        tinning,
        tinningLabel: CALENDAR_TINNING[tinning],
        forms: formRows,
        totalSheets,
        printedSides,
        plateSets: printedSides,
        colors: CALENDAR_COLORS,
        totalImpressions,
        paperReamRate: Number(paperReamRate),
        paperRatePerSheet,
        paperCost,
        plateRate,
        plateSetRate,
        plateCost,
        printFirst1k: Number(print4.first1k),
        printNextK: Number(print4.nextK),
        printingCost,
        tinningRate: Number(tinningRate),
        tinningCost,
        totalCost: subtotal,
        costPerCalendar: subtotal / qty,
        wastagePct: 0,
      },
    };
  }

  async calcSticker(dto: any) {
    const rates = await this.getRates();
    const { stickerW, stickerH, qty, cols, rows, margin: marg = 0.25, mode, halfcut,
            paperRate = 3.5, printRate = 5, hcPct = 30,
            vendorRate, transport = 100, hcPct2 = 30, multiplier: dtoMult } = dto;
    const multiplier = dtoMult ?? rates.multiplier ?? DEFAULT_RATES.multiplier;
    const sheetW = cols * stickerW + 2 * marg;
    const sheetH = rows * stickerH + 2 * marg;
    const stickersPerSheet = cols * rows;
    const sheetsNeeded = Math.ceil(qty / stickersPerSheet);
    const sheetArea = sheetW * sheetH;
    let subtotal = 0;
    const breakdown: any[] = [];
    const sr = rates.sticker ?? DEFAULT_RATES.sticker;

    if (mode === 'inhouse') {
      const pc  = sheetsNeeded * paperRate;
      const prc = sheetsNeeded * printRate;
      subtotal = pc + prc;
      breakdown.push(
        { label: 'Paper (' + sheetsNeeded + ' sheets x Rs.' + paperRate + ')', amount: pc },
        { label: 'Printing (' + sheetsNeeded + ' sheets x Rs.' + printRate + ')', amount: prc },
      );
      if (halfcut) {
        const hc = subtotal * hcPct / 100;
        subtotal += hc;
        breakdown.push({ label: 'Half Cutting (' + hcPct + '% of cost)', amount: hc });
      }
    } else {
      const vr = vendorRate ?? sr.vendorRate;
      const tr = transport ?? sr.transport;
      const printingCost = sheetArea * vr * sheetsNeeded;
      subtotal = printingCost + tr;
      breakdown.push(
        { label: 'Vendor Printing (' + sheetArea.toFixed(2) + ' sq in x Rs.' + vr + ' x ' + sheetsNeeded + ' sheets)', amount: printingCost },
        { label: 'Transport', amount: tr },
      );
      if (halfcut) {
        const hc = subtotal * (hcPct2 ?? sr.halfCutPct) / 100;
        subtotal += hc;
        breakdown.push({ label: 'Half Cutting (' + hcPct2 + '%)', amount: hc });
      }
    }
    const total = subtotal * multiplier;
    return { breakdown, subtotal, total, perSticker: qty > 0 ? total / qty : 0,
             sheetW: sheetW.toFixed(2), sheetH: sheetH.toFixed(2), stickersPerSheet, sheetsNeeded, sheetArea: sheetArea.toFixed(2), multiplier };
  }
}
