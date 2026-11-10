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

  /** The cells of the first data row, by column name. */
  const cells = (csv: string) => {
    const [header, row] = csv.replace("\uFEFF", "").trim().split("\r\n");
    const names = header!.split(",");
    const values = row!.split(",");
    return { names, get: (name: string) => values[names.indexOf(name)] };
  };

  it("exports the payer, reference and fee of a slip", () => {
    const { names, get } = cells(toCSV(normalizeExtraction(fx.transferSlip, { today })));
    expect(names.slice(names.indexOf("total"), names.indexOf("item_description"))).toEqual([
      "total", "payer", "reference", "fee", "tax_id", "recipient_name",
      "bank_check", "bank_provider", "bank_checked_at", "bank_amount", "bank_date", "bank_trans_ref",
    ]);
    expect(get("total")).toBe("2500");
    expect(get("payer")).toBe("นายสมมติ ตัวอย่าง");
    expect(get("reference")).toBe("202509030941" + "0001");
    expect(get("fee")).toBe("0");
    // nothing about the bank for a slip nobody checked
    for (const c of ["bank_check", "bank_provider", "bank_checked_at", "bank_amount", "bank_date", "bank_trans_ref"]) expect(get(c), c).toBe("");
  });

  it("records what the bank said about a slip, next to the status", () => {
    const receipt = normalizeExtraction(fx.transferSlip, { today });
    const { get } = cells(
      toCSV({
        ...receipt,
        verification: {
          status: "verified",
          provider: "slip2go",
          checkedAt: "2026-11-10T06:00:00.000Z",
          bank: { transRef: "2025090309410001", date: "2025-09-03T09:41:00+07:00", amount: 2500, fee: 0, senderBank: "004", receiverBank: "014" },
        },
      }),
    );
    expect(get("bank_check")).toBe("verified");
    expect(get("bank_provider")).toBe("slip2go");
    expect(get("bank_checked_at")).toBe("2026-11-10T06:00:00.000Z");
    expect(get("bank_amount")).toBe("2500");
    expect(get("bank_date")).toBe("2025-09-03T09:41:00+07:00");
    expect(get("bank_trans_ref")).toBe("2025090309410001");
  });

  it("says when the bank was asked but could not answer or had no such transfer, with no bank figures", () => {
    const receipt = normalizeExtraction(fx.transferSlip, { today });
    for (const [status, reason] of [["not_found", undefined], ["pending", undefined], ["unavailable", "busy"]] as const) {
      const { get } = cells(toCSV({ ...receipt, verification: { status, reason, provider: "easyslip", checkedAt: "2026-11-10T06:00:00.000Z" } }));
      expect(get("bank_check")).toBe(status);
      expect(get("bank_provider")).toBe("easyslip");
      expect(get("bank_checked_at")).toBe("2026-11-10T06:00:00.000Z");
      expect(get("bank_amount")).toBe("");
      expect(get("bank_trans_ref")).toBe("");
    }
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
