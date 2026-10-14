# Thai Receipt Reader

[ไทย](#ภาษาไทย) · [English](#english)

---

## English

Open-source AI tool that turns printed Thai receipts and transfer slips into editable, structured data (JSON / CSV). For small shops, freelancers and developers building expense tools.

**What it does**

- Upload one image → extract merchant/payee, date, time, subtotal, VAT, total and line items.
- Handles Thai numerals (๑๒๓), Buddhist Era dates (12/05/2568 → 2025-05-12), Thai/English month names and mixed Thai–English text.
- Flags uncertain fields (model unsure, unreadable amounts, totals that don't add up, VAT that isn't 7%, dates in the future, two-digit years).
- Review and correct everything, then export JSON or CSV. Export is blocked until you tick "I have checked this against the original" and no errors remain.

**What it does not do**

- **Extraction only.** It does not verify that a receipt or payment slip is genuine.
- Printed documents only: no handwriting. No accounting-system integrations.
- Bank account numbers, card numbers, phone numbers and national IDs are not requested from the model.

**How it works**

The model only *transcribes* text exactly as printed (Zod-validated output via Vercel AI SDK). Deterministic TypeScript then parses digits, dates and amounts (integer satang, no float error) and runs the cross-checks. See [`packages/extractor`](packages/extractor).

```
apps/web                 Next.js demo (upload → review → export)
packages/extractor       Reusable TypeScript package (extract, normalise, validate, export)
```

### Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # add AI_GATEWAY_API_KEY
pnpm dev                                       # http://localhost:3000
pnpm test                                      # extractor tests
```

No key yet? Click one of the synthetic samples on the page to try the review screen without calling a model.

### Use the package

```ts
import { extractReceipt, toCSV } from "@thai-receipt-reader/extractor";

const { receipt } = await extractReceipt({
  image: bytes,                  // Uint8Array / URL / data URL
  mediaType: "image/jpeg",
  model: "google/gemini-2.5-flash", // any vision model on AI Gateway
});
receipt.flags;                   // fields a human should check
toCSV(receipt);
```

Browser-safe helpers (no model code) are at `@thai-receipt-reader/extractor/core`.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPattarapongS%2Fthai-receipt-reader&root-directory=apps%2Fweb&env=AI_GATEWAY_API_KEY&envDescription=Vercel%20AI%20Gateway%20key&envLink=https%3A%2F%2Fvercel.com%2Fdocs%2Fai-gateway)

> Keep "Include source files outside of the Root Directory" enabled (Vercel's default) so the workspace package is available. The repo must be public for the button to work.

### Costs

Prices change; check the linked pages before relying on these.

| Item | Cost model |
|---|---|
| Hosting | Next.js on Vercel. The Hobby plan is free for personal, non-commercial use; commercial use needs Pro. See [vercel.com/pricing](https://vercel.com/pricing). One serverless invocation per extracted image. |
| Model | Pay per token through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) at the chosen model's price (see the model list in the AI Gateway dashboard). One image + about 400 output tokens per document. Cost per receipt ≈ (image input tokens × input price) + (output tokens × output price). Smaller "flash/mini" vision models are typically fractions of a US cent per receipt; measure on your own documents. |

Set `RECEIPT_MODEL` to change the model.

### Privacy

- Uploaded images are processed in memory and never written to disk or storage by this app. The browser preview uses a local object URL.
- The model provider receives the image. Choose a provider and AI Gateway data-retention settings that fit your obligations.
- Use only synthetic data in public tests and issues. The fixtures in this repo are invented.
- The demo has no authentication. `/api/extract` has a built-in best-effort rate limit (`RATE_LIMIT_PER_HOUR` per visitor IP, default 10, and `RATE_LIMIT_PER_DAY` for the whole site, default 200). It is held in memory per server instance, so it is not a hard cap. Before sharing the link publicly, also:
  - add a **Vercel Firewall rate-limit rule** for `/api/extract` (Project → Firewall), which holds across instances, and
  - set an **AI Gateway budget** on the API key (AI Gateway → Budgets) as a hard spending cap.

### License

[MIT](LICENSE)

---

## ภาษาไทย

เครื่องมือ AI โอเพนซอร์สที่แปลงใบเสร็จและสลิปโอนเงินภาษาไทย (แบบพิมพ์) ให้เป็นข้อมูลที่มีโครงสร้างและแก้ไขได้ (JSON / CSV) สำหรับร้านค้าขนาดเล็ก ฟรีแลนซ์ และนักพัฒนาที่สร้างเครื่องมือบันทึกค่าใช้จ่าย

**ทำอะไรได้**

- อัปโหลดรูปหนึ่งรูป → ดึงชื่อร้าน/ผู้รับเงิน วันที่ เวลา ยอดก่อน VAT VAT ยอดรวม และรายการสินค้า
- รองรับเลขไทย (๑๒๓) วันที่ พ.ศ. (12/05/2568 → 2025-05-12) ชื่อเดือนไทย/อังกฤษ และข้อความผสมไทย–อังกฤษ
- ทำเครื่องหมายช่องที่ไม่แน่ใจ: โมเดลไม่มั่นใจ อ่านตัวเลขไม่ออก ยอดรายการรวมไม่ตรงยอดรวม VAT ไม่ใช่ 7% วันที่อยู่ในอนาคต ปีสองหลัก
- ตรวจแก้ได้ทุกช่อง แล้วจึงส่งออก JSON หรือ CSV โดยต้องติ๊ก "ตรวจเทียบกับรูปต้นฉบับแล้ว" และต้องไม่มีข้อผิดพลาดค้างอยู่

**ไม่ได้ทำอะไร**

- **ดึงข้อมูลเท่านั้น** ไม่ตรวจสอบว่าใบเสร็จหรือสลิปเป็นของจริง
- รองรับเอกสารที่พิมพ์เท่านั้น ไม่รองรับลายมือ และไม่เชื่อมระบบบัญชี
- ไม่ขอเลขบัญชี เลขบัตร เบอร์โทร หรือเลขบัตรประชาชนจากโมเดล

**หลักการทำงาน**

โมเดลมีหน้าที่ "คัดลอกข้อความตามที่พิมพ์" เท่านั้น (ผลลัพธ์ตรวจด้วย Zod ผ่าน Vercel AI SDK) จากนั้นโค้ด TypeScript แบบ deterministic จะแปลงเลข วันที่ และจำนวนเงิน (เก็บเป็นสตางค์จำนวนเต็ม) และตรวจความสอดคล้องของข้อมูล ดูที่ [`packages/extractor`](packages/extractor)

### วิธีติดตั้ง

ต้องมี Node 20+ และ pnpm

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # ใส่ AI_GATEWAY_API_KEY
pnpm dev                                       # http://localhost:3000
pnpm test                                      # รันเทสต์ของ extractor
```

ยังไม่มี key? กดตัวอย่างสังเคราะห์ในหน้าเว็บเพื่อลองหน้าตรวจทานโดยไม่ต้องเรียกโมเดล

### Deploy บน Vercel

ใช้ปุ่ม Deploy ด้านบน (repo ต้องเป็น public ปุ่มจึงจะใช้งานได้ และเปิด "Include source files outside of the Root Directory" ไว้ตามค่าเริ่มต้นของ Vercel)

### ค่าใช้จ่าย

ราคาเปลี่ยนได้ โปรดตรวจจากลิงก์ก่อนตัดสินใจ

- **โฮสติ้ง**: Vercel แผน Hobby ฟรีสำหรับใช้ส่วนตัวที่ไม่ใช่เชิงพาณิชย์ ใช้เชิงพาณิชย์ต้องใช้ Pro ดู [vercel.com/pricing](https://vercel.com/pricing) แต่ละรูปที่ประมวลผลคือหนึ่ง serverless invocation
- **โมเดล**: จ่ายตามจำนวน token ผ่าน [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) ตามราคาของโมเดลที่เลือก ต่อเอกสารมีรูป 1 รูปและ output ประมาณ 400 token ค่าใช้จ่ายต่อใบ ≈ (token ของรูป × ราคา input) + (token output × ราคา output) โมเดลวิชันขนาดเล็กมักตกใบละเศษเสี้ยวของเซนต์ แต่ควรวัดจากเอกสารจริงของคุณ

เปลี่ยนโมเดลได้ด้วย `RECEIPT_MODEL`

### ความเป็นส่วนตัว

- รูปที่อัปโหลดถูกประมวลผลในหน่วยความจำ ไม่ถูกเขียนลงดิสก์หรือที่เก็บข้อมูลโดยแอปนี้
- ผู้ให้บริการโมเดลจะได้รับรูป โปรดเลือกผู้ให้บริการและการตั้งค่าการเก็บข้อมูลของ AI Gateway ให้เหมาะกับข้อผูกพันของคุณ
- ข้อมูลทดสอบสาธารณะและ issue ต้องเป็นข้อมูลสังเคราะห์เท่านั้น (fixtures ใน repo นี้ถูกแต่งขึ้นทั้งหมด)
- เดโมไม่มีระบบยืนยันตัวตน แต่ `/api/extract` มี rate limit ในตัวแบบ best-effort (`RATE_LIMIT_PER_HOUR` ต่อ IP ค่าเริ่มต้น 10 และ `RATE_LIMIT_PER_DAY` ทั้งเว็บ ค่าเริ่มต้น 200) เก็บในหน่วยความจำของแต่ละ server instance จึงไม่ใช่เพดานตายตัว ก่อนแชร์ลิงก์สาธารณะควรทำเพิ่มด้วย:
  - เพิ่มกฎ **Vercel Firewall rate limit** สำหรับ `/api/extract` (Project → Firewall) ซึ่งทำงานข้าม instance และ
  - ตั้ง **AI Gateway budget** ที่ API key (AI Gateway → Budgets) เป็นเพดานค่าใช้จ่ายจริง

### สัญญาอนุญาต

[MIT](LICENSE)
