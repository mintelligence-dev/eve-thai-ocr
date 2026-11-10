import { describe, expect, it } from "vitest";
import { toCSV } from "../src/export.js";
import { SYSTEM_PROMPT } from "../src/extract.js";
import { normalizeExtraction, revalidate } from "../src/normalize.js";
import { RawExtractionSchema, ReceiptSchema, type RawExtraction } from "../src/schema.js";
import { scoreReceipt } from "../src/score.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");

/** A slip whose recipient is shown with a shop name and, separately, the account holder's name (invented). */
const shopSlip: RawExtraction = {
  ...fx.transferSlip,
  merchant: "SAMPLE KITCHEN",
  recipientName: "  น.ส. ตัวอย่าง สมมติ ",
};

describe("recipientName", () => {
  it("keeps the shop name and the person's name apart, trimmed", () => {
    const r = normalizeExtraction(shopSlip, { today });
    expect(r.merchant).toBe("SAMPLE KITCHEN");
    expect(r.recipientName).toBe("น.ส. ตัวอย่าง สมมติ");
  });

  it("is null when the slip shows one name, or an empty text, and on receipts", () => {
    expect(normalizeExtraction(fx.transferSlip, { today }).recipientName).toBeNull();
    expect(normalizeExtraction({ ...shopSlip, recipientName: "   " }, { today }).recipientName).toBeNull();
    expect(normalizeExtraction(fx.thaiDigitsReceipt, { today }).recipientName).toBeNull();
  });

  it("survives a round trip through the schema", () => {
    const r = normalizeExtraction(shopSlip, { today });
    expect(ReceiptSchema.parse(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it("is exported in its own CSV column, and protected like every other text cell", () => {
    const r = normalizeExtraction(shopSlip, { today });
    const [header, row] = toCSV(r).replace("﻿", "").trim().split("\r\n");
    const cols = header!.split(",");
    const cells = row!.split(",");
    expect(cols).toContain("recipient_name");
    expect(cells[cols.indexOf("recipient_name")]).toBe("น.ส. ตัวอย่าง สมมติ");
    const injected = toCSV({ ...r, recipientName: "=HYPERLINK(\"http://example.invalid\")" });
    expect(injected).not.toMatch(/,=HYPERLINK/);
  });

  it("keeps a 'the model was not sure' flag on it until it is edited", () => {
    const r = normalizeExtraction({ ...shopSlip, uncertainFields: ["recipientName"] }, { today });
    expect(r.flags.map((f) => `${f.path}:${f.code}`)).toContain("recipientName:model_uncertain");
    const other = revalidate({ ...r, payer: "x" }, { today, previous: r });
    expect(other.flags.map((f) => f.path)).toContain("recipientName");
    const edited = revalidate({ ...r, recipientName: "y" }, { today, previous: r });
    expect(edited.flags.map((f) => f.path)).not.toContain("recipientName");
  });

  it("is described to the model in the schema, with the rule that a name is the name only", () => {
    // The rules sit in the field descriptions, not in the system prompt: a sentence about
    // codes in the prompt made the model drop the "063-" from a receipt's number (see the commit message).
    const text = (field: keyof typeof RawExtractionSchema.shape) => RawExtractionSchema.shape[field].description ?? "";
    expect(text("recipientName")).toMatch(/shop or business name/);
    expect(text("recipientName")).toMatch(/person's name/);
    expect(text("merchant")).toMatch(/without a bank name/);
    expect(text("merchant")).toContain("wraps onto a second line");
    expect(text("payer")).toMatch(/without the bank's name/);
    // and the prompt itself stays free of the name rules
    expect(SYSTEM_PROMPT).not.toMatch(/never add the bank's name/);
  });
});

describe("scoring names strictly", () => {
  const slip = normalizeExtraction({ ...shopSlip, payer: "นาย ตัวอย่าง ก", merchant: "SAMPLE KITCHEN น.ส. ตัวอย่าง สมมติ" }, { today });
  const pass = (expected: Parameters<typeof scoreReceipt>[1]) => scoreReceipt(slip, expected).checks.find((c) => c.field === "merchant")?.pass;

  it("lets the loose check accept extra text, and the strict one refuse it", () => {
    expect(pass({ merchant: "SAMPLE KITCHEN" })).toBe(true);
    expect(pass({ merchant: "SAMPLE KITCHEN", strictNames: true })).toBe(false);
  });

  it("ignores case, spaces and punctuation in a strict comparison", () => {
    const clean = normalizeExtraction({ ...shopSlip, payer: "นาย ตัวอย่าง ก" }, { today });
    const s = (expected: Parameters<typeof scoreReceipt>[1]) => scoreReceipt(clean, expected);
    expect(s({ merchant: "sample kitchen", payer: "นายตัวอย่าง ก.", recipientName: "น.ส.ตัวอย่างสมมติ", strictNames: true }).accuracy).toBe(1);
    expect(s({ recipientName: "น.ส. คนอื่น", strictNames: true }).checks[0]?.pass).toBe(false);
  });

  it("can require recipientName to stay empty", () => {
    const one = normalizeExtraction(fx.transferSlip, { today });
    expect(scoreReceipt(one, { recipientName: null }).checks[0]?.pass).toBe(true);
    expect(scoreReceipt(normalizeExtraction(shopSlip, { today }), { recipientName: null }).checks[0]?.pass).toBe(false);
  });
});
