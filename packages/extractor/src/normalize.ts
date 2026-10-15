import { splitAddOns } from "./addons.js";
import type { Flag, LineItem, RawExtraction, Receipt } from "./schema.js";
import {
  parseAmountToSatang,
  parseQuantity,
  parseThaiDate,
  parseTime,
} from "./thai.js";
import { MAX_INDIVIDUAL_FLAGS, validateReceipt, type ValidateOptions } from "./validate.js";

const clean = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

/** Models sometimes echo the raw schema names ("dateText"); map them to field paths. */
const uncertainPath = (field: string) =>
  field.trim().replace(/Text(?=\.|$)/g, "");

/**
 * Turn the model's raw text fields into typed values and attach review flags.
 * All number and date parsing happens here, deterministically.
 */
export function normalizeExtraction(
  raw: RawExtraction,
  options: ValidateOptions = {},
): Receipt {
  const flags: Flag[] = [];

  const money = (text: string | null, path: string): number | null => {
    const t = clean(text);
    if (t === null) return null;
    const satang = parseAmountToSatang(t);
    if (satang === null) {
      flags.push({
        path,
        code: "unparseable",
        severity: "error",
        message: `Could not read "${t}" as an amount.`,
        params: { text: t },
      });
      return null;
    }
    return satang / 100;
  };

  let date: string | null = null;
  const dateText = clean(raw.dateText);
  if (dateText !== null) {
    const parsed = parseThaiDate(dateText, { today: options.today });
    if (!parsed) {
      flags.push({
        path: "date",
        code: "unparseable",
        severity: "error",
        message: `Could not read "${dateText}" as a date.`,
        params: { text: dateText },
      });
    } else {
      date = parsed.iso;
      if (parsed.twoDigitYear) {
        flags.push({
          path: "date",
          code: "two_digit_year",
          severity: "warning",
          message: `Two-digit year in "${dateText}" was interpreted as ${parsed.iso.slice(0, 4)}. Please confirm.`,
          params: { text: dateText, year: parsed.iso.slice(0, 4) },
        });
      }
    }
  }

  const timeText = clean(raw.timeText);
  const time = timeText ? parseTime(timeText) : null;
  if (timeText && !time) {
    flags.push({
      path: "time",
      code: "unparseable",
      severity: "warning",
      message: `Could not read "${timeText}" as a time.`,
      params: { text: timeText },
    });
  }

  const currency = clean(raw.currency)?.toUpperCase() ?? "THB";
  if (currency !== "THB") {
    flags.push({
      path: "currency",
      code: "unsupported_currency",
      severity: "warning",
      message: `Currency ${currency} is not THB. Amounts are not converted.`,
      params: { currency },
    });
  }

  const parsedItems: LineItem[] = raw.lineItems.map((item, i) => ({
    description: item.description.trim(),
    quantity: clean(item.quantityText) ? parseQuantity(item.quantityText!) : null,
    unitPrice: money(item.unitPriceText, `lineItems.${i}.unitPrice`),
    amount: money(item.amountText, `lineItems.${i}.amount`),
  }));

  // Add-on lines whose price is already inside the line above (see addons.ts).
  const { items: lineItems, splits } = splitAddOns(parsedItems);
  for (const sp of splits) {
    flags.push({
      path: `lineItems.${sp.index}.amount`,
      code: "addon_split",
      severity: "warning",
      message: `The printed amount ${sp.printed.toFixed(2)} already includes the ${sp.addOns} add-on line(s) below it. Shown as ${sp.base.toFixed(2)} plus the add-ons so nothing is counted twice.`,
      params: { printed: sp.printed.toFixed(2), base: sp.base.toFixed(2), count: sp.addOns },
    });
  }

  const base: Omit<Receipt, "flags"> = {
    documentType: raw.documentType,
    merchant: clean(raw.merchant),
    date,
    time,
    currency,
    subtotal: money(raw.subtotalText, "subtotal"),
    vat: money(raw.vatText, "vat"),
    total: money(raw.totalText, "total"),
    lineItems,
  };

  // Dedupe, then summarise when the model doubts many line-item cells at once.
  const uncertain = [...new Set(raw.uncertainFields.map(uncertainPath))].filter(
    // Currency defaults to THB when not printed, so there is nothing to confirm.
    (path) => !(path === "currency" && clean(raw.currency) === null),
  );
  const itemCells = uncertain.filter((p) => p.startsWith("lineItems."));
  const summarise = itemCells.length > MAX_INDIVIDUAL_FLAGS;
  for (const path of summarise ? uncertain.filter((p) => !p.startsWith("lineItems.")) : uncertain) {
    flags.push({
      path,
      code: "model_uncertain",
      severity: "warning",
      message: "The model was not confident about this field.",
    });
  }
  if (summarise) {
    flags.push({
      path: "lineItems",
      code: "model_uncertain",
      severity: "warning",
      message: `The model was not confident about ${itemCells.length} line item fields. Check the items against the original.`,
      params: { count: itemCells.length },
    });
  }

  // A path that failed to parse already has an error; don't also say "missing".
  const failed = new Set(flags.filter((f) => f.code === "unparseable").map((f) => f.path));
  const checks = validateReceipt(base, options).filter(
    (f) => !(f.code === "missing" && failed.has(f.path)),
  );
  return { ...base, flags: [...flags, ...checks] };
}

/** Re-run validation after a user edit (e.g. on the review screen). */
export function revalidate(
  receipt: Receipt,
  options: ValidateOptions = {},
): Receipt {
  const { flags: _old, ...base } = receipt;
  return { ...base, flags: validateReceipt(base, options) };
}
