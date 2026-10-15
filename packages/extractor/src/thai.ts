const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Replace Thai digits (๐-๙) with ASCII digits. */
export function thaiDigitsToArabic(input: string): string {
  return input.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));
}

/** Full and abbreviated Thai month names (dots stripped) -> month number. */
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, มค: 1,
  กุมภาพันธ์: 2, กพ: 2,
  มีนาคม: 3, มีค: 3,
  เมษายน: 4, เมย: 4,
  พฤษภาคม: 5, พค: 5,
  มิถุนายน: 6, มิย: 6,
  กรกฎาคม: 7, กค: 7,
  สิงหาคม: 8, สค: 8,
  กันยายน: 9, กย: 9,
  ตุลาคม: 10, ตค: 10,
  พฤศจิกายน: 11, พย: 11,
  ธันวาคม: 12, ธค: 12,
};

const EN_MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function monthFromName(name: string): number | null {
  const thai = THAI_MONTHS[name.trim().replace(/\./g, "")];
  if (thai) return thai;
  const idx = EN_MONTHS.indexOf(name.trim().toLowerCase().slice(0, 3));
  return idx >= 0 ? idx + 1 : null;
}

export interface ParsedDate {
  /** ISO date in the Gregorian calendar, YYYY-MM-DD. */
  iso: string;
  /** Year as written was Buddhist Era and has been converted. */
  buddhistEra: boolean;
  /** A two-digit year was resolved heuristically; needs review. */
  twoDigitYear: boolean;
}

export interface ParseDateOptions {
  /** Reference "today", used to resolve two-digit years. Defaults to now. */
  today?: Date;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function resolveYear(
  raw: string,
  today: Date,
): { year: number; buddhistEra: boolean; twoDigit: boolean } | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (raw.length === 4) {
    return n >= 2400
      ? { year: n - 543, buddhistEra: true, twoDigit: false }
      : { year: n, buddhistEra: false, twoDigit: false };
  }
  if (raw.length === 2) {
    // 68 may mean BE 2568 (=2025) or CE 2068; pick the one closest to today.
    const ce = 2000 + n;
    const be = 2500 + n - 543;
    const cy = today.getUTCFullYear();
    return Math.abs(be - cy) < Math.abs(ce - cy)
      ? { year: be, buddhistEra: true, twoDigit: true }
      : { year: ce, buddhistEra: false, twoDigit: true };
  }
  return null;
}

/**
 * Parse a date as printed on a Thai receipt or slip. Handles Thai digits,
 * Buddhist Era years, Thai/English month names and d/m/y numeric formats
 * (day first, the Thai convention). Returns null when it cannot be parsed.
 */
export function parseThaiDate(
  text: string,
  options: ParseDateOptions = {},
): ParsedDate | null {
  const today = options.today ?? new Date();
  const s = thaiDigitsToArabic(text).trim().replace(/\s+/g, " ");

  let day: number;
  let month: number | null;
  let yearRaw: string;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const numeric = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/.exec(s);
  const named = /^(\d{1,2})\s*([^\d\s]+)\s*(\d{2}|\d{4})\b/.exec(s);

  if (iso) {
    yearRaw = iso[1]!;
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    yearRaw = numeric[3]!;
  } else if (named) {
    day = Number(named[1]);
    month = monthFromName(named[2]!);
    yearRaw = named[3]!;
  } else {
    return null;
  }

  if (month === null) return null;
  const year = resolveYear(yearRaw, today);
  if (!year || !isValidYmd(year.year, month, day)) return null;

  const pad = (v: number, n = 2) => String(v).padStart(n, "0");
  return {
    iso: `${pad(year.year, 4)}-${pad(month)}-${pad(day)}`,
    buddhistEra: year.buddhistEra,
    twoDigitYear: year.twoDigit,
  };
}

/** Parse "14:35", "๑๔.๓๕ น.", "14:35:09" into "HH:mm". */
export function parseTime(text: string): string | null {
  const s = thaiDigitsToArabic(text);
  const m = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Parse a money string into integer satang (1/100 baht) so arithmetic stays
 * exact. Handles Thai digits, ฿ / บาท / THB, thousands separators and
 * "1.234,50" style. Returns null when no number is present.
 */
export function parseAmountToSatang(text: string): number | null {
  let s = thaiDigitsToArabic(text)
    .replace(/฿|บาท|baht|thb/gi, "")
    // POS receipts print unit prices as "@100.00".
    .replace(/^@/, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
  const negative = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[-()]/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart: string;
  let frac = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const sep = Math.max(lastDot, lastComma);
    intPart = s.slice(0, sep);
    frac = s.slice(sep + 1);
  } else if (lastComma >= 0) {
    // "12,50" is a decimal; "1,234" / "1,234,567" are thousands.
    const after = s.slice(lastComma + 1);
    const commas = (s.match(/,/g) ?? []).length;
    if (after.length === 3 && commas >= 1) {
      intPart = s;
    } else if (commas === 1 && after.length <= 2) {
      intPart = s.slice(0, lastComma);
      frac = after;
    } else {
      return null;
    }
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1) {
      intPart = s; // "1.234.567" thousands
    } else {
      intPart = s.slice(0, lastDot);
      frac = s.slice(lastDot + 1);
    }
  } else {
    intPart = s;
  }

  intPart = intPart.replace(/[.,]/g, "");
  if (frac.length > 2) return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return null;
  const satang =
    Number(intPart || "0") * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -satang : satang;
}

/** Parse a plain quantity like "2", "๒", "1.5". */
export function parseQuantity(text: string): number | null {
  const s = thaiDigitsToArabic(text).replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
