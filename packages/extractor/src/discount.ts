/**
 * Does an item name say it is a discount, promotion or other credit? A
 * negative amount on such a line is expected, so it needs no warning.
 *
 * English words are matched whole ("off" must not match "Coffee"); Thai has no
 * spaces between words, so Thai terms are matched as substrings.
 */
const ENGLISH =
  /\b(discounts?|promo|promos|promotions?|coupons?|vouchers?|rebates?|refunds?|redeem(ed)?|savings?|save|free|off|deduct(ion)?|credit|cashback)\b/i;
const THAI = /ส่วนลด|ลดราคา|ลด|โปรโมชั่น|โปรโมชัน|โปรฯ|คูปอง|คืนเงิน|แต้ม|ฟรี|แถม|หักเงิน/;

export function isDiscountLabel(description: string): boolean {
  return ENGLISH.test(description) || THAI.test(description);
}
