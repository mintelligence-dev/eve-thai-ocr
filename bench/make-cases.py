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

# 6. One long receipt photographed as two overlapping images. Three identical
# "Mineral water" lines sit inside the overlap: a merge must keep all three (they are
# really on the receipt) and still not repeat any line that appears in both photos.
def long_receipt(shop, date, number, items, total_note=True):
    f = font(22); fb = font(26)
    lines = [(shop, fb), ("TAX ID 1234567890121", f), (f"Date {date}  10:21", f), (f"Receipt No: {number}", f), ("-" * 40, f)]
    lines += [(f"{d:<30}{a:>9.2f}", f) for d, a in items]
    total = sum(a for _, a in items)
    vat = round(total * 7 / 107, 2)
    lines += [("-" * 40, f), (f"{'TOTAL':<30}{total:>9.2f}", fb), (f"{'VAT 7% included':<30}{vat:>9.2f}", f), ("Thank you", f)]
    img = Image.new("RGB", (620, 60 + 34 * len(lines)), "white"); d = ImageDraw.Draw(img); y = 30
    for text, fnt in lines:
        d.text((30, y), text, fill="black", font=fnt); y += 34
    return img, total, vat

items = [("Fresh milk 1L", 38.0), ("Bread roll", 12.0), ("Eggs (10)", 59.0), ("Rice 5kg", 158.0), ("Soy sauce", 31.0),
         ("Instant noodles", 6.0), ("Cooking oil 1L", 72.0), ("Sugar 1kg", 24.0), ("Salt", 9.0), ("Tea bags", 45.0),
         ("Coffee 3in1", 89.0), ("Bread roll", 12.0), ("Mineral water 600ml", 7.0), ("Mineral water 600ml", 7.0),
         ("Mineral water 600ml", 7.0), ("Chips", 20.0), ("Chocolate bar", 25.0), ("Tissue pack", 49.0),
         ("Dish soap", 35.0), ("Shampoo", 119.0), ("Toothpaste", 54.0), ("Bananas", 28.0), ("Apples (4)", 66.0)]
long_img, total, vat = long_receipt("SAMPLE MART (Branch 2)", "03/11/2026", "000451", items)
H = long_img.height
cut1, cut2 = int(H * 0.60), int(H * 0.42)          # photo 1: top 60%; photo 2: from 42% down (an 18% overlap)
long_img.crop((0, 0, 620, cut1)).save(os.path.join(OUT, "long-receipt.1.png"))
long_img.crop((0, cut2, 620, H)).save(os.path.join(OUT, "long-receipt.2.png"))
expected("long-receipt.expected.json", {
    "merchant": "SAMPLE MART", "date": "2026-11-03", "taxId": "1234567890121", "reference": "000451",
    "total": total, "vat": vat,
    "lineItems": [{"description": d, "amount": a} for d, a in items],
})

# 7. Two DIFFERENT receipts. These must be refused, not merged.
other_items = [("Pad kra pao", 60.0), ("Iced tea", 25.0), ("Fried egg", 10.0)]
a_img, _, _ = long_receipt("RICE HOUSE", "12/05/2026", "000017", other_items)
b_img, _, _ = long_receipt("NOODLE CORNER", "12/05/2026", "000902", [("Boat noodles", 50.0), ("Water", 10.0)])
a_img.save(os.path.join(OUT, "different-shops.1.png")); b_img.save(os.path.join(OUT, "different-shops.2.png"))
expected("different-shops.expected.json", {"different": True})
# same shop, another day and another total
c_img, _, _ = long_receipt("RICE HOUSE", "19/05/2026", "000041", [("Pad kra pao", 60.0), ("Pad kra pao", 60.0), ("Cola", 20.0)])
a_img.save(os.path.join(OUT, "different-days.1.png")); c_img.save(os.path.join(OUT, "different-days.2.png"))
expected("different-days.expected.json", {"different": True})
print("wrote", sorted(os.listdir(OUT)))
