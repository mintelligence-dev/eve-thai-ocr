import { describe, expect, it } from "vitest";
import { normalizeExtraction, revalidate } from "../src/normalize.js";
import { itemsReconcile } from "../src/validate.js";
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

  it("reads the payer, reference and fee of a transfer slip", () => {
    const r = normalizeExtraction(fx.transferSlip, { today });
    expect(r).toMatchObject({
      merchant: "นางสาว ตัวอย่าง ทดสอบ",
      payer: "นายสมมติ ตัวอย่าง",
      reference: "202509030941" + "0001",
      fee: 0,
    });
  });

  it("drops line items the model invented for a transfer slip", () => {
    const r = normalizeExtraction(
      {
        ...fx.transferSlip,
        lineItems: [
          { description: "นายสมมติ", quantityText: null, unitPriceText: null, amountText: "2,500.00", unit: null, productCode: null, discountText: null },
          { description: "ค่าธรรมเนียม", quantityText: null, unitPriceText: null, amountText: "0.00", unit: null, productCode: null, discountText: null },
        ],
      },
      { today },
    );
    expect(r.lineItems).toEqual([]);
    expect(codes(r)).not.toContain("lineItems:items_total_mismatch");
  });

  it("keeps the line items of a receipt, and leaves payer, reference and fee empty", () => {
    const r = normalizeExtraction(fx.thaiDigitsReceipt, { today });
    expect(r.lineItems).toHaveLength(2);
    expect([r.payer, r.reference, r.fee]).toEqual([null, null, null]);
  });

  it("explains an amount with more than two decimals instead of guessing", () => {
    const r = normalizeExtraction({ ...fx.transferSlip, feeText: "5.555 บาท" }, { today });
    const flag = r.flags.find((f) => f.path === "fee");
    expect(r.fee).toBeNull();
    expect(flag).toMatchObject({ code: "unparseable", severity: "error", params: { text: "5.555 บาท", reason: "decimals" } });
    expect(flag!.message).toContain("more than two decimal places");
  });

  it("flags an unreadable fee", () => {
    const r = normalizeExtraction({ ...fx.transferSlip, feeText: "O.O?" }, { today });
    expect(codes(r)).toContain("fee:unparseable");
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

  it("blocks an unrecognised document until the type is confirmed", () => {
    const r = normalizeExtraction({ ...fx.thaiDigitsReceipt, documentType: "unknown" }, { today });
    expect(r.flags.map((f) => [f.path, f.code, f.severity])).toEqual([["documentType", "not_a_receipt", "error"]]);
    // Choosing a type on the review screen clears it.
    expect(revalidate({ ...r, documentType: "receipt" }, { today }).flags).toEqual([]);
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
          { description: "x", quantityText: "3", unitPriceText: "65.00", amountText: "130.00", unit: null, productCode: null, discountText: null },
        ],
      },
      { today },
    );
    expect(codes(r)).toContain("lineItems.0.amount:line_total_mismatch");
  });

  it("treats BHT, ฿ and บาท as THB", () => {
    for (const c of ["BHT", "฿", "บาท", "baht"]) {
      const r = normalizeExtraction({ ...fx.thaiDigitsReceipt, currency: c }, { today });
      expect(r.currency).toBe("THB");
      expect(codes(r)).not.toContain("currency:unsupported_currency");
    }
  });

  it("accepts a VAT lower than 7% when exempt items explain the gap", () => {
    // A supermarket receipt: two items (48.75 and 62.00) carry no VAT, so VAT is 7/107 of the other 1,093.00.
    const raw = {
      ...fx.thaiDigitsReceipt,
      subtotalText: null, totalText: "1,203.75", vatText: "71.50",
      lineItems: [
        ["Milk", "48.75 N"], ["Soap", "59.00 P"], ["Cheese", "190.00"], ["Noodles", "92.00"],
        ["Rice", "803.00"], ["Eggs", "62.00 N"],
      ].map(([description, amountText]) => ({ description: description!, quantityText: null, unitPriceText: null, amountText: amountText!, unit: null, productCode: null, discountText: null })),
    };
    const r = normalizeExtraction(raw, { today });
    expect(r.lineItems.map((l) => l.amount)).toEqual([48.75, 59, 190, 92, 803, 62]);
    expect(codes(r)).not.toContain("vat:vat_mismatch");
    // The same VAT with nothing to explain it is still flagged.
    const odd = normalizeExtraction({ ...raw, vatText: "50.00" }, { today });
    expect(codes(odd)).toContain("vat:vat_mismatch");
  });

  it("flags non-THB currency", () => {
    const r = normalizeExtraction({ ...fx.thaiDigitsReceipt, currency: "usd" }, { today });
    expect(r.currency).toBe("USD");
    expect(codes(r)).toContain("currency:unsupported_currency");
  });

  it("maps raw schema names in uncertainFields to field paths", () => {
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, uncertainFields: ["dateText", "lineItems.1.amountText", "total"] },
      { today },
    );
    expect(codes(r)).toEqual([
      "date:model_uncertain",
      "lineItems.1.amount:model_uncertain",
      "total:model_uncertain",
    ]);
  });

  it("does not ask to confirm a currency that was not printed", () => {
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, currency: null, uncertainFields: ["currency"] },
      { today },
    );
    expect(r.flags).toEqual([]);
  });

  it("fills a price-only line as 1 x amount and marks it assumed; negatives stay empty", () => {
    const r = normalizeExtraction(
      {
        ...fx.thaiDigitsReceipt,
        subtotalText: null, vatText: null, totalText: "74.41",
        lineItems: [
          { description: "A", quantityText: null, unitPriceText: null, amountText: "100.00", unit: null, productCode: null, discountText: null },
          { description: "Promo", quantityText: null, unitPriceText: null, amountText: "-25.59", unit: null, productCode: null, discountText: null },
        ],
      },
      { today },
    );
    expect(r.lineItems.map((l) => [l.quantity, l.unitPrice, l.amount, l.assumed])).toEqual([
      [1, 100, 100, true],
      [null, null, -25.59, undefined],
    ]);
  });

  const noAmountItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      description: `item ${i}`, quantityText: null, unitPriceText: null, amountText: null,
      unit: null, productCode: null, discountText: null,
    }));

  it("flags a line item with no amount", () => {
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, lineItems: [
        { description: "a", quantityText: null, unitPriceText: null, amountText: "174.41", unit: null, productCode: null, discountText: null },
        ...noAmountItems(1),
      ] },
      { today },
    );
    expect(codes(r)).toEqual(["lineItems.1.amount:missing"]);
  });

  it("summarises many missing amounts into one flag", () => {
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, lineItems: noAmountItems(19) },
      { today },
    );
    expect(codes(r).filter((c) => c.includes("lineItems"))).toEqual(["lineItems:missing"]);
  });

  it("summarises many uncertain line item cells and dedupes repeats", () => {
    const cells = [0, 1, 2, 3, 4].map((i) => `lineItems.${i}.amount`);
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, uncertainFields: ["total", ...cells, "lineItems.0.amountText"] },
      { today },
    );
    expect(codes(r)).toEqual(["total:model_uncertain", "lineItems:model_uncertain"]);
    expect(r.flags[1]!.message).toContain("5 line item fields");
  });

  it("keeps up to three uncertain line item cells as individual flags", () => {
    const r = normalizeExtraction(
      { ...fx.thaiDigitsReceipt, uncertainFields: ["lineItems.0.amount", "lineItems.1.description"] },
      { today },
    );
    expect(codes(r)).toEqual(["lineItems.0.amount:model_uncertain", "lineItems.1.description:model_uncertain"]);
  });

  it("clears flags after the user fixes the fields", () => {
    const r = normalizeExtraction(fx.futureDateReceipt, { today });
    const fixed = revalidate({ ...r, date: "2025-05-12" }, { today });
    expect(fixed.flags).toEqual([]);
  });
});

describe("itemsReconcile", () => {
  const items = (...amounts: (number | null)[]) =>
    amounts.map((amount) => ({ description: "x", quantity: null, unitPrice: null, amount }));

  it("matches the total, the subtotal, or the total minus VAT", () => {
    expect(itemsReconcile({ lineItems: items(100, 25, -20), total: 105, subtotal: null, vat: null })).toEqual({
      sum: 105, target: 105, against: "total", diff: 0,
    });
    expect(itemsReconcile({ lineItems: items(100), total: 107, subtotal: 100, vat: 7 })?.against).toBe("subtotal");
    expect(itemsReconcile({ lineItems: items(98.13), total: 105, subtotal: null, vat: 6.87 })?.against).toBe("beforeVat");
  });

  it("reports the gap when nothing matches", () => {
    expect(itemsReconcile({ lineItems: items(125, 25, -20), total: 105, subtotal: null, vat: null })).toEqual({
      sum: 130, target: 105, against: null, diff: 25,
    });
  });

  it("counts an item without an amount as zero, and returns null with nothing to compare", () => {
    expect(itemsReconcile({ lineItems: items(100, null), total: 105, subtotal: null, vat: null })?.sum).toBe(100);
    expect(itemsReconcile({ lineItems: [], total: 105, subtotal: null, vat: null })).toBeNull();
    expect(itemsReconcile({ lineItems: items(5), total: null, subtotal: null, vat: null })).toBeNull();
  });
});

describe("the reference number", () => {
  const ref = (referenceText: string | null, referenceLabel: string | null) =>
    normalizeExtraction({ ...fx.thaiDigitsReceipt, referenceText, referenceLabel }, { today }).reference;

  it("keeps a labelled receipt number, with spaces removed", () => {
    expect(ref("063 - 175270", "Rcpt")).toBe("063-175270");
    expect(ref("20261003114", "Receipt No:")).toBe("20261003114");
    expect(ref("123", null)).toBe("123");
  });

  it("drops a number the label says is a POS, permit, terminal, queue or cashier id", () => {
    for (const label of ["POS", "POS PERMIT", "Terminal ID", "Queue No", "Cashier", "รหัสเครื่อง", "คิวที่"]) {
      expect(ref("E03027000202234", label), label).toBeNull();
    }
  });

  it("does not mistake a longer word for a machine id", () => {
    expect(ref("D-1", "Deposit ref")).toBe("D-1");
    expect(ref("T-9", "Transaction ref")).toBe("T-9");
  });
});
