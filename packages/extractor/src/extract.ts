import { generateText, Output, type LanguageModel } from "ai";
import { normalizeExtraction } from "./normalize.js";
import { RawExtractionSchema, type Receipt, type RawExtraction } from "./schema.js";
import type { ValidateOptions } from "./validate.js";

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

export const SYSTEM_PROMPT = `You read printed Thai receipts and bank transfer slips and return structured data.
Rules:
- First decide what the image shows. Only a printed receipt, tax invoice or bank transfer slip counts. If the image is blank, unreadable, or anything else, set documentType to "unknown", every text field to null and lineItems to []. Never write plausible-looking values for text you cannot actually see.
- Copy values exactly as printed, including Thai digits (๑๒๓), Buddhist Era years (2568), and currency symbols. Do not convert, translate, round or calculate.
- If a field is not visible, return null. Never guess or invent values.
- For line items, fill quantityText and unitPriceText ONLY when they are printed as their own values. If the receipt shows just one price per line, put it in amountText and leave quantityText and unitPriceText null. Do not assume a quantity of 1 and do not copy the amount into unitPriceText.
- An add-on, topping or modifier printed on its own line under an item belongs to the line above. If it shows only a price (for example "@25.00") and no subtotal of its own, put that price in unitPriceText and leave amountText null. Never copy a price into amountText if the line above already includes it in its subtotal.
- Some receipts print "quantity * unit price / unit" (for example "2 * 41.00 / ชิ้น") on its own line directly BELOW an item. That line belongs to the item above it, not to the next item.
- Copy a price without the tax-class letter that may follow it (N, P, T, V...) only if you can; if unsure, copy it as printed.
- Discounts and promotions are line items with a negative amountText, as printed.
- For a transfer slip, "merchant" is the payee / recipient name and "totalText" is the transferred amount.
- Do NOT output bank account numbers, card numbers, phone numbers or national IDs.
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

export interface ExtractOptions extends ValidateOptions {
  /** Image bytes or a URL/data URL. Not retained by this library. */
  image: Uint8Array | ArrayBuffer | string | URL;
  mediaType?: string;
  /** "provider/model" string routed through Vercel AI Gateway, or a model instance. */
  model?: LanguageModel;
  /** Test seam: replace the model call. */
  generate?: (args: { image: ExtractOptions["image"]; mediaType?: string }) => Promise<RawExtraction>;
  abortSignal?: AbortSignal;
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
    return { raw, receipt: normalizeExtraction(raw, options) };
  }

  const result = await generateText({
    model: options.model ?? DEFAULT_MODEL,
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: RawExtractionSchema, name: "receipt" }),
    abortSignal: options.abortSignal,
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

  return {
    raw: result.output,
    receipt: normalizeExtraction(result.output, options),
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    },
  };
}
