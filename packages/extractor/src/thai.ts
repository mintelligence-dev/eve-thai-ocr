const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/**
 * The zero of the digits of scripts near Thai. A vision model sometimes writes a Thai digit
 * in one of these (for example the Bengali ৬০.০০ for ๖๐.๐๐): the value is right, the script
 * is not. Each script's digits run from its zero to its nine.
 */
const OTHER_SCRIPT_ZEROS: Record<string, number> = {
  Lao: 0x0ed0,
  Bengali: 0x09e6,
  Devanagari: 0x0966,
  Myanmar: 0x1040,
  Khmer: 0x17e0,
};

/** The script of the first digit in `input` that is neither ASCII nor Thai, or null. */
export function otherScriptDigits(input: string): string | null {
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    for (const [script, zero] of Object.entries(OTHER_SCRIPT_ZEROS)) {
      if (cp >= zero && cp <= zero + 9) return script;
    }
  }
  return null;
}

/**
 * Replace Thai digits (๐-๙) with ASCII digits. Digits of the scripts in OTHER_SCRIPT_ZEROS
 * are replaced too, by their value; normalizeExtraction flags each field where that happened,
 * so a person compares it with the paper.
 */
export function thaiDigitsToArabic(input: string): string {
  let out = input.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));
  if (otherScriptDigits(out) === null) return out;
  for (const zero of Object.values(OTHER_SCRIPT_ZEROS)) {
    out = out.replace(/./gsu, (c) => {
      const cp = c.codePointAt(0)!;
      return cp >= zero && cp <= zero + 9 ? String(cp - zero) : c;
    });
  }
  return out;
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
  let s = cleanAmountText(text);
  const negative = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[-()]/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  return parseCleanAmount(s, negative);
}

/**
 * True for an amount written with more than two decimal places, such as
 * "5.555 บาท". Baht have only satang (two decimals), so this is not a valid
 * amount, and it is ambiguous (5.55? 5.56? 5,555?) so it is never guessed.
 */
export function hasTooManyDecimals(text: string): boolean {
  return /^[-(]?\d+\.\d{3,}\)?$/.test(cleanAmountText(text));
}

function cleanAmountText(text: string): string {
  return thaiDigitsToArabic(text)
    .replace(/฿|บาท|baht|bht|thb/gi, "")
    // POS receipts print unit prices as "@100.00".
    .replace(/^@/, "")
    // ...and per-unit prices as "41.00 / ชิ้น".
    .replace(/\s*\/\s*[^\d\s]+\s*$/, "")
    // A tax-class letter (or star) after the amount: "48.75 N", "59.00 P", "19.00 T".
    .replace(/(\d)\s*[A-Za-z*]$/, "$1")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
}

function parseCleanAmount(s: string, negative: boolean): number | null {
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

const WORD_DIGITS: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9,
};
const WORD_POWERS: Record<string, number> = { สิบ: 10, ร้อย: 100, พัน: 1000, หมื่น: 10_000, แสน: 100_000 };
/** Longest first, so that no word is taken for the start of another. */
const WORDS = [...Object.keys(WORD_DIGITS), ...Object.keys(WORD_POWERS), "ล้าน", "บาท", "สตางค์", "ถ้วน"].sort(
  (a, b) => b.length - a.length,
);

function wordTokens(text: string): string[] | null {
  const t = text.normalize("NFC").replace(/[\s()\[\].,\-]+/g, "");
  const out: string[] = [];
  for (let i = 0; i < t.length; ) {
    const word = WORDS.find((w) => t.startsWith(w, i));
    if (!word) return null;
    out.push(word);
    i += word.length;
  }
  return out;
}

/** A number below a million, from its words: "สองหมื่นหนึ่งพันห้าร้อย" is 21,500. */
function wordsBelowMillion(tokens: string[]): number | null {
  let value = 0;
  let digit: number | null = null;
  for (const t of tokens) {
    if (t in WORD_DIGITS) {
      if (digit !== null) return null; // two digits in a row
      digit = WORD_DIGITS[t]!;
    } else if (t in WORD_POWERS) {
      // "สิบ" alone is ten; the other places need a digit before them
      if (digit === null && t !== "สิบ") return null;
      value += (digit ?? 1) * WORD_POWERS[t]!;
      digit = null;
    } else {
      return null;
    }
  }
  return value + (digit ?? 0);
}

function wordsToInteger(tokens: string[]): number | null {
  const million = tokens.lastIndexOf("ล้าน");
  if (million < 0) return wordsBelowMillion(tokens);
  const left = million === 0 ? null : wordsToInteger(tokens.slice(0, million));
  const right = wordsBelowMillion(tokens.slice(million + 1));
  return left === null || right === null ? null : left * 1_000_000 + right;
}

/**
 * The amount a receipt writes in words ("หนึ่งพันสองร้อยบาทถ้วน", "สองร้อยห้าสิบบาทห้าสิบสตางค์"),
 * in satang, or null when the words are not a number written that way (handwriting misread,
 * another language, a word it does not know). Null means "cannot check", never "wrong".
 */
export function parseThaiAmountWords(text: string): number | null {
  const tokens = wordTokens(text);
  if (!tokens) return null;
  const baht = tokens.indexOf("บาท");
  if (baht < 0) return null;

  const before = tokens.slice(0, baht);
  const after = tokens.slice(baht + 1).filter((t) => t !== "ถ้วน");
  const whole = before.length === 0 ? 0 : wordsToInteger(before);
  if (whole === null) return null;

  let satang = 0;
  if (after.length > 0) {
    if (after[after.length - 1] !== "สตางค์") return null;
    const s = wordsBelowMillion(after.slice(0, -1));
    if (s === null || s >= 100) return null;
    satang = s;
  } else if (before.length === 0) {
    return null; // "บาท" alone
  }
  return whole * 100 + satang;
}
