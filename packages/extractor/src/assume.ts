import type { LineItem } from "./schema.js";

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Most receipts print only a price on a line, with no quantity: one line, one
 * item. Fill those in as quantity 1 and unit price = amount, and mark the
 * line `assumed` so the UI can show the values are not printed on the receipt.
 *
 * Careful cases are left alone:
 * - discounts and other negative amounts (not an item you bought);
 * - a line that already has a quantity;
 * - a unit price that differs from the amount (the quantity is unknown);
 * - the whole receipt, if any line has a unit price but no amount: that is a
 *   quantity/add-on line the model could not attach (e.g. "2 * 41.00 / ชิ้น"),
 *   so the structure is unclear and filling 1 x amount could be wrong.
 */
export function assumeSingleUnits(items: LineItem[]): LineItem[] {
  const unresolved = items.some((i) => i.amount === null && i.unitPrice !== null);
  if (unresolved) return items;

  return items.map((item) => {
    if (item.amount === null || item.amount <= 0 || item.quantity !== null) return item;
    if (item.unitPrice !== null && !same(item.unitPrice, item.amount)) return item;
    return { ...item, quantity: 1, unitPrice: item.amount, assumed: true };
  });
}
