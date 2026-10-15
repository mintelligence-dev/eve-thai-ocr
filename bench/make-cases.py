#!/usr/bin/env python3
"""Generate the synthetic test documents in bench/cases/ (needs Pillow and a Thai font; macOS paths).

Everything here is invented: no real shops, people or amounts.
    python3 bench/make-cases.py
"""
import json, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cases")
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
os.makedirs(OUT, exist_ok=True)
W, H = 800, 1200

def font(size): return ImageFont.truetype(FONT, size)

def save(img, name): img.convert("RGB").save(os.path.join(OUT, name))
def expected(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# 1. Blank page.
save(Image.new("RGB", (W, H), "white"), "not-receipt-blank.png")
expected("not-receipt-blank.expected.json", {"empty": True})

# 2. Grey noise (looks like a failed scan).
rnd = random.Random(7)
noise = Image.new("L", (W // 4, H // 4))
noise.putdata([int(rnd.gauss(200, 25)) % 256 for _ in range(W // 4 * H // 4)])
save(noise.resize((W, H), Image.NEAREST), "not-receipt-noise.png")
expected("not-receipt-noise.expected.json", {"empty": True})

# 3. A page of notes that mentions money but is not a receipt.
img = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(img)
y = 60
for size, line in [(34, "Meeting notes / บันทึกการประชุม"), (24, ""), (24, "1. Marketing budget for Q3: 12,000 baht"),
                   (24, "2. ค่าเดินทางทีมขาย ประมาณ 3,500 บาท"), (24, "3. Hire two part-time staff (start 1 Nov)"),
                   (24, "4. นัดประชุมครั้งต่อไป วันที่ 20 ตุลาคม"), (24, ""), (24, "Action: ask finance to confirm the total.")]:
    d.text((60, y), line, fill="black", font=font(size)); y += size + 26
save(img, "not-receipt-notes.png")
expected("not-receipt-notes.expected.json", {"empty": True})

# 4. A clean synthetic Thai receipt: Thai digits, Buddhist Era date, VAT-inclusive.
lines = [
    (30, "ร้านข้าวมันไก่ตัวอย่าง", "c"), (22, "(Sample Chicken Rice)", "c"), (20, "", "l"),
    (22, "วันที่ ๑๒/๐๕/๒๕๖๘   เวลา ๑๒.๓๐ น.", "l"), (22, "เลขที่ใบเสร็จ ๐๐๑๒๓", "l"), (20, "-" * 38, "l"),
    (22, "ข้าวมันไก่ต้ม       ๒ x ๖๐.๐๐       ๑๒๐.๐๐", "l"),
    (22, "ต้มจืดเต้าหู้        ๑ x ๔๕.๐๐        ๔๕.๐๐", "l"),
    (22, "น้ำเปล่า           ๒ x ๑๐.๐๐        ๒๐.๐๐", "l"), (20, "-" * 38, "l"),
    (22, "รวมก่อน VAT                    ๑๗๒.๙๐", "l"), (22, "VAT ๗%                          ๑๒.๑๐", "l"),
    (26, "ยอดรวมสุทธิ                   ๑๘๕.๐๐", "l"), (20, "", "l"), (22, "ขอบคุณที่ใช้บริการ", "c"),
]
def receipt():
    img = Image.new("RGB", (620, 760), "white"); d = ImageDraw.Draw(img); y = 40
    for size, text, align in lines:
        f = font(size); w = d.textlength(text, font=f)
        d.text(((620 - w) / 2 if align == "c" else 40, y), text, fill="black", font=f); y += size + 22
    return img
truth = {"merchant": "ข้าวมันไก่ตัวอย่าง", "date": "2025-05-12", "subtotal": [172.9], "vat": 12.1, "total": 185,
         "lineItems": [{"description": "ข้าวมันไก่ต้ม", "amount": 120}, {"description": "ต้มจืดเต้าหู้", "amount": 45},
                       {"description": "น้ำเปล่า", "amount": 20}]}
save(receipt(), "receipt-thai-clean.png"); expected("receipt-thai-clean.expected.json", truth)

# 5. The same receipt, blurred and tilted like a bad phone photo.
bad = receipt().rotate(4, expand=True, fillcolor="white").filter(ImageFilter.GaussianBlur(5))
save(bad, "receipt-thai-blurred.png"); expected("receipt-thai-blurred.expected.json", truth)
print("wrote", sorted(os.listdir(OUT)))
