import { describe, expect, it } from "vitest";
import { cleanWords, normalizeExtraction } from "../src/normalize.js";
import { revalidate } from "../src/normalize.js";
import { parseThaiAmountWords } from "../src/thai.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2026-11-02T00:00:00Z");
const codes = (r: { flags: { path: string; code: string }[] }) => r.flags.map((f) => `${f.path}:${f.code}`);

describe("parseThaiAmountWords", () => {
  it.each([
    ["หนึ่งร้อยบาทถ้วน", 10000],
    ["หนึ่งพันสองร้อยบาทถ้วน", 120000],
    ["(สามร้อยยี่สิบเอ็ดบาทถ้วน)", 32100],
    ["สิบเอ็ดบาทถ้วน", 1100],
    ["ยี่สิบบาทถ้วน", 2000],
    ["สองหมื่นหนึ่งพันห้าร้อยบาทถ้วน", 2150000],
    ["หนึ่งแสนสองหมื่นสามพันสี่ร้อยห้าสิบหกบาทถ้วน", 12345600],
    ["สองล้านห้าแสนบาทถ้วน", 250000000],
    ["สิบล้านบาทถ้วน", 1000000000],
    ["สองร้อยห้าสิบบาทห้าสิบสตางค์", 25050],
    ["สามบาทยี่สิบห้าสตางค์", 325],
    ["ห้าสิบสตางค์", null], // no "บาท": not written the way receipts write it
    ["ศูนย์บาทห้าสิบสตางค์", 50],
    ["หนึ่ง พัน สอง ร้อย บาท ถ้วน", 120000], // spaces from the line wrapping
  ])("reads %s", (words, satang) => {
    expect(parseThaiAmountWords(words)).toBe(satang);
  });

  it("gives null for what is not a number in Thai words", () => {
    expect(parseThaiAmountWords("")).toBeNull();
    expect(parseThaiAmountWords("บาท")).toBeNull();
    expect(parseThaiAmountWords("One thousand baht")).toBeNull();
    expect(parseThaiAmountWords("หนึ่งสองบาทถ้วน")).toBeNull(); // two digits in a row
    expect(parseThaiAmountWords("ร้อยบาทถ้วน")).toBeNull(); // a place with no digit
    expect(parseThaiAmountWords("หนึ่งร้อยบาทแปดสตางค์ห้า")).toBeNull();
    expect(parseThaiAmountWords("หนึ่งร้อยบาทร้อยสตางค์")).toBeNull(); // 100 satang is not satang
  });
});

const receipt = (over: object = {}) => ({
  ...fx.thaiDigitsReceipt,
  merchant: "Demo Shop",
  dateText: "2025-10-03",
  timeText: null,
  subtotalText: null,
  vatText: null,
  totalText: "1,200.00",
  lineItems: [],
  uncertainFields: [],
  ...over,
});

describe("the receipt-only fields", () => {
  it("reads them into typed values, and the unit, code and discount of an item", () => {
    const r = normalizeExtraction(
      receipt({
        documentSubtype: "receipt_tax_invoice",
        bookNumber: " 09 ",
        merchantAddress: "92 ถนนตัวอย่าง",
        branch: "สำนักงานใหญ่",
        buyerName: "บริษัท ตัวอย่าง จำกัด",
        buyerAddress: "1 ถนนทดสอบ",
        buyerTaxIdText: "1-1223-34455-66-8",
        referenceDocument: "PO-77",
        paymentMethod: "cash",
        totalDiscountText: "20.00",
        taxableAmountText: "1,121.50",
        exemptAmountText: "0.00",
        totalInWords: "หนึ่งพันสองร้อยบาทถ้วน",
        hasSignature: true,
        lineItems: [{ description: "Pen", quantityText: "2", unitPriceText: "10.00", amountText: "20.00", unit: "ด้าม", productCode: " P-1 ", discountText: "-5.00" }],
      }),
      { today },
    );
    expect(r).toMatchObject({
      documentSubtype: "receipt_tax_invoice", bookNumber: "09", merchantAddress: "92 ถนนตัวอย่าง", branch: "สำนักงานใหญ่",
      buyerName: "บริษัท ตัวอย่าง จำกัด", buyerAddress: "1 ถนนทดสอบ", buyerTaxId: "1122334455668", referenceDocument: "PO-77",
      paymentMethod: "cash", totalDiscount: 20, taxableAmount: 1121.5, exemptAmount: 0, totalInWords: "หนึ่งพันสองร้อยบาทถ้วน", hasSignature: true,
    });
    expect(r.lineItems[0]).toMatchObject({ unit: "ด้าม", productCode: "P-1", discount: 5 });
  });

  it("leaves them out of a transfer slip, whatever the model wrote", () => {
    const r = normalizeExtraction(receipt({ documentType: "transfer_slip", buyerName: "x", totalInWords: "x", hasSignature: true }), { today });
    for (const k of ["buyerName", "totalInWords", "hasSignature", "bookNumber"]) expect(r).not.toHaveProperty(k);
  });

  it("keeps null as null, so that 'not printed' stays different from 'not signed'", () => {
    const r = normalizeExtraction(receipt({ hasSignature: null }), { today });
    expect(r.hasSignature).toBeNull();
    expect(normalizeExtraction(receipt({ hasSignature: false }), { today }).hasSignature).toBe(false);
  });
});

describe("the checks on them", () => {
  it("says nothing when the words and the figure agree, or when the words cannot be read", () => {
    expect(codes(normalizeExtraction(receipt({ totalInWords: "หนึ่งพันสองร้อยบาทถ้วน" }), { today }))).toEqual([]);
    expect(codes(normalizeExtraction(receipt({ totalInWords: "(unreadable scribble)" }), { today }))).toEqual([]);
  });

  it("warns when the words say another amount, and again after an edit of the total", () => {
    const r = normalizeExtraction(receipt({ totalInWords: "หนึ่งพันสามร้อยบาทถ้วน" }), { today });
    expect(codes(r)).toEqual(["totalInWords:total_words_mismatch"]);
    expect(r.flags[0]!.params).toMatchObject({ wordsAmount: "1300.00", total: "1200.00" });
    expect(codes(revalidate({ ...r, total: 1300 }, { today, previous: r }))).toEqual([]);
  });

  it("checks the VAT against the amount VAT applies to", () => {
    const ok = normalizeExtraction(receipt({ taxableAmountText: "1,121.50", vatText: "78.50" }), { today });
    expect(codes(ok)).toEqual([]);
    const bad = normalizeExtraction(receipt({ taxableAmountText: "1,121.50", vatText: "50.00" }), { today });
    expect(codes(bad)).toContain("taxableAmount:tax_base_mismatch");
  });

  it("warns about a buyer's tax ID that fails the check digit", () => {
    const r = normalizeExtraction(receipt({ buyerTaxIdText: "1122334455669" }), { today });
    expect(codes(r)).toContain("buyerTaxId:invalid_buyer_tax_id");
  });
});

describe("VAT larger than the total", () => {
  it("warns, as when a baht and satang column pair is read as one number", () => {
    const r = normalizeExtraction(receipt({ subtotalText: "84112", vatText: "5888", totalText: "900" }), { today });
    expect(codes(r)).toContain("vat:vat_exceeds_total");
    expect(codes(r)).not.toContain("vat:vat_mismatch"); // one message about the VAT, not two
  });

  it("says nothing when the VAT is a part of the total", () => {
    const r = normalizeExtraction(receipt({ subtotalText: "841.12", vatText: "58.88", totalText: "900" }), { today });
    expect(codes(r)).not.toContain("vat:vat_exceeds_total");
  });

  it("clears after the VAT is corrected", () => {
    const r = normalizeExtraction(receipt({ subtotalText: "84112", vatText: "5888", totalText: "900" }), { today });
    expect(codes(revalidate({ ...r, vat: 58.88, subtotal: 841.12 }, { today, previous: r }))).not.toContain("vat:vat_exceeds_total");
  });
});

describe("the total in words, as kept", () => {
  it.each([
    ["(One thousand baht only)", "One thousand baht only"],
    ["One thousand baht only)", "One thousand baht only"],
    ["-เก้าร้อยบาทถ้วน.-", "เก้าร้อยบาทถ้วน"],
    ["เก้าร้อยบาทถ้วน.", "เก้าร้อยบาทถ้วน"],
    ["  (หนึ่งพันบาทถ้วน)  ", "หนึ่งพันบาทถ้วน"],
    ["สองร้อยบาทถ้วน", "สองร้อยบาทถ้วน"],
  ])("cleans %s", (printed, kept) => {
    expect(cleanWords(printed)).toBe(kept);
  });

  it("keeps nothing from nothing", () => {
    expect(cleanWords(null)).toBeNull();
    expect(cleanWords("  ")).toBeNull();
    expect(cleanWords("(-)")).toBeNull();
  });

  it("is what a receipt stores, and the check still reads it", () => {
    const ok = normalizeExtraction(receipt({ totalInWords: "-หนึ่งพันสองร้อยบาทถ้วน.-" }), { today });
    expect(ok.totalInWords).toBe("หนึ่งพันสองร้อยบาทถ้วน");
    expect(codes(ok)).toEqual([]);
    const bad = normalizeExtraction(receipt({ totalInWords: "(หนึ่งพันสามร้อยบาทถ้วน)" }), { today });
    expect(codes(bad)).toEqual(["totalInWords:total_words_mismatch"]);
  });
});
