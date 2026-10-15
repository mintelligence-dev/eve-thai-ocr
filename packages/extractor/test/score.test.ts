import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../src/normalize.js";
import { scoreReceipt, similarity } from "../src/score.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");
const receipt = normalizeExtraction(fx.thaiDigitsReceipt, { today });

describe("similarity", () => {
  it("is 1 for identical text and ignores case and punctuation", () => {
    expect(similarity("#DMDSL Glow", "dmdsl-glow")).toBe(1);
  });
  it("drops with each wrong character", () => {
    expect(similarity("abcd", "abxd")).toBe(0.75);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});

describe("scoreReceipt", () => {
  it("scores a perfect match as 100%", () => {
    const s = scoreReceipt(receipt, {
      merchant: "Sample Coffee",
      date: "2025-05-12",
      total: 174.41,
      vat: 11.41,
      subtotal: [163, 174.41],
      lineItems: [
        { description: "ลาเต้เย็น", amount: 130 },
        { description: "Croissant", amount: 33 },
      ],
    });
    expect(s.accuracy).toBe(1);
    expect(s.descriptionSimilarity).toBe(1);
  });

  it("reports each failing check", () => {
    const s = scoreReceipt(receipt, {
      merchant: "Other Shop",
      date: null, // model must not have filled in a date
      total: 999,
      lineItems: [{ amount: 130 }],
    });
    expect(s.checks.filter((c) => !c.pass).map((c) => c.field)).toEqual([
      "merchant", "date", "total", "itemCount", "itemAmounts",
    ]);
  });

  it("matches line amounts regardless of order", () => {
    const s = scoreReceipt(receipt, { lineItems: [{ amount: 33 }, { amount: 130 }] });
    expect(s.checks.find((c) => c.field === "itemAmounts")?.pass).toBe(true);
  });

  it("flags invented quantity / unit price", () => {
    const s = scoreReceipt(receipt, { noQuantityOrUnitPrice: true });
    expect(s.checks[0]).toMatchObject({ field: "noInventedQtyPrice", pass: false, actual: 2 });
  });

  it("scores description similarity by best match, not position", () => {
    const s = scoreReceipt(receipt, {
      lineItems: [
        { description: "Croissant", amount: 33 },
        { description: "ลาเต้เย็น", amount: 130 },
      ],
    });
    expect(s.descriptionSimilarity).toBe(1);
  });
});
