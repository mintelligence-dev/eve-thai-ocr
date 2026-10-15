import { describe, expect, it } from "vitest";
import { assumeSingleUnits } from "../src/assume.js";

const item = (description: string, quantity: number | null, unitPrice: number | null, amount: number | null) => ({
  description, quantity, unitPrice, amount,
});

describe("assumeSingleUnits", () => {
  it("turns a price-only line into 1 x amount, marked assumed", () => {
    expect(assumeSingleUnits([item("Mask", null, null, 19)])).toEqual([
      { description: "Mask", quantity: 1, unitPrice: 19, amount: 19, assumed: true },
    ]);
  });

  it("also fills a line whose unit price equals its amount", () => {
    expect(assumeSingleUnits([item("Pearls", null, 25, 25)])[0]).toMatchObject({ quantity: 1, unitPrice: 25, assumed: true });
  });

  it("leaves printed quantities and prices alone", () => {
    const items = [item("Tea", 2, 60, 120), item("Cake", 1, 45, 45)];
    expect(assumeSingleUnits(items)).toEqual(items);
  });

  it("leaves negative amounts (discounts) and empty amounts alone", () => {
    const items = [item("Discount", null, null, -15), item("Note", null, null, null)];
    expect(assumeSingleUnits(items)).toEqual(items);
  });

  it("does not guess the quantity when the unit price differs from the amount", () => {
    const items = [item("Cheese", null, 41, 82)];
    expect(assumeSingleUnits(items)).toEqual(items);
  });

  it("does nothing when a line has a unit price but no amount (an unattached quantity line)", () => {
    const items = [item("Cheese", null, null, 82), item("2 * 41.00 / ชิ้น", null, 41, null)];
    expect(assumeSingleUnits(items)).toEqual(items);
  });

  it("does not modify its input", () => {
    const items = [item("Mask", null, null, 19)];
    assumeSingleUnits(items);
    expect(items[0]).toEqual(item("Mask", null, null, 19));
  });
});
