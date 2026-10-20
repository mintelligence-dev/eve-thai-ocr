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
