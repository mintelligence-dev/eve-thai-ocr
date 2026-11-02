import { similarity } from "./score.js";
import { taxIdDigits } from "./taxid.js";
import { parseAmountToSatang, parseThaiDate } from "./thai.js";

/** What is printed in ONE of several images, read on its own (null = not visible in that image). */
export interface ImageFact {
  merchant: string | null;
  taxIdText: string | null;
  referenceText: string | null;
  dateText: string | null;
  totalText: string | null;
}

export interface ImageConflict {
  field: "merchant" | "taxId" | "date" | "total";
  /** Zero-based indexes of the two images that disagree. */
  images: [number, number];
  values: [string, string];
}

const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Do these images show the same document? Compares what each image says about
 * the shop, tax ID, date and total. A value missing from one image is no
 * evidence either way (the bottom of a long receipt has no shop name), so only
 * values that are present in both can disagree. The receipt number is not used:
 * receipts often print two numbers (receipt and terminal), and the model may
 * pick a different one from each photo.
 */
export function findImageConflicts(facts: ImageFact[], today: Date = new Date()): ImageConflict[] {
  const out: ImageConflict[] = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i]!;
      const b = facts[j]!;
      const add = (field: ImageConflict["field"], x: string, y: string) =>
        out.push({ field, images: [i, j], values: [x, y] });

      if (a.taxIdText && b.taxIdText) {
        const x = taxIdDigits(a.taxIdText);
        const y = taxIdDigits(b.taxIdText);
        if (x && y && x !== y) add("taxId", x, y);
      }

      if (a.merchant && b.merchant) {
        const x = alnum(a.merchant);
        const y = alnum(b.merchant);
        // One name being part of the other (a cut-off logo) is the same shop.
        if (x && y && !x.includes(y) && !y.includes(x) && similarity(a.merchant, b.merchant) < 0.5) {
          add("merchant", a.merchant, b.merchant);
        }
      }

      if (a.dateText && b.dateText) {
        const x = parseThaiDate(a.dateText, { today });
        const y = parseThaiDate(b.dateText, { today });
        if (x && y && x.iso !== y.iso) add("date", x.iso, y.iso);
      }

      if (a.totalText && b.totalText) {
        const x = parseAmountToSatang(a.totalText);
        const y = parseAmountToSatang(b.totalText);
        if (x !== null && y !== null && x !== y) add("total", a.totalText, b.totalText);
      }
    }
  }
  return out;
}
