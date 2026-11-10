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
  sameDocument: z
    .boolean()
    .describe(
      "With several images: true only if they are all parts of ONE document (one receipt or slip, possibly overlapping). False if they look like different documents. Always true for a single image.",
    ),
  imageFacts: z
    .array(
      z.object({
        merchant: z.string().nullable(),
        taxIdText: z.string().nullable(),
        referenceText: z.string().nullable(),
        dateText: z.string().nullable(),
        totalText: z.string().nullable(),
      }),
    )
    .describe(
      "With several images: one entry per image, in order, with what is printed in THAT image only (null when not visible there). totalText is the final grand total, not a subtotal. Empty for a single image.",
    ),
  merchant: z
    .string()
    .nullable()
    .describe(
      "Shop name for a receipt, or the recipient (To) name for a transfer slip: the name only, without a bank name, account number, biller ID or shop code. A name that wraps onto a second line is one name.",
    ),
  recipientName: z
    .string()
    .nullable()
    .describe(
      "Transfer slip only: when the recipient is shown with BOTH a shop or business name and, separately, a person's name (the account holder), this is the person's name and 'merchant' is the shop or business name. Null when the slip shows only one name for the recipient, and on receipts.",
    ),
  payer: z
    .string()
    .nullable()
    .describe(
      "Sender (From) name on a transfer slip: the name only, without the bank's name (ธนาคาร, ธ.) or an account number. Null on receipts or when no name is shown.",
    ),
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
    "merged_images",
    "slip_not_found",
    "slip_pending",
    "slip_amount_mismatch",
    "slip_date_mismatch",
    "slip_reference_mismatch",
    "slip_qr_reference_mismatch",
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

/**
 * What the bank's own records say about a transfer. Only the figures needed to
 * compare with the slip are kept: no account numbers and no names.
 */
export const BankSlipSchema = z.object({
  transRef: z.string(),
  /** ISO date and time with offset, as the bank reports it. */
  date: z.string().nullable(),
  /** Baht. */
  amount: z.number(),
  /** Baht. */
  fee: z.number().nullable(),
  /** 3-digit Bank of Thailand code of the sender's bank. */
  senderBank: z.string().nullable(),
  /** 3-digit Bank of Thailand code of the receiver's bank. */
  receiverBank: z.string().nullable(),
});
export type BankSlip = z.infer<typeof BankSlipSchema>;

/**
 * The result of looking a transfer slip up with the bank (see slip.ts). Absent
 * when nobody checked. It is kept on the receipt so that an edit to the amount or
 * date is compared with the bank's figures again, and so an export records it.
 */
export const VerificationSchema = z.object({
  /**
   * verified: the bank has this transfer. not_found: it has no such transfer. pending: too
   * recent to tell. unavailable: it was asked, but the service or the bank could not answer;
   * that says nothing about the slip.
   */
  status: z.enum(["verified", "not_found", "pending", "unavailable"]),
  /** For unavailable: why (the key was refused, out of quota, busy, or another error). */
  reason: z.enum(["rejected", "quota", "busy", "error"]).optional(),
  /** Name of the service that looked it up. */
  provider: z.string(),
  /** When it was looked up (ISO timestamp). */
  checkedAt: z.string(),
  /** Present when verified. */
  bank: BankSlipSchema.optional(),
});
export type Verification = z.infer<typeof VerificationSchema>;

/** Normalised, editable result shown on the review screen and exported. */
export const ReceiptSchema = z.object({
  documentType: z.enum(["receipt", "transfer_slip", "unknown"]),
  /** Shop, or the payee (recipient) on a transfer slip. */
  merchant: z.string().nullable(),
  /** Sender on a transfer slip. */
  payer: z.string().nullable(),
  /**
   * Transfer slip: the account holder's name, when the recipient is shown with both a shop
   * or business name (`merchant`) and a person's name. Null when only one name is shown.
   */
  recipientName: z.string().nullable(),
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
  /**
   * What the slip's own QR code says (the sending bank and the transaction reference), when
   * the code was found in the photo. It is read on the device and needs no service; the
   * reference on the slip is compared with it.
   */
  slipQr: z.object({ sendingBank: z.string(), transRef: z.string() }).optional(),
  /** The bank's answer, when a transfer slip was checked with the bank. */
  verification: VerificationSchema.optional(),
  flags: z.array(FlagSchema),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
