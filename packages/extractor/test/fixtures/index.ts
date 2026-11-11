import type { RawExtraction } from "../../src/schema.js";

/**
 * Synthetic data only. Names, amounts and dates are invented; no real
 * merchants, accounts or people. Each fixture is what a vision model would
 * return for a document with that layout.
 */
const item = (
  description: string,
  quantityText: string | null,
  unitPriceText: string | null,
  amountText: string | null,
) => ({ description, quantityText, unitPriceText, amountText, unit: null, productCode: null, discountText: null });

const base: RawExtraction = {
  documentType: "receipt",
  handwritten: false,
  sameDocument: true,
  imageFacts: [],
  merchant: null,
  payer: null,
  recipientName: null,
  referenceText: null,
  referenceLabel: null,
  taxIdText: null,
  feeText: null,
  dateText: null,
  timeText: null,
  currency: null,
  subtotalText: null,
  vatText: null,
  totalText: null,
  documentSubtype: null,
  bookNumber: null,
  merchantAddress: null,
  branch: null,
  buyerName: null,
  buyerAddress: null,
  buyerTaxIdText: null,
  referenceDocument: null,
  paymentMethod: null,
  totalDiscountText: null,
  taxableAmountText: null,
  exemptAmountText: null,
  totalInWords: null,
  hasSignature: null,
  lineItems: [],
  uncertainFields: [],
};

/** Thai digits, BE date, VAT-inclusive total. */
export const thaiDigitsReceipt: RawExtraction = {
  ...base,
  merchant: "ร้านกาแฟตัวอย่าง (Sample Coffee)",
  dateText: "๑๒/๐๕/๒๕๖๘",
  timeText: "๑๔.๓๕ น.",
  subtotalText: "๑๖๓.๐๐",
  vatText: "๑๑.๔๑",
  totalText: "฿๑๗๔.๔๑",
  lineItems: [
    item("ลาเต้เย็น", "๒", "๖๕.๐๐", "๑๓๐.๐๐"),
    item("Croissant", "๑", "๓๓.๐๐", "๓๓.๐๐"),
  ],
};

/** English month, Gregorian year, mixed Thai-English item names. */
export const mixedLanguageReceipt: RawExtraction = {
  ...base,
  merchant: "Demo Mart สาขาทดสอบ",
  dateText: "5 Jan 2025",
  totalText: "1,070.00 THB",
  vatText: "70.00",
  subtotalText: "1,000.00",
  lineItems: [
    item("น้ำดื่ม Water 600ml", "12", "7.00", "84.00"),
    item("ข้าวสาร Rice 5kg", "2", "158.00", "316.00"),
    item("Shampoo แชมพู", "1", "600.00", "600.00"),
  ],
};

/** Transfer slip: payee, amount, Thai month abbreviation. */
export const transferSlip: RawExtraction = {
  ...base,
  documentType: "transfer_slip",
  merchant: "นางสาว ตัวอย่าง ทดสอบ",
  payer: "นายสมมติ ตัวอย่าง",
  recipientName: null,
  referenceText: "2025 0903 0941 0001",
  referenceLabel: "เลขที่รายการ",
  taxIdText: null,
  feeText: "0.00",
  dateText: "3 ก.ย. 68",
  timeText: "09:41",
  totalText: "2,500.00 บาท",
};

/** Items do not add up to the total (a line was probably missed). */
export const itemsMismatchReceipt: RawExtraction = {
  ...thaiDigitsReceipt,
  lineItems: [item("ลาเต้เย็น", "2", "65.00", "130.00")],
};

/** Year printed with the wrong calendar: BE year read as 2658. */
export const futureDateReceipt: RawExtraction = {
  ...thaiDigitsReceipt,
  dateText: "12/05/2658",
};

export const unreadableAmountReceipt: RawExtraction = {
  ...thaiDigitsReceipt,
  totalText: "1?4.4l",
  uncertainFields: ["total"],
};

export const emptyReceipt: RawExtraction = { ...base, documentType: "unknown" };

export const formulaInjectionReceipt: RawExtraction = {
  ...thaiDigitsReceipt,
  merchant: "=HYPERLINK(\"http://example.invalid\",\"x\")",
};
