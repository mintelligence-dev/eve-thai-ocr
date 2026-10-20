import { HandwritingNotSupportedError } from "@thai-receipt-reader/extractor";
import { describe, expect, it } from "vitest";
import { classifyError } from "./errors";

describe("classifyError", () => {
  it("reports handwriting as unsupported, not as a failure", () => {
    expect(classifyError(new HandwritingNotSupportedError())).toMatchObject({ code: "handwritten", status: 422 });
  });

  it("reports an upstream rate limit as busy, including when the AI SDK wrapped it in a retry error", () => {
    const wrapped = Object.assign(new Error("Failed after 4 attempts"), { name: "AI_RetryError", lastError: { statusCode: 429 } });
    expect(classifyError(wrapped)).toMatchObject({ code: "busy", status: 503, retryAfterSec: 15 });
    expect(classifyError(Object.assign(new Error("x"), { statusCode: 429 })).code).toBe("busy");
    const named = Object.assign(new Error("x"), { name: "GatewayRateLimitError" });
    expect(classifyError(named).code).toBe("busy");
  });

  it("treats anything else as a failed extraction", () => {
    expect(classifyError(new Error("boom"))).toMatchObject({ code: "extract_failed", status: 502 });
    expect(classifyError(Object.assign(new Error("x"), { statusCode: 500 })).code).toBe("extract_failed");
    expect(classifyError("weird").code).toBe("extract_failed");
    expect(classifyError(null).code).toBe("extract_failed");
  });
});
