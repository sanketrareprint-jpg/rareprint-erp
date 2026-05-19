import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

// ─── CUTS PER PARENT SHEET ────────────────────────────────────────────────────
// How many finished pieces fit in one parent sheet
const CUTS: Record<string, Record<string, number>> = {
  '1823': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 32 },
  '1925': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 40 },
};

// Parent sheet area in sq inches (for lamination)
const SHEET_AREA: Record<string, number> = {
  '1823': 18 * 23, // 414 sq in
  '1925': 19 * 25, // 475 sq in
};

// ─── CORRECT DEFAULT MASTER RATES ────────────────────────────────────────────
const DEFAULT_RATES = {
  paper: {
    '1823-bond70':  850,
    '1823-bond80':  950,
    '1925-bond70':  950,
    '1925-bond80': 1050,
    '1823-map90':  1100,
    '1925-map90':  1200,
    '1823-map100': 1260,  // ₹1260 per ream of 500 sheets → ₹2.52/sheet
    '1925-map100': 1500,
  },
  printing: {
    // 4-Color (CMYK): per PARENT SHEET, block billing (round up to 1000)
    '4color': { first1k: 900, nextK: 300 },
    // 1-Color: per PIECE (parentSheets × cuts/sheet), flat rate per 1000 pieces
    '1color': { flat: 150 },
    // 2-Color: per PIECE, flat rate per 1000 pieces (150+150=300)
    '2color': { flat: 300 },
  },
  plate: 250,           // ₹250 per plate; 1-color=1 plate, 2-color=2, 4-color=4
  padBinding: {
    A4:      15,        // ₹15 per A4 pad
    A5:      10,
    A6:       7,
    A8:       5,
    '1/3A4':  8,
  },
  billBookBinding: {
    A4: 25,             // placeholder — edit in Master Rates
    A8: 15,             // placeholder — edit in Master Rates
  },
  punch: 2,
  lamination: {
    gloss: 0.34,        // ₹0.34 per 100 sq inch (Gloss)
    matt:  0.50,        // placeholder — edit in Master Rates
  },
  envelope: { DL: 2.5, A4: 4, A5: 3, C4: 5 },
  sticker:  { vendorRate: 0.035, minQty: 1000, transport: 100, halfCutPct: 30 },
  multiplier: 1.67,    // single multiplier applied to total cost (covers margin + GST)
};

// ─── FILE-BASED RATE PERSISTENCE ─────────────────────────────────────────────
// Used as reliable fallback when SystemConfig DB table is not yet migrated
const RATES_FILE = path.join(__dirname, '..', '..', 'data', 'rates.json');

function readRatesFile(): any | null {
  try {
    if (fs.existsSync(RATES_FILE)) {
      return JSON.parse(fs.readFileSync(RATES_FILE, 'utf8'));
    }
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

@Injectable()
export class RateCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── LOAD RATES: DB → file → defaults ──────────────────────────────────────
  async getRates(): Promise<any> {
    // 1. Try DB (SystemConfig table)
    try {
      const rows = await (this.prisma as any).$queryRawUnsafe(
        `SELECT value FROM "SystemConfig" WHERE key = 'rate_calculator_rates' LIMIT 1`
      );
      if (rows && rows[0]?.value) return JSON.parse(rows[0].value);
    } catch {}
    // 2. Try local JSON file (survives server restarts without DB migration)
    const fromFile = readRatesFile();
    if (fromFile) return fromFile;
    // 3. Fall back to compiled defaults
    return DEFAULT_RATES;
  }

  // ─── SAVE RATES: DB + file (both for reliability) ──────────────────────────
  async saveRates(rates: any): Promise<{ success: boolean }> {
    const json = JSON.stringify(rates);
    // Try DB
    try {
      await (this.prisma as any).$queryRawUnsafe(
        `INSERT INTO "SystemConfig" (key, value, "updatedAt")
         VALUES ('rate_calculator_rates', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = NOW()`,
        json
      );
    } catch {}
    // Always write to file as reliable fallback
    writeRatesFile(rates);
    return { success: true };
  }

  // ─── PRINTING COST ──────────────────────────────────────────────────────────
  // Rules:
  //   4-color  → billed per PARENT SHEET, block billing (round up to nearest 1000)
  //              ₹first1k for first 1000 sheets + ₹nextK per additional 1000 block
  //   1-color  → billed per PIECE (parentSheets × cutsPerSheet), flat ₹flat per 1000
  //   2-color  → same as 1-color but flat rate is ₹300 per 1000 pieces
  //   sidesMult = 2 for double-side, 1 for single-side
  private getPrintCost(
    rates: any,
    colors: number,
    parentSheets: number,
    cutsPerSheet: number,
    sidesMult = 1,
  ): number {
    if (colors === 4) {
      const first1k = rates.printing?.['4color']?.first1k ?? DEFAULT_RATES.printing['4color'].first1k;
      const nextK   = rates.printing?.['4color']?.nextK   ?? DEFAULT_RATES.printing['4color'].nextK;
      const base = parentSheets <= 1000
        ? first1k
        : first1k + Math.ceil((parentSheets - 1000) / 1000) * nextK;
      return base * sidesMult;
    } else {
      // 1-color or 2-color: count total pieces, flat rate
      const totalPieces = parentSheets * cutsPerSheet;
      const flat = colors === 1
        ? (rates.printing?.['1color']?.flat ?? DEFAULT_RATES.printing['1color'].flat)
        : (rates.printing?.['2color']?.flat ?? DEFAULT_RATES.printing['2color'].flat);
      const blocks = Math.max(Math.ceil(totalPieces / 1000), 1); // minimum 1 block
      return blocks * flat * sidesMult;
    }
  }

  // ─── PAPER COST ─────────────────────────────────────────────────────────────
  private getPaperRatePerSheet(rates: any, psize: string, gsm: string): number {
    const key = `${psize}-${gsm}`;
    const reamRate = rates.paper?.[key] ?? (DEFAULT_RATES.paper as any)[key] ?? 1000;
    return reamRate / 500;
  }

  // ─── PLATE COST ─────────────────────────────────────────────────────────────
  private getPlateCost(rates: any, colors: number, sidesMult: number): number {
    return colors * (rates.plate ?? DEFAULT_RATES.plate) * sidesMult;
  }

  // ─── PAD BINDING ─────────────────────────────────────────────────────────────
  private getPadRate(rates: any, size: string): number {
    return rates.padBinding?.[size] ?? (DEFAULT_RATES.padBinding as any)[size] ?? 10;
  }

  // ─── BILL BOOK BINDING ───────────────────────────────────────────────────────
  private getBillBookRate(rates: any, size: string): number {
    return rates.billBookBinding?.[size] ?? (DEFAULT_RATES.billBookBinding as any)[size] ?? 20;
  }

  // ─── LAMINATION COST (area-based) ───────────────────────────────────────────
  // Formula: (parentSheetAreaSqIn / 100) × ratePer100SqIn × sheets × sideMult
  // lamType: 'gloss-single' | 'gloss-double' | 'matt-single' | 'matt-double' | 'none'
  private getLamCost(rates: any, lamType: string, psize: string, sheets: number): number {
    if (!lamType || lamType === 'none') return 0;
    const sqIn = SHEET_AREA[psize] ?? 414;
    const parts = lamType.split('-');
    const finish  = parts[0]; // 'gloss' or 'matt'
    const sideMul = parts[1] === 'double' ? 2 : 1;
    const rateKey = finish === 'matt' ? 'matt' : 'gloss';
    const ratePer100 = rates.lamination?.[rateKey] ?? (DEFAULT_RATES.lamination as any)[rateKey] ?? 0.34;
    return (sqIn / 100) * ratePer100 * sheets * sideMul;
  }

  // ─── FORWARD CALCULATION ────────────────────────────────────────────────────
  // User enters paper specs + qty (finished pieces) for each layer
  async calcForward(dto: any) {
    const rates = await this.getRates();
    const {
      layers = [],
      lam = 'none',
      padSize, pads = 0,
      punch,
      envelope,
      multiplier: dtoMult,
      customer, job,
    } = dto;

    const multiplier = dtoMult ?? rates.multiplier ?? DEFAULT_RATES.multiplier;
    let subtotal = 0;
    const breakdown: any[] = [];
    let totalQty = 0;
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

      const printLabel = colors === 4
        ? `Layer ${i+1}: Printing (${parentSheets.toLocaleString()} sheets, 4-color${sidesMult===2?' ×2 sides':''})`
        : `Layer ${i+1}: Printing (${(parentSheets*cutsPerSheet).toLocaleString()} impressions, ${colors}-color${sidesMult===2?' ×2 sides':''})`;

      breakdown.push(
        { label: `Layer ${i+1}: Paper (${parentSheets.toLocaleString()} sheets × ₹${paperRate.toFixed(2)})`, amount: paperCost },
        { label: printLabel, amount: printCost },
        { label: `Layer ${i+1}: Plates (${colors * sidesMult} plate${colors*sidesMult>1?'s':''})`, amount: plateCost },
      );
    }

    if (lam && lam !== 'none') {
      const lc = this.getLamCost(rates, lam, mainPsize, totalQty);
      subtotal += lc;
      breakdown.push({ label: `Laminatio