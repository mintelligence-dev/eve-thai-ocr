/**
 * Does an item name plainly say it is a discount? A negative amount on such a
 * line is expected, so it needs no warning. This list is deliberately short and
 * literal: a negative amount under any other name (promo codes, "BOGO", "free",
 * store jargon) is not guessed at, it is flagged for a person to confirm.
 *
 * English is matched as whole words; Thai has no spaces between words, so Thai
 * terms are matched as substrings.
 */
const ENGLISH = /\bdiscounts?\b/i;
const THAI = /ส่วนลด|ลดราคา/;

export function isDiscountLabel(description: string): boolean {
  return ENGLISH.test(description) || THAI.test(description);
}
