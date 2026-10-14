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
  merchant: z
    .string()
    .nullable()
    .describe("Shop name for a receipt, or the payee/recipient name for a transfer slip."),
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
      "Field names you could not read confidently, e.g. 'total', 'date', 'lineItems.2.amount'.",
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
  ]),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  /** Baht. */
  unitPrice: z.number().nullable(),
  /** Baht. */
  amount: z.number().nullable(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

/** Normalised, editable result shown on the review screen and exported. */
export const ReceiptSchema = z.object({
  documentType: z.enum(["receipt", "transfer_slip", "unknown"]),
  merchant: z.string().nullable(),
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
