import type { RawExtraction } from "./schema.js";

/**
 * Synthetic model outputs for trying the review screen without an API key.
 * All names and numbers are invented.
 */
export const SAMPLES: { id: string; label: string; raw: RawExtraction }[] = [
  {
    id: "thai-receipt",
    label: "ใบเสร็จร้านกาแฟ (เลขไทย / พ.ศ.)",
    raw: {
      documentType: "receipt",
      merchant: "ร้านกาแฟตัวอย่าง (Sample Coffee)",
      dateText: "๑๒/๐๕/๒๕๖๘",
      timeText: "๑๔.๓๕ น.",
      currency: null,
      subtotalText: "๑๖๓.๐๐",
      vatText: "๑๑.๔๑",
      totalText: "฿๑๗๔.๔๑",
      lineItems: [
        { description: "ลาเต้เย็น", quantityText: "๒", unitPriceText: "๖๕.๐๐", amountText: "๑๓๐.๐๐" },
        { description: "Croissant", quantityText: "๑", unitPriceText: "๓๓.๐๐", amountText: "๓๓.๐๐" },
      ],
      uncertainFields: [],
    },
  },
  {
    id: "transfer-slip",
    label: "สลิปโอนเงิน (ปี 2 หลัก ต้องตรวจ)",
    raw: {
      documentType: "transfer_slip",
      merchant: "นางสาว ตัวอย่าง ทดสอบ",
      dateText: "3 ก.ย. 68",
      timeText: "09:41",
      currency: null,
      subtotalText: null,
      vatText: null,
      totalText: "2,500.00 บาท",
      lineItems: [],
      uncertainFields: [],
    },
  },
  {
    id: "needs-review",
    label: "ใบเสร็จที่มีปัญหา (ยอดไม่ตรง / อ่านไม่ออก)",
    raw: {
      documentType: "receipt",
      merchant: "Demo Mart สาขาทดสอบ",
      dateText: "5 Jan 2658",
      timeText: null,
      currency: null,
      subtotalText: "1,000.00",
      vatText: "70.00",
      totalText: "1,070.00",
      lineItems: [
        { description: "น้ำดื่ม Water 600ml", quantityText: "12", unitPriceText: "7.00", amountText: "84.00" },
        { description: "ข้าวสาร Rice 5kg", quantityText: "2", unitPriceText: "158.00", amountText: "3l6.00" },
      ],
      uncertainFields: ["lineItems.1.amount"],
    },
  },
];
