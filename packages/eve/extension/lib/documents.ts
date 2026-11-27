import { posix } from "node:path";
import {
  DifferentDocumentsError,
  HandwritingNotSupportedError,
  MAX_IMAGES,
  ReceiptSchema,
  extractReceipt,
  parseAmountToSatang,
  parseQuantity,
  parseThaiDate,
  parseTime,
  revalidate,
  sniffImageType,
  toCSV,
  toJSON,
  type ExtractOptions,
  type Flag,
  type LineItem,
  type Receipt,
} from "@eve-thai-receipt-extension/extractor";
import { z } from "zod";

/** Where eve copies the files people attach (see eve's "Inbound attachments"). */
export const ATTACHMENTS_DIR = "/workspace/.eve/attachments/";
/** All the photos of one document together. Nothing shrinks them first, unlike the web app. */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
/** Documents kept per session; the oldest is dropped first. */
export const MAX_KEPT = 20;

/**
 * A failure whose message is meant for the person: what went wrong and what to
 * do. Tools throw it so the agent relays it instead of reading the image itself.
 */
export class DocumentToolError extends Error {
  override name = "DocumentToolError";
}

/** Only files eve saved as attachments can be read. */
export function attachmentPath(path: string): string {
  const file = posix.normalize(path.trim());
  if (!file.startsWith(ATTACHMENTS_DIR) || file.length === ATTACHMENTS_DIR.length) {
    throw new DocumentToolError(`Only attached files under ${ATTACHMENTS_DIR} can be read. Pass the path from the file's "Attached file" label.`);
  }
  return file;
}

const ascii = (bytes: Uint8Array, from: number, text: string) =>
  [...text].every((c, i) => bytes[from + i] === c.charCodeAt(0));

/** Why a file that is not a JPEG, PNG or WebP was refused, in words a person can act on. */
export function unsupportedFileMessage(bytes: Uint8Array): string {
  if (ascii(bytes, 0, "%PDF")) {
    return "PDF files can't be read here yet. Send a photo or a screenshot of each page instead (up to 4, in order).";
  }
  const heif = ["heic", "heix", "hevc", "heif", "mif1", "msf1"];
  if (ascii(bytes, 4, "ftyp") && heif.some((brand) => ascii(bytes, 8, brand))) {
    return "HEIC photos can't be read. Send it as a JPEG or PNG, or as a screenshot of the photo.";
  }
  return "Only JPEG, PNG or WebP images of a printed receipt, tax invoice or transfer slip can be read.";
}

const statusOf = (e: unknown): number | undefined => {
  const err = e as { statusCode?: number; lastError?: { statusCode?: number } } | null;
  return err?.lastError?.statusCode ?? err?.statusCode;
};

/** Turn what the extraction threw into a message for the person. */
export function describeExtractFailure(e: unknown): DocumentToolError {
  if (e instanceof DocumentToolError) return e;
  if (e instanceof HandwritingNotSupportedError) {
    return new DocumentToolError("This looks handwritten. Only printed receipts, tax invoices and transfer slips can be read.");
  }
  if (e instanceof DifferentDocumentsError) {
    const fields = [...new Set(e.conflicts.map((c) => c.field))];
    const what = fields.length ? ` (they differ in: ${fields.join(", ")})` : "";
    return new DocumentToolError(
      `These photos don't look like parts of the same document${what}. Send photos of one receipt only, in order from top to bottom, or read each receipt on its own.`,
    );
  }
  if (statusOf(e) === 429 || (e instanceof Error && e.name === "GatewayRateLimitError")) {
    return new DocumentToolError("The reading service is busy. Try again in a moment.");
  }
  const name = e instanceof Error ? e.name : "error";
  return new DocumentToolError(`The document could not be read (${name}). Try again, or send a clearer photo.`);
}

export interface ReadOptions {
  /** Attachment paths of one document, in order from top to bottom. */
  paths: string[];
  /** Reads a file from the session sandbox; null when it is not there. */
  readFile: (path: string) => Promise<Uint8Array | null>;
  model: ExtractOptions["model"];
  maxBytes?: number;
  abortSignal?: AbortSignal;
  today?: Date;
  /** Test seam: replaces the model call (see extractReceipt). */
  generate?: ExtractOptions["generate"];
}

/** Read one document from one or more attached photos. The model only transcribes; the checks are code. */
export async function readDocument(options: ReadOptions): Promise<Receipt> {
  const { paths } = options;
  if (paths.length === 0) throw new DocumentToolError("Give the path of at least one attached photo.");
  if (paths.length > MAX_IMAGES) {
    throw new DocumentToolError(`At most ${MAX_IMAGES} photos can be read as one document. Read each receipt on its own.`);
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const images: { image: Uint8Array; mediaType: string }[] = [];
  let total = 0;
  for (const path of paths) {
    const file = attachmentPath(path);
    const bytes = await options.readFile(file);
    if (!bytes) throw new DocumentToolError(`The attachment ${file} is gone. Ask the person to send the photo again.`);
    if (bytes.length === 0) throw new DocumentToolError(`The attachment ${file} is empty.`);
    total += bytes.length;
    if (total > maxBytes) {
      throw new DocumentToolError(`The photos are larger than ${Math.floor(maxBytes / (1024 * 1024))} MB together. Send smaller photos or screenshots.`);
    }
    // Trust the file's first bytes, not its name or the type the sender claimed.
    const mediaType = sniffImageType(bytes);
    if (!mediaType) throw new DocumentToolError(unsupportedFileMessage(bytes));
    images.push({ image: bytes, mediaType });
  }

  try {
    const { receipt } = await extractReceipt({
      images,
      model: options.model,
      abortSignal: options.abortSignal,
      today: options.today,
      generate: options.generate,
    });
    return receipt;
  } catch (e) {
    throw describeExtractFailure(e);
  }
}

/* ------------------------------------------------------------------ */
/* Documents kept in the session                                       */
/* ------------------------------------------------------------------ */

export interface StoredDocument {
  id: string;
  receipt: Receipt;
  /** ISO time it was read. */
  readAt: string;
}
export interface DocumentStore {
  nextId: number;
  documents: StoredDocument[];
}
export const emptyStore = (): DocumentStore => ({ nextId: 1, documents: [] });

export function addDocument(store: DocumentStore, receipt: Receipt, now = new Date()): { store: DocumentStore; id: string } {
  const id = `doc-${store.nextId}`;
  const documents = [...store.documents, { id, receipt, readAt: now.toISOString() }].slice(-MAX_KEPT);
  return { store: { nextId: store.nextId + 1, documents }, id };
}

export function findDocument(store: DocumentStore, id: string): Receipt {
  const found = store.documents.find((d) => d.id === id);
  if (!found) {
    throw new DocumentToolError(`There is no document ${id} in this conversation. Read the photo again with read_document.`);
  }
  return found.receipt;
}

export function replaceDocument(store: DocumentStore, id: string, receipt: Receipt): DocumentStore {
  return { ...store, documents: store.documents.map((d) => (d.id === id ? { ...d, receipt } : d)) };
}

/* ------------------------------------------------------------------ */
/* Corrections                                                          */
/* ------------------------------------------------------------------ */

// Values are taken as the person typed them ("๑,๒๕๐ บาท", "12 พ.ค. 68") and parsed
// by the same code that parses the document, so the agent never converts a year
// or works out an amount itself.
const typed = z.string().nullable();
const textFields = [
  "merchant", "payer", "recipientName", "reference", "taxId", "bookNumber", "merchantAddress", "branch",
  "buyerName", "buyerAddress", "buyerTaxId", "referenceDocument", "totalInWords",
] as const;
const amountFields = ["subtotal", "vat", "total", "fee", "totalDiscount", "taxableAmount", "exemptAmount"] as const;

export const CorrectionSchema = z.object({
  fields: z
    .object({
      ...Object.fromEntries(textFields.map((f) => [f, typed.optional()])),
      ...Object.fromEntries(amountFields.map((f) => [f, typed.optional()])),
      date: typed.optional().describe("As the person wrote it, e.g. 12/05/2568 or 12 พ.ค. 68. It is parsed by code."),
      time: typed.optional().describe("As the person wrote it, e.g. 14:35 or 14.35 น."),
      documentType: z.enum(["receipt", "transfer_slip", "unknown"]).optional(),
      documentSubtype: z.enum(["receipt", "receipt_tax_invoice", "tax_invoice"]).nullable().optional(),
      paymentMethod: z.enum(["cash", "cheque", "transfer", "card", "other"]).nullable().optional(),
      hasSignature: z.boolean().nullable().optional(),
    } as Record<string, z.ZodType>)
    .partial()
    .optional()
    .describe(
      `Document fields to change, as the person typed them (null clears one). Text: ${textFields.join(", ")}. ` +
        `Amounts in baht, as typed: ${amountFields.join(", ")}. Also date, time, documentType, documentSubtype, paymentMethod, hasSignature.`,
    ),
  lineItems: z
    .array(
      z.object({
        index: z.number().int().min(0).describe("0-based position of the line in the document's lineItems."),
        remove: z.boolean().optional().describe("True to delete this line."),
        description: z.string().optional(),
        quantity: typed.optional(),
        unitPrice: typed.optional(),
        amount: typed.optional(),
        discount: typed.optional(),
        unit: typed.optional(),
        productCode: typed.optional(),
      }),
    )
    .optional()
    .describe("Changes to existing lines, by index. Values as typed."),
  addLineItems: z
    .array(
      z.object({
        description: z.string(),
        quantity: typed.optional(),
        unitPrice: typed.optional(),
        amount: typed.optional(),
      }),
    )
    .optional()
    .describe("Lines the reading missed, added at the end. Values as typed."),
});
export type Correction = z.infer<typeof CorrectionSchema>;

function parseBaht(field: string, text: string | null): number | null {
  if (text === null || text.trim() === "") return null;
  const satang = parseAmountToSatang(text);
  if (satang === null) throw new DocumentToolError(`"${text}" is not an amount (${field}). Ask the person for the figure as printed.`);
  return satang / 100;
}
function parseQty(field: string, text: string | null): number | null {
  if (text === null || text.trim() === "") return null;
  const q = parseQuantity(text);
  if (q === null) throw new DocumentToolError(`"${text}" is not a quantity (${field}).`);
  return q;
}

/** Apply a person's correction and run every check again, as the web review screen does. */
export function applyCorrection(receipt: Receipt, correction: Correction, today?: Date): Receipt {
  const patch: Record<string, unknown> = {};
  const fields = (correction.fields ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if ((amountFields as readonly string[]).includes(key)) {
      patch[key] = parseBaht(key, value as string | null);
    } else if (key === "date") {
      if (value === null || (value as string).trim() === "") patch.date = null;
      else {
        const parsed = parseThaiDate(value as string, { today });
        if (!parsed) throw new DocumentToolError(`"${value}" is not a date. Ask for it as printed, e.g. 12/05/2568.`);
        patch.date = parsed.iso;
      }
    } else if (key === "time") {
      if (value === null || (value as string).trim() === "") patch.time = null;
      else {
        const parsed = parseTime(value as string);
        if (!parsed) throw new DocumentToolError(`"${value}" is not a time. Ask for it as printed, e.g. 14:35.`);
        patch.time = parsed;
      }
    } else if (key === "taxId" || key === "buyerTaxId") {
      patch[key] = value === null ? null : String(value).replace(/\D/g, "") || null;
    } else {
      patch[key] = value;
    }
  }

  const lines: (LineItem | null)[] = receipt.lineItems.map((l) => ({ ...l }));
  for (const edit of correction.lineItems ?? []) {
    const line = lines[edit.index];
    if (!line) throw new DocumentToolError(`There is no line ${edit.index} (the document has ${receipt.lineItems.length} lines, counted from 0).`);
    if (edit.remove) {
      lines[edit.index] = null;
      continue;
    }
    const at = `lineItems.${edit.index}`;
    if (edit.description !== undefined) line.description = edit.description;
    if (edit.amount !== undefined) line.amount = parseBaht(`${at}.amount`, edit.amount);
    if (edit.discount !== undefined) line.discount = parseBaht(`${at}.discount`, edit.discount);
    if (edit.unit !== undefined) line.unit = edit.unit;
    if (edit.productCode !== undefined) line.productCode = edit.productCode;
    // As on the review screen: once a person sets the quantity or unit price, it is no longer assumed.
    if (edit.quantity !== undefined || edit.unitPrice !== undefined) delete line.assumed;
    if (edit.quantity !== undefined) line.quantity = parseQty(`${at}.quantity`, edit.quantity);
    if (edit.unitPrice !== undefined) line.unitPrice = parseBaht(`${at}.unitPrice`, edit.unitPrice);
  }
  for (const [i, add] of (correction.addLineItems ?? []).entries()) {
    const at = `addLineItems.${i}`;
    lines.push({
      description: add.description,
      quantity: parseQty(`${at}.quantity`, add.quantity ?? null),
      unitPrice: parseBaht(`${at}.unitPrice`, add.unitPrice ?? null),
      amount: parseBaht(`${at}.amount`, add.amount ?? null),
    });
  }

  const edited = { ...receipt, ...patch, lineItems: lines.filter((l): l is LineItem => l !== null) };
  const checked = ReceiptSchema.safeParse(revalidate(edited, { previous: receipt, today }));
  if (!checked.success) throw new DocumentToolError(`The correction does not fit the document: ${checked.error.issues[0]?.message ?? "invalid value"}.`);
  return checked.data;
}

/* ------------------------------------------------------------------ */
/* What the agent sees, and export                                     */
/* ------------------------------------------------------------------ */

const flagView = (f: Flag) => ({ field: f.path, problem: f.message });

/**
 * The document as the agent should present it. `mustFix` are errors (export is
 * locked until each is put right); `pleaseCheck` are warnings for the person.
 */
export function presentDocument(id: string, receipt: Receipt) {
  const { flags, ...document } = receipt;
  const mustFix = flags.filter((f) => f.severity === "error").map(flagView);
  const pleaseCheck = flags.filter((f) => f.severity === "warning").map(flagView);
  return { documentId: id, canExport: mustFix.length === 0, mustFix, pleaseCheck, document };
}

export type ExportFormat = "csv" | "json";

/** The export, refused while anything must still be fixed (the web app locks export the same way). */
export function exportDocument(id: string, receipt: Receipt, format: ExportFormat) {
  const errors = receipt.flags.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    const list = errors.map((f) => `${f.path}: ${f.message}`).join("; ");
    throw new DocumentToolError(`Export is locked until these are fixed: ${list}. Ask the person for the right values and call correct_document.`);
  }
  return {
    documentId: id,
    format,
    filename: `${id}.${format}`,
    content: format === "csv" ? toCSV(receipt) : toJSON(receipt),
  };
}
