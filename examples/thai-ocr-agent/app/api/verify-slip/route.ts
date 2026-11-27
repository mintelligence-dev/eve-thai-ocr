import {
  parseSlipQr,
  slipVerifierFromEnv,
  type Verification,
} from "@eve-thai-ocr/extractor";
import { clientKey, slipPerVisitor } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The QR text is at most 128 characters; anything much larger is not one. */
const MAX_BODY_BYTES = 1024;

const reply = (body: object, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Is a verification service set up? The page asks this to decide whether to offer the check. */
export function GET() {
  const verifier = slipVerifierFromEnv(process.env);
  return reply(verifier ? { enabled: true, provider: verifier.name } : { enabled: false });
}

/**
 * Asks the bank, through the configured verification service, whether a transfer
 * exists. The request carries only the text of the slip's QR code: not the image,
 * and nothing else from the slip. Nothing is stored and nothing from the request or
 * the answer is logged.
 */
export async function POST(request: Request) {
  const verifier = slipVerifierFromEnv(process.env);
  if (!verifier) {
    return reply({ error: "Slip checking is not set up on this server.", code: "slip_verify_disabled" }, 501);
  }

  const limited = slipPerVisitor.hit(clientKey(request.headers));
  if (!limited.ok) {
    return reply(
      { error: `Too many checks from you. Try again in ${Math.ceil(limited.retryAfterSec / 60)} min.`, code: "rate_limited", retryAfterSec: limited.retryAfterSec },
      429,
      { "Retry-After": String(limited.retryAfterSec) },
    );
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply({ error: "The request is too large.", code: "bad_request" }, 413);
  }
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return reply({ error: "The request is too large.", code: "bad_request" }, 413);
    payload = (JSON.parse(text) as { payload?: unknown } | null)?.payload;
  } catch {
    return reply({ error: 'Expected JSON like {"payload": "<QR text>"}.', code: "bad_request" }, 400);
  }
  if (typeof payload !== "string") {
    return reply({ error: 'Expected JSON like {"payload": "<QR text>"}.', code: "bad_request" }, 400);
  }

  // A text that is not a bank slip QR code, or whose checksum fails, never reaches the service.
  const qr = parseSlipQr(payload);
  if (!qr) {
    return reply({ error: "This is not a transfer slip QR code, or it was read wrongly.", code: "invalid_qr" }, 400);
  }

  const check = await verifier.verify({ payload: payload.trim(), qr, signal: request.signal });
  if (check.status === "unavailable") {
    return reply(
      { error: "The slip checking service could not answer.", code: "slip_unavailable", reason: check.reason },
      503,
    );
  }

  const verification: Verification = {
    status: check.status,
    provider: verifier.name,
    checkedAt: new Date().toISOString(),
    ...(check.status === "verified" ? { bank: check.bank } : {}),
  };
  return reply({ verification });
}
