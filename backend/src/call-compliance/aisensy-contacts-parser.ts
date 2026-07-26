// backend/src/call-compliance/aisensy-contacts-parser.ts
//
// Parses the "Export Contacts" CSV downloaded from AiSensy, e.g.:
//   Name,UserNumber,Tags,Last Active,Created On,First Message,Source,Status,Opted In,Intervened By,...
// Values look like:
//   Dibyanshi Surjendu,+917001596262,Akansha,01 Jul 2026 00:09,01 Jul 2026 00:08,,AD,Active,Yes,
//
// The "Tags" column is how this business assigns a contact to a sales agent
// — the tag text is that agent's first name (e.g. "Vaishali", "ritu"). A
// contact can carry more than one tag over its lifetime, pipe-separated
// (e.g. "nikita | priya") if it was re-tagged; we keep the raw string and
// treat the first tag as the contact's current owner for matching purposes.
import * as XLSX from 'xlsx';

export type ParsedContactRow = {
  name: string | null;
  phone: string; // normalized last-10-digit number
  tagRaw: string | null; // raw value from the Tags column, e.g. "Vaishali" or "nikita | priya"
  primaryTag: string | null; // first tag segment, used to resolve the owning agent
  lastActiveAt: Date | null;
  createdOnAt: Date | null;
  source: string | null;
  status: string | null;
  optedIn: boolean | null;
};

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Parses AiSensy's "01 Jul 2026 00:09" export date format. */
function parseAisensyDate(raw: unknown): Date | null {
  const s = cellStr(raw);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toUpperCase()];
  if (mon === undefined) return null;
  return new Date(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]));
}

/** Normalizes any phone-number-ish string (e.g. "+917001596262") to its last 10 digits. */
export function normalizeContactPhone(raw: unknown): string {
  const digits = cellStr(raw).replace(/\D/g, '');
  return digits.slice(-10);
}

function splitTags(tagRaw: string): string[] {
  return tagRaw
    .split(/[|,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseAisensyContactsCsv(buffer: Buffer): ParsedContactRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });

  const result: ParsedContactRow[] = [];
  for (const row of rows) {
    const phone = normalizeContactPhone(row['UserNumber']);
    if (phone.length !== 10) continue; // skip rows without a usable number

    const tagRaw = cellStr(row['Tags']) || null;
    const tags = tagRaw ? splitTags(tagRaw) : [];
    const optedInRaw = cellStr(row['Opted In']).toLowerCase();

    result.push({
      name: cellStr(row['Name']) || null,
      phone,
      tagRaw,
      primaryTag: tags[0] ?? null,
      lastActiveAt: parseAisensyDate(row['Last Active']),
      createdOnAt: parseAisensyDate(row['Created On']),
      source: cellStr(row['Source']) || null,
      status: cellStr(row['Status']) || null,
      optedIn: optedInRaw ? optedInRaw === 'yes' : null,
    });
  }
  return result;
}
