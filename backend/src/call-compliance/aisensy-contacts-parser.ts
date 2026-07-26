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

// Looks up a column by trying several header spellings, case/whitespace/BOM
// insensitive — AiSensy's export headers have drifted between "Created On",
// "CreatedOn" and "Created At" across account/export-type variants, and a
// silent miss here used to leave createdOnAt null for every row (which then
// made every month in the Ad ROI tab show 0 contacts created, even though
// the phone/name columns parsed fine).
function getField(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalizedKeys = new Map<string, string>();
  for (const key of Object.keys(row)) {
    normalizedKeys.set(key.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' '), key);
  }
  for (const candidate of candidates) {
    const norm = candidate.trim().toLowerCase().replace(/\s+/g, ' ');
    const actualKey = normalizedKeys.get(norm);
    if (actualKey !== undefined) return row[actualKey];
  }
  return undefined;
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/**
 * Parses AiSensy export dates. Handles the documented "01 Jul 2026 00:09"
 * format plus common variants (seconds, AM/PM, full month names), and falls
 * back to native Date parsing (ISO strings, "MM/DD/YYYY", etc.) for exports
 * that use a different locale format entirely. Returns null only if nothing
 * plausible can be extracted, rather than silently returning a bad date.
 */
function parseAisensyDate(raw: unknown): Date | null {
  const s = cellStr(raw);
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toUpperCase()];
    if (mon !== undefined) {
      let hour = Number(m[4]);
      const ampm = m[7]?.toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      const date = new Date(Number(m[3]), mon, Number(m[1]), hour, Number(m[5]), Number(m[6] ?? 0));
      if (!isNaN(date.getTime())) return date;
    }
  }

  // Fallback for formats not covered above (ISO timestamps, "MM/DD/YYYY", etc.)
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime()) && fallback.getFullYear() >= 2015 && fallback.getFullYear() <= 2100) {
    return fallback;
  }
  return null;
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
    const phone = normalizeContactPhone(getField(row, ['UserNumber', 'User Number', 'Phone', 'Mobile', 'WA ID']));
    if (phone.length !== 10) continue; // skip rows without a usable number

    const tagRaw = cellStr(getField(row, ['Tags', 'Tag'])) || null;
    const tags = tagRaw ? splitTags(tagRaw) : [];
    const optedInRaw = cellStr(getField(row, ['Opted In', 'OptedIn'])).toLowerCase();

    result.push({
      name: cellStr(getField(row, ['Name'])) || null,
      phone,
      tagRaw,
      primaryTag: tags[0] ?? null,
      lastActiveAt: parseAisensyDate(getField(row, ['Last Active', 'LastActive'])),
      createdOnAt: parseAisensyDate(getField(row, ['Created On', 'CreatedOn', 'Created At', 'CreatedAt', 'Date Created', 'Created'])),
      source: cellStr(getField(row, ['Source'])) || null,
      status: cellStr(getField(row, ['Status'])) || null,
      optedIn: optedInRaw ? optedInRaw === 'yes' : null,
    });
  }
  return result;
}
