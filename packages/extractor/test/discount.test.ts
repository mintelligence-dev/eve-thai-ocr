import { describe, expect, it } from "vitest";
import { isDiscountLabel } from "../src/discount.js";
import { normalizeExtraction } from "../src/normalize.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");

describe("isDiscountLabel", () => {
  it.each([
    "Member discount 20.-", "DISCOUNT", "Discounts", "Staff discount -10",
    "ส่วนลด", "AIS รับส่วนลด 20.- ทุก", "ลดราคา 10%", "คูปองส่วนลด",
  ])("recognises %j", (name) => expect(isDiscountLabel(name)).toBe(true));

  it.each([
    // Store jargon and loose words are not guessed at: they get a warning.
    "BOGO", "B1G1 promo", "Buy 300B. get free G", "Promo code", "Coupon -10", "20% off", "แลกแต้ม", "โปรโมชั่นพิเศษ", "แถม",
    "Coffee", "Offline mode cable", "Freestyle shampoo", "Iced milk tea", "ข้าวมันไก่ต้ม", "Adjustment", "",
  ])("does not match %j", (name) => expect(isDiscountLabel(name)).toBe(false));
});

describe("negative amounts", () => {
  const withItem = (description: string, amountText: string) =>
    normalizeExtraction(
      {
        ...fx.thaiDigitsReceipt,
        subtotalText: null, vatText: null, totalText: "100.00",
        lineItems: [
          { description: "Tea", quantityText: null, unitPriceText: null, amountText: "120.00" },
          { description, quantityText: null, unitPriceText: null, amountText },
        ],
      },
      { today },
    ).flags.map((f) => f.code);

  it("does not warn when the name says discount", () => {
    expect(withItem("Member discount", "-20.00")).not.toContain("negative_amount");
    expect(withItem("ส่วนลด", "-20.00")).not.toContain("negative_amount");
  });

  it("still warns when a negative amount has no discount label", () => {
    expect(withItem("Adjustment", "-20.00")).toContain("negative_amount");
  });

  it("does not guess from jargon such as BOGO", () => {
    expect(withItem("BOGO", "-20.00")).toContain("negative_amount");
  });
});
