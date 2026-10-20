import { z } from "zod";

/**
 * What the vision model returns. Everything is kept as the text printed on the
 * document (Thai digits, Buddhist Era dates, "฿1,234.50"...). Normalisation to
 * numbers and ISO dates is done by deterministic code in `normalize.ts`, never
 * by the model.
 */
export const RawExtractionSchema = z.object({
  documentType: z
    .enum(["receipt", "transfer_slip", "unknown"])
    .describe("Kind of document in the image."),
  handwritten: z
    .boolean()
    .describe(
      "True only when the main content (the amounts, items or date) is handwritten rather than printed or typed. A signature, stamp or short handwritten note on an otherwise printed document does not count.",
    ),
  merchant: z
    .string()
    .nullable()
    .describe("Shop name for a receipt, or the payee / recipient (To) name for a transfer slip."),
  payer: z
    .string()
    .nullable()
    .describe("Sender (From) name on a transfer slip. Null on receipts or when no name is shown."),
  referenceText: z
    .string()
    .nullable()
    .describe(
      "Transaction reference number on a transfer slip, or the receipt / invoice number on a receipt. Never an account number.",
    ),
  referenceLabel: z
    .string()
    .nullable()
    .describe(
      "The label printed right next to the number in referenceText, copied as printed (e.g. 'Rcpt No.', 'Transaction reference', 'เลขที่รายการ'). Null if it has no label.",
    ),
  taxIdText: z
    .string()
    .nullable()
    .describe("The shop's tax ID as printed on a receipt or tax invoice (TAX ID, เลขประจำตัวผู้เสียภาษี). Null if absent."),
  feeText: z.string().nullable().describe("Transfer fee as printed, on a transfer slip."),
  dateText: z.string().nullable().describe("Date exactly as printed."),
  timeText: z.string().nullable().describe("Time exactly as printed."),
  currency: z
    .string()
    .nullable()
    .describe("Currency code if printed (e.g. THB). Null if only ฿ / บาท is shown."),
  subtotalText: z.string().nullable().describe("Subtotal before VAT, as printed."),
  vatText: z.string().nullable().describe("VAT amount, as printed."),
  totalText: z.string().nullable().describe("Grand total / transferred amount, as printed."),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantityText: z.string().nullable(),
      unitPriceText: z.string().nullable(),
      amountText: z.string().nullable(),
    }),
  ),
  uncertainFields: z
    .array(z.string())
    .describe(
      "Names of fields printed but not read confidently: merchant, payer, date, time, subtotal, vat, total, fee, reference, taxId, or lineItems.<index>.<description|quantity|unitPrice|amount>.",
    ),
});
export type RawExtraction = z.infer<typeof RawExtractionSchema>;

export const FlagSchema = z.object({
  /** Field path, e.g. "total", "date", "lineItems.1.amount". */
  path: z.string(),
  code: z.enum([
    "model_uncertain",
    "missing",
    "unparseable",
    "unsupported_currency",
    "two_digit_year",
    "date_in_future",
    "date_too_old",
    "line_total_mismatch",
    "items_total_mismatch",
    "vat_mismatch",
    "negative_amount",
    "not_a_receipt",
    "addon_split",
    "invalid_tax_id",
  ]),
  severity: z.enum(["error", "warning"]),
  /** English text, for logs and API consumers. */
  message: z.string(),
  /** Values used in `message`, so a UI can render the flag in another language. */
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  /** Baht. */
  unitPrice: z.number().nullable(),
  /** Baht. */
  amount: z.number().nullable(),
  /**
   * True when quantity and unit price were not printed and were filled in as
   * 1 x amount. Cleared when a person edits either field.
   */
  assumed: z.boolean().optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

/** Normalised, editable result shown on the review screen and exported. */
export const ReceiptSchema = z.object({
  documentType: z.enum(["receipt", "transfer_slip", "unknown"]),
  /** Shop, or the payee (recipient) on a transfer slip. */
  merchant: z.string().nullable(),
  /** Sender on a transfer slip. */
  payer: z.string().nullable(),
  /** Transaction reference on a transfer slip, or the receipt / invoice number. */
  reference: z.string().nullable(),
  /** The shop's tax ID, digits only. */
  taxId: z.string().nullable(),
  /** Transfer fee in baht, on a transfer slip. */
  fee: z.number().nullable(),
  /** ISO date (Gregorian), e.g. 2025-05-12. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** HH:mm, 24h. */
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  currency: z.string(),
  /** All money fields are in baht. */
  subtotal: z.number().nullable(),
  vat: z.number().nullable(),
  total: z.number().nullable(),
  lineItems: z.array(LineItemSchema),
  flags: z.array(FlagSchema),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
