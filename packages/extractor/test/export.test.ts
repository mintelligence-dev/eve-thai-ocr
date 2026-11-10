import { describe, expect, it } from "vitest";
import { toCSV, toJSON } from "../src/export.js";
import { normalizeExtraction } from "../src/normalize.js";
import { DEFAULT_MODEL, HandwritingNotSupportedError, defaultProviderOptions, extractReceipt } from "../src/extract.js";
import { ReceiptSchema } from "../src/schema.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");

describe("export", () => {
  it("round-trips JSON through the schema", () => {
    const r = normalizeExtraction(fx.mixedLanguageReceipt, { today });
    expect(ReceiptSchema.parse(JSON.parse(toJSON(r)))).toEqual(r);
  });

  it("writes one CSV row per line item with a BOM and CRLF", () => {
    const csv = toCSV(normalizeExtraction(fx.thaiDigitsReceipt, { today }));
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("ลาเต้เย็น,2,65,130");
  });

  it("exports the payer, reference and fee of a slip", () => {
    const csv = toCSV(normalizeExtraction(fx.transferSlip, { today }));
    const [header, row] = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(header).toContain("total,payer,reference,fee,tax_id,bank_check,item_description");
    // tax_id and bank_check are empty for a slip nobody checked with the bank
    expect(row).toContain("2500,นายสมมติ ตัวอย่าง,202509030941" + "0001,0,,,");
  });

  it("records the result of checking a slip with the bank", () => {
    const receipt = normalizeExtraction(fx.transferSlip, { today });
    const csv = toCSV({
      ...receipt,
      verification: { status: "not_found", provider: "easyslip", checkedAt: "2026-11-10T06:00:00.000Z" },
    });
    const [, row] = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(row).toContain(",,not_found,");
  });

  it("keeps totals for a slip with no line items", () => {
    const lines = toCSV(normalizeExtraction(fx.transferSlip, { today })).trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("2500");
  });

  it("neutralises spreadsheet formulas from OCR text", () => {
    const csv = toCSV(normalizeExtraction(fx.formulaInjectionReceipt, { today }));
    expect(csv).toContain(`"'=HYPERLINK(""http://example.invalid"",""x"")"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });
});

describe("extractReceipt", () => {
  it("normalises whatever the model returns", async () => {
    const { receipt, raw } = await extractReceipt({
      image: new Uint8Array([1, 2, 3]),
      today,
      generate: async () => fx.transferSlip,
    });
    expect(raw).toEqual(fx.transferSlip);
    expect(receipt.total).toBe(2500);
  });

  it("rejects model output that does not match the schema", async () => {
    await expect(
      extractReceipt({
        image: new Uint8Array(),
        generate: async () => ({ merchant: "x" }) as never,
      }),
    ).rejects.toThrow();
  });
});

describe("handwritten documents", () => {
  it("are refused, and nothing the model read is returned", async () => {
    const readSomething = { ...fx.thaiDigitsReceipt, handwritten: true };
    await expect(
      extractReceipt({ image: new Uint8Array(), generate: async () => readSomething }),
    ).rejects.toBeInstanceOf(HandwritingNotSupportedError);
  });

  it("do not stop a printed document", async () => {
    const { receipt } = await extractReceipt({
      image: new Uint8Array(), today, generate: async () => ({ ...fx.thaiDigitsReceipt, handwritten: false }),
    });
    expect(receipt.total).toBe(174.41);
  });
});

describe("defaultProviderOptions", () => {
  it("caps Gemini 2.5 Flash thinking, and leaves other models alone", () => {
    expect(defaultProviderOptions("google/gemini-2.5-flash")).toEqual({
      google: { thinkingConfig: { thinkingBudget: 1024 } },
    });
    expect(defaultProviderOptions("openai/gpt-4.1-mini")).toBeUndefined();
    expect(defaultProviderOptions("google/gemini-2.5-flash-lite")).toBeUndefined();
  });

  it("applies to the default model", () => {
    expect(DEFAULT_MODEL).toBe("google/gemini-2.5-flash");
    expect(defaultProviderOptions(DEFAULT_MODEL)).toBeDefined();
  });
});
