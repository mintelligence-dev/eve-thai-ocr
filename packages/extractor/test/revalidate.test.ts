import { describe, expect, it } from "vitest";
import { normalizeExtraction, revalidate } from "../src/normalize.js";
import type { RawExtraction, Receipt } from "../src/schema.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");
const item = (description: string, quantityText: string | null, unitPriceText: string | null, amountText: string | null) => ({
  description,
  quantityText,
  unitPriceText,
  amountText,
  unit: null,
  productCode: null,
  discountText: null,
});

/** `path:code` for every flag, in order. */
const codes = (r: Receipt) => r.flags.map((f) => `${f.path}:${f.code}`);

/** What the review screen does on an edit: change a field, then re-check with the receipt as it was. */
const edit = (before: Receipt, patch: Partial<Receipt>) => revalidate({ ...before, ...patch }, { today, previous: before });

const editItem = (before: Receipt, i: number, patch: Partial<Receipt["lineItems"][number]>) =>
  edit(before, { lineItems: before.lineItems.map((it, k) => (k === i ? { ...it, ...patch } : it)) });

const read = (raw: RawExtraction, imageCount?: number) => normalizeExtraction(raw, { today, imageCount });

describe("revalidate keeps what the document's reading said", () => {
  it("keeps the 'check where the photos meet' flag through any edit, with or without the previous receipt", () => {
    const r = read(fx.thaiDigitsReceipt, 2);
    expect(codes(r)).toContain("lineItems:merged_images");
    expect(codes(edit(r, { merchant: "Other" }))).toContain("lineItems:merged_images");
    expect(codes(editItem(r, 0, { amount: 1 }))).toContain("lineItems:merged_images");
    expect(codes(revalidate({ ...r, merchant: "Other" }, { today }))).toContain("lineItems:merged_images");
  });

  it("keeps 'the model was not sure' for a field until that field is changed", () => {
    const r = read({ ...fx.thaiDigitsReceipt, uncertainFields: ["merchant", "time"] });
    expect(codes(r)).toEqual(expect.arrayContaining(["merchant:model_uncertain", "time:model_uncertain"]));

    const other = edit(r, { time: "15:00" });
    expect(codes(other)).toContain("merchant:model_uncertain");
    expect(codes(other)).not.toContain("time:model_uncertain");

    const same = edit(r, { vat: 12 });
    expect(codes(same)).toEqual(expect.arrayContaining(["merchant:model_uncertain", "time:model_uncertain"]));
  });

  it("does the same for a cell of a line item", () => {
    const r = read({ ...fx.thaiDigitsReceipt, uncertainFields: ["lineItems.1.amount", "lineItems.0.description"] });
    expect(codes(r)).toEqual(expect.arrayContaining(["lineItems.1.amount:model_uncertain", "lineItems.0.description:model_uncertain"]));

    // another cell, or another field of the same row, leaves them alone
    const a = editItem(r, 1, { quantity: 5 });
    expect(codes(a)).toContain("lineItems.1.amount:model_uncertain");
    expect(codes(editItem(r, 0, { amount: 1 }))).toContain("lineItems.0.description:model_uncertain");

    // changing the doubted cell clears its flag, and only its flag
    const b = editItem(r, 1, { amount: 40 });
    expect(codes(b)).not.toContain("lineItems.1.amount:model_uncertain");
    expect(codes(b)).toContain("lineItems.0.description:model_uncertain");
  });

  it("drops a row's flag, rather than moving it to another row, when rows above are removed", () => {
    const r = read({ ...fx.thaiDigitsReceipt, uncertainFields: ["lineItems.1.amount"] });
    const removed = edit(r, { lineItems: r.lineItems.slice(1) });
    expect(codes(removed).some((c) => c.endsWith("model_uncertain"))).toBe(false);
  });

  it("keeps the summary 'the model doubted N item cells' while the list keeps its length", () => {
    const items = ["a", "b", "c", "d"].map((n) => item(n, "1", "10.00", "10.00"));
    const r = read({
      ...fx.thaiDigitsReceipt,
      subtotalText: null,
      vatText: null,
      totalText: "40.00",
      lineItems: items,
      uncertainFields: ["lineItems.0.amount", "lineItems.1.amount", "lineItems.2.amount", "lineItems.3.amount"],
    });
    expect(codes(r)).toContain("lineItems:model_uncertain");
    expect(codes(editItem(r, 0, { amount: 11 }))).toContain("lineItems:model_uncertain");
    expect(codes(edit(r, { lineItems: r.lineItems.slice(1) }))).not.toContain("lineItems:model_uncertain");
  });

  it("keeps the add-on note until the price it explains is changed", () => {
    const r = read({
      ...fx.thaiDigitsReceipt,
      merchant: "Demo Tea Shop", dateText: "2025-10-03", timeText: null,
      subtotalText: null, vatText: null, totalText: "105.00",
      lineItems: [
        item("Iced tea", "1", "100.00", "125.00"),
        item("Extra pearls", null, "25.00", null),
        item("Member discount", null, null, "-20.00"),
      ],
    });
    expect(codes(r)).toContain("lineItems.0.amount:addon_split");
    expect(codes(editItem(r, 2, { amount: -10 }))).toContain("lineItems.0.amount:addon_split");
    expect(codes(editItem(r, 0, { amount: 90 }))).not.toContain("lineItems.0.amount:addon_split");
  });

  it("keeps the other-script warning until that value is changed", () => {
    const r = read({ ...fx.thaiDigitsReceipt, totalText: "১৭৪.৪১" });
    expect(r.total).toBe(174.41);
    expect(codes(r)).toContain("total:other_script_digits");
    expect(codes(edit(r, { merchant: "x" }))).toContain("total:other_script_digits");
    expect(codes(edit(r, { total: 174.4 }))).not.toContain("total:other_script_digits");
  });

  it("keeps the two-digit-year warning until the date is changed", () => {
    const r = read({ ...fx.thaiDigitsReceipt, dateText: "12/05/68" });
    expect(codes(r)).toContain("date:two_digit_year");
    expect(codes(edit(r, { merchant: "x" }))).toContain("date:two_digit_year");
    expect(codes(edit(r, { date: "2025-05-13" }))).not.toContain("date:two_digit_year");
  });

  it("keeps an unreadable field's error, once, while it is still empty", () => {
    const r = read({ ...fx.thaiDigitsReceipt, dateText: "sometime last week" });
    expect(codes(r)).toContain("date:unparseable");
    const other = edit(r, { merchant: "x" });
    expect(codes(other).filter((c) => c === "date:unparseable")).toHaveLength(1);
    expect(codes(other)).not.toContain("date:missing"); // not both "unreadable" and "missing"
    const filled = edit(r, { date: "2025-05-12" });
    expect(codes(filled)).not.toContain("date:unparseable");
    expect(codes(filled)).not.toContain("date:missing");
  });

  it("gives the same flags when checked again, however often", () => {
    const r = read({ ...fx.thaiDigitsReceipt, uncertainFields: ["merchant"] }, 2);
    const once = edit(r, { vat: 12 });
    const twice = edit(once, {});
    const thrice = edit(twice, {});
    expect(codes(twice)).toEqual(codes(once));
    expect(codes(thrice)).toEqual(codes(once));
  });

  it("drops the flags about a field's reading when no previous receipt is given", () => {
    const r = read({ ...fx.thaiDigitsReceipt, uncertainFields: ["merchant"] });
    expect(codes(revalidate({ ...r, vat: 12 }, { today })).includes("merchant:model_uncertain")).toBe(false);
  });
});

describe("checks that depend only on the current value are redone on every edit", () => {
  it("keeps warning about a currency other than THB, and stops when it is put right", () => {
    const r = read({ ...fx.thaiDigitsReceipt, currency: "USD" });
    expect(codes(r)).toContain("currency:unsupported_currency");
    expect(codes(edit(r, { merchant: "x" }))).toContain("currency:unsupported_currency");
    expect(codes(revalidate({ ...r, merchant: "x" }, { today }))).toContain("currency:unsupported_currency");
    expect(codes(edit(r, { currency: "THB" }))).not.toContain("currency:unsupported_currency");
  });

  it("flags a bad tax ID typed in by hand, and accepts a good one in any layout", () => {
    const r = read({ ...fx.thaiDigitsReceipt, taxIdText: "1234567890121" }); // valid check digit
    expect(codes(r)).not.toContain("taxId:invalid_tax_id");

    const bad = edit(r, { taxId: "1234567890122" });
    expect(bad.flags.find((f) => f.code === "invalid_tax_id")?.params).toEqual({ text: "1234567890122" });
    // still flagged after an unrelated edit
    expect(codes(edit(bad, { merchant: "x" }))).toContain("taxId:invalid_tax_id");

    expect(codes(edit(bad, { taxId: "1234567890121" }))).not.toContain("taxId:invalid_tax_id");
    expect(codes(edit(bad, { taxId: "1-2345-67890-12-1" }))).not.toContain("taxId:invalid_tax_id");
  });
});
