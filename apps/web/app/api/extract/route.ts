import { DEFAULT_MODEL, extractReceipt } from "@thai-receipt-reader/extractor";
import { classifyError } from "@/lib/errors";
import { sniffImageType } from "@/lib/image-type";
import { clientKey, perVisitor, wholeSite } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel rejects request bodies above 4.5 MB, so stay under that.
const MAX_BYTES = 4 * 1024 * 1024;

/** Operator-facing hints keyed by AI SDK / Gateway error class name. */
const REASONS: Record<string, string> = {
  GatewayAuthenticationError: "AI Gateway rejected the API key. Check AI_GATEWAY_API_KEY and redeploy.",
  GatewayModelNotFoundError: "Model not found in AI Gateway. Check RECEIPT_MODEL.",
  GatewayRateLimitError: "AI Gateway rate limit or spending cap reached.",
  AI_NoObjectGeneratedError: "The model did not return data in the expected format. Try again or use another model.",
  AI_TypeValidationError: "The model returned data that failed validation. Try again or use another model.",
};

/**
 * Errors carry an English `error` for API consumers and a stable `code` (plus
 * optional numbers) so the web UI can show the message in the user's language.
 */
const error = (
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  Response.json(
    { error: message, code, ...extra },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );

/**
 * Receives one image, sends it to the model, returns the extraction. The image
 * lives only in memory for the duration of the request: it is never written to
 * disk or storage, and nothing from the document is logged.
 */
export async function POST(request: Request) {
  // Cheapest checks first: nothing is read or sent to a model when over limit.
  for (const [limiter, key, code, message] of [
    [perVisitor, clientKey(request.headers), "rate_limited", "Too many requests from you."],
    [wholeSite, "all", "daily_limit", "The demo has reached its daily limit."],
  ] as const) {
    const r = limiter.hit(key);
    if (!r.ok) {
      return error(code, `${message} Try again in ${Math.ceil(r.retryAfterSec / 60)} min.`, 429,
        { retryAfterSec: r.retryAfterSec }, { "Retry-After": String(r.retryAfterSec) });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("bad_request", "Expected multipart form data with an 'image' field.", 400);
  }

  const file = form.get("image");
  if (!(file instanceof File)) return error("missing_image", "Missing 'image' file.", 400);
  if (file.size === 0) return error("empty_file", "The file is empty.", 400);
  if (file.size > MAX_BYTES) return error("too_large", "Image is larger than 4 MB.", 413);

  // Trust the file's first bytes, not its name or the type the sender claims.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return error("bad_type", "Only JPEG, PNG or WebP images are supported.", 415);

  const model = process.env.RECEIPT_MODEL || DEFAULT_MODEL;
  try {
    const { receipt } = await extractReceipt({
      image: bytes,
      mediaType: type,
      model,
      abortSignal: request.signal,
    });
    // `model` is returned so the UI can show which model read the document.
    return Response.json({ receipt, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Not a failure of the document: unsupported (handwriting) or a busy service.
    const known = classifyError(e);
    if (known.code === "handwritten") return error(known.code, known.message, known.status);
    if (known.code === "busy") {
      console.error("extract busy: upstream rate limit");
      return error(known.code, known.message, known.status, { retryAfterSec: known.retryAfterSec }, { "Retry-After": String(known.retryAfterSec) });
    }
    // The client gets the error class and HTTP status only. The (truncated)
    // gateway message goes to server logs, visible to the project owner.
    const name = e instanceof Error ? e.name : "unknown";
    const status = (e as { statusCode?: number } | null)?.statusCode;
    console.error("extract failed:", name, status ?? "", e instanceof Error ? e.message.slice(0, 300) : "");
    const reason = REASONS[name] ?? "Extraction failed. Check the model configuration and try again.";
    return error("extract_failed", "Extraction failed.", 502, {
      detail: `${reason} (${name}${status ? `, HTTP ${status}` : ""})`,
    });
  }
}
