import { describe, expect, it } from "vitest";
import { toCSV, toJSON } from "../src/export.js";
import { normalizeExtraction } from "../src/normalize.js";
import { extractReceipt } from "../src/extract.js";
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
