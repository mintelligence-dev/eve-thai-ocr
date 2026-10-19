import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../src/normalize.js";
import { isValidThaiTaxId, taxIdDigits } from "../src/taxid.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");
// 1234567890121 is an invented number whose check digit happens to be correct.
const VALID = "1234567890121";

describe("taxIdDigits", () => {
  it("keeps only the digits, including Thai digits", () => {
    expect(taxIdDigits("1-2345-67890-12-1")).toBe(VALID);
    expect(taxIdDigits("TAX ID# ๑๒๓๔๕๖๗๘๙๐๑๒๑")).toBe(VALID);
  });
});

describe("isValidThaiTaxId", () => {
  it("accepts a number with the right check digit", () => {
    expect(isValidThaiTaxId(VALID)).toBe(true);
  });
  it("rejects a wrong check digit, a wrong length and non-digits", () => {
    expect(isValidThaiTaxId("1234567890122")).toBe(false);
    expect(isValidThaiTaxId("123456789012")).toBe(false);
    expect(isValidThaiTaxId("12345678901211")).toBe(false);
    expect(isValidThaiTaxId("12345678901AB")).toBe(false);
    expect(isValidThaiTaxId("")).toBe(false);
  });
  it("catches a single misread digit (a 1 read as a 7)", () => {
    expect(isValidThaiTaxId("7234567890121")).toBe(false);
  });
});

describe("tax ID in an extraction", () => {
  const codes = (r: ReturnType<typeof normalizeExtraction>) => r.flags.map((f) => `${f.path}:${f.code}`);

  it("is normalised to digits and not flagged when valid", () => {
    const r = normalizeExtraction({ ...fx.thaiDigitsReceipt, taxIdText: "๑-๒๓๔๕-๖๗๘๙๐-๑๒-๑" }, { today });
    expect(r.taxId).toBe(VALID);
    expect(codes(r)).not.toContain("taxId:invalid_tax_id");
  });

  it("is flagged, but kept for the person to fix, when the check digit is wrong", () => {
    const r = normalizeExtraction({ ...fx.thaiDigitsReceipt, taxIdText: "1-2345-67890-12-2" }, { today });
    expect(r.taxId).toBe("1234567890122");
    expect(codes(r)).toContain("taxId:invalid_tax_id");
  });

  it("is null when absent", () => {
    const r = normalizeExtraction(fx.thaiDigitsReceipt, { today });
    expect(r.taxId).toBeNull();
    expect(codes(r)).not.toContain("taxId:invalid_tax_id");
  });
});
