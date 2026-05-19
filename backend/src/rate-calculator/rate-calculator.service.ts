import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

const CUTS: Record<string, Record<string, number>> = {
  '1823': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 32 },
  '1925': { A4: 4, A5: 8, A6: 16, A8: 64, '1/3A4': 6, DL: 6, visiting: 40 },
};

const SHEET_AREA: Record<string, number> = {
  '1823': 18 * 23,
  '1925': 19 * 25,
};

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
  lamination: { gloss: 0.34, matt: 0.50 },
  envelope: { DL: 2.5, A4: 4, A5: 3, C4: 5 },
  sticker: { vendorRate: 0.035, minQty: 1000, transport: 100, halfCutPct: 30 },
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

@Injectable()
export class RateCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async getRates(): Promise<any> {
    try {
      const rows = await (this.prisma as any).$queryRawUnsafe(
        `SELECT value FROM "SystemConfig" WHERE key = 'rate_calculator_rates' LIMIT 1`
      );
      if (rows && rows[0]?.value) return JSON.parse(rows[0].value);
    } catch {}
    const fromFile = readRatesFile();
    if (fromFile) return fromFile;
    return DEFAULT_RATES;
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

  async calcForward(dto: any) {
    const rates = await this.getRates();
    const { layers = [], lam = 'none', padSize, pads = 0, punch, envelope, multiplier: dtoMult, customer, job } = dto;
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
        ? ('Layer ' + (i+1) + ': Printing (' + parentSheets.toLocaleString() + ' sheets, 4-color' + (sidesMult===2 ? ' x2 sides' : '') + ')')
        : ('Layer ' + (i+1) + ': Printing (' + (parentSheets*cutsPerSheet).toLocaleString() + ' impressions, ' + colors + '-color' + (sidesMult===2 ? ' x2 sides' : '') + ')');
      breakdown.push(
        { label: 'Layer ' + (i+1) + ': Paper (' + parentSheets.toLocaleString() + ' sheets x Rs.' + paperRate.toFixed(2) + ')', amount: paperCost },
        { label: printLabel, amount: printCost },
        { label: 'Layer ' + (i+1) + ': Plates (' + (colors * sidesMult) + ' plate' + (colors*sidesMult>1?'s':'') + ')', amount: plateCost },
      );
    }

    if (lam && lam !== 'none') {
      const lc = this.getLamCost(rates, lam, mainPsize, totalQty);
      subtotal += lc;
      breakdown.push({ label: 'Lamination (' + lam + ', ' + totalQty.toLocaleString() + ' sheets)', amount: lc });
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
    const { product, qty, sheetsPerUnit = 100, fsize, paper, parent: psize = '1823', colors, sides, lam = 'none', multiplier: dtoMult, customer } = dto;
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
    description += ' | ' + cutsPerSheet + ' cuts/sheet | Parent sheets needed: ' + totalParentSheets.toLocaleString();

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
    }
    if (product === 'envelope') {
      const envSize = fsize === 'DL' ? 'DL' : 'A5';
      const ec = (rates.envelope?.[envSize] ?? DEFAULT_RATES.envelope[envSize] ?? 3) * qty;
      subtotal += ec;
      breakdown.push({ label: 'Envelope Making (' + qty.toLocaleString() + ' pcs)', amount: ec });
    }
    if (lam && lam !== 'none') {
      const lc = this.getLamCost(rates, lam, psize, totalParentSheets);
      subtotal += lc;
      breakdown.push({ label: 'Lamination (' + lam + ', ' + totalParentSheets.toLocaleString() + ' sheets)', amount: lc });
    }

    const total = subtotal * multiplier;
    return { breakdown, subtotal, total, perPiece: qty > 0 ? total / qty : 0, totalPieces, totalParentSheets, cutsPerSheet, description, multiplier, customer };
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
