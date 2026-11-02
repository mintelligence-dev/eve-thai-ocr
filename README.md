# Thai Receipt Reader

[ไทย](#ภาษาไทย) · [English](#english)

---

## English

Open-source AI tool that turns **printed** Thai receipts and bank transfer slips into editable, structured data (JSON / CSV). For small shops, freelancers and developers building expense tools. A person always reviews the result before anything is exported.

### What it does

- Upload a photo, or take one on your phone. Photos are resized on your device first (see [Privacy](#privacy-and-data)).
- **A very long receipt can be photographed in up to 4 photos**, in order from top to bottom, overlapping by a few lines. They are read as one receipt, and the app **checks that they really are the same one**: photos that look like different receipts are refused with a message instead of being merged.
- **Receipts and tax invoices:** shop name, shop tax ID, receipt number, date and time, subtotal, VAT, total and line items.
- **Transfer slips:** payee, payer, amount, fee, reference number, date and time.
- Reads Thai numerals (๑๒๓), Buddhist Era dates (`12/05/2568` → `2025-05-12`), Thai and English month names, two-digit years, `฿` / `บาท` / `BHT` / `THB`, and mixed Thai–English text.
- Understands common receipt layouts: prices followed by a tax-class letter (`48.75 N`), prices with a unit suffix (`41.00 / ชิ้น`), add-on lines whose price is already included in the line above, and discounts shown as negative lines.
- **Flags what a person should check** (yellow = please confirm, red = must fix before export). See [What it checks](#what-it-checks).
- Review and edit every field. The files you will get (JSON and CSV) are previewed live under the form. Export stays locked until you tick "I have checked this against the original" and no red errors remain.
- Thai and English interface, light and dark theme.

### What it does not do

- **Extraction only.** It does not verify that a receipt or a payment slip is genuine.
- **Printed documents only. Handwriting is refused**, not read badly: handwritten numbers came back differently on every run in our tests (the same amount as 200,000, 2,000,000 and 2,009,000), with nothing on screen to warn you.
- Up to 4 photos of **one** document. Different receipts are never merged (see "How reliable is it?" for how well that is checked). There is no batch mode for many receipts yet.
- No accounting-system integrations and no automatic sending anywhere.
- It does not store your images (see [Privacy](#privacy-and-data)), and it has no accounts or history.

### How reliable is it?

Honestly: good, not perfect, and it varies between runs of the same photo. On our small private test set (three shop receipts and four bank slips from different banks) the default model read the shop, date, total and VAT correctly in most runs. The mistakes we saw most:

- **Thai numerals in small print** (for example `๑๘๕.๐๐` read as `145`).
- Lines with several prices, long receipts, faded thermal paper, tilted or blurry photos.
- Values that are partly covered or cut off.

**Several photos of one receipt.** The model reads them together and also reports what each photo shows on its own (shop, tax ID, date, total); the code compares those, so photos of different receipts are refused even if the model thought they matched. On our small test set, 12 of 12 pairs of different receipts were refused (real and synthetic, including the same shop on another day), and a long synthetic receipt with three identical lines inside the overlap merged correctly 3 of 3 times. Real photos cut into two parts merged with the same quirks as single photos (for example a heading line counted as an item). What it cannot do: two photos that show none of the shop, tax ID, date or total (for example two middle sections) can only be caught by the model's own judgement and the totals check, so always read the merged result.

That is why the app cross-checks the numbers and asks you to confirm anything doubtful. **Always compare against the original.** Before changing the model, run [`pnpm bench`](bench/README.md) on your own documents: models differ a lot (one made up a whole receipt from a blank image).

### What it checks

| Flag | Meaning |
|---|---|
| Items don't add up | Line items must add up to the total, subtotal, or total minus VAT (live bar under the items). |
| VAT | Checked against 7%. Receipts that mix VAT and VAT-exempt items are accepted when 1–3 items add up to the exempt part. |
| Tax ID | 13 digits with the Thai check digit. A misread digit almost always breaks it. |
| Dates | Not in the future, not over 10 years old; a two-digit year is shown with how it was read. |
| Amounts | An amount with more than two decimals (`5.555`) is never guessed. A negative amount needs a name that says discount or promotion (`discount`, `promotion`, `ส่วนลด`, `ลดราคา`, `โปรโมชั่น`, `โปรโมชัน`); other names, such as `BOGO`, are flagged. |
| Model unsure | Fields the model said it could not read confidently, or values that were hidden or cut off. |
| Not a receipt | Blank, unreadable or unrelated images must be confirmed before anything is exported. |
| Several photos | Photos that look like different receipts are refused. A merged result always carries a yellow "check the lines where the photos meet" flag, and the items-vs-total bar still applies. |
| Assumed values | A line with only a price is shown as quantity 1 × price (faded italic, marked `assumed` in the JSON). Not done for discounts or unclear layouts. |

### How it works

The model only **transcribes** text exactly as printed (output validated with Zod through the Vercel AI SDK). Deterministic TypeScript then parses digits, dates and amounts (integer satang, so no floating-point error) and runs all the checks above. Prices never come from the model's arithmetic. See [`packages/extractor`](packages/extractor).

```
apps/web                 Next.js demo: upload → review → preview → export
packages/extractor       Reusable TypeScript package: extract, normalise, validate, export, score
bench/                   Compare vision models on your own documents
```

### Export formats

JSON is the full structure, including `flags` and `assumed`. CSV has one row per line item, with the document fields repeated, a UTF-8 BOM so Excel opens Thai text correctly, and spreadsheet-formula characters neutralised:

`document_type, merchant, date, time, currency, subtotal, vat, total, payer, reference, fee, tax_id, item_description, item_quantity, item_unit_price, item_amount`

For a transfer slip, `merchant` is the payee and `reference` is the transaction reference; for a receipt, `reference` is the receipt number.

### Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # add AI_GATEWAY_API_KEY
pnpm dev                                       # http://localhost:3000
pnpm test                                      # all tests
```

No key yet? On the page, press one of the synthetic samples (or open `/?sample=transfer-slip`, `/?sample=thai-receipt`, `/?sample=needs-review`, `/?sample=addon-discount`) to try the review screen without calling a model.

| Variable | Default | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` | – | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key. Not needed on Vercel if you use OIDC. |
| `RECEIPT_MODEL` | `google/gemini-2.5-flash` | Any vision model on AI Gateway (`provider/model`). The review screen shows which model read each document. |
| `RATE_LIMIT_PER_HOUR` | `10` | Requests per visitor IP per hour (best effort, see below). |
| `RATE_LIMIT_PER_DAY` | `200` | Requests for the whole site per day. |

With the default model, thinking is capped (1,024 tokens). Reading a receipt is mostly transcription, so unlimited thinking only added time and cost: a 17-item receipt took ~40 s and ~2¢ uncapped, and ~9–13 s and ~0.5¢ capped, with no loss of accuracy. Turning thinking off completely halves the cost again but cost about 11 points of accuracy on our test set (98% → 87%), so it is not recommended (`pnpm bench -- --thinking 0` lets you test it).

The page shows what the model has read as it goes (the API's `?stream=1` mode sends one JSON object per line). The model thinks for several seconds before it writes anything, so the first fields appear late (about 10 s of 13 s on a long receipt) and the total time is unchanged. A handwritten document is refused as soon as the model says so, without waiting for the rest.

### Use the package

```ts
import { extractReceipt, DifferentDocumentsError, HandwritingNotSupportedError, toCSV } from "@thai-receipt-reader/extractor";

try {
  const { receipt, usage } = await extractReceipt({
    image: bytes,                     // Uint8Array of a JPEG, PNG or WebP
    mediaType: "image/jpeg",
    model: "google/gemini-2.5-flash", // any vision model on AI Gateway
    // A long receipt in several photos, top to bottom (up to 4), instead of `image`:
    // images: [{ image: top, mediaType: "image/jpeg" }, { image: bottom, mediaType: "image/jpeg" }],
  });
  receipt.flags;                      // what a person should check
  toCSV(receipt);
} catch (e) {
  if (e instanceof HandwritingNotSupportedError) { /* ask for a printed document */ }
  if (e instanceof DifferentDocumentsError) { /* the photos are not one receipt: e.conflicts says what differs */ }
}
```

Browser-safe helpers (no model code), such as `normalizeExtraction`, `revalidate`, `itemsReconcile`, `toJSON` and `toCSV`, are at `@thai-receipt-reader/extractor/core`.

### Compare models on your own documents

```bash
pnpm bench -- --dry-run     # plan and rough cost, no calls
pnpm bench                  # needs AI_GATEWAY_API_KEY in apps/web/.env.local
```

It scores each model against ground truth you write (shop, totals, items, tax ID, "must not invent anything on a blank page", …) and prints accuracy, speed and cost. Synthetic cases live in `bench/cases/`. Keep real documents in `bench/private/` (git-ignored). Details: [`bench/README.md`](bench/README.md).

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPattarapongS%2Fthai-receipt-reader&root-directory=apps%2Fweb&env=AI_GATEWAY_API_KEY&envDescription=Vercel%20AI%20Gateway%20key&envLink=https%3A%2F%2Fvercel.com%2Fdocs%2Fai-gateway)

Keep "Include source files outside of the Root Directory" enabled (Vercel's default) so the workspace package is available. The repository must be public for the button to work.

### Costs

Prices change; check the linked pages before relying on these.

| Item | What to expect |
|---|---|
| Model | About **0.3–0.6 US cents (roughly 0.1–0.2 baht) per document** with the default model in our tests (a long supermarket receipt is at the high end). Billed per token through [AI Gateway](https://vercel.com/docs/ai-gateway/pricing), at the provider's list price. |
| Free credit | Per Vercel's docs, AI Gateway gives a small monthly credit (US$5 every 30 days, counted from the first request) and a card must be on file to unlock it. In our testing the default model ran on it. Buying credits ends the free monthly credit. The free tier has lower rate limits, so many simultaneous requests can get a "service is busy" message. |
| Hosting | Next.js on Vercel. The Hobby plan is for personal, non-commercial use; commercial use needs Pro. See [vercel.com/pricing](https://vercel.com/pricing). |

### Protect your demo

The demo has no login, so anyone with the link can use your API budget.

- Built-in limits (`RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_DAY`) are held in memory per server instance: a guard against loops and casual abuse, **not a hard cap**.
- Add a **Vercel Firewall rate-limit rule** for `/api/extract` (Project → Firewall); it holds across instances.
- Set an **AI Gateway budget** on the API key (AI Gateway → Budgets) as the hard spending cap, and leave auto top-up off.

### Privacy and data

Receipts and slips contain personal and financial data. Please read this before you run it for other people.

- **Your images are not stored by this app.** They are handled in memory for one request. The only things logged are error details (type, status and a short, truncated message), never the document. No accounts, no database.
- **Photos are cleaned on the device first.** The browser fixes the rotation, shrinks the photo and re-encodes it as JPEG, which also removes EXIF metadata such as the GPS location. The server then checks the file type from the file's first bytes.
- **The model provider receives the image** (through Vercel AI Gateway). At the time of writing, the AI Gateway catalog marks the models used here as **not used for training**. For **zero data retention (ZDR)**, meaning the provider keeps nothing after answering, it lists `gpt-4.1-mini` and `mistral-small` as all providers and Gemini as only some. Enforcing ZDR for every request is an AI Gateway setting that, per Vercel's pricing page, is for Pro and Enterprise plans. Check the current [AI Gateway data-handling docs](https://vercel.com/docs/ai-gateway) and your provider's terms; they can change.
- **Tax IDs:** the shop's 13-digit tax ID is read from receipts. For a sole proprietor this is their personal ID number. The app does not keep it, but it appears in the exported files. The model is told not to output customers' personal ID numbers, card numbers, phone numbers or bank account numbers.
- Text printed on a document can try to instruct the model (prompt injection). Results always pass schema validation and a human review, and CSV cells that start with `=`, `+`, `-` or `@` are neutralised, but treat exports as untrusted input.
- If you run this for other people, tell them what happens to their image and get consent where the law requires it (for example under Thailand's PDPA). This README is not legal advice.
- Use only synthetic data in public tests, issues and screenshots. Everything in `bench/cases/` is invented.

### License

[MIT](LICENSE)

---

## ภาษาไทย

เครื่องมือ AI โอเพนซอร์สที่แปลงใบเสร็จและสลิปโอนเงินภาษาไทย **แบบพิมพ์** ให้เป็นข้อมูลที่มีโครงสร้างและแก้ไขได้ (JSON / CSV) สำหรับร้านค้าขนาดเล็ก ฟรีแลนซ์ และนักพัฒนาที่สร้างเครื่องมือบันทึกค่าใช้จ่าย ทุกครั้งจะมีคนตรวจผลก่อนส่งออก

### ทำอะไรได้

- อัปโหลดรูป หรือถ่ายรูปจากมือถือ ระบบย่อรูปบนเครื่องคุณก่อน (ดู [ความเป็นส่วนตัว](#ความเป็นส่วนตัวและข้อมูล))
- **ใบเสร็จที่ยาวมากถ่ายแยกได้สูงสุด 4 รูป** เรียงจากบนลงล่างและให้รูปซ้อนกันสองสามบรรทัด ระบบอ่านรวมเป็นใบเดียว และ **เช็กให้ว่าเป็นใบเดียวกันจริงไหม** ถ้ารูปดูเหมือนคนละใบ จะปฏิเสธพร้อมข้อความ ไม่รวมให้
- **ใบเสร็จและใบกำกับภาษี:** ชื่อร้าน เลขประจำตัวผู้เสียภาษีของร้าน เลขที่ใบเสร็จ วันที่ เวลา ยอดก่อน VAT VAT ยอดรวม และรายการสินค้า
- **สลิปโอนเงิน:** ผู้รับเงิน ผู้โอน จำนวนเงิน ค่าธรรมเนียม เลขอ้างอิง วันที่ เวลา
- อ่านเลขไทย (๑๒๓) วันที่ พ.ศ. (`12/05/2568` → `2025-05-12`) ชื่อเดือนไทย/อังกฤษ ปีสองหลัก `฿` / `บาท` / `BHT` / `THB` และข้อความผสมไทย–อังกฤษ
- เข้าใจรูปแบบใบเสร็จที่พบบ่อย: ราคามีรหัสภาษีต่อท้าย (`48.75 N`) ราคาต่อหน่วยมีหน่วยต่อท้าย (`41.00 / ชิ้น`) ของเพิ่มที่ราคารวมอยู่ในบรรทัดบนแล้ว และส่วนลดที่เป็นบรรทัดติดลบ
- **ติดธงจุดที่ควรตรวจ** (เหลือง = ช่วยยืนยัน, แดง = ต้องแก้ก่อนส่งออก) ดู [สิ่งที่ระบบตรวจ](#สิ่งที่ระบบตรวจ)
- ตรวจแก้ได้ทุกช่อง และมีตัวอย่างไฟล์ JSON และ CSV ที่จะได้ใต้ฟอร์มแบบสด ส่งออกไม่ได้จนกว่าจะติ๊ก "ฉันตรวจเทียบกับรูปต้นฉบับแล้ว" และไม่เหลือข้อผิดพลาดสีแดง
- หน้าเว็บสองภาษา (ไทย/อังกฤษ) ธีมสว่างและมืด

### ไม่ทำอะไร

- **ดึงข้อมูลเท่านั้น** ไม่ตรวจว่าใบเสร็จหรือสลิปเป็นของจริง
- **รองรับเฉพาะเอกสารที่พิมพ์ ลายมือจะถูกปฏิเสธ** ไม่ใช่อ่านแบบไม่แม่น เพราะตัวเลขลายมืออ่านได้ไม่ตรงกันทุกรอบ (ยอดเดียวกันได้ทั้ง 200,000 / 2,000,000 / 2,009,000 ในการทดสอบ) โดยไม่มีอะไรบนจอเตือนคุณ
- สูงสุด 4 รูปต่อ **หนึ่ง** เอกสาร ใบเสร็จคนละใบไม่ถูกรวมกัน (ดูหัวข้อ "เชื่อถือได้แค่ไหน" ว่าเช็กได้ดีแค่ไหน) ยังไม่มีโหมดอัปโหลดหลายใบพร้อมกัน
- ไม่เชื่อมระบบบัญชี ไม่ส่งข้อมูลไปที่ไหนอัตโนมัติ
- ไม่เก็บรูปของคุณ (ดู [ความเป็นส่วนตัว](#ความเป็นส่วนตัวและข้อมูล)) ไม่มีบัญชีผู้ใช้และไม่มีประวัติย้อนหลัง

### เชื่อถือได้แค่ไหน

พูดตรงๆ: ดี แต่ไม่สมบูรณ์ และผลของรูปเดียวกันอาจต่างกันในแต่ละรอบ ในชุดทดสอบเล็กๆ ของเรา (ใบเสร็จร้านค้า 3 ใบ สลิป 4 ธนาคาร) โมเดลเริ่มต้นอ่านร้าน วันที่ ยอดรวม และ VAT ถูกในส่วนใหญ่ของรอบที่ลอง จุดที่พลาดบ่อยที่สุด:

- **เลขไทยตัวเล็ก** (เช่น `๑๘๕.๐๐` อ่านเป็น `145`)
- บรรทัดที่มีหลายราคา ใบยาวมาก กระดาษความร้อนซีด รูปเอียงหรือเบลอ
- ค่าที่ถูกปิดหรือถูกตัดขอบ

**หลายรูปของใบเดียว** โมเดลอ่านรวมกัน และรายงานด้วยว่าแต่ละรูปแสดงอะไรโดยลำพัง (ร้าน เลขผู้เสียภาษี วันที่ ยอดรวม) แล้วโค้ดเทียบกัน รูปคนละใบจึงถูกปฏิเสธแม้โมเดลเห็นว่าตรงกัน ในชุดทดสอบเล็กๆ ของเรา คู่รูปคนละใบถูกปฏิเสธ 12 จาก 12 ครั้ง (ทั้งใบจริงและสังเคราะห์ รวมร้านเดียวกันคนละวัน) และใบยาวสังเคราะห์ที่มีบรรทัดเหมือนกัน 3 บรรทัดในรอยซ้อนถูกรวมถูกต้อง 3 จาก 3 ครั้ง ส่วนใบจริงที่ตัดเป็นสองท่อน รวมแล้วมีข้อสังเกตเดียวกับรูปเดียว (เช่น บรรทัดหัวข้อถูกนับเป็นรายการ) สิ่งที่ทำไม่ได้: สองรูปที่ไม่เห็นร้าน เลขผู้เสียภาษี วันที่ หรือยอดรวมเลย (เช่นท่อนกลางสองท่อน) จับได้แค่จากการตัดสินของโมเดลและการเช็กยอดรวม จึงควรอ่านผลที่รวมแล้วทุกครั้ง

เพราะแบบนี้แอปจึงเทียบตัวเลขข้ามกันและให้คุณยืนยันจุดที่น่าสงสัย **เทียบกับต้นฉบับทุกครั้ง** ก่อนเปลี่ยนโมเดล ให้รัน [`pnpm bench`](bench/README.md) กับเอกสารของคุณเอง เพราะโมเดลต่างกันมาก (มีตัวที่แต่งใบเสร็จขึ้นมาทั้งใบจากรูปขาวเปล่า)

### สิ่งที่ระบบตรวจ

| ธง | ความหมาย |
|---|---|
| รายการรวมไม่ตรงยอด | ผลรวมรายการต้องเท่ายอดรวม ยอดก่อน VAT หรือยอดรวมหัก VAT (แถบเช็กสดใต้รายการ) |
| VAT | เทียบกับ 7% ใบเสร็จที่มีทั้งสินค้ามี VAT และไม่มี VAT ยอมรับได้ ถ้ามีสินค้า 1–3 ชิ้นรวมกันได้ส่วนที่ไม่มี VAT พอดี |
| เลขผู้เสียภาษี | 13 หลักและหลักตรวจของไทย เลขที่อ่านผิดเกือบทุกครั้งจะไม่ผ่าน |
| วันที่ | ไม่อยู่ในอนาคต ไม่เก่ากว่า 10 ปี ปีสองหลักจะบอกว่าอ่านเป็นปีอะไร |
| จำนวนเงิน | จำนวนเงินที่มีทศนิยมเกิน 2 ตำแหน่ง (`5.555`) ไม่เดาให้ ยอดติดลบต้องมีชื่อที่บอกว่าเป็นส่วนลดหรือโปรโมชัน (`discount`, `promotion`, `ส่วนลด`, `ลดราคา`, `โปรโมชั่น`, `โปรโมชัน`) ชื่ออื่นอย่าง `BOGO` ติดธง |
| โมเดลไม่มั่นใจ | ช่องที่โมเดลบอกว่าอ่านไม่ชัด หรือค่าที่ถูกปิด/ตัดขอบ |
| ไม่ใช่ใบเสร็จ | รูปว่าง อ่านไม่ออก หรือไม่เกี่ยวข้อง ต้องยืนยันก่อนส่งออก |
| หลายรูป | รูปที่ดูเหมือนคนละใบถูกปฏิเสธ ผลที่รวมแล้วมีธงเหลือง "ตรวจบรรทัดตรงรอยต่อของรูป" เสมอ และแถบเช็กยอดรวมยังทำงานอยู่ |
| ค่าที่สมมติ | บรรทัดที่มีแต่ราคา แสดงเป็นจำนวน 1 × ราคา (ตัวเอียงจาง และมี `assumed` ใน JSON) ไม่ทำกับส่วนลดหรือเลย์เอาต์ที่ไม่ชัด |

### หลักการทำงาน

โมเดลมีหน้าที่ **คัดลอกข้อความตามที่พิมพ์** เท่านั้น (ผลลัพธ์ตรวจด้วย Zod ผ่าน Vercel AI SDK) จากนั้นโค้ด TypeScript แบบ deterministic จะแปลงเลข วันที่ และจำนวนเงิน (เก็บเป็นสตางค์จำนวนเต็ม ไม่มีค่าเพี้ยนจากทศนิยม) และรันการตรวจทั้งหมดข้างบน ราคาไม่เคยมาจากการคำนวณของโมเดล ดู [`packages/extractor`](packages/extractor)

```
apps/web                 เว็บเดโม Next.js: อัปโหลด → ตรวจทาน → ดูตัวอย่าง → ส่งออก
packages/extractor       แพ็กเกจ TypeScript ใช้ซ้ำได้: ดึงข้อมูล แปลง ตรวจสอบ ส่งออก ให้คะแนน
bench/                   เทียบโมเดลวิชันด้วยเอกสารของคุณเอง
```

### รูปแบบไฟล์ที่ส่งออก

JSON คือโครงสร้างเต็ม รวม `flags` และ `assumed` ส่วน CSV มีหนึ่งแถวต่อหนึ่งรายการสินค้า โดยซ้ำช่องระดับเอกสารทุกแถว ใส่ตัวกำกับ UTF-8 เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง และกันอักขระที่ Excel จะนำไปรันเป็นสูตร:

`document_type, merchant, date, time, currency, subtotal, vat, total, payer, reference, fee, tax_id, item_description, item_quantity, item_unit_price, item_amount`

ในสลิปโอนเงิน `merchant` คือผู้รับเงิน และ `reference` คือเลขอ้างอิงรายการ ในใบเสร็จ `reference` คือเลขที่ใบเสร็จ

### วิธีติดตั้ง

ต้องมี Node 20+ และ pnpm

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # ใส่ AI_GATEWAY_API_KEY
pnpm dev                                       # http://localhost:3000
pnpm test                                      # รันเทสต์ทั้งหมด
```

ยังไม่มี key? กดตัวอย่างสังเคราะห์ในหน้าเว็บ (หรือเปิด `/?sample=transfer-slip`, `/?sample=thai-receipt`, `/?sample=needs-review`, `/?sample=addon-discount`) เพื่อลองหน้าตรวจทานโดยไม่ต้องเรียกโมเดล

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `AI_GATEWAY_API_KEY` | – | key ของ [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) ไม่ต้องใช้บน Vercel ถ้าใช้ OIDC |
| `RECEIPT_MODEL` | `google/gemini-2.5-flash` | โมเดลวิชันใดๆ บน AI Gateway (`provider/model`) หน้าตรวจทานแสดงว่าเอกสารนั้นอ่านด้วยโมเดลไหน |
| `RATE_LIMIT_PER_HOUR` | `10` | จำนวนคำขอต่อ IP ผู้เยี่ยมชมต่อชั่วโมง (best effort ดูด้านล่าง) |
| `RATE_LIMIT_PER_DAY` | `200` | จำนวนคำขอทั้งเว็บต่อวัน |

โมเดลเริ่มต้นถูกจำกัดการ "คิด" ไว้ที่ 1,024 token เพราะการอ่านใบเสร็จส่วนใหญ่คือการคัดลอก การคิดไม่จำกัดแค่เพิ่มเวลาและค่าใช้จ่าย: ใบ 17 รายการใช้ ~40 วินาที ~2 เซนต์ เมื่อไม่จำกัด และ ~9–13 วินาที ~0.5 เซนต์ เมื่อจำกัด โดยความแม่นยำไม่ลดลง การปิดการคิดทั้งหมดถูกลงอีกครึ่งหนึ่ง แต่ความแม่นยำในชุดทดสอบของเราตกประมาณ 11 จุด (98% → 87%) จึงไม่แนะนำ (ลองได้ด้วย `pnpm bench -- --thinking 0`)

หน้าเว็บแสดงสิ่งที่โมเดลอ่านได้ทีละส่วน (โหมด `?stream=1` ของ API ส่ง JSON หนึ่งอ็อบเจกต์ต่อหนึ่งบรรทัด) แต่โมเดลใช้เวลาคิดหลายวินาทีก่อนจะเริ่มเขียน ข้อมูลชุดแรกจึงโผล่ช้า (ราววินาทีที่ 10 จาก 13 ในใบยาว) และเวลารวมไม่เปลี่ยน เอกสารลายมือจะถูกปฏิเสธทันทีที่โมเดลบอก โดยไม่รอส่วนที่เหลือ

### ใช้แพ็กเกจ

```ts
import { extractReceipt, DifferentDocumentsError, HandwritingNotSupportedError, toCSV } from "@thai-receipt-reader/extractor";

try {
  const { receipt, usage } = await extractReceipt({
    image: bytes,                     // Uint8Array ของไฟล์ JPEG, PNG หรือ WebP
    mediaType: "image/jpeg",
    model: "google/gemini-2.5-flash", // โมเดลวิชันใดๆ บน AI Gateway
    // ใบยาวหลายรูป เรียงจากบนลงล่าง (สูงสุด 4) ใช้แทน `image`:
    // images: [{ image: top, mediaType: "image/jpeg" }, { image: bottom, mediaType: "image/jpeg" }],
  });
  receipt.flags;                      // จุดที่ควรให้คนตรวจ
  toCSV(receipt);
} catch (e) {
  if (e instanceof HandwritingNotSupportedError) { /* ขอเอกสารที่พิมพ์ออกมา */ }
  if (e instanceof DifferentDocumentsError) { /* รูปไม่ใช่ใบเดียวกัน: e.conflicts บอกว่าต่างกันตรงไหน */ }
}
```

ฟังก์ชันที่ใช้ในเบราว์เซอร์ได้ (ไม่มีโค้ดเรียกโมเดล) เช่น `normalizeExtraction`, `revalidate`, `itemsReconcile`, `toJSON`, `toCSV` อยู่ที่ `@thai-receipt-reader/extractor/core`

### เทียบโมเดลด้วยเอกสารของคุณเอง

```bash
pnpm bench -- --dry-run     # ดูแผนและค่าใช้จ่ายคร่าวๆ โดยไม่เรียกโมเดล
pnpm bench                  # ต้องมี AI_GATEWAY_API_KEY ใน apps/web/.env.local
```

ให้คะแนนแต่ละโมเดลกับเฉลยที่คุณเขียนเอง (ร้าน ยอด รายการ เลขผู้เสียภาษี "ห้ามแต่งข้อมูลจากหน้าเปล่า" ฯลฯ) แล้วแสดงความแม่นยำ ความเร็ว และค่าใช้จ่าย เคสสังเคราะห์อยู่ใน `bench/cases/` เอกสารจริงให้เก็บใน `bench/private/` (ไม่ขึ้น git) รายละเอียดที่ [`bench/README.md`](bench/README.md)

### Deploy บน Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPattarapongS%2Fthai-receipt-reader&root-directory=apps%2Fweb&env=AI_GATEWAY_API_KEY&envDescription=Vercel%20AI%20Gateway%20key&envLink=https%3A%2F%2Fvercel.com%2Fdocs%2Fai-gateway)

เปิด "Include source files outside of the Root Directory" ไว้ตามค่าเริ่มต้นของ Vercel เพื่อให้แพ็กเกจในเวิร์กสเปซถูกใช้ได้ และ repo ต้องเป็น public ปุ่มจึงจะใช้งานได้

### ค่าใช้จ่าย

ราคาเปลี่ยนได้ โปรดตรวจจากลิงก์ก่อนตัดสินใจ

| รายการ | ที่ควรคาด |
|---|---|
| โมเดล | ประมาณ **0.3–0.6 เซนต์สหรัฐ (ราว 0.1–0.2 บาท) ต่อเอกสาร** กับโมเดลเริ่มต้นในการทดสอบของเรา (ใบซูเปอร์ยาวๆ อยู่ปลายบน) คิดตามจำนวน token ผ่าน [AI Gateway](https://vercel.com/docs/ai-gateway/pricing) ตามราคาของผู้ให้บริการ |
| เครดิตฟรี | ตามเอกสารของ Vercel AI Gateway ให้เครดิตเล็กน้อยรายเดือน (US$5 ทุก 30 วัน นับจากคำขอแรก) และต้องผูกบัตรไว้จึงปลดล็อก ในการทดสอบของเรา โมเดลเริ่มต้นใช้เครดิตนี้ได้ การซื้อเครดิตจะทำให้เสียเครดิตฟรีรายเดือน บัญชีฟรีมีโควตาความถี่ต่ำกว่า คำขอพร้อมกันหลายอันอาจเจอข้อความ "ตอนนี้มีคนใช้เยอะ" |
| โฮสติ้ง | Next.js บน Vercel แผน Hobby ใช้ส่วนตัวที่ไม่ใช่เชิงพาณิชย์ ใช้เชิงพาณิชย์ต้องใช้ Pro ดู [vercel.com/pricing](https://vercel.com/pricing) |

### ปกป้องเดโมของคุณ

เดโมไม่มีระบบล็อกอิน ใครมีลิงก์ก็ใช้งบ API ของคุณได้

- ขีดจำกัดในตัว (`RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_DAY`) เก็บในหน่วยความจำของแต่ละ server instance เป็นแค่เครื่องกันลูปและการใช้พร่ำเพรื่อ **ไม่ใช่เพดานตายตัว**
- เพิ่มกฎ **Vercel Firewall rate limit** ที่ `/api/extract` (Project → Firewall) ซึ่งทำงานข้าม instance
- ตั้ง **AI Gateway budget** ที่ API key (AI Gateway → Budgets) เป็นเพดานค่าใช้จ่ายจริง และปิด auto top-up ไว้

### ความเป็นส่วนตัวและข้อมูล

ใบเสร็จและสลิปมีข้อมูลส่วนบุคคลและข้อมูลการเงิน โปรดอ่านก่อนเปิดให้คนอื่นใช้

- **แอปนี้ไม่เก็บรูปของคุณ** รูปถูกประมวลผลในหน่วยความจำภายในหนึ่งคำขอ สิ่งเดียวที่บันทึกคือรายละเอียดของ error (ชนิด รหัสสถานะ และข้อความสั้นๆ ที่ตัดแล้ว) ไม่มีเนื้อหาของเอกสาร ไม่มีบัญชีผู้ใช้และไม่มีฐานข้อมูล
- **รูปถูกจัดการบนเครื่องก่อน** เบราว์เซอร์แก้การหมุนรูป ย่อรูป และเข้ารหัสใหม่เป็น JPEG ซึ่งล้างข้อมูล EXIF เช่น พิกัด GPS ออกไปด้วย จากนั้นเซิร์ฟเวอร์ตรวจชนิดไฟล์จากไบต์แรกของไฟล์
- **ผู้ให้บริการโมเดลได้รับรูป** (ผ่าน Vercel AI Gateway) ณ เวลาที่เขียน แคตตาล็อกของ AI Gateway ระบุว่าโมเดลที่ใช้ที่นี่ **ไม่ถูกใช้เทรน** ส่วน **การไม่เก็บข้อมูลเลย (ZDR)** ซึ่งหมายถึงผู้ให้บริการไม่เก็บอะไรไว้หลังตอบ แคตตาล็อกระบุ `gpt-4.1-mini` และ `mistral-small` ว่าทุกผู้ให้บริการ และ Gemini ว่าเพียงบางส่วน การบังคับใช้ ZDR กับทุกคำขอเป็นการตั้งค่าของ AI Gateway ที่ตามหน้าราคาของ Vercel ใช้ได้กับแผน Pro และ Enterprise โปรดตรวจ [เอกสารการจัดการข้อมูลของ AI Gateway](https://vercel.com/docs/ai-gateway) และเงื่อนไขของผู้ให้บริการที่ใช้ เพราะเปลี่ยนได้
- **เลขผู้เสียภาษี:** ระบบอ่านเลขผู้เสียภาษี 13 หลักของ "ร้าน" จากใบเสร็จ ถ้าร้านเป็นบุคคลธรรมดา เลขนี้คือเลขบัตรประชาชนของเขา แอปไม่เก็บไว้ แต่เลขจะอยู่ในไฟล์ที่ส่งออก โมเดลถูกสั่งไม่ให้ดึงเลขบัตรประชาชนของลูกค้า เลขบัตร เบอร์โทร หรือเลขบัญชีธนาคาร
- ข้อความที่พิมพ์บนเอกสารอาจพยายามสั่งโมเดลได้ (prompt injection) ผลลัพธ์ต้องผ่านการตรวจรูปแบบและคนตรวจเสมอ และเซลล์ CSV ที่ขึ้นต้นด้วย `=`, `+`, `-` หรือ `@` ถูกทำให้ปลอดภัยแล้ว แต่ควรถือไฟล์ที่ส่งออกเป็นข้อมูลที่ยังไม่น่าเชื่อถือ
- ถ้าคุณเปิดให้คนอื่นใช้ ควรแจ้งว่ารูปของเขาถูกส่งไปที่ไหน และขอความยินยอมเมื่อกฎหมายกำหนด (เช่น PDPA ของไทย) README นี้ไม่ใช่คำแนะนำทางกฎหมาย
- ใช้ข้อมูลสังเคราะห์เท่านั้นในเทสต์ issue และภาพหน้าจอสาธารณะ ทุกอย่างใน `bench/cases/` ถูกแต่งขึ้น

### สัญญาอนุญาต

[MIT](LICENSE)
