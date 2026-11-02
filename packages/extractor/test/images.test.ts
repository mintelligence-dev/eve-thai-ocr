import { describe, expect, it } from "vitest";
import {
  DifferentDocumentsError, MAX_IMAGES, extractReceipt, extractReceiptStream, inputImages,
} from "../src/extract.js";
import type { RawPartial } from "../src/extract.js";
import { findImageConflicts, type ImageFact } from "../src/images.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2026-11-02T00:00:00Z");
const fact = (over: Partial<ImageFact> = {}): ImageFact => ({
  merchant: null, taxIdText: null, referenceText: null, dateText: null, totalText: null, ...over,
});
const img = (n: number) => new Uint8Array([n]);
const raw = (over: object = {}) => ({ ...fx.thaiDigitsReceipt, ...over });

describe("findImageConflicts", () => {
  it("finds nothing when the images agree, or when one image lacks the value", () => {
    expect(findImageConflicts([
      fact({ merchant: "Sample Food Hall Branch 2", dateText: "19.09.2026", taxIdText: "1122334455668" }),
      fact({ totalText: "1,203.75" }),
    ], today)).toEqual([]);
  });

  it("accepts a cut-off shop name, other spellings of a date, and the same total", () => {
    expect(findImageConflicts([
      fact({ merchant: "Sample Food Hall", dateText: "19/09/2569", totalText: "1,203.75" }),
      fact({ merchant: "SAMPLE FOOD HALL BRANCH 2", dateText: "๑๙.๐๙.๒๐๒๖", totalText: "฿1203.75" }),
    ], today)).toEqual([]);
  });

  it("flags different shops, tax IDs, dates and totals", () => {
    const c = findImageConflicts([
      fact({ merchant: "ORCHID PHARMACY BRANCH 2", taxIdText: "5566778899006", dateText: "03/10/2026", totalText: "342.00" }),
      fact({ merchant: "DEMO DRINKS (Thailand)", taxIdText: "1020304050600", dateText: "19/09/2026", totalText: "105.00" }),
    ], today);
    expect(c.map((x) => x.field).sort()).toEqual(["date", "merchant", "taxId", "total"]);
    expect(c.every((x) => x.images[0] === 0 && x.images[1] === 1)).toBe(true);
  });

  it("compares every pair among three images, naming the two that disagree", () => {
    const c = findImageConflicts([
      fact({ totalText: "100.00" }), fact({ merchant: "A" }), fact({ totalText: "250.00" }),
    ], today);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ field: "total", images: [0, 2] });
  });

  it("ignores a value that cannot be read, and the receipt number", () => {
    expect(findImageConflicts([
      fact({ dateText: "not a date", totalText: "???", referenceText: "063-175270" }),
      fact({ dateText: "19/09/2026", totalText: "12.00", referenceText: "063-181068" }),
    ], today)).toEqual([]);
  });
});

describe("inputImages", () => {
  it("uses `images` if given, else the single `image`, and limits the count", () => {
    expect(inputImages({ image: img(1), mediaType: "image/png" })).toEqual([{ image: img(1), mediaType: "image/png" }]);
    expect(inputImages({ images: [{ image: img(1) }, { image: img(2) }] })).toHaveLength(2);
    expect(() => inputImages({})).toThrow();
    expect(() => inputImages({ images: Array.from({ length: MAX_IMAGES + 1 }, (_, i) => ({ image: img(i) })) })).toThrow();
  });
});

describe("reading several images as one document", () => {
  const two = { images: [{ image: img(1) }, { image: img(2) }], today };

  it("merges, and adds a flag to check where the photos overlap", async () => {
    const r = await extractReceipt({ ...two, generate: async () => raw({ imageFacts: [fact({ merchant: "Shop" }), fact({ totalText: "174.41" })] }) });
    expect(r.imageCount).toBe(2);
    expect(r.receipt.flags.map((f) => f.code)).toContain("merged_images");
    expect(r.receipt.flags.find((f) => f.code === "merged_images")!.params).toEqual({ count: 2 });
  });

  it("adds no such flag for a single image", async () => {
    const r = await extractReceipt({ image: img(1), today, generate: async () => raw() });
    expect(r.imageCount).toBe(1);
    expect(r.receipt.flags.map((f) => f.code)).not.toContain("merged_images");
  });

  it("refuses when the model says the images are different documents", async () => {
    await expect(extractReceipt({ ...two, generate: async () => raw({ sameDocument: false }) }))
      .rejects.toMatchObject({ name: "DifferentDocumentsError", reason: "model" });
  });

  it("refuses when what the images show disagrees, even if the model says they match", async () => {
    const generate = async () => raw({
      sameDocument: true,
      imageFacts: [fact({ merchant: "Orchid Pharmacy", totalText: "342.00" }), fact({ merchant: "Demo Drinks", totalText: "105.00" })],
    });
    const err = await extractReceipt({ ...two, generate }).catch((e) => e);
    expect(err).toBeInstanceOf(DifferentDocumentsError);
    expect(err.reason).toBe("conflict");
    expect(err.conflicts.map((c: { field: string }) => c.field).sort()).toEqual(["merchant", "total"]);
  });

  it("does not check sameness for a single image", async () => {
    await expect(extractReceipt({ image: img(1), today, generate: async () => raw({ sameDocument: false }) })).resolves.toBeTruthy();
  });
});

describe("streaming several images", () => {
  const two = { images: [{ image: img(1) }, { image: img(2) }], today };
  const run = async (source: () => AsyncIterable<RawPartial>) => {
    const seen: string[] = [];
    for await (const e of extractReceiptStream({ ...two, generateStream: source })) seen.push(e.type);
    return seen;
  };

  it("stops as soon as the model says the images differ, without reading further", async () => {
    let produced = 0;
    async function* source() {
      produced++; yield { handwritten: false } as RawPartial;
      produced++; yield { handwritten: false, sameDocument: false } as RawPartial;
      produced++; yield { merchant: "never read" } as RawPartial;
    }
    await expect(run(source)).rejects.toMatchObject({ name: "DifferentDocumentsError", reason: "model" });
    expect(produced).toBe(2);
  });

  it("stops once the per-image facts are complete and disagree", async () => {
    let produced = 0;
    async function* source() {
      const facts = [fact({ merchant: "Orchid Pharmacy" }), fact({ merchant: "Demo Drinks" })];
      produced++; yield { sameDocument: true, imageFacts: [facts[0]!, { merchant: "GA" }] } as RawPartial; // still being written
      produced++; yield { sameDocument: true, imageFacts: facts, documentType: "receipt" } as RawPartial;
      produced++; yield { merchant: "never read" } as RawPartial;
    }
    await expect(run(source)).rejects.toMatchObject({ name: "DifferentDocumentsError", reason: "conflict" });
    expect(produced).toBe(2);
  });

  it("does not mistake a half-written name for a conflict", async () => {
    async function* source() {
      yield { sameDocument: true, imageFacts: [fact({ merchant: "Sample Food Hall Branch 2" }), { merchant: "Sample Fo" }] } as RawPartial;
      yield raw({ imageFacts: [fact({ merchant: "Sample Food Hall Branch 2" }), fact({ merchant: "Sample Food Hall Branch 2" })] }) as RawPartial;
    }
    expect(await run(source)).toEqual(["partial", "partial", "final"]);
  });
});
