import { generateText, Output, type LanguageModel } from "ai";
import { normalizeExtraction } from "./normalize.js";
import { RawExtractionSchema, type Receipt, type RawExtraction } from "./schema.js";
import type { ValidateOptions } from "./validate.js";

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

export const SYSTEM_PROMPT = `You read printed Thai receipts and bank transfer slips and return structured data.
Rules:
- Copy values exactly as printed, including Thai digits (๑๒๓), Buddhist Era years (2568), and currency symbols. Do not convert, translate, round or calculate.
- If a field is not visible, return null. Never guess or invent values.
- For line items, fill quantityText and unitPriceText ONLY when they are printed as their own values. If the receipt shows just one price per line, put it in amountText and leave quantityText and unitPriceText null. Do not assume a quantity of 1 and do not copy the amount into unitPriceText.
- Discounts and promotions are line items with a negative amountText, as printed.
- For a transfer slip, "merchant" is the payee / recipient name and "totalText" is the transferred amount.
- Do NOT output bank account numbers, card numbers, phone numbers or national IDs.
- List every field you could not read confidently in "uncertainFields", using these names: merchant, date, time, subtotal, vat, total, lineItems.<index>.description / quantity / unitPrice / amount (index starts at 0). Do not list a field that is simply not printed.
- You only extract text. You do not judge whether the document is genuine.`;

export interface ExtractOptions extends ValidateOptions {
  /** Image bytes or a URL/data URL. Not retained by this library. */
  image: Uint8Array | ArrayBuffer | string | URL;
  mediaType?: string;
  /** "provider/model" string routed through Vercel AI Gateway, or a model instance. */
  model?: LanguageModel;
  /** Test seam: replace the model call. */
  generate?: (args: { image: ExtractOptions["image"]; mediaType?: string }) => Promise<RawExtraction>;
  abortSignal?: AbortSignal;
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
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the fields from this document." },
          { type: "image", image: options.image, mediaType: options.mediaType },
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
