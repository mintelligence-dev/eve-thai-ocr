import { describe, expect, it } from "vitest";
import { splitAddOns } from "../src/addons.js";
import { normalizeExtraction } from "../src/normalize.js";
import * as fx from "./fixtures/index.js";

const item = (description: string, quantity: number | null, unitPrice: number | null, amount: number | null) => ({
  description, quantity, unitPrice, amount,
});
const amounts = (items: { amount: number | null }[]) => items.map((i) => i.amount);
const today = new Date("2025-10-14T00:00:00Z");

describe("splitAddOns", () => {
  it("splits an add-on that has only a unit price", () => {
    const r = splitAddOns([item("Iced tea", 1, 100, 125), item("Extra pearls", null, 25, null), item("Promo", null, null, -20)]);
    expect(amounts(r.items)).toEqual([100, 25, -20]);
    expect(r.splits).toEqual([{ index: 0, printed: 125, base: 100, addOns: 1 }]);
  });

  it("fixes an add-on that was also given its own amount (counted twice)", () => {
    const r = splitAddOns([item("Iced tea", 1, 100, 125), item("Extra pearls", null, null, 25), item("Promo", null, null, -20)]);
    expect(amounts(r.items)).toEqual([100, 25, -20]);
  });

  it("handles several add-ons and a quantity above one", () => {
    const r = splitAddOns([item("Latte", 2, 60, 150), item("Oat milk", null, 10, null), item("Syrup", null, 20, null)]);
    expect(amounts(r.items)).toEqual([120, 10, 20]);
    expect(r.splits[0]!.addOns).toBe(2);
  });

  it("leaves ordinary lines alone", () => {
    const items = [item("Tea", 2, 60, 120), item("Cake", 1, 45, 45), item("Water", null, null, 20)];
    expect(splitAddOns(items)).toEqual({ items, splits: [] });
  });

  it("does nothing when the numbers do not add up exactly", () => {
    const items = [item("Tea", 1, 100, 125), item("Extra", null, 20, null)];
    expect(splitAddOns(items)).toEqual({ items, splits: [] });
  });

  it("does not treat a real item (with quantity or unit price) as an add-on", () => {
    const items = [item("Tea", 1, 100, 125), item("Cake", 1, null, 25)];
    expect(splitAddOns(items).splits).toEqual([]);
  });

  it("does not modify its input", () => {
    const items = [item("Tea", 1, 100, 125), item("Extra", null, 25, null)];
    splitAddOns(items);
    expect(items[0]!.amount).toBe(125);
  });
});

describe("add-ons in a full extraction", () => {
  const raw = {
    ...fx.thaiDigitsReceipt,
    merchant: "Demo Tea Shop", dateText: "2025-10-03", timeText: null,
    subtotalText: null, vatText: null, totalText: "105.00",
    lineItems: [
      { description: "Iced tea", quantityText: "1", unitPriceText: "100.00", amountText: "125.00", unit: null, productCode: null, discountText: null },
      { description: "Extra pearls", quantityText: null, unitPriceText: "25.00", amountText: null, unit: null, productCode: null, discountText: null },
      { description: "Member discount", quantityText: null, unitPriceText: null, amountText: "-20.00", unit: null, productCode: null, discountText: null },
    ],
  };

  it("adds up to the total, with a visible note and no mismatch warning", () => {
    const r = normalizeExtraction(raw, { today });
    expect(amounts(r.lineItems)).toEqual([100, 25, -20]);
    const codes = r.flags.map((f) => `${f.path}:${f.code}`);
    expect(codes).toContain("lineItems.0.amount:addon_split");
    expect(codes).not.toContain("lineItems:items_total_mismatch");
    expect(codes).not.toContain("lineItems.1.amount:missing");
  });
});
