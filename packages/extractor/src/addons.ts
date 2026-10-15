import type { LineItem } from "./schema.js";

export interface AddOnSplit {
  /** Index of the main line. */
  index: number;
  /** Amount printed on the main line (it already included the add-ons). */
  printed: number;
  /** Quantity × unit price of the main line. */
  base: number;
  /** Number of add-on lines below it. */
  addOns: number;
}

const sat = (baht: number) => Math.round(baht * 100);

/** What an add-on line costs: its own amount, else unit price × quantity. */
function addOnCost(item: LineItem): number | null {
  if (item.amount !== null) {
    // An add-on line only carries a price; a quantity or unit price means a real item.
    return item.amount > 0 && item.quantity === null && item.unitPrice === null ? sat(item.amount) : null;
  }
  return item.unitPrice !== null ? sat(item.unitPrice * (item.quantity ?? 1)) : null;
}

/**
 * Some receipts print an add-on (a topping, a size upgrade) on its own line
 * under an item, while the item's subtotal already includes it:
 *
 *   1  Iced tea     @100.00   125.00
 *      Extra pearls @25.00
 *
 * Read literally that counts the add-on twice or leaves it without a price.
 * When the printed numbers prove it (quantity × unit price + the add-ons =
 * the printed subtotal, to the satang) the main line is set to quantity × unit
 * price and each add-on gets its own price, so the lines add up to the total.
 * Nothing is guessed: lines that do not fit the pattern are left untouched.
 */
export function splitAddOns(items: LineItem[]): { items: LineItem[]; splits: AddOnSplit[] } {
  const out = items.map((i) => ({ ...i }));
  const splits: AddOnSplit[] = [];

  for (let i = 0; i < out.length; i++) {
    const main = out[i]!;
    if (main.quantity === null || main.unitPrice === null || main.amount === null) continue;
    const base = Math.round(main.quantity * sat(main.unitPrice));
    const extra = sat(main.amount) - base;
    if (extra <= 0) continue;

    const costs: number[] = [];
    let sum = 0;
    for (let j = i + 1; j < out.length && sum < extra; j++) {
      const cost = addOnCost(out[j]!);
      if (cost === null) break;
      costs.push(cost);
      sum += cost;
    }
    if (costs.length === 0 || sum !== extra) continue;

    splits.push({ index: i, printed: main.amount, base: base / 100, addOns: costs.length });
    main.amount = base / 100;
    costs.forEach((cost, k) => {
      out[i + 1 + k]!.amount = cost / 100;
    });
    i += costs.length;
  }
  return { items: out, splits };
}
