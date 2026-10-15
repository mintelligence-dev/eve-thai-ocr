import type { Receipt } from "./schema.js";

type Num = number | number[] | null;

/** Ground truth for one document. Fields left out are not scored. */
export interface Expected {
  merchant?: string;
  date?: string | null;
  /** A number, a list of acceptable numbers, or null (must not be filled in). */
  subtotal?: Num;
  vat?: Num;
  total?: Num;
  lineItems?: { description?: string; amount: number }[];
  /** The document prints only one price per line, so quantity/unit price must stay null. */
  noQuantityOrUnitPrice?: boolean;
}

export interface Check {
  field: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
}

export interface Score {
  checks: Check[];
  passed: number;
  total: number;
  /** passed / total, 0..1 */
  accuracy: number;
  /** Mean 0..1 text similarity of line-item descriptions; null if not scored. */
  descriptionSimilarity: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** 1 = identical after normalisation, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}

const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.005;

function numMatches(actual: number | null, expected: Num): boolean {
  if (expected === null) return actual === null;
  return (Array.isArray(expected) ? expected : [expected]).some((e) => close(actual, e));
}

/** Score an extraction against ground truth. Deterministic; no model involved. */
export function scoreReceipt(receipt: Receipt, expected: Expected): Score {
  const checks: Check[] = [];
  const add = (field: string, pass: boolean, exp: unknown, actual: unknown) =>
    checks.push({ field, pass, expected: exp, actual });

  if (expected.merchant !== undefined) {
    const e = norm(expected.merchant);
    const a = norm(receipt.merchant ?? "");
    add("merchant", a !== "" && (a.includes(e) || e.includes(a)), expected.merchant, receipt.merchant);
  }
  if (expected.date !== undefined) add("date", receipt.date === expected.date, expected.date, receipt.date);
  for (const k of ["subtotal", "vat", "total"] as const) {
    if (expected[k] !== undefined) add(k, numMatches(receipt[k], expected[k]!), expected[k], receipt[k]);
  }

  let descriptionSimilarity: number | null = null;
  if (expected.lineItems) {
    const exp = expected.lineItems;
    const act = receipt.lineItems;
    add("itemCount", act.length === exp.length, exp.length, act.length);

    const sortNums = (xs: (number | null)[]) =>
      xs.map((x) => (x === null ? "null" : x.toFixed(2))).sort().join(",");
    add(
      "itemAmounts",
      sortNums(act.map((i) => i.amount)) === sortNums(exp.map((i) => i.amount)),
      exp.map((i) => i.amount),
      act.map((i) => i.amount),
    );

    const described = exp.filter((i) => i.description !== undefined);
    if (described.length > 0) {
      const pool = [...act];
      let sum = 0;
      for (const e of described) {
        let best = -1;
        let bestSim = 0;
        pool.forEach((a, idx) => {
          const s = similarity(e.description!, a.description);
          if (s > bestSim || best === -1) [best, bestSim] = [idx, s];
        });
        if (best >= 0) pool.splice(best, 1);
        sum += bestSim;
      }
      descriptionSimilarity = sum / described.length;
    }
  }
  if (expected.noQuantityOrUnitPrice) {
    const invented = receipt.lineItems.filter((i) => i.quantity !== null || i.unitPrice !== null).length;
    add("noInventedQtyPrice", invented === 0, 0, invented);
  }

  const passed = checks.filter((c) => c.pass).length;
  return {
    checks,
    passed,
    total: checks.length,
    accuracy: checks.length ? passed / checks.length : 0,
    descriptionSimilarity,
  };
}
