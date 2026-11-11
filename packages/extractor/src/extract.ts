import { generateText, Output, streamText, type LanguageModel } from "ai";
import { findImageConflicts, type ImageConflict } from "./images.js";
import { normalizeExtraction } from "./normalize.js";
import { RawExtractionSchema, type Receipt, type RawExtraction } from "./schema.js";
import type { ValidateOptions } from "./validate.js";

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

export const SYSTEM_PROMPT = `You read printed Thai receipts and bank transfer slips and return structured data.
Rules:
- Set "handwritten" to true only when the main content of the document (its amounts, items or date) is handwritten rather than printed or typed. A signature, a stamp or a short handwritten note on an otherwise printed document does not count. If handwritten is true, do not try to read it: return every other field as null, lineItems as [] and uncertainFields as [].
- First decide what the image shows. Only a printed receipt, tax invoice or bank transfer slip counts. If the image is blank, unreadable, or anything else, set documentType to "unknown", every text field to null and lineItems to []. Never write plausible-looking values for text you cannot actually see.
- Copy values exactly as printed, including Thai digits (๑๒๓), Buddhist Era years (2568), and currency symbols. Do not convert, translate, round or calculate.
- If a field is not visible, return null. Never guess or invent values.
- For line items, fill quantityText and unitPriceText ONLY when they are printed as their own values. If the receipt shows just one price per line, put it in amountText and leave quantityText and unitPriceText null. Do not assume a quantity of 1 and do not copy the amount into unitPriceText.
- An add-on, topping or modifier printed on its own line under an item belongs to the line above. If it shows only a price (for example "@25.00") and no subtotal of its own, put that price in unitPriceText and leave amountText null. Never copy a price into amountText if the line above already includes it in its subtotal.
- Some receipts print "quantity * unit price / unit" (for example "2 * 41.00 / ชิ้น") on its own line directly BELOW an item. That line belongs to the item above it, not to the next item.
- Copy a price without the tax-class letter that may follow it (N, P, T, V...) only if you can; if unsure, copy it as printed.
- Discounts and promotions are line items with a negative amountText, as printed.
- For a transfer slip: "merchant" is the recipient (To / ไปยัง / ผู้รับ), "payer" is the sender (From / จาก / ผู้โอน), "totalText" is the amount transferred, "feeText" is the fee, "referenceText" is the transaction reference number (if two numbers are printed, use the one labelled transaction reference, เลขที่รายการ or รหัสอ้างอิง), and lineItems must be []. On a receipt, "referenceText" is the receipt or invoice number (Rcpt No., Receipt No., เลขที่ใบเสร็จ), never a POS, machine, permit, terminal, queue or cashier number, and null if no receipt number is printed; always also give "referenceLabel", the label printed next to that number, and payer and feeText are null; on a slip, taxIdText is null.
- If part of a value is hidden, covered, blurred or cut off (for example a white box over some digits), return null for that field and list it in "uncertainFields". Never return only the visible part of a number or name.
- Do NOT output bank account numbers, card numbers, phone numbers, or the personal ID number of a customer or of a person on a slip. The only IDs you may output are, on a receipt or tax invoice, the shop's tax ID ("taxIdText") and the buyer's tax ID ("buyerTaxIdText") (TAX ID, เลขประจำตัวผู้เสียภาษี), each copied exactly as printed and each in its own field.
- List every field you could not read confidently in "uncertainFields", using these names: merchant, date, time, subtotal, vat, total, lineItems.<index>.description / quantity / unitPrice / amount (index starts at 0). Do not list a field that is simply not printed.
- You only extract text. You do not judge whether the document is genuine.`;

/**
 * Reading a receipt is transcription, so extra "thinking" adds time and cost
 * without helping. Measured on a 17-item receipt: unlimited thinking took
 * 25-44 s and ~6,000 output tokens; a 1,024-token budget took 10-12 s and
 * ~1,900 tokens, with no loss of accuracy. Gemini 2.5 Flash thinks by default,
 * so cap it. Other models are left alone. Callers can override with
 * `providerOptions`.
 */
export function defaultProviderOptions(model: unknown): ExtractOptions["providerOptions"] {
  return model === "google/gemini-2.5-flash"
    ? { google: { thinkingConfig: { thinkingBudget: 1024 } } }
    : undefined;
}

/**
 * Thrown when the document is handwritten. Only printed receipts and transfer
 * slips are supported: handwritten numbers are read unreliably (the same amount
 * came back as 200,000, 2,000,000 and 2,009,000 on different runs) and nothing
 * on screen would tell the user so. The values the model read are discarded.
 */
export class HandwritingNotSupportedError extends Error {
  override name = "HandwritingNotSupportedError";
  constructor() {
    super("Handwritten documents are not supported. Use a printed receipt or transfer slip.");
  }
}

/**
 * Thrown when several images were given as parts of one document but they do
 * not look like the same one: the model said so, or what each image shows
 * (shop, tax ID, date, total) disagrees. Nothing is merged: a merged result of
 * two different receipts would look plausible and be wrong.
 */
export class DifferentDocumentsError extends Error {
  override name = "DifferentDocumentsError";
  constructor(
    readonly reason: "model" | "conflict",
    readonly conflicts: ImageConflict[] = [],
  ) {
    super("These images do not look like parts of the same document.");
  }
}

/** The most images that can be read as one document. */
export const MAX_IMAGES = 4;

export interface InputImage {
  image: Uint8Array | ArrayBuffer | string | URL;
  mediaType?: string;
}

/** Added to the system prompt when more than one image is given. */
export const MULTI_IMAGE_PROMPT = `
You are given several images, in order (Image 1, Image 2, ...). They should be consecutive parts of ONE long receipt or slip, top to bottom, and they may overlap: lines at the bottom of one image can appear again at the top of the next.
- Return ONE merged result for the whole document. Write each printed line once: a line visible in two images because they overlap is one line. Do not drop lines. Do not merge lines that are genuinely repeated in the document (the same item bought twice is two lines): decide by position, using the overlap. If the images are out of order, still read the document from top to bottom.
- Shop name, tax ID and date come from the first image that shows them. Totals, VAT and payment lines come from the image that shows them.
- Set "sameDocument" to false if the images do not look like parts of one document: a different shop, a different date or time, a different receipt number, or lines that do not continue from one image to the next. A second photo of the same part is still one document.
- Fill "imageFacts" with one entry per image, in order, with only what is printed in THAT image (null when it is not visible there). Do this before anything else. "totalText" is the final grand total, never a subtotal.
- If sameDocument is false, do not read the document: return every other field as null, lineItems as [] and uncertainFields as [].`;

export interface ExtractOptions extends ValidateOptions {
  /** Image bytes or a URL/data URL. Not retained by this library. */
  image?: Uint8Array | ArrayBuffer | string | URL;
  mediaType?: string;
  /**
   * Several images of ONE long document, in order from top to bottom (up to
   * MAX_IMAGES). They may overlap. Used instead of `image`.
   */
  images?: InputImage[];
  /** "provider/model" string routed through Vercel AI Gateway, or a model instance. */
  model?: LanguageModel;
  /** Test seam: replace the model call. */
  generate?: (args: ExtractOptions) => Promise<RawExtraction>;
  /** Test seam for `extractReceiptStream`: yields the growing partial output. */
  generateStream?: (args: ExtractOptions) => AsyncIterable<RawPartial>;
  abortSignal?: AbortSignal;
  /** Retries after a failed model call, with growing pauses (2 s, 4 s, 8 s). Default 3. */
  maxRetries?: number;
  /** Provider-specific settings passed to the AI SDK, e.g. a reasoning budget. */
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
}

export interface ExtractResult {
  receipt: Receipt;
  raw: RawExtraction;
  /** How many images the result was read from. */
  imageCount: number;
  /** Token usage reported by the model call. Absent when `generate` is used. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** The images to read: `images` if given, else the single `image`. */
export function inputImages(options: ExtractOptions): InputImage[] {
  const list = options.images?.length ? options.images : options.image !== undefined ? [{ image: options.image, mediaType: options.mediaType }] : [];
  if (list.length === 0) throw new Error("Give an image (`image`) or a list of images (`images`).");
  if (list.length > MAX_IMAGES) throw new Error(`At most ${MAX_IMAGES} images can be read as one document.`);
  return list;
}

/** Throw if the model or the per-image facts say these are not one document. */
function assertSameDocument(raw: RawExtraction, imageCount: number, today?: Date) {
  if (imageCount < 2) return;
  if (raw.sameDocument === false) throw new DifferentDocumentsError("model");
  const conflicts = findImageConflicts(raw.imageFacts, today);
  if (conflicts.length > 0) throw new DifferentDocumentsError("conflict", conflicts);
}

/** The model call shared by `extractReceipt` and `extractReceiptStream`. */
function modelCall(options: ExtractOptions) {
  const model = options.model ?? DEFAULT_MODEL;
  const images = inputImages(options);
  const many = images.length > 1;
  return {
    model,
    system: many ? SYSTEM_PROMPT + MULTI_IMAGE_PROMPT : SYSTEM_PROMPT,
    output: Output.object({ schema: RawExtractionSchema, name: "receipt" }),
    // The AI SDK default is 2. Short bursts of 429 (rate limit) are common on a free
    // AI Gateway account, and one more pause usually rides them out.
    maxRetries: options.maxRetries ?? 3,
    providerOptions: options.providerOptions ?? defaultProviderOptions(model),
    messages: [
      {
        role: "user" as const,
        content: many
          ? [
              { type: "text" as const, text: `Extract the fields from this document. It is given as ${images.length} images, in order.` },
              ...images.flatMap((img, i) => [
                { type: "text" as const, text: `Image ${i + 1} of ${images.length}:` },
                { type: "file" as const, data: img.image, mediaType: img.mediaType ?? "image/*" },
              ]),
            ]
          : [
              { type: "text" as const, text: "Extract the fields from this document." },
              { type: "file" as const, data: images[0]!.image, mediaType: images[0]!.mediaType ?? "image/*" },
            ],
      },
    ],
  };
}

/**
 * Extract and normalise a receipt from one image. The model only transcribes
 * text; parsing, VAT checks and flags are deterministic.
 */
export async function extractReceipt(options: ExtractOptions): Promise<ExtractResult> {
  if (options.generate) {
    const raw = RawExtractionSchema.parse(await options.generate(options));
    if (raw.handwritten) throw new HandwritingNotSupportedError();
    const count = inputImages(options).length;
    assertSameDocument(raw, count, options.today);
    return { raw, receipt: normalizeExtraction(raw, { ...options, imageCount: count }), imageCount: count };
  }

  const result = await generateText({ ...modelCall(options), abortSignal: options.abortSignal });

  if (result.output.handwritten) throw new HandwritingNotSupportedError();
  const count = inputImages(options).length;
  assertSameDocument(result.output, count, options.today);
  return {
    raw: result.output,
    receipt: normalizeExtraction(result.output, { ...options, imageCount: count }),
    imageCount: count,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** What the model has written so far: text exactly as printed, not yet parsed or checked. */
export type RawPartial = DeepPartial<RawExtraction>;

export type ExtractEvent =
  | { type: "partial"; raw: RawPartial }
  | { type: "final"; result: ExtractResult };

/**
 * While streaming: refuse as soon as the model says the images differ, or as soon as
 * the per-image facts are complete (the next field, documentType, has started) and
 * they disagree. Returns whether the facts have been checked. Facts that are still
 * being written can be cut mid-word, so they are not compared until then.
 */
function earlyDocumentCheck(partial: RawPartial, count: number, alreadyChecked: boolean, today?: Date): boolean {
  if (partial.sameDocument === false) throw new DifferentDocumentsError("model");
  if (alreadyChecked || partial.documentType === undefined) return alreadyChecked;
  const facts = (partial.imageFacts ?? []).filter((f): f is NonNullable<typeof f> => f != null);
  const conflicts = findImageConflicts(
    facts.map((f) => ({
      merchant: f.merchant ?? null,
      taxIdText: f.taxIdText ?? null,
      referenceText: f.referenceText ?? null,
      dateText: f.dateText ?? null,
      totalText: f.totalText ?? null,
    })),
    today,
  );
  if (conflicts.length > 0) throw new DifferentDocumentsError("conflict", conflicts);
  return true;
}

/**
 * Like `extractReceipt`, but yields what the model has read so far as it goes
 * (`partial`, raw text only: no parsing, no flags, so nothing in it can be
 * exported) and ends with the same result `extractReceipt` returns (`final`).
 * A handwritten document is refused as soon as the model says so, without
 * waiting for, or paying for, the rest of the answer.
 */
export async function* extractReceiptStream(options: ExtractOptions): AsyncGenerator<ExtractEvent> {
  if (options.generateStream) {
    const count = inputImages(options).length;
    let last: RawPartial = {};
    let checked = false;
    for await (const partial of options.generateStream(options)) {
      if (partial.handwritten === true) throw new HandwritingNotSupportedError();
      if (count > 1) checked = earlyDocumentCheck(partial, count, checked, options.today);
      last = partial;
      yield { type: "partial", raw: partial };
    }
    const raw = RawExtractionSchema.parse(last);
    if (raw.handwritten) throw new HandwritingNotSupportedError();
    assertSameDocument(raw, count, options.today);
    yield { type: "final", result: { raw, receipt: normalizeExtraction(raw, { ...options, imageCount: count }), imageCount: count } };
    return;
  }

  // Our own controller lets us stop the model call early, and still honours the caller's signal.
  const controller = new AbortController();
  options.abortSignal?.addEventListener("abort", () => controller.abort(), { once: true });
  // streamText reports failures through a callback instead of throwing from the stream.
  let failure: unknown;
  const result = streamText({
    ...modelCall(options),
    abortSignal: controller.signal,
    onError: ({ error }) => {
      failure = error;
    },
  });

  const count = inputImages(options).length;
  let checked = false;
  for await (const partial of result.partialOutputStream) {
    const p = partial as RawPartial;
    try {
      if (p.handwritten === true) throw new HandwritingNotSupportedError();
      if (count > 1) checked = earlyDocumentCheck(p, count, checked, options.today);
    } catch (e) {
      controller.abort(); // stop paying for an answer we are going to refuse
      throw e;
    }
    yield { type: "partial", raw: p };
  }
  if (failure) throw failure;

  const output = await result.output;
  if (output.handwritten) throw new HandwritingNotSupportedError();
  let usage: ExtractResult["usage"];
  try {
    const u = await result.usage;
    usage = { inputTokens: u?.inputTokens, outputTokens: u?.outputTokens };
  } catch {
    usage = undefined;
  }
  assertSameDocument(output, count, options.today);
  yield { type: "final", result: { raw: output, receipt: normalizeExtraction(output, { ...options, imageCount: count }), imageCount: count, usage } };
}
