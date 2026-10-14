import type { Flag, Receipt } from "./schema.js";

export interface ValidateOptions {
  today?: Date;
  /** VAT rate used for the consistency check. Thailand: 0.07. */
  vatRate?: number;
}

const toSatang = (baht: number) => Math.round(baht * 100);
/** Tolerance of 1 baht to absorb per-line rounding on printed receipts. */
const TOLERANCE = 100;

/**
 * Cross-field checks on a normalised receipt. Produces flags for the review
 * screen; never changes values. The checks are heuristics: a flag means "a
 * human should look", not "this is wrong".
 */
export function validateReceipt(
  r: Omit<Receipt, "flags">,
  options: ValidateOptions = {},
): Flag[] {
  const flags: Flag[] = [];
  const today = options.today ?? new Date();
  const vatRate = options.vatRate ?? 0.07;

  if (r.total === null) {
    flags.push({
      path: "total",
      code: "missing",
      severity: "error",
      message: "Total amount is missing.",
    });
  }

  if (r.merchant === null) {
    flags.push({
      path: "merchant",
      code: "missing",
      severity: "warning",
      message: "Merchant / payee name is missing.",
    });
  }

  if (r.date === null) {
    flags.push({
      path: "date",
      code: "missing",
      severity: "warning",
      message: "Date is missing.",
    });
  } else {
    const d = new Date(`${r.date}T00:00:00Z`);
    const dayMs = 86_400_000;
    if (d.getTime() > today.getTime() + dayMs) {
      flags.push({
        path: "date",
        code: "date_in_future",
        severity: "warning",
        message: `Date ${r.date} is in the future. Check the year (Buddhist vs Gregorian).`,
      });
    } else if (today.getTime() - d.getTime() > 3650 * dayMs) {
      flags.push({
        path: "date",
        code: "date_too_old",
        severity: "warning",
        message: `Date ${r.date} is more than 10 years ago. Check the year.`,
      });
    }
  }

  r.lineItems.forEach((item, i) => {
    if (item.amount !== null && item.amount < 0) {
      flags.push({
        path: `lineItems.${i}.amount`,
        code: "negative_amount",
        severity: "warning",
        message: "Negative amount (discount or misread?).",
      });
    }
    if (item.quantity !== null && item.unitPrice !== null && item.amount !== null) {
      const expected = Math.round(item.quantity * toSatang(item.unitPrice));
      if (Math.abs(expected - toSatang(item.amount)) > TOLERANCE) {
        flags.push({
          path: `lineItems.${i}.amount`,
          code: "line_total_mismatch",
          severity: "warning",
          message: `Quantity × unit price (${(expected / 100).toFixed(2)}) does not equal amount (${item.amount.toFixed(2)}).`,
        });
      }
    }
  });

  const amounts = r.lineItems.map((l) => l.amount);
  if (r.total !== null && amounts.length > 0 && amounts.every((a) => a !== null)) {
    const sum = amounts.reduce<number>((acc, a) => acc + toSatang(a as number), 0);
    const candidates = [r.total, r.subtotal, r.total !== null && r.vat !== null ? r.total - r.vat : null]
      .filter((v): v is number => v !== null)
      .map(toSatang);
    if (!candidates.some((c) => Math.abs(c - sum) <= TOLERANCE)) {
      flags.push({
        path: "lineItems",
        code: "items_total_mismatch",
        severity: "warning",
        message: `Line items add up to ${(sum / 100).toFixed(2)}, which matches neither the total nor the subtotal.`,
      });
    }
  }

  if (r.vat !== null && r.total !== null) {
    const total = toSatang(r.total);
    const vat = toSatang(r.vat);
    const inclusive = Math.round((total * vatRate) / (1 + vatRate));
    const exclusive = r.subtotal !== null ? Math.round(toSatang(r.subtotal) * vatRate) : null;
    const ok =
      Math.abs(vat - inclusive) <= TOLERANCE ||
      (exclusive !== null && Math.abs(vat - exclusive) <= TOLERANCE);
    if (!ok) {
      flags.push({
        path: "vat",
        code: "vat_mismatch",
        severity: "warning",
        message: `VAT ${r.vat.toFixed(2)} is not ${(vatRate * 100).toFixed(0)}% of the total/subtotal.`,
      });
    }
  }

  return flags;
}
