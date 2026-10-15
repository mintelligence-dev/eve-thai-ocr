import { describe, expect, it } from "vitest";
import { FlagSchema, SAMPLES, normalizeExtraction } from "@thai-receipt-reader/extractor/core";
import { T, apiErrorText, detectLang, fieldLabel, flagText, LANGS } from "./i18n";

const today = new Date("2025-10-14T00:00:00Z");

describe("dictionaries", () => {
  it("th and en have exactly the same keys", () => {
    expect(Object.keys(T.th).sort()).toEqual(Object.keys(T.en).sort());
    expect(Object.keys(T.th.sample).sort()).toEqual(Object.keys(T.en.sample).sort());
    expect(Object.keys(T.th.docTypes).sort()).toEqual(Object.keys(T.en.docTypes).sort());
    expect(Object.keys(T.th.themes).sort()).toEqual(Object.keys(T.en.themes).sort());
    expect(Object.keys(T.th.against).sort()).toEqual(Object.keys(T.en.against).sort());
  });
  it("has a label for every sample", () => {
    for (const s of SAMPLES) for (const l of LANGS) expect(T[l].sample[s.id]).toBeTruthy();
  });
});

describe("flagText", () => {
  const flags = SAMPLES.flatMap((s) => normalizeExtraction(s.raw, { today }).flags);

  it("renders every flag from the samples with no leftover placeholders", () => {
    expect(flags.length).toBeGreaterThan(3);
    for (const f of flags) for (const l of LANGS) {
      const text = flagText(f, l);
      expect(text, `${f.code} ${l}`).not.toMatch(/[{}]|undefined/);
      expect(text.length).toBeGreaterThan(5);
      for (const v of Object.values(f.params ?? {})) expect(text, `${f.code} ${l}`).toContain(String(v));
    }
  });

  it("handles every flag code in both languages", () => {
    for (const code of FlagSchema.shape.code.options) for (const l of LANGS) {
      const text = flagText({ path: "total", code, severity: "warning", message: "fallback" }, l);
      expect(text).not.toBe("fallback");
    }
  });

  it("puts the numbers into the sentence", () => {
    const f = { path: "vat", code: "vat_mismatch", severity: "warning", message: "", params: { vat: "50.00", rate: "7" } } as const;
    expect(flagText(f, "en")).toContain("50.00");
    expect(flagText(f, "th")).toContain("7%");
  });
});

describe("fieldLabel", () => {
  it("names fields and numbers line items from 1", () => {
    expect(fieldLabel("total", "th")).toBe("ยอดรวม");
    expect(fieldLabel("lineItems.19.amount", "en")).toBe("Amount · item 20");
    expect(fieldLabel("lineItems.0.quantity", "th")).toBe("จำนวน · รายการที่ 1");
  });
});

describe("apiErrorText", () => {
  it("localises codes and fills the wait time", () => {
    expect(apiErrorText({ code: "rate_limited", retryAfterSec: 3600 }, "en")).toContain("60 min");
    expect(apiErrorText({ code: "too_large" }, "th")).toContain("4 MB");
  });
  it("falls back for unknown codes and appends operator detail", () => {
    expect(apiErrorText({ code: "nope" }, "en")).toBe("Something went wrong. Please try again.");
    expect(apiErrorText({ code: "extract_failed", detail: "Check key" }, "en")).toMatch(/\(Check key\)$/);
  });
});

describe("detectLang", () => {
  it("picks Thai when any preferred language is Thai, else English", () => {
    expect(detectLang(["en-US", "th-TH"])).toBe("th");
    expect(detectLang(["en-US", "ja"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
