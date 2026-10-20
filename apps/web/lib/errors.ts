import { HandwritingNotSupportedError } from "@thai-receipt-reader/extractor";

export interface Classified {
  code: "handwritten" | "busy" | "extract_failed";
  status: number;
  message: string;
  /** Seconds to suggest waiting, for "busy". */
  retryAfterSec?: number;
}

const statusOf = (e: unknown): number | undefined => {
  const err = e as { statusCode?: number; lastError?: { statusCode?: number } } | null;
  return err?.lastError?.statusCode ?? err?.statusCode;
};

/**
 * Turn whatever the extraction threw into a code the UI can translate. A rate
 * limit (HTTP 429 from the AI Gateway, which the AI SDK wraps in a retry error
 * once its retries run out) is reported as "busy", not as a failure of the document.
 */
export function classifyError(e: unknown): Classified {
  if (e instanceof HandwritingNotSupportedError) {
    return {
      code: "handwritten",
      status: 422,
      message: "Handwritten documents are not supported. Use a printed receipt or transfer slip.",
    };
  }
  if (statusOf(e) === 429 || (e instanceof Error && e.name === "GatewayRateLimitError")) {
    return { code: "busy", status: 503, message: "The service is busy. Try again in a moment.", retryAfterSec: 15 };
  }
  return { code: "extract_failed", status: 502, message: "Extraction failed." };
}

/** Operator-facing hints keyed by AI SDK / Gateway error class name. */
const REASONS: Record<string, string> = {
  GatewayAuthenticationError: "AI Gateway rejected the API key. Check AI_GATEWAY_API_KEY and redeploy.",
  GatewayModelNotFoundError: "Model not found in AI Gateway. Check RECEIPT_MODEL.",
  GatewayRateLimitError: "AI Gateway rate limit or spending cap reached.",
  AI_NoObjectGeneratedError: "The model did not return data in the expected format. Try again or use another model.",
  AI_TypeValidationError: "The model returned data that failed validation. Try again or use another model.",
};

export interface Failure extends Classified {
  /** For the project owner: the error class, HTTP status and a hint. Safe to show. */
  detail?: string;
  /** A line for the server log (never contains the document). */
  log?: string;
}

/** Everything the API needs to report a failure, in one place for both response modes. */
export function describeFailure(e: unknown): Failure {
  const known = classifyError(e);
  if (known.code === "busy") return { ...known, log: "extract busy: upstream rate limit" };
  if (known.code !== "extract_failed") return known;

  const name = e instanceof Error ? e.name : "unknown";
  const status = (e as { statusCode?: number } | null)?.statusCode;
  const reason = REASONS[name] ?? "Extraction failed. Check the model configuration and try again.";
  return {
    ...known,
    detail: `${reason} (${name}${status ? `, HTTP ${status}` : ""})`,
    // The (truncated) gateway message goes to server logs, visible to the project owner.
    log: `extract failed: ${name} ${status ?? ""} ${e instanceof Error ? e.message.slice(0, 300) : ""}`,
  };
}
