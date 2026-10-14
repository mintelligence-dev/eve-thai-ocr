import { describe, expect, it } from "vitest";
import { normalizeExtraction, revalidate } from "../src/normalize.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");
const codes = (r: ReturnType<typeof normalizeExtraction>) =>
  r.flags.map((f) => `${f.path}:${f.code}`);

describe("normalizeExtraction", () => {
  it("normalises a Thai-digit, Buddhist Era receipt with no flags", () => {
    const r = normalizeExtraction(fx.thaiDigitsReceipt, { today });
    expect(r).toMatchObject({
      documentType: "receipt",
      merchant: "ร้านกาแฟตัวอย่าง (Sample Coffee)",
      date: "2025-05-12",
      time: "14:35",
      currency: "THB",
      subtotal: 163,
      vat: 11.41,
      total: 174.41,
    });
    expect(r.lineItems).toEqual([
      { description: "ลาเต้เย็น", quantity: 2, unitPrice: 65, amount: 130 },
      { description: "Croissant", quantity: 1, unitPrice: 33, amount: 33 },
    ]);
    expect(r.flags).toEqual([]);
  });

  it("handles mixed Thai-English text and Gregorian dates", () => {
    const r = normalizeExtraction(fx.mixedLanguageReceipt, { today });
    expect(r.date).toBe("2025-01-05");
    expect(r.total).toBe(1070);
    expect(r.flags).toEqual([]);
  });

  it("extracts a transfer slip", () => {
    const r = normalizeExtraction(fx.transferSlip, { today });
    expect(r).toMatchObject({
      documentType: "transfer_slip",
      merchant: "นางสาว ตัวอย่าง ทดสอบ",
      date: "2025-09-03",
      time: "09:41",
      total: 2500,
      lineItems: [],
    });
    // Only the two-digit year needs confirmation.
    expect(codes(r)).toEqual(["date:two_digit_year"]);
  });

  it("flags line items that do not add up", () => {
    expect(codes(normalizeExtraction(fx.itemsMismatchReceipt, { today }))).toEqual([
      "lineItems:items_total_mismatch",
    ]);
  });

  it("flags a future date from a wrong-calendar year", () => {
    const r = normalizeExtraction(fx.futureDateReceipt, { today });
    expect(r.date).toBe("2115-05-12");
    expect(codes(r)).toContain("date:date_in_future");
  });

  it("reports unreadable amounts as errors and keeps the model's uncertainty", () => {
    const r = normalizeExtraction(fx.unreadableAmountReceipt, { today });
    expect(r.total).toBeNull();
    expect(codes(r)).toEqual(
      expect.arrayContaining(["total:unparseable", "total:model_uncertain"]),
    );
    // No duplicate "missing" next to "unparseable".
    expect(codes(r)).not.toContain("total:missing");
    expect(r.flags.find((f) => f.code === "unparseable")?.severity).toBe("error");
  });

  it("flags every missing field on an empty document", () => {
    const r = normalizeExtraction(fx.emptyReceipt, { today });
    expect(codes(r)).toEqual(
      expect.arrayContaining(["total:missing", "merchant:missing", "date:missing"]),
    );
    expect(r.currency).toBe("THB");
  });

  it("flags a VAT amount that is not 7%", () => {
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, vatText: "50.00" },
      { today },
    );
    expect(codes(r)).toContain("vat:vat_mismatch");
  });

  it("flags a quantity x price mismatch on a line", () => {
    const r = normalizeExtraction(
      {
        ...fx.thaiDigitsReceipt,
        lineItems: [
          { description: "x", quantityText: "3", unitPriceText: "65.00", amountText: "130.00" },
        ],
      },
      { today },
    );
    expect(codes(r)).toContain("lineItems.0.amount:line_total_mismatch");
  });

  it("flags non-THB currency", () => {
    const r = normalizeExtraction({ ...fx.thaiDigitsReceipt, currency: "usd" }, { today });
    expect(r.currency).toBe("USD");
    expect(codes(r)).toContain("currency:unsupported_currency");
  });

  it("clears flags after the user fixes the fields", () => {
    const r = normalizeExtraction(fx.futureDateReceipt, { today });
    const fixed = revalidate({ ...r, date: "2025-05-12" }, { today });
    expect(fixed.flags).toEqual([]);
  });
});
