import { describe, expect, it } from "vitest";
import { isDiscountLabel } from "../src/discount.js";
import { normalizeExtraction } from "../src/normalize.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");

describe("isDiscountLabel", () => {
  it.each([
    "Member discount 20.-", "DISCOUNT", "Promo code", "Coupon -10", "20% off", "Buy 300B. get free G", "BOGO", "B1G1 promo",
    "ส่วนลด", "AIS รับส่วนลด 20.- ทุก", "โปรโมชั่นพิเศษ", "คูปองส่วนลด", "ลดราคา 10%", "แลกแต้ม", "คืนเงิน",
  ])("recognises %j", (name) => expect(isDiscountLabel(name)).toBe(true));

  it.each([
    "Coffee", "Offline mode cable", "Freestyle shampoo", "Iced milk tea", "ข้าวมันไก่ต้ม", "น้ำเปล่า", "Adjustment", "",
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
});
