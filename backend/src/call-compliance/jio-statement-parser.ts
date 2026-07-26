// backend/src/call-compliance/jio-statement-parser.ts
//
// Parses a Jio (or similarly-formatted carrier) monthly "Account Usage and
// Recharge Statement" PDF into individual outgoing voice calls.
//
// The statement's itemized usage section lists calls under a repeating
// table header:
//   No.  Date  Number  Used Usage  Billed Usage  Free Usage  Chargeable Usage  Amount
// with rows like:
//   1 26-JUL-26 13:57:25 919179454786 81 0 0 0 0.00
// The row numbering restarts at 1 when the section switches from
// "Voice Local" to "Voice STD" — we don't need to distinguish the two, we
// just want every destination number + timestamp + duration.
//
// The statement header also carries the phone number the bill itself
// belongs to ("Jio Number : 9356469774"), which is used elsewhere to
// auto-match the statement to the agent whose User.phone ends in that
// number — useful because a shared family/business account can have every
// statement registered to the same billing name.
//
// Verified against real sample statements in this repo's dev/test fixtures:
// row counts extracted match the "Total Usage Summary" voice count exactly.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export type ParsedCallRow = {
  phone: string; // normalized last-10-digit destination number
  calledAt: Date;
  durationSec: number;
};

export type ParsedStatement = {
  ownerNumber: string | null; // last-10-digit number this statement is billed to
  periodStart: Date | null;
  periodEnd: Date | null;
  rows: ParsedCallRow[];
};

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const ITEMIZED_VOICE_HEADER = /No\.\s*Date\s*Number\s*Used/i;
const ROW_RE = /(\d{1,5})\s+(\d{2}-[A-Z]{3}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{10,15})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)/g;
const OWNER_NUMBER_RE = /Jio Number\s*:?\s*(\d{10})/i;
const PERIOD_RE = /Statement from\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+to\s+(\d{2}-[A-Za-z]{3}-\d{4})/i;

function parseShortDate(dateStr: string, timeStr: string): Date | null {
  const m = dateStr.match(/^(\d{2})-([A-Z]{3})-(\d{2})$/);
  if (!m) return null;
  const mon = MONTHS[m[2]];
  if (mon === undefined) return null;
  const day = Number(m[1]);
  const year = 2000 + Number(m[3]);
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  return new Date(year, mon, day, hh, mm, ss);
}

function parseFullDate(s: string): Date | null {
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toUpperCase()];
  if (mon === undefined) return null;
  return new Date(Number(m[3]), mon, Number(m[1]));
}

/** Normalizes any phone-number-ish string to its last 10 digits. */
export function normalizePhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.slice(-10);
}

export async function parseJioStatementPdf(buffer: Buffer): Promise<ParsedStatement> {
  const data = new Uint8Array(buffer);
  const loadingTask = (pdfjsLib as any).getDocument({ data, useSystemFonts: true, disableFontFace: true });
  const doc = await loadingTask.promise;

  let ownerNumber: string | null = null;
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  const rows: ParsedCallRow[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it: any) => it.str ?? '').join(' ');

    if (!ownerNumber) {
      const ownerMatch = pageText.match(OWNER_NUMBER_RE);
      if (ownerMatch) ownerNumber = ownerMatch[1];
    }
    if (!periodStart) {
      const periodMatch = pageText.match(PERIOD_RE);
      if (periodMatch) {
        periodStart = parseFullDate(periodMatch[1]);
        periodEnd = parseFullDate(periodMatch[2]);
      }
    }

    if (!ITEMIZED_VOICE_HEADER.test(pageText)) continue;

    ROW_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROW_RE.exec(pageText))) {
      const [, , dateStr, timeStr, phoneRaw, usedSec] = match;
      const calledAt = parseShortDate(dateStr, timeStr);
      if (!calledAt) continue;
      const phone = normalizePhone(phoneRaw);
      if (phone.length !== 10) continue;
      rows.push({ phone, calledAt, durationSec: Number(usedSec) || 0 });
    }
  }

  return { ownerNumber, periodStart, periodEnd, rows };
}
