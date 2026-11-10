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
    dropHint: "ใช้รูปจากมือถือได้เลย (JPEG, PNG, WebP, HEIC) หรือไฟล์ PDF ระบบย่อรูปให้อัตโนมัติบนเครื่องคุณก่อนอัปโหลด",
    camera: "ถ่ายรูป",
    addPhoto: "+ เพิ่มรูปของใบเดียวกัน",
    longHint: "ใบยาวมาก? ถ่ายแยกเป็นหลายรูปได้ (สูงสุด 4 รูป) ให้รูปถัดไปซ้อนกับท้ายรูปก่อนหน้า 2–3 บรรทัด และเรียงจากบนลงล่าง ระบบจะรวมเป็นใบเดียวและเช็กให้ว่าเป็นใบเดียวกันจริงไหม",
    orderHint: "เรียงจากบนลงล่างของใบเสร็จ (ใช้ปุ่มลูกศรสลับลำดับ)",
    slipCheckTitle: "ตรวจกับธนาคาร",
    slipCheckIntro: "สลิปธนาคารมี QR เล็กๆ ที่ใช้ถามธนาคารได้ว่ามีรายการโอนนี้จริงไหม และยอดกับวันที่ตรงกับที่อ่านได้หรือเปล่า รูปสลิปอย่างเดียวพิสูจน์ไม่ได้ว่าจริงหรือปลอม",
    slipNoService: "เดโมนี้ยังไม่ได้เปิดบริการตรวจกับธนาคาร (ผู้ติดตั้งต้องตั้งค่าบริการตรวจสลิปก่อน)",
    slipScanning: "กำลังหา QR ตรวจสลิปในรูป…",
    slipQrMatches: "เลขอ้างอิงที่อ่านได้ตรงกับเลขใน QR บนสลิป (ตรวจในเครื่อง ไม่ได้พิสูจน์ว่าสลิปจริง)",
    slipQrMismatch: "เลขอ้างอิงที่อ่านได้ ({printed}) ไม่ตรงกับเลขใน QR บนสลิป ({qr})",
    useQrReference: "ใช้ค่าจาก QR",
    slipNoQrLocal: "ไม่พบ QR บนสลิปในรูป จึงเทียบเลขอ้างอิงกับ QR ไม่ได้ ซึ่งไม่ได้แปลว่าสลิปปลอม",
    slipNoQr: "ไม่พบ QR ตรวจสลิปของธนาคารในรูป (เป็น QR เล็กๆ มักอยู่ท้ายสลิป ต้องเห็นชัดและไม่ถูกตัดออก) จึงตรวจกับธนาคารไม่ได้ ซึ่งไม่ได้แปลว่าสลิปปลอม",
    slipDisclosure: "เมื่อกดตรวจ ระบบจะส่งเฉพาะข้อความใน QR (รหัสธนาคารผู้โอนและเลขอ้างอิงรายการ) ผ่านเซิร์ฟเวอร์นี้ไปยังบริการตรวจสลิปของบุคคลที่สาม ({provider}) ไม่ส่งรูปสลิป",
    slipCheck: "ตรวจกับธนาคาร",
    slipChecking: "กำลังถามธนาคาร…",
    slipRecheck: "ตรวจอีกครั้ง",
    slipVerified: "ธนาคารยืนยันว่ามีรายการโอนนี้ (ตามธนาคาร ยอด {amount} บาท วันที่ {date})",
    slipVerifiedNote: "ยืนยันเฉพาะว่ามีรายการโอนตามเลขอ้างอิงนี้ ส่วนยอดและวันที่ให้ดูว่าตรงกับช่องด้านล่างหรือไม่ (ถ้าไม่ตรงจะมีแจ้งเตือนสีแดง) ยังไม่ได้ตรวจว่าผู้รับคือบัญชีของคุณ และไม่ได้ตรวจว่าเคยใช้สลิปนี้ไปแล้วหรือไม่",
    slipMismatch: "ธนาคารมีรายการโอนตามเลขอ้างอิงนี้ แต่ยอดหรือวันที่ไม่ตรงกับสลิป (ตามธนาคาร ยอด {amount} บาท วันที่ {date}) ดูแจ้งเตือนสีแดงในรายการที่ควรตรวจ",
    slipNotFoundStatus: "ธนาคารไม่พบรายการโอนนี้ ผลนี้ยังสรุปไม่ได้ว่าจริงหรือปลอม (ดูคำอธิบายในรายการที่ควรตรวจ)",
    slipPendingStatus: "ธนาคารยังยืนยันไม่ได้ รายการอาจเพิ่งโอน ลองตรวจอีกครั้งในอีกสักครู่",
    slipUnavailableStatus: "ถามธนาคารแล้วแต่ตอบไม่ได้ ซึ่งไม่ได้แปลว่าสลิปปลอม ไฟล์ที่ส่งออกจะบันทึกว่า \"ตอบไม่ได้\" ลองตรวจอีกครั้งได้",
    movePhoto: "ย้ายรูปที่ {n} {dir}",
    moveLeft: "ไปทางซ้าย",
    moveRight: "ไปทางขวา",
    removePhoto: "เอารูปที่ {n} ออก",
    preparing: "กำลังเตรียมรูป…",
    lowRes: "รูปค่อนข้างเล็ก ({w}×{h} พิกเซล) ตัวหนังสือเล็กอาจอ่านไม่ออก ลองถ่ายให้ใกล้ขึ้น",
    tipsTitle: "ถ่ายให้อ่านแม่น",
    tip1: "วางใบเสร็จบนพื้นเรียบ ถ่ายตรงจากด้านบน ไม่เอียง",
    tip2: "แสงสว่างพอ ไม่มีเงาหรือแสงสะท้อนบังตัวหนังสือ",
    tip3: "ให้เห็นทั้งใบ ตั้งแต่ชื่อร้านถึงยอดรวม และถ่ายให้ใกล้พอที่ตัวหนังสือชัด",
    preview: "ตัวอย่างรูปที่เลือก",
    extract: "อ่านข้อมูล",
    reading: "กำลังอ่าน…",
    liveTitle: "กำลังอ่านเอกสาร…",
    liveNote: "นี่คือสิ่งที่อ่านได้ตอนนี้ ตามที่พิมพ์ในรูป ยังไม่ผ่านการตรวจ จึงแก้ไขและส่งออกยังไม่ได้ จะเปิดให้ตรวจทานเมื่ออ่านเสร็จ",
    liveWaiting: "กำลังส่งรูปให้โมเดลอ่าน…",
    liveElapsed: "ผ่านไป {n} วินาที (ปกติใช้ราว 10–15 วินาที)",
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
    payee: "ผู้รับเงิน",
    payer: "ผู้โอน",
    recipientName: "ชื่อเจ้าของบัญชีผู้รับ",
    recipientNameHint: "เฉพาะสลิปที่แสดงทั้งชื่อร้านและชื่อบุคคล",
    amountTransferred: "จำนวนเงินที่โอน",
    fee: "ค่าธรรมเนียม",
    reference: "เลขที่รายการอ้างอิง",
    receiptNumber: "เลขที่ใบเสร็จ",
    taxId: "เลขประจำตัวผู้เสียภาษี",
    showHidden: "แสดงช่องที่ซ่อน (เลขผู้เสียภาษี, ยอดก่อน VAT, VAT, รายการสินค้า)",
    hideUnrelated: "ซ่อนช่องที่ไม่เกี่ยวข้อง",
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
    themes: { light: "สว่าง", dark: "มืด" },
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
    dropHint: "Phone photos are fine (JPEG, PNG, WebP, HEIC), and so are PDF files. They are resized automatically on your device before upload.",
    camera: "Take photo",
    addPhoto: "+ Add another photo of the same receipt",
    longHint: "A very long receipt? Take it in several photos (up to 4). Make each photo overlap the end of the previous one by 2–3 lines, in order from top to bottom. They are read as one receipt, and we check they really are the same one.",
    orderHint: "In order from the top of the receipt to the bottom (use the arrows to reorder).",
    slipCheckTitle: "Check with the bank",
    slipCheckIntro: "A bank slip carries a small QR code that can ask the bank whether this transfer exists, and whether its amount and date match what was read. The slip image alone cannot prove it is real or fake.",
    slipNoService: "This demo has no bank-check service set up (whoever installs the app must configure a slip verification service first).",
    slipScanning: "Looking for the slip's QR code in the photo…",
    slipQrMatches: "The reference read matches the one in the slip's QR code (checked on this device; it does not prove the slip is real).",
    slipQrMismatch: "The reference read ({printed}) differs from the one in the slip's QR code ({qr})",
    useQrReference: "Use the QR code's value",
    slipNoQrLocal: "No QR code was found on the slip in the photo, so the reference can't be compared with it. That does not mean the slip is fake.",
    slipNoQr: "No bank slip QR code was found in the photo (it is a small QR code, usually near the end of the slip, and it must be sharp and not cropped), so the bank can't be asked. That does not mean the slip is fake.",
    slipDisclosure: "When you press the button, only the text inside the QR code (the sending bank's code and the transaction reference) is sent, through this server, to a third-party slip verification service ({provider}). The slip image is not sent.",
    slipCheck: "Check with the bank",
    slipChecking: "Asking the bank…",
    slipRecheck: "Check again",
    slipVerified: "The bank confirms this transfer exists (bank's record: {amount} baht on {date})",
    slipVerifiedNote: "This only confirms that a transfer with this reference exists. Look at whether the amount and date match the fields below (a red warning appears if they don't). It has not checked that the receiver is your account, or whether this slip was already used.",
    slipMismatch: "The bank has a transfer with this reference, but its amount or date does not match the slip (bank's record: {amount} baht on {date}). See the red warning in the list to check.",
    slipNotFoundStatus: "The bank has no such transfer. That alone does not show whether the slip is real or fake (see the explanation in the list to check).",
    slipPendingStatus: "The bank can't confirm yet. The transfer may be very recent. Try again in a few minutes.",
    slipUnavailableStatus: "The bank was asked but could not answer. That does not mean the slip is fake. The export records \"unavailable\". You can check again.",
    movePhoto: "Move photo {n} {dir}",
    moveLeft: "left",
    moveRight: "right",
    removePhoto: "Remove photo {n}",
    preparing: "Preparing the image…",
    lowRes: "This image is small ({w}×{h} px), so small print may be unreadable. Try a closer photo.",
    tipsTitle: "For a clear read",
    tip1: "Lay the receipt flat and shoot straight down, not at an angle.",
    tip2: "Use enough light, with no shadows or glare over the text.",
    tip3: "Show the whole receipt, from the shop name to the total, close enough that the text is sharp.",
    preview: "Preview of the selected image",
    extract: "Read data",
    reading: "Reading…",
    liveTitle: "Reading the document…",
    liveNote: "This is what has been read so far, as printed. It has not been checked yet, so it can't be edited or exported. You can review it when reading is done.",
    liveWaiting: "Sending the image to the model…",
    liveElapsed: "{n} s elapsed (usually about 10–15 s)",
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
    payee: "Payee",
    payer: "Payer",
    recipientName: "Recipient account holder",
    recipientNameHint: "Only when the slip shows both a shop name and a person's name",
    amountTransferred: "Amount transferred",
    fee: "Fee",
    reference: "Reference number",
    receiptNumber: "Receipt number",
    taxId: "Tax ID",
    showHidden: "Show hidden fields (tax ID, subtotal, VAT, items)",
    hideUnrelated: "Hide fields that don't apply",
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
    themes: { light: "Light", dark: "Dark" },
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
    documentType: "ประเภทเอกสาร", merchant: "ชื่อร้าน / ผู้รับเงิน", payer: "ผู้โอน", recipientName: "ชื่อเจ้าของบัญชีผู้รับ", reference: "เลขที่อ้างอิง", taxId: "เลขผู้เสียภาษี", fee: "ค่าธรรมเนียม", date: "วันที่", time: "เวลา", currency: "สกุลเงิน",
    subtotal: "ยอดก่อน VAT", vat: "VAT", total: "ยอดรวม", lineItems: "รายการสินค้า", verification: "ตรวจกับธนาคาร",
    description: "ชื่อรายการ", quantity: "จำนวน", unitPrice: "ราคาต่อหน่วย", amount: "จำนวนเงิน",
  },
  en: {
    documentType: "Document type", merchant: "Shop / payee", payer: "Payer", recipientName: "Recipient account holder", reference: "Reference", taxId: "Tax ID", fee: "Fee", date: "Date", time: "Time", currency: "Currency",
    subtotal: "Subtotal", vat: "VAT", total: "Total", lineItems: "Items", verification: "Bank check",
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
    unparseable_decimals: "“{text}” มีทศนิยมเกิน 2 ตำแหน่ง ซึ่งไม่ใช่จำนวนเงินบาทที่ถูกต้อง ระบบไม่เดาให้ ตรวจกับรูปต้นฉบับแล้วกรอกเอง",
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
    invalid_tax_id: "เลขผู้เสียภาษี {text} ไม่ถูกต้อง (หลักตรวจสุดท้ายไม่ตรง) อาจอ่านตัวเลขผิด ตรวจกับรูปต้นฉบับ",
    merged_images: "อ่านจาก {count} รูปที่ต่อกันจากบนลงล่าง ตรวจบรรทัดตรงรอยต่อของรูป ไม่ควรมีบรรทัดตกหล่นหรือซ้ำ",
    not_a_receipt: "ระบบไม่แน่ใจว่าเอกสารนี้เป็นใบเสร็จหรือสลิปโอนเงิน ถ้าใช่ ให้เลือกประเภทเอกสารให้ถูกต้อง ถ้าไม่ใช่ ข้อมูลด้านล่างอาจเป็นข้อมูลที่ไม่มีอยู่จริง",
    slip_amount_mismatch: "ยอดในสลิปคือ {printed} แต่ธนาคารบันทึกรายการนี้ไว้ {bank} ตรวจตัวเลขกับรูปต้นฉบับ ถ้าอ่านถูกแล้ว สลิปอาจถูกแก้ไข ควรระวังก่อนใช้สลิปนี้",
    slip_date_mismatch: "วันที่ในสลิปคือ {printed} แต่ธนาคารบันทึกรายการนี้ไว้วันที่ {bank} ตรวจวันที่กับรูปต้นฉบับ ถ้าอ่านถูกแล้ว สลิปอาจถูกแก้ไข ควรระวังก่อนใช้สลิปนี้",
    slip_reference_mismatch: "เลขอ้างอิงในสลิป ({printed}) ไม่ตรงกับของธนาคาร ({bank}) ตรวจว่าอ่านเลขถูกหรือไม่ หรือสลิปแสดงเลขหลายชุด",
    slip_qr_reference_mismatch: "เลขอ้างอิงในสลิป ({printed}) ไม่ตรงกับเลขใน QR บนสลิป ({qr}) ตรวจว่าอ่านเลขถูกหรือไม่ (ตัวอักษรหน้าตาคล้ายกัน เช่น I กับ l) หรือสลิปแสดงเลขหลายชุด เลขใน QR ไม่ได้พิสูจน์ว่าสลิปจริง",
    slip_not_found: "ธนาคารไม่พบรายการโอนตามเลขอ้างอิงนี้ สลิปอาจเป็นของปลอมหรือถูกแก้ไข หรือรายการเพิ่งโอน หรือเป็นธนาคารที่บริการนี้ตรวจไม่ได้ ผลนี้ยังสรุปไม่ได้ว่าจริงหรือปลอม",
    slip_pending: "ธนาคารยังยืนยันรายการนี้ไม่ได้ (รายการอาจเพิ่งโอน) ลองตรวจอีกครั้งในอีกสักครู่",
  },
  en: {
    missing_total: "The total is missing.",
    missing_merchant: "The shop or payee name is missing.",
    missing_date: "The date is missing.",
    missing_items: "{count} items have no amount.",
    missing_item: "This item has no amount.",
    missing_other: "This field is empty.",
    unparseable: "Couldn't read “{text}” as {kind}.",
    unparseable_decimals: "“{text}” has more than two decimal places, which isn't a valid baht amount. It isn't guessed. Check the original and type the right value.",
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
    invalid_tax_id: "Tax ID {text} is not valid (its check digit does not match), so a digit may have been misread. Check it against the original.",
    merged_images: "Read from {count} photos, top to bottom. Check the lines where the photos meet: none should be missing or repeated.",
    not_a_receipt: "We aren't sure this is a receipt or transfer slip. If it is, set the document type. If not, the data below may be made up.",
    slip_amount_mismatch: "The slip shows {printed} but the bank's record of this transfer is {bank}. Check the number against the original. If it was read correctly, the slip may have been altered, so be careful before relying on it.",
    slip_date_mismatch: "The slip shows {printed} but the bank's record of this transfer is dated {bank}. Check the date against the original. If it was read correctly, the slip may have been altered, so be careful before relying on it.",
    slip_reference_mismatch: "The reference on the slip ({printed}) differs from the bank's ({bank}). Check it was read correctly, or whether the slip shows more than one number.",
    slip_qr_reference_mismatch: "The reference on the slip ({printed}) differs from the one in the slip's QR code ({qr}). Check it was read correctly (letters that look alike, such as I and l), or whether the slip shows more than one number. The QR code does not prove the slip is real.",
    slip_not_found: "The bank has no transfer with this reference. The slip may be forged or altered, or the transfer is very recent, or it is from a bank this service can't check. This alone does not show whether the slip is real or fake.",
    slip_pending: "The bank can't confirm this transfer yet (it may be very recent). Try again in a few minutes.",
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
      if (p?.reason === "decimals") return tpl(t.unparseable_decimals!, p);
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
    case "merged_images": return tpl(t.merged_images!, p);
    case "invalid_tax_id": return tpl(t.invalid_tax_id!, p);
    case "slip_amount_mismatch": return tpl(t.slip_amount_mismatch!, p);
    case "slip_date_mismatch": return tpl(t.slip_date_mismatch!, p);
    case "slip_reference_mismatch": return tpl(t.slip_reference_mismatch!, p);
    case "slip_qr_reference_mismatch": return tpl(t.slip_qr_reference_mismatch!, p);
    case "slip_not_found": return t.slip_not_found!;
    case "slip_pending": return t.slip_pending!;
    default: return f.message;
  }
}

const API: Record<Lang, Record<string, string>> = {
  th: {
    missing_image: "ยังไม่ได้เลือกรูป",
    bad_type: "รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WebP) และ PDF",
    pdf_encrypted: "PDF นี้ตั้งรหัสผ่านไว้ เปิดอ่านไม่ได้ ลองบันทึกเป็น PDF ใหม่แบบไม่ใส่รหัสผ่าน หรือถ่ายภาพหน้าจอแล้วอัปโหลดแทน",
    pdf_too_many_pages: "PDF นี้มี {pages} หน้า แต่ใช้ได้สูงสุด {max} หน้าต่อหนึ่งใบเสร็จ ระบบไม่ตัดหน้าให้เอง เพราะอาจไม่ใช่ใบเสร็จใบเดียว ลองแยกเฉพาะหน้าของใบเสร็จแล้วอัปโหลดใหม่",
    pdf_unreadable: "เปิดไฟล์ PDF นี้ไม่ได้ ไฟล์อาจเสียหาย ลองบันทึกหรือพิมพ์เป็น PDF ใหม่ แล้วอัปโหลดอีกครั้ง",
    empty_file: "ไฟล์ว่างเปล่า",
    too_large: "รูปใหญ่เกินไป แม้ย่อแล้วก็ยังเกิน 4 MB ลองถ่ายใหม่หรือครอปให้เหลือเฉพาะใบเสร็จ",
    decode_failed: "เปิดรูปนี้ไม่ได้ ลองบันทึกเป็น JPEG หรือ PNG แล้วอัปโหลดใหม่",
    rate_limited: "คุณใช้งานบ่อยเกินไป ลองใหม่ในอีก {minutes} นาที",
    daily_limit: "เดโมนี้ถึงโควตารายวันแล้ว ลองใหม่ในอีก {minutes} นาที",
    extract_failed: "อ่านข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง",
    busy: "ตอนนี้มีคนใช้งานเยอะ ลองใหม่อีกครั้งในอีกสักครู่ (ประมาณ {seconds} วินาที)",
    too_many_images: "ใช้ได้สูงสุด 4 รูปต่อหนึ่งใบเสร็จ",
    invalid_qr: "ข้อความที่อ่านได้จาก QR ไม่ใช่ QR ตรวจสลิปของธนาคาร หรืออ่านผิดพลาด ลองถ่ายหรือครอปสลิปให้เห็น QR ชัดขึ้น",
    slip_verify_disabled: "เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าบริการตรวจสลิป",
    slip_unavailable_rejected: "บริการตรวจสลิปปฏิเสธคำขอ (คีย์ไม่ถูกต้องหรือถูกปิดใช้งาน) ต้องให้ผู้ดูแลตรวจสอบ",
    slip_unavailable_quota: "โควตาของบริการตรวจสลิปหมด หรือแพ็กเกจหมดอายุแล้ว ต้องให้ผู้ดูแลต่อแพ็กเกจหรือเพิ่มโควตา",
    slip_unavailable_busy: "บริการตรวจสลิปหรือธนาคารตอบไม่ได้ในตอนนี้ ซึ่งไม่ได้แปลว่าสลิปปลอม ลองใหม่อีกครั้งในอีกสักครู่",
    slip_unavailable_error: "ถามธนาคารไม่สำเร็จในครั้งนี้ ซึ่งไม่ได้แปลว่าสลิปปลอม ลองใหม่อีกครั้ง",
    different_documents: "รูปเหล่านี้ดูเหมือนไม่ใช่ใบเสร็จใบเดียวกัน ระบบไม่ได้รวมให้ เอารูปที่ไม่เกี่ยวข้องออก หรืออัปโหลดแยกทีละใบ",
    different_documents_fields: "รูปเหล่านี้ดูเหมือนไม่ใช่ใบเสร็จใบเดียวกัน ({fields} ไม่ตรงกัน) ระบบไม่ได้รวมให้ เอารูปที่ไม่เกี่ยวข้องออก หรืออัปโหลดแยกทีละใบ",
    handwritten: "รูปนี้เขียนด้วยลายมือ ระบบรองรับเฉพาะใบเสร็จและสลิปโอนเงินแบบพิมพ์ เพราะอ่านลายมือไม่แม่น โดยเฉพาะตัวเลข กรุณาใช้เอกสารที่พิมพ์ออกมา",
    generic: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
  },
  en: {
    missing_image: "Please choose an image first.",
    bad_type: "Only JPEG, PNG, WebP or PDF files are supported.",
    pdf_encrypted: "This PDF is password protected, so it can't be read. Save an unprotected copy, or upload a screenshot instead.",
    pdf_too_many_pages: "This PDF has {pages} pages, but at most {max} pages can be read as one receipt. Pages are not dropped for you, because the file may hold more than one receipt. Keep only the receipt's pages and try again.",
    pdf_unreadable: "This PDF can't be opened. The file may be damaged. Save or print it as a new PDF and try again.",
    empty_file: "The file is empty.",
    too_large: "The image is still over 4 MB even after resizing. Try a new photo, or crop it to just the receipt.",
    decode_failed: "This image can't be opened. Save it as JPEG or PNG and try again.",
    rate_limited: "You're going a bit fast. Try again in {minutes} min.",
    daily_limit: "The demo has reached its daily limit. Try again in {minutes} min.",
    extract_failed: "Couldn't read the document. Please try again.",
    busy: "The service is busy right now. Please try again in a moment (about {seconds} s).",
    too_many_images: "At most 4 photos can be read as one receipt.",
    invalid_qr: "The text read from the QR code is not a bank slip QR code, or it was read wrongly. Try a sharper photo or crop the slip so the QR code is clear.",
    slip_verify_disabled: "Slip checking is not set up on this server.",
    slip_unavailable_rejected: "The slip checking service refused the request (the key is invalid or disabled). Whoever runs this app needs to look at it.",
    slip_unavailable_quota: "The slip checking service has run out of quota, or its package has expired. Whoever runs this app needs to renew it or add more.",
    slip_unavailable_busy: "The slip checking service or the bank could not answer right now. That does not mean the slip is fake. Try again in a moment.",
    slip_unavailable_error: "The bank could not be asked this time. That does not mean the slip is fake. Try again.",
    different_documents: "These photos don't look like the same receipt, so they were not combined. Remove the one that doesn't belong, or upload them one at a time.",
    different_documents_fields: "These photos don't look like the same receipt ({fields} differ), so they were not combined. Remove the one that doesn't belong, or upload them one at a time.",
    handwritten: "This looks handwritten. Only printed receipts and transfer slips are supported, because handwriting, especially numbers, can't be read reliably. Please use a printed document.",
    generic: "Something went wrong. Please try again.",
  },
};

export interface ApiError {
  code?: string;
  retryAfterSec?: number;
  detail?: string;
  /** For different_documents: which values disagreed. */
  fields?: string[];
  /** For pdf_too_many_pages: the page count of the file and the most that can be read. */
  pages?: number;
  max?: number;
  /** For slip_unavailable: why the service could not answer. */
  reason?: string;
}

const CONFLICT_FIELDS: Record<Lang, Record<string, string>> = {
  th: { merchant: "ชื่อร้าน", taxId: "เลขผู้เสียภาษี", date: "วันที่", total: "ยอดรวม" },
  en: { merchant: "shop", taxId: "tax ID", date: "date", total: "total" },
};

/** Message for an /api/extract error response. `detail` is operator-facing (English). */
export function apiErrorText(e: ApiError, lang: Lang): string {
  const minutes = e.retryAfterSec ? Math.max(1, Math.ceil(e.retryAfterSec / 60)) : 1;
  const seconds = e.retryAfterSec ?? 15;
  const key =
    e.code === "different_documents" && e.fields?.length ? "different_documents_fields"
    : e.code === "slip_unavailable" ? `slip_unavailable_${e.reason ?? "error"}`
    : e.code ?? "";
  const fields = (e.fields ?? []).map((f) => CONFLICT_FIELDS[lang][f] ?? f).join(lang === "th" ? ", " : ", ");
  const base = tpl(API[lang][key] ?? API[lang].generic!, { minutes, seconds, fields, pages: e.pages ?? 0, max: e.max ?? 0 });
  return e.detail ? `${base} (${e.detail})` : base;
}

/** Pick a starting language from the browser's preferences. */
export const detectLang = (languages: readonly string[]): Lang =>
  languages.some((l) => l.toLowerCase().startsWith("th")) ? "th" : "en";
