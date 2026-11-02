import { DEFAULT_MODEL, MAX_IMAGES, extractReceipt, extractReceiptStream } from "@thai-receipt-reader/extractor";
import { describeFailure } from "@/lib/errors";
import { sniffImageType } from "@/lib/image-type";
import { clientKey, perVisitor, wholeSite } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel rejects request bodies above 4.5 MB, so stay under that.
const MAX_BYTES = 4 * 1024 * 1024; // all the images together
/** Partial results are sent at most this often; the model emits one per token. */
const PARTIAL_EVERY_MS = 150;

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

  // One image, or several photos of ONE long document in order from top to bottom.
  const files = form.getAll("image");
  if (files.length === 0 || !files.every((f): f is File => f instanceof File)) {
    return error("missing_image", "Missing 'image' file.", 400);
  }
  if (files.length > MAX_IMAGES) return error("too_many_images", `At most ${MAX_IMAGES} images.`, 400);
  if (files.some((f) => f.size === 0)) return error("empty_file", "The file is empty.", 400);
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) return error("too_large", "The images are larger than 4 MB together.", 413);

  // Each extra image costs about one more model call: count it against the limits.
  for (let i = 1; i < files.length; i++) {
    for (const [limiter, key] of [[perVisitor, clientKey(request.headers)], [wholeSite, "all"]] as const) {
      const r = limiter.hit(key);
      if (!r.ok) {
        return error("rate_limited", `Too many requests. Try again in ${Math.ceil(r.retryAfterSec / 60)} min.`, 429,
          { retryAfterSec: r.retryAfterSec }, { "Retry-After": String(r.retryAfterSec) });
      }
    }
  }

  // Trust each file's first bytes, not its name or the type the sender claims.
  const images: { image: Uint8Array; mediaType: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return error("bad_type", "Only JPEG, PNG or WebP images are supported.", 415);
    images.push({ image: bytes, mediaType: type });
  }

  const model = process.env.RECEIPT_MODEL || DEFAULT_MODEL;

  // ?stream=1: send what the model has read so far as it goes (one JSON object per
  // line), then the final result. The web page uses this so something moves on
  // screen within a couple of seconds instead of after the whole answer.
  if (new URL(request.url).searchParams.has("stream")) {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        let lastPartial = 0;
        try {
          for await (const event of extractReceiptStream({ images, model, abortSignal: request.signal })) {
            if (event.type === "final") {
              send({ type: "final", receipt: event.result.receipt, model });
            } else if (Date.now() - lastPartial >= PARTIAL_EVERY_MS) {
              lastPartial = Date.now();
              send({ type: "partial", raw: event.raw });
            }
          }
        } catch (e) {
          const f = describeFailure(e);
          if (f.log) console.error(f.log);
          send({ type: "error", code: f.code, error: f.message, retryAfterSec: f.retryAfterSec, detail: f.detail, fields: f.fields });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  }

  try {
    const { receipt } = await extractReceipt({
      images,
      model,
      abortSignal: request.signal,
    });
    // `model` is returned so the UI can show which model read the document.
    return Response.json({ receipt, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const f = describeFailure(e);
    if (f.log) console.error(f.log);
    const extra: Record<string, unknown> = {};
    if (f.retryAfterSec) extra.retryAfterSec = f.retryAfterSec;
    if (f.detail) extra.detail = f.detail;
    if (f.fields) extra.fields = f.fields;
    return error(f.code, f.message, f.status, extra, f.retryAfterSec ? { "Retry-After": String(f.retryAfterSec) } : {});
  }
}
