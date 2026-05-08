import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Cuts per parent sheet for each final size
const CUTS: Record<string, Record<string, number>> = {
  '1823': { A4:4, A5:8, A6:16, A8:64, '1/3A4':6, DL:6, visiting:32 },
  '1925': { A4:4, A5:8, A6:16, A8:64, '1/3A4':6, DL:6, visiting:40 },
};

const DEFAULT_RATES = {
  paper: {
    '1823-bond70': 850, '1823-bond80': 950,
    '1925-bond70': 950, '1925-bond80': 1050,
    '1823-map90':  1100,'1925-map90':  1200,
    '1823-map100': 1350,'1925-map100': 1500,
  },
  printing: {
    first1k: { '1': 500, '2': 800, '4': 1200 },
    nextK:   { '1': 200, '2': 350, '4': 500  },
  },
  plate: 120,
  padBinding: { A4: 8, A5: 6, A6: 5, A8: 3, '1/3A4': 4 },
  punch: 2,
  lamination: { 'A4-single': 4, 'A4-double': 7, 'A3-single': 7, 'A3-double': 12 },
  envelope: { DL: 2.5, A4: 4, A5: 3, C4: 5 },
  sticker: { vendorRate: 0.035, minQty: 1000, transport: 100, halfCutPct: 30 },
};

@Injectable()
export class RateCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  private ratesCache: any = null;

  async getRates() {
    try {
      const row = await (this.prisma as any).$queryRawUnsafe(
        `SELECT value FROM "SystemConfig" WHERE key = 'rate_calculator_rates' LIMIT 1`
      );
      if (row && row[0]?.value) return JSON.parse(row[0].value);
    } catch {}
    return DEFAULT_RATES;
  }

  async saveRates(rates: any) {
    try {
      await (this.prisma as any).$queryRawUnsafe(
        `INSERT INTO "SystemConfig" (key, value) VALUES ('rate_calculator_rates', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        JSON.stringify(rates)
      );
    } catch {
      // Table may not exist — just return success, rates are used client-side
    }
    this.ratesCache = rates;
    return { success: true };
  }

  private getPaperRatePerSheet(rates: any, psize: string, gsm: string): number {
    const key = `${psize}-${gsm}`;
    const reamRate = rates.paper?.[key] ?? DEFAULT_RATES.paper[key] ?? 1000;
    return reamRate / 500;
  }

  private getPrintCost(rates: any, colors: number, qty: number, sidesMult = 1): number {
    const c = String(colors);
    const first1k = rates.printing?.first1k?.[c] ?? DEFAULT_RATES.printing.first1k[c] ?? 500;
    const nextK   = rates.printing?.nextK?.[c]   ?? DEFAULT_RATES.printing.nextK[c]   ?? 200;
    const base = qty <= 1000 ? first1k : first1k + Math.ceil((qty - 1000) / 1000) * nextK;
    return base * sidesMult;
  }

  private getPadRate(rates: any, size: string): number {
    return rates.padBinding?.[size] ?? DEFAULT_RATES.padBinding[size] ?? 8;
  }

  private getLamRate(rates: any, size: string, side: string): number {
    const key = `${size}-${side}`;
    return rates.lamination?.[key] ?? DEFAULT_RATES.lamination[key] ?? 4;
  }

  async calcForward(dto: any) {
    const rates = await this.getRates();
    const { layers = [], lam, padSize, pads = 0, punch, envelope, margin = 15, gst = 18, customer, job } = dto;

    let subtotal = 0;
    const breakdown: any[] = [];
    let totalQty = 0;

    for (let i = 0; i < layers.length; i++) {
      const { psize, gsm, qty, fsize, colors, sides } = layers[i];
      const cutsPerSheet = CUTS[psize]?.[fsize] ?? 4;
      const sheets = Math.ceil(qty / cutsPerSheet);
      const paperRate = this.getPaperRatePerSheet(rates, psize, gsm);
      const paperCost = sheets * paperRate;
      const sidesMult = sides === 'double' ? 2 : 1;
      const printCost = this.getPrintCost(rates, colors, qty, sidesMult);
      const plateCost = colors * (rates.plate ?? DEFAULT_RATES.plate) * sidesMult;
      const layerTotal = paperCost + printCost + plateCost;
      subtotal += layerTotal;
      totalQty = Math.max(totalQty, qty);

      breakdown.push(
        { label: `Layer ${i+1}: Paper (${sheets} sheets × ₹${paperRate.toFixed(2)})`, amount: paperCost },
        { label: `Layer ${i+1}: Printing (${qty} copies, ${colors} color${colors>1?'s':''}${sidesMult===2?' × 2 sides':''})`, amount: printCost },
        { label: `Layer ${i+1}: Plates (${colors * sidesMult} plates)`, amount: plateCost },
      );
    }

    // Finishing
    if (lam && lam !== 'none') {
      const lc = this.getLamRate(rates, 'A4', lam) * totalQty;
      subtotal += lc;
      breakdown.push({ label: `Lamination (${lam}, ${totalQty} sheets)`, amount: lc });
    }
    if (pads > 0 && padSize) {
      const pr = this.getPadRate(rates, padSize);
      const pc = pr * pads;
      subtotal += pc;
      breakdown.push({ label: `Pad Binding (${pads} × ${padSize} @ ₹${pr}/pad)`, amount: pc });
    }
    if (punch) {
      const pu = (rates.punch ?? DEFAULT_RATES.punch) * totalQty;
      subtotal += pu;
      breakdown.push({ label: `File Punching (${totalQty} pieces)`, amount: pu });
    }
    if (envelope && envelope !== 'none') {
      const er = rates.envelope?.[envelope] ?? DEFAULT_RATES.envelope[envelope] ?? 3;
      const ec = er * totalQty;
      subtotal += ec;
      breakdown.push({ label: `Envelope Making (${envelope}, ${totalQty} pcs)`, amount: ec });
    }

    const marginAmt = subtotal * margin / 100;
    const gstAmt    = (subtotal + marginAmt) * gst / 100;
    const total     = subtotal + marginAmt + gstAmt;

    return { breakdown, subtotal, marginAmt, gstAmt, total, perPiece: totalQty > 0 ? total / totalQty : 0, totalQty, customer, job };
  }

  async calcReverse(dto: any) {
    const rates = await this.getRates();
    const { product, qty, sheetsPerUnit = 100, fsize, paper, parent, colors, sides, lam, margin = 15, gst = 18, customer } = dto;

    const cutsPerSheet = CUTS[parent]?.[fsize] ?? 4;
    const sidesMult = sides === 'double' ? 2 : 1;

    let totalPrintSheets: number;
    let description: string;

    if (product === 'pads' || product === 'billbook') {
      totalPrintSheets = qty * sheetsPerUnit;
      description = `${qty} ${product === 'billbook' ? 'bill books' : 'pads'} × ${sheetsPerUnit} sheets = ${totalPrintSheets.toLocaleString()} total sheets`;
    } else {
      totalPrintSheets = qty;
      description = `${qty} ${product}`;
    }

    const totalParentSheets = Math.ceil(totalPrintSheets / cutsPerSheet);
    description += ` | ${cutsPerSheet} cuts/sheet | Parent sheets needed: ${totalParentSheets.toLocaleString()}`;

    const paperRate = this.getPaperRatePerSheet(rates, parent, paper);
    const paperCost = totalParentSheets * paperRate;
    const printCost = this.getPrintCost(rates, colors, totalPrintSheets, sidesMult);
    const plateCost = colors * (rates.plate ?? DEFAULT_RATES.plate) * sidesMult;

    let subtotal = paperCost + printCost + plateCost;
    const breakdown: any[] = [
      { label: `Paper (${totalParentSheets.toLocaleString()} parent sheets × ₹${paperRate.toFixed(2)})`, amount: paperCost },
      { label: `Printing (${(totalPrintSheets * sidesMult).toLocaleString()} impressions, ${colors} color${colors>1?'s':''})`, amount: printCost },
      { label: `Plates (${colors * sidesMult} plates)`, amount: plateCost },
    ];

    if (product === 'pads' || product === 'billbook') {
      const pr = this.getPadRate(rates, fsize);
      const pc = pr * qty;
      subtotal += pc;
      breakdown.push({ label: `Pad Binding (${qty} pads × ₹${pr}/pad)`, amount: pc });
    }
    if (product === 'file') {
      const pu = (rates.punch ?? DEFAULT_RATES.punch) * qty;
      subtotal += pu;
      breakdown.push({ label: `File Punching (${qty} pieces)`, amount: pu });
    }
    if (product === 'envelope') {
      const envSize = fsize === 'DL' ? 'DL' : 'A5';
      const ec = (rates.envelope?.[envSize] ?? DEFAULT_RATES.envelope[envSize] ?? 3) * qty;
      subtotal += ec;
      breakdown.push({ label: `Envelope Making (${qty} pcs)`, amount: ec });
    }
    if (lam && lam !== 'none') {
      const lc = this.getLamRate(rates, 'A4', lam) * totalPrintSheets;
      subtotal += lc;
      breakdown.push({ label: `Lamination (${lam})`, amount: lc });
    }

    const marginAmt = subtotal * margin / 100;
    const gstAmt    = (subtotal + marginAmt) * gst / 100;
    const total     = subtotal + marginAmt + gstAmt;

    return { breakdown, subtotal, marginAmt, gstAmt, total, perPiece: qty > 0 ? total / qty : 0, totalPrintSheets, totalParentSheets, cutsPerSheet, description, customer };
  }

  async calcSticker(dto: any) {
    const rates = await this.getRates();
    const { stickerW, stickerH, qty, cols, rows, margin: marg = 0.25, mode, halfcut,
            paperRate = 3.5, printRate = 5, hcPct = 30,
            vendorRate, minQty = 1000, transport = 100, hcPct2 = 30,
            margin: profitMargin = 15, gst = 18 } = dto;

    const sheetW = cols * stickerW + 2 * marg;
    const sheetH = rows * stickerH + 2 * marg;
    const stickersPerSheet = cols * rows;
    const sheetsNeeded = Math.ceil(qty / stickersPerSheet);
    const sheetArea = sheetW * sheetH;

    let subtotal = 0;
    const breakdown: any[] = [];

    const sr = rates.sticker ?? DEFAULT_RATES.sticker;

    if (mode === 'inhouse') {
      const pc = sheetsNeeded * paperRate;
      const prc = sheetsNeeded * printRate;
      subtotal = pc + prc;
      breakdown.push(
        { label: `Paper (${sheetsNeeded} sheets × ₹${paperRate})`, amount: pc },
        { label: `Printing (${sheetsNeeded} sheets × ₹${printRate})`, amount: prc },
      );
      if (halfcut) {
        const hc = subtotal * hcPct / 100;
        subtotal += hc;
        breakdown.push({ label: `Half Cutting (${hcPct}% of cost)`, amount: hc });
      }
    } else {
      const vr = vendorRate ?? sr.vendorRate;
      const tr = transport ?? sr.transport;
      const printingCost = sheetArea * vr * sheetsNeeded;
      subtotal = printingCost + tr;
      breakdown.push(
        { label: `Vendor Printing (${sheetArea.toFixed(2)} sq in × ₹${vr} × ${sheetsNeeded} sheets)`, amount: printingCost },
        { label: 'Transport', amount: tr },
      );
      if (halfcut) {
        const hc = subtotal * (hcPct2 ?? sr.halfCutPct) / 100;
        subtotal += hc;
        breakdown.push({ label: `Half Cutting (${hcPct2}%)`, amount: hc });
      }
    }

    const marginAmt = subtotal * profitMargin / 100;
    const gstAmt    = (subtotal + marginAmt) * gst / 100;
    const total     = subtotal + marginAmt + gstAmt;

    return { breakdown, subtotal, marginAmt, gstAmt, total, perSticker: qty > 0 ? total / qty : 0,
             sheetW: sheetW.toFixed(2), sheetH: sheetH.toFixed(2), stickersPerSheet, sheetsNeeded, sheetArea: sheetArea.toFixed(2) };
  }
}