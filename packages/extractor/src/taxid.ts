import { thaiDigitsToArabic } from "./thai.js";

/** Keep only the digits of a printed tax ID ("5-5667-78899-00-6", "๐๑๐๕..."). */
export function taxIdDigits(text: string): string {
  return thaiDigitsToArabic(text).replace(/\D/g, "");
}

/**
 * A Thai tax ID has 13 digits; the last is a check digit:
 * (11 - (sum of digit i x (13 - i), i = 0..11) mod 11) mod 10.
 * A misread digit almost always breaks the check, so this catches OCR errors.
 */
export function isValidThaiTaxId(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}
