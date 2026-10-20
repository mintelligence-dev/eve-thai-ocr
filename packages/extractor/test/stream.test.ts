import { describe, expect, it } from "vitest";
import { HandwritingNotSupportedError, extractReceipt, extractReceiptStream } from "../src/extract.js";
import type { RawPartial } from "../src/extract.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");
const image = new Uint8Array([1, 2, 3]);

async function* growing(full: object, steps: RawPartial[]) {
  for (const s of steps) yield s;
  yield full as RawPartial;
}
const collect = async (it: AsyncGenerator<unknown>) => {
  const out: unknown[] = [];
  for await (const e of it) out.push(e);
  return out as { type: string; raw?: RawPartial; result?: { receipt: { total: number | null } } }[];
};

describe("extractReceiptStream", () => {
  it("yields what the model has read so far, then the same result as extractReceipt", async () => {
    const steps: RawPartial[] = [
      { documentType: "receipt" },
      { documentType: "receipt", merchant: "ร้านกาแฟ" },
    ];
    const events = await collect(
      extractReceiptStream({ image, today, generateStream: () => growing(fx.thaiDigitsReceipt, steps) }),
    );
    expect(events.map((e) => e.type)).toEqual(["partial", "partial", "partial", "final"]);
    expect(events[1]!.raw).toMatchObject({ merchant: "ร้านกาแฟ" });

    const direct = await extractReceipt({ image, today, generate: async () => fx.thaiDigitsReceipt });
    expect(events.at(-1)!.result).toEqual(direct);
  });

  it("partial results are raw text only: nothing parsed, no flags", async () => {
    const events = await collect(
      extractReceiptStream({
        image, today,
        generateStream: () => growing(fx.thaiDigitsReceipt, [{ totalText: "฿๑๗" }]),
      }),
    );
    const partial = events[0]!.raw as Record<string, unknown>;
    expect(partial.totalText).toBe("฿๑๗");
    expect(partial).not.toHaveProperty("flags");
    expect(partial).not.toHaveProperty("total");
  });

  it("stops at once when the model says the document is handwritten", async () => {
    let produced = 0;
    async function* source() {
      produced++;
      yield { documentType: "transfer_slip" } as RawPartial;
      produced++;
      yield { documentType: "transfer_slip", handwritten: true } as RawPartial;
      produced++;
      yield { merchant: "should never be read" } as RawPartial;
    }
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const e of extractReceiptStream({ image, generateStream: () => source() })) seen.push(e.type);
      })(),
    ).rejects.toBeInstanceOf(HandwritingNotSupportedError);
    expect(seen).toEqual(["partial"]);
    expect(produced).toBe(2); // the third chunk was never requested
  });

  it("rejects a final answer that does not match the schema", async () => {
    await expect(
      collect(extractReceiptStream({ image, generateStream: () => growing({ merchant: "x" }, []) })),
    ).rejects.toThrow();
  });

  it("refuses a handwritten final answer even if it was never flagged mid-stream", async () => {
    await expect(
      collect(extractReceiptStream({ image, generateStream: () => growing({ ...fx.thaiDigitsReceipt, handwritten: true }, []) })),
    ).rejects.toBeInstanceOf(HandwritingNotSupportedError);
  });
});
