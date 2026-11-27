import { HandwritingNotSupportedError } from "@eve-thai-ocr/extractor";
import { describe, expect, it } from "vitest";
import { classifyError, describeFailure } from "./errors";

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

describe("describeFailure", () => {
  it("gives the owner a detail and a log line for a failed extraction, never the document", () => {
    const e = Object.assign(new Error("secret text from the document ".repeat(30)), { name: "GatewayAuthenticationError", statusCode: 403 });
    const f = describeFailure(e);
    expect(f.code).toBe("extract_failed");
    expect(f.detail).toContain("AI Gateway rejected the API key");
    expect(f.detail).toContain("GatewayAuthenticationError, HTTP 403");
    expect(f.log!.length).toBeLessThan(400); // the message is truncated
  });

  it("logs a busy service briefly and has no detail", () => {
    const f = describeFailure(Object.assign(new Error("x"), { statusCode: 429 }));
    expect(f).toMatchObject({ code: "busy", status: 503, retryAfterSec: 15 });
    expect(f.detail).toBeUndefined();
    expect(f.log).toMatch(/busy/);
  });

  it("has nothing to log for handwriting", () => {
    const f = describeFailure(new HandwritingNotSupportedError());
    expect(f).toMatchObject({ code: "handwritten", status: 422 });
    expect(f.log).toBeUndefined();
  });
});

