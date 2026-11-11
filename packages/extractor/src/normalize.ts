import { splitAddOns } from "./addons.js";
import { assumeSingleUnits } from "./assume.js";
import { taxIdDigits } from "./taxid.js";
import type { Flag, LineItem, RawExtraction, Receipt } from "./schema.js";
import {
  hasTooManyDecimals,
  parseAmountToSatang,
  parseQuantity,
  parseThaiDate,
  parseTime,
} from "./thai.js";
import { MAX_INDIVIDUAL_FLAGS, validateReceipt, type ValidateOptions } from "./validate.js";

/**
 * A number labelled as a POS, machine, permit, terminal, queue or cashier id is
 * not a receipt number, whatever the model made of it. English words are matched
 * whole ("deposit" must not match "pos"); Thai terms as substrings.
 */
const NOT_A_REFERENCE = /\b(pos|permit|terminal|machine|cashier|queue|tid|mid)\b|เครื่อง|แคชเชียร์|พนักงาน|คิว/i;

const clean = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

/** Models sometimes echo the raw schema names ("dateText"); map them to field paths. */
const uncertainPath = (field: string) =>
  field.trim().replace(/Text(?=\.|$)/g, "");

function referenceFrom(raw: RawExtraction): string | null {
  const text = clean(raw.referenceText)?.replace(/\s+/g, "") ?? null;
  const label = clean(raw.referenceLabel);
  return text && !(label && NOT_A_REFERENCE.test(label)) ? text : null;
}

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
      const decimals = hasTooManyDecimals(t);
      flags.push({
        path,
        code: "unparseable",
        severity: "error",
        message: decimals
          ? `"${t}" has more than two decimal places, which is not a valid baht amount.`
          : `Could not read "${t}" as an amount.`,
        params: decimals ? { text: t, reason: "decimals" } : { text: t },
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

  // Receipts write the baht as THB, BHT, ฿ or บาท; they all mean the same thing.
  const rawCurrency = clean(raw.currency)?.toUpperCase();
  const currency = rawCurrency && !["BHT", "BAHT", "฿", "บาท"].includes(rawCurrency) ? rawCurrency : "THB";

  // A discount is written as a positive number; "as printed" with a minus sign still means the same.
  const optionalCells = (item: RawExtraction["lineItems"][number], i: number) => {
    const discount = money(item.discountText ?? null, `lineItems.${i}.discount`);
    return {
      ...(clean(item.unit) ? { unit: clean(item.unit) } : {}),
      ...(clean(item.productCode) ? { productCode: clean(item.productCode) } : {}),
      ...(discount !== null ? { discount: Math.abs(discount) } : {}),
    };
  };

  // A transfer slip has no line items; anything the model listed is a misread
  // of the slip's own fields (From, To, fee...), so it is dropped.
  const parsedItems: LineItem[] = (raw.documentType === "transfer_slip" ? [] : raw.lineItems).map((item, i) => ({
    description: item.description.trim(),
    quantity: clean(item.quantityText) ? parseQuantity(item.quantityText!) : null,
    unitPrice: money(item.unitPriceText, `lineItems.${i}.unitPrice`),
    amount: money(item.amountText, `lineItems.${i}.amount`),
    ...optionalCells(item, i),
  }));

  // Add-on lines whose price is already inside the line above (see addons.ts).
  const { items: splitItems, splits } = splitAddOns(parsedItems);
  const lineItems = assumeSingleUnits(splitItems);
  for (const sp of splits) {
    flags.push({
      path: `lineItems.${sp.index}.amount`,
      code: "addon_split",
      severity: "warning",
      message: `The printed amount ${sp.printed.toFixed(2)} already includes the ${sp.addOns} add-on line(s) below it. Shown as ${sp.base.toFixed(2)} plus the add-ons so nothing is counted twice.`,
      params: { printed: sp.printed.toFixed(2), base: sp.base.toFixed(2), count: sp.addOns },
    });
  }

  if ((options.imageCount ?? 1) > 1) {
    flags.push({
      path: "lineItems",
      code: "merged_images",
      severity: "warning",
      message: `Read from ${options.imageCount} images, top to bottom. Check the lines where the photos overlap: none should be missing or repeated.`,
      params: { count: options.imageCount! },
    });
  }

  const taxIdText = clean(raw.taxIdText);
  const taxId = taxIdText ? taxIdDigits(taxIdText) || null : null;

  // The fields below belong to receipts; a slip has none of them, whatever the model made of it.
  const onReceipt = raw.documentType !== "transfer_slip";
  const buyerTaxIdText = onReceipt ? clean(raw.buyerTaxIdText) : null;
  const buyerTaxId = buyerTaxIdText ? taxIdDigits(buyerTaxIdText) || null : null;
  const receiptOnly = onReceipt
    ? {
        documentSubtype: raw.documentSubtype ?? null,
        bookNumber: clean(raw.bookNumber),
        merchantAddress: clean(raw.merchantAddress),
        branch: clean(raw.branch),
        buyerName: clean(raw.buyerName),
        buyerAddress: clean(raw.buyerAddress),
        buyerTaxId,
        referenceDocument: clean(raw.referenceDocument),
        paymentMethod: raw.paymentMethod ?? null,
        totalDiscount: (() => {
          const d = money(raw.totalDiscountText, "totalDiscount");
          return d === null ? null : Math.abs(d);
        })(),
        taxableAmount: money(raw.taxableAmountText, "taxableAmount"),
        exemptAmount: money(raw.exemptAmountText, "exemptAmount"),
        totalInWords: clean(raw.totalInWords),
        hasSignature: raw.hasSignature ?? null,
      }
    : {};

  const base: Omit<Receipt, "flags"> = {
    documentType: raw.documentType,
    merchant: clean(raw.merchant),
    payer: clean(raw.payer),
    recipientName: clean(raw.recipientName),
    reference: referenceFrom(raw),
    fee: money(raw.feeText, "fee"),
    taxId: taxId,
    date,
    time,
    currency,
    subtotal: money(raw.subtotalText, "subtotal"),
    vat: money(raw.vatText, "vat"),
    total: money(raw.totalText, "total"),
    lineItems,
    ...receiptOnly,
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

/** Flags that record how a field was read, and so hold until that field is changed. */
const FIELD_FLAGS = new Set<Flag["code"]>(["model_uncertain", "unparseable", "two_digit_year", "addon_split"]);

const SCALAR_FIELDS = [
  "documentType", "merchant", "payer", "recipientName", "reference", "taxId", "fee",
  "date", "time", "currency", "subtotal", "vat", "total",
  "documentSubtype", "bookNumber", "merchantAddress", "branch", "buyerName", "buyerAddress", "buyerTaxId",
  "referenceDocument", "paymentMethod", "totalDiscount", "taxableAmount", "exemptAmount", "totalInWords", "hasSignature",
] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];

const ITEM_CELL = /^lineItems\.(\d+)\.(description|quantity|unitPrice|amount)$/;
const ITEM_ROW = /^lineItems\.(\d+)$/;

/**
 * Does a flag from before an edit still hold after it? The flags that say how a
 * field was read (the model was unsure, a date had a two-digit year, a price had to
 * be split) are about that field's value, so they stay until the value changes.
 * A line item is told apart by its name: if rows were removed or reordered, the
 * flag of a row that is no longer there is dropped rather than put on another row.
 */
function stillHolds(flag: Flag, before: Receipt, after: Receipt): boolean {
  if (flag.code === "merged_images") return true; // about the whole document
  if (!FIELD_FLAGS.has(flag.code)) return false; // recomputed by validateReceipt

  const cell = ITEM_CELL.exec(flag.path);
  if (cell) {
    const a = before.lineItems[Number(cell[1])];
    const b = after.lineItems[Number(cell[1])];
    const field = cell[2] as keyof LineItem;
    return !!a && !!b && a.description === b.description && a[field] === b[field];
  }
  const row = ITEM_ROW.exec(flag.path);
  if (row) {
    const a = before.lineItems[Number(row[1])];
    const b = after.lineItems[Number(row[1])];
    return !!a && !!b && a.description === b.description && a.quantity === b.quantity && a.unitPrice === b.unitPrice && a.amount === b.amount;
  }
  // The summary "the model doubted N item cells" holds while the list keeps its length.
  if (flag.path === "lineItems") return before.lineItems.length === after.lineItems.length;
  if ((SCALAR_FIELDS as readonly string[]).includes(flag.path)) {
    const field = flag.path as ScalarField;
    return before[field] === after[field];
  }
  return false;
}

export interface RevalidateOptions extends ValidateOptions {
  /**
   * The receipt as it was before the edit. Flags that describe how the document was
   * read are kept for every field the edit did not change. Without it only the flag
   * about merged photos is kept, and the rest are dropped (every other flag is
   * recomputed from the current values either way).
   */
  previous?: Receipt;
}

/** Re-run validation after a user edit (e.g. on the review screen). */
export function revalidate(receipt: Receipt, options: RevalidateOptions = {}): Receipt {
  const { flags: carried, ...base } = receipt;
  const { previous, ...validateOptions } = options;

  const kept = (previous?.flags ?? carried).filter((f) =>
    f.code === "merged_images" || (previous !== undefined && stillHolds(f, previous, receipt)),
  );
  // A field that still cannot be read already has an error; don't also say "missing".
  const failed = new Set(kept.filter((f) => f.code === "unparseable").map((f) => f.path));
  const checks = validateReceipt(base, validateOptions).filter(
    (f) => !(f.code === "missing" && failed.has(f.path)),
  );
  return { ...base, flags: [...kept, ...checks] };
}
