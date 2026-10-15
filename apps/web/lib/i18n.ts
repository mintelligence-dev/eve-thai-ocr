import type { Flag } from "@thai-receipt-reader/extractor/core";

export type Lang = "th" | "en";
export const LANGS: Lang[] = ["th", "en"];

type Params = Record<string, string | number>;
const fill = (tpl: string, p: Params = {}) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));

export const T = {
  th: {
    title: "Thai Receipt Reader",
    tagline: "อ่านใบเสร็จและสลิปโอนเงินภาษาไทยให้เป็นข้อมูลที่แก้ไขได้ แล้วส่งออกเป็น JSON หรือ CSV",
    notice: "แอปนี้อ่านข้อมูลจากรูปเท่านั้น ไม่ตรวจว่าใบเสร็จหรือสลิปเป็นของจริง และไม่เก็บรูปที่อัปโหลดไว้",
    drop: "ลากรูปมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์",
    dropHint: "รองรับ JPEG, PNG, WebP ขนาดไม่เกิน 4 MB",
    preview: "ตัวอย่างรูปที่เลือก",
    extract: "อ่านข้อมูล",
    reading: "กำลังอ่าน…",
    samplesLead: "ยังไม่มีรูป? ลองตัวอย่างสมมติ (ไม่ต้องใช้ AI):",
    sample: {
      "thai-receipt": "ใบเสร็จร้านกาแฟ (เลขไทย, พ.ศ.)",
      "transfer-slip": "สลิปโอนเงิน (ปี 2 หลัก)",
      "needs-review": "ใบเสร็จที่มีจุดต้องแก้",
      "addon-discount": "ชาไข่มุก (ท็อปปิ้ง + ส่วนลด)",
    } as Record<string, string>,
    review: "ตรวจทานข้อมูล",
    modelUsed: "อ่านด้วยโมเดล: {model}",
    sampleNoAi: "ตัวอย่างสมมติ ไม่ได้ใช้ AI",
    flagsTitle: "จุดที่ควรตรวจ",
    allClear: "ไม่พบจุดผิดปกติ แต่ยังควรเทียบกับรูปต้นฉบับทุกครั้ง",
    type: "ประเภทเอกสาร",
    docTypes: { receipt: "ใบเสร็จ", transfer_slip: "สลิปโอนเงิน", unknown: "ไม่ทราบ" },
    merchant: "ชื่อร้าน / ผู้รับเงิน",
    date: "วันที่ (ค.ศ.)",
    time: "เวลา",
    currency: "สกุลเงิน",
    subtotal: "ยอดก่อน VAT",
    vat: "VAT",
    total: "ยอดรวม",
    items: "รายการสินค้า",
    colName: "รายการ",
    colQty: "จำนวน",
    colUnit: "ราคาต่อหน่วย",
    colAmount: "จำนวนเงิน",
    addItem: "+ เพิ่มรายการ",
    removeItem: "ลบรายการที่ {n}",
    confirm: "ฉันตรวจเทียบกับรูปต้นฉบับแล้ว",
    fixErrors: "แก้ข้อผิดพลาดสีแดงก่อน จึงจะส่งออกได้",
    exportJson: "ส่งออก JSON",
    exportCsv: "ส่งออก CSV",
    previewTitle: "ตัวอย่างไฟล์ที่จะส่งออก",
    previewHint: "ตัวอย่างอัปเดตตามที่คุณแก้ข้อมูลด้านบน ติ๊กยืนยันก่อน จึงจะส่งออกได้",
    jsonNote: "โครงสร้างเต็ม รวมจุดที่ควรตรวจ",
    csvNote: "หนึ่งแถวต่อหนึ่งรายการสินค้า เปิดใน Excel ได้",
    langLabel: "ภาษา",
    themeLabel: "ธีม",
    themes: { auto: "ตามระบบ", light: "สว่าง", dark: "มืด" },
    sumOk: "รวมรายการ {sum} ตรงกับ{against} {target}",
    sumBad: "รวมรายการ {sum} ไม่ตรงกับยอดรวม {target} (ต่างกัน {diff})",
    assumedHint: "ใบเสร็จไม่ได้พิมพ์ช่องนี้ ระบบสมมติเป็น 1 ชิ้น (จำนวน × ราคา = จำนวนเงิน)",
    assumedNote: "ตัวเอียงสีจางคือค่าที่ระบบสมมติ ไม่ได้พิมพ์ในใบเสร็จ แก้ไขได้ตามต้องการ",
    sumTagOk: "ตรงกัน",
    sumTagBad: "ควรตรวจ",
    against: { total: "ยอดรวม", subtotal: "ยอดก่อน VAT", beforeVat: "ยอดรวมหัก VAT" },
    fieldDot: "{field} · รายการที่ {n}",
  },
  en: {
    title: "Thai Receipt Reader",
    tagline: "Turn Thai receipts and transfer slips into editable data, then export it as JSON or CSV.",
    notice: "This app only reads what is printed. It does not check whether a receipt or slip is genuine, and it does not keep your image.",
    drop: "Drop an image here, or click to choose a file",
    dropHint: "JPEG, PNG or WebP, up to 4 MB",
    preview: "Preview of the selected image",
    extract: "Read data",
    reading: "Reading…",
    samplesLead: "No image handy? Try a made-up sample (no AI used):",
    sample: {
      "thai-receipt": "Coffee shop receipt (Thai digits, Buddhist year)",
      "transfer-slip": "Transfer slip (two-digit year)",
      "needs-review": "Receipt with problems to fix",
      "addon-discount": "Milk tea with add-on and discount",
    } as Record<string, string>,
    review: "Review the data",
    modelUsed: "Read with model: {model}",
    sampleNoAi: "Made-up sample, no AI used",
    flagsTitle: "Please check",
    allClear: "Nothing looks wrong, but always compare with the original image.",
    type: "Document type",
    docTypes: { receipt: "Receipt", transfer_slip: "Transfer slip", unknown: "Unknown" },
    merchant: "Shop / payee",
    date: "Date (Gregorian)",
    time: "Time",
    currency: "Currency",
    subtotal: "Subtotal before VAT",
    vat: "VAT",
    total: "Total",
    items: "Items",
    colName: "Item",
    colQty: "Qty",
    colUnit: "Unit price",
    colAmount: "Amount",
    addItem: "+ Add item",
    removeItem: "Remove item {n}",
    confirm: "I have checked this against the original image",
    fixErrors: "Fix the errors in red before exporting.",
    exportJson: "Export JSON",
    exportCsv: "Export CSV",
    previewTitle: "Preview of the files you will export",
    previewHint: "The preview updates as you edit above. Tick the confirmation first to enable export.",
    jsonNote: "Full structure, including the points to check",
    csvNote: "One row per item. Opens in Excel.",
    langLabel: "Language",
    themeLabel: "Theme",
    themes: { auto: "System", light: "Light", dark: "Dark" },
    sumOk: "Items add up to {sum}, matching the {against} {target}",
    sumBad: "Items add up to {sum}, but the total is {target} (off by {diff})",
    assumedHint: "Not printed on the receipt. Assumed to be 1 item (quantity × price = amount).",
    assumedNote: "Faded italic values are assumed, not printed on the receipt. You can edit them.",
    sumTagOk: "Matches",
    sumTagBad: "Check",
    against: { total: "total", subtotal: "subtotal", beforeVat: "total minus VAT" },
    fieldDot: "{field} · item {n}",
  },
} as const;

export type Dict = (typeof T)[Lang];
export const tpl = fill;

const FIELD: Record<Lang, Record<string, string>> = {
  th: {
    documentType: "ประเภทเอกสาร", merchant: "ชื่อร้าน", date: "วันที่", time: "เวลา", currency: "สกุลเงิน",
    subtotal: "ยอดก่อน VAT", vat: "VAT", total: "ยอดรวม", lineItems: "รายการสินค้า",
    description: "ชื่อรายการ", quantity: "จำนวน", unitPrice: "ราคาต่อหน่วย", amount: "จำนวนเงิน",
  },
  en: {
    documentType: "Document type", merchant: "Shop / payee", date: "Date", time: "Time", currency: "Currency",
    subtotal: "Subtotal", vat: "VAT", total: "Total", lineItems: "Items",
    description: "Item name", quantity: "Quantity", unitPrice: "Unit price", amount: "Amount",
  },
};

/** Human label for a flag path such as "date" or "lineItems.3.amount". */
export function fieldLabel(path: string, lang: Lang): string {
  const m = /^lineItems\.(\d+)\.(\w+)$/.exec(path);
  if (m) return tpl(T[lang].fieldDot, { field: FIELD[lang][m[2]!] ?? m[2]!, n: Number(m[1]) + 1 });
  return FIELD[lang][path] ?? path;
}

const KIND: Record<Lang, Record<string, string>> = {
  th: { amount: "จำนวนเงิน", date: "วันที่", time: "เวลา" },
  en: { amount: "an amount", date: "a date", time: "a time" },
};

const FLAG: Record<Lang, Record<string, string>> = {
  th: {
    missing_total: "ไม่พบยอดรวม",
    missing_merchant: "ไม่พบชื่อร้านหรือผู้รับเงิน",
    missing_date: "ไม่พบวันที่",
    missing_items: "มี {count} รายการที่ไม่มีจำนวนเงิน",
    missing_item: "รายการนี้ไม่มีจำนวนเงิน",
    missing_other: "ไม่พบข้อมูลในช่องนี้",
    unparseable: "อ่าน “{text}” เป็น{kind}ไม่ได้",
    uncertain_items: "AI ไม่มั่นใจข้อมูลในรายการสินค้า {count} จุด ควรตรวจกับรูปต้นฉบับ",
    uncertain: "AI ไม่มั่นใจข้อมูลในช่องนี้",
    unsupported_currency: "สกุลเงินเป็น {currency} ไม่ใช่ THB และระบบไม่ได้แปลงค่าเงินให้",
    two_digit_year: "“{text}” ระบุปีแค่ 2 หลัก ระบบอ่านเป็นปี {year} กรุณายืนยัน",
    date_in_future: "วันที่ {date} อยู่ในอนาคต ตรวจปีอีกครั้ง (พ.ศ. หรือ ค.ศ.)",
    date_too_old: "วันที่ {date} เก่ากว่า 10 ปี ตรวจปีอีกครั้ง",
    line_total_mismatch: "จำนวน × ราคาต่อหน่วย ได้ {expected} แต่จำนวนเงินคือ {amount}",
    items_total_mismatch: "ยอดรวมของรายการได้ {sum} ไม่ตรงกับยอดรวมหรือยอดก่อน VAT อาจมีรายการตกหล่น",
    vat_mismatch: "VAT {vat} ไม่ใช่ {rate}% ของยอดรวม ตรวจ VAT หรือยอดรวมอีกครั้ง",
    negative_amount: "จำนวนเงินติดลบ แต่ชื่อรายการไม่ได้บอกว่าเป็นส่วนลด เครื่องหมายลบอาจอ่านผิด",
    addon_split: "ยอดที่พิมพ์ในรายการนี้ ({printed}) รวมของเพิ่มด้านล่างไว้แล้ว ระบบแยกเป็น {base} บวกราคาของเพิ่ม เพื่อไม่ให้นับซ้ำ ตรวจกับรูปต้นฉบับด้วย",
    not_a_receipt: "ระบบไม่แน่ใจว่าเอกสารนี้เป็นใบเสร็จหรือสลิปโอนเงิน ถ้าใช่ ให้เลือกประเภทเอกสารให้ถูกต้อง ถ้าไม่ใช่ ข้อมูลด้านล่างอาจเป็นข้อมูลที่ไม่มีอยู่จริง",
  },
  en: {
    missing_total: "The total is missing.",
    missing_merchant: "The shop or payee name is missing.",
    missing_date: "The date is missing.",
    missing_items: "{count} items have no amount.",
    missing_item: "This item has no amount.",
    missing_other: "This field is empty.",
    unparseable: "Couldn't read “{text}” as {kind}.",
    uncertain_items: "The AI wasn't sure about {count} item fields. Check the items against the original.",
    uncertain: "The AI wasn't sure about this field.",
    unsupported_currency: "The currency is {currency}, not THB. Amounts are not converted.",
    two_digit_year: "“{text}” has a two-digit year. We read it as {year}. Please confirm.",
    date_in_future: "{date} is in the future. Check the year (Buddhist or Gregorian).",
    date_too_old: "{date} is more than 10 years ago. Check the year.",
    line_total_mismatch: "Quantity × unit price is {expected}, but the amount is {amount}.",
    items_total_mismatch: "The items add up to {sum}, which doesn't match the total or subtotal. An item may be missing.",
    vat_mismatch: "VAT {vat} is not {rate}% of the total. Check the VAT or the total.",
    negative_amount: "Negative amount, but the item name doesn't say it's a discount. The minus sign may be misread.",
    addon_split: "The amount printed on this item ({printed}) already includes the add-on below it. It is shown as {base} plus the add-on price so nothing is counted twice. Please check it against the original.",
    not_a_receipt: "We aren't sure this is a receipt or transfer slip. If it is, set the document type. If not, the data below may be made up.",
  },
};

/** Render a validation flag in the chosen language. */
export function flagText(f: Flag, lang: Lang): string {
  const t = FLAG[lang];
  const p = f.params;
  const leaf = f.path.split(".").pop() ?? f.path;
  switch (f.code) {
    case "missing":
      if (f.path === "total") return t.missing_total!;
      if (f.path === "merchant") return t.missing_merchant!;
      if (f.path === "date") return t.missing_date!;
      if (f.path === "lineItems") return tpl(t.missing_items!, p);
      if (/^lineItems\.\d+\.amount$/.test(f.path)) return t.missing_item!;
      return t.missing_other!;
    case "unparseable": {
      const kind = KIND[lang][leaf === "date" || leaf === "time" ? leaf : "amount"]!;
      return tpl(t.unparseable!, { ...p, kind });
    }
    case "model_uncertain":
      return f.path === "lineItems" ? tpl(t.uncertain_items!, p) : t.uncertain!;
    case "unsupported_currency": return tpl(t.unsupported_currency!, p);
    case "two_digit_year": return tpl(t.two_digit_year!, p);
    case "date_in_future": return tpl(t.date_in_future!, p);
    case "date_too_old": return tpl(t.date_too_old!, p);
    case "line_total_mismatch": return tpl(t.line_total_mismatch!, p);
    case "items_total_mismatch": return tpl(t.items_total_mismatch!, p);
    case "vat_mismatch": return tpl(t.vat_mismatch!, p);
    case "negative_amount": return t.negative_amount!;
    case "not_a_receipt": return t.not_a_receipt!;
    case "addon_split": return tpl(t.addon_split!, p);
    default: return f.message;
  }
}

const API: Record<Lang, Record<string, string>> = {
  th: {
    missing_image: "ยังไม่ได้เลือกรูป",
    bad_type: "รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP",
    empty_file: "ไฟล์ว่างเปล่า",
    too_large: "ไฟล์ใหญ่เกิน 4 MB",
    rate_limited: "คุณใช้งานบ่อยเกินไป ลองใหม่ในอีก {minutes} นาที",
    daily_limit: "เดโมนี้ถึงโควตารายวันแล้ว ลองใหม่ในอีก {minutes} นาที",
    extract_failed: "อ่านข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง",
    generic: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
  },
  en: {
    missing_image: "Please choose an image first.",
    bad_type: "Only JPEG, PNG or WebP files are supported.",
    empty_file: "The file is empty.",
    too_large: "The file is larger than 4 MB.",
    rate_limited: "You're going a bit fast. Try again in {minutes} min.",
    daily_limit: "The demo has reached its daily limit. Try again in {minutes} min.",
    extract_failed: "Couldn't read the document. Please try again.",
    generic: "Something went wrong. Please try again.",
  },
};

export interface ApiError {
  code?: string;
  retryAfterSec?: number;
  detail?: string;
}

/** Message for an /api/extract error response. `detail` is operator-facing (English). */
export function apiErrorText(e: ApiError, lang: Lang): string {
  const minutes = e.retryAfterSec ? Math.max(1, Math.ceil(e.retryAfterSec / 60)) : 1;
  const base = tpl(API[lang][e.code ?? ""] ?? API[lang].generic!, { minutes });
  return e.detail ? `${base} (${e.detail})` : base;
}

/** Pick a starting language from the browser's preferences. */
export const detectLang = (languages: readonly string[]): Lang =>
  languages.some((l) => l.toLowerCase().startsWith("th")) ? "th" : "en";
