import { generateText, Output, type LanguageModel } from "ai";
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
- Do NOT output bank account numbers, card numbers, phone numbers, or the personal ID number of a customer or of a person on a slip. The only ID you may output is the shop's tax ID ("taxIdText") on a receipt or tax invoice (TAX ID, เลขประจำตัวผู้เสียภาษี), copied exactly as printed.
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

export interface ExtractOptions extends ValidateOptions {
  /** Image bytes or a URL/data URL. Not retained by this library. */
  image: Uint8Array | ArrayBuffer | string | URL;
  mediaType?: string;
  /** "provider/model" string routed through Vercel AI Gateway, or a model instance. */
  model?: LanguageModel;
  /** Test seam: replace the model call. */
  generate?: (args: { image: ExtractOptions["image"]; mediaType?: string }) => Promise<RawExtraction>;
  abortSignal?: AbortSignal;
  /** Retries after a failed model call, with growing pauses (2 s, 4 s, 8 s). Default 3. */
  maxRetries?: number;
  /** Provider-specific settings passed to the AI SDK, e.g. a reasoning budget. */
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
}

export interface ExtractResult {
  receipt: Receipt;
  raw: RawExtraction;
  /** Token usage reported by the model call. Absent when `generate` is used. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Extract and normalise a receipt from one image. The model only transcribes
 * text; parsing, VAT checks and flags are deterministic.
 */
export async function extractReceipt(options: ExtractOptions): Promise<ExtractResult> {
  if (options.generate) {
    const raw = RawExtractionSchema.parse(await options.generate(options));
    if (raw.handwritten) throw new HandwritingNotSupportedError();
    return { raw, receipt: normalizeExtraction(raw, options) };
  }

  const result = await generateText({
    model: options.model ?? DEFAULT_MODEL,
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: RawExtractionSchema, name: "receipt" }),
    abortSignal: options.abortSignal,
    // The AI SDK default is 2. Short bursts of 429 (rate limit) are common on a free
    // AI Gateway account, and one more pause usually rides them out.
    maxRetries: options.maxRetries ?? 3,
    providerOptions: options.providerOptions ?? defaultProviderOptions(options.model ?? DEFAULT_MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the fields from this document." },
          { type: "file", data: options.image, mediaType: options.mediaType ?? "image/*" },
        ],
      },
    ],
  });

  if (result.output.handwritten) throw new HandwritingNotSupportedError();
  return {
    raw: result.output,
    receipt: normalizeExtraction(result.output, options),
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
