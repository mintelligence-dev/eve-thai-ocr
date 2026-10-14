import { extractReceipt } from "@thai-receipt-reader/extractor";
import { clientKey, perVisitor, wholeSite } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel rejects request bodies above 4.5 MB, so stay under that.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Operator-facing hints keyed by AI SDK / Gateway error class name. */
const REASONS: Record<string, string> = {
  GatewayAuthenticationError: "AI Gateway rejected the API key. Check AI_GATEWAY_API_KEY and redeploy.",
  GatewayModelNotFoundError: "Model not found in AI Gateway. Check RECEIPT_MODEL.",
  GatewayRateLimitError: "AI Gateway rate limit or spending cap reached.",
  AI_NoObjectGeneratedError: "The model did not return data in the expected format. Try again or use another model.",
  AI_TypeValidationError: "The model returned data that failed validation. Try again or use another model.",
};

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives one image, sends it to the model, returns the extraction. The image
 * lives only in memory for the duration of the request: it is never written to
 * disk or storage, and nothing from the document is logged.
 */
export async function POST(request: Request) {
  // Cheapest checks first: nothing is read or sent to a model when over limit.
  for (const [limiter, key, who] of [
    [perVisitor, clientKey(request.headers), "คุณใช้งานบ่อยเกินไป / You have made too many requests"],
    [wholeSite, "all", "เดโมถึงโควตารายวันแล้ว / The demo has reached its daily limit"],
  ] as const) {
    const r = limiter.hit(key);
    if (!r.ok) {
      const mins = Math.ceil(r.retryAfterSec / 60);
      return Response.json(
        { error: `${who}. ลองใหม่ใน ${mins} นาที / Try again in ${mins} min.` },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSec), "Cache-Control": "no-store" } },
      );
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart form data with an 'image' field.", 400);
  }

  const file = form.get("image");
  if (!(file instanceof File)) return error("Missing 'image' file.", 400);
  if (!TYPES.has(file.type)) return error("Only JPEG, PNG or WebP images are supported.", 415);
  if (file.size === 0) return error("The file is empty.", 400);
  if (file.size > MAX_BYTES) return error("Image is larger than 4 MB.", 413);

  try {
    const { receipt } = await extractReceipt({
      image: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type,
      model: process.env.RECEIPT_MODEL || undefined,
      abortSignal: request.signal,
    });
    return Response.json({ receipt }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // The client gets the error class and HTTP status only. The (truncated)
    // gateway message goes to server logs, visible to the project owner.
    const name = e instanceof Error ? e.name : "unknown";
    const status = (e as { statusCode?: number } | null)?.statusCode;
    console.error("extract failed:", name, status ?? "", e instanceof Error ? e.message.slice(0, 300) : "");
    const reason = REASONS[name] ?? "Extraction failed. Check the model configuration and try again.";
    return error(`${reason} (${name}${status ? `, HTTP ${status}` : ""})`, 502);
  }
}
