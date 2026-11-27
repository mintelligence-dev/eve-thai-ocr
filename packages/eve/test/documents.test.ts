import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RawExtraction } from "@eve-thai-ocr/extractor";
import { describe, expect, it } from "vitest";

import * as fx from "../../extractor/test/fixtures/index.js";
import {
  ATTACHMENTS_DIR,
  DocumentToolError,
  MAX_KEPT,
  addDocument,
  applyCorrection,
  attachmentPath,
  emptyStore,
  exportDocument,
  findDocument,
  presentDocument,
  readDocument,
  replaceDocument,
  type ReadOptions,
} from "../extension/lib/documents.js";

// Synthetic images only (see bench/README.md).
const png = new Uint8Array(readFileSync(fileURLToPath(new URL("../../../bench/cases/receipt-thai-clean.png", import.meta.url))));
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const today = new Date("2025-10-14T00:00:00Z");
const at = (name: string) => `${ATTACHMENTS_DIR}abc123/${name}`;

function reader(files: Record<string, Uint8Array>): ReadOptions["readFile"] {
  return async (path) => files[path] ?? null;
}
const read = (raw: RawExtraction | (() => never), files: Record<string, Uint8Array>, extra: Partial<ReadOptions> = {}) =>
  readDocument({
    paths: Object.keys(files),
    readFile: reader(files),
    model: "test/model",
    today,
    generate: typeof raw === "function" ? raw : async () => raw,
    ...extra,
  });
const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(DocumentToolError);
  return (e as Error).message;
};

describe("attachmentPath", () => {
  it("accepts files eve saved as attachments", () => {
    expect(attachmentPath(at("slip.png"))).toBe(at("slip.png"));
  });

  it("refuses anything outside the attachments folder, including a way out with ..", () => {
    for (const path of ["/etc/passwd", "/workspace/notes.txt", `${ATTACHMENTS_DIR}../../secret`, ATTACHMENTS_DIR, "slip.png"]) {
      expect(() => attachmentPath(path)).toThrow(DocumentToolError);
    }
  });
});

describe("readDocument", () => {
  it("reads an attached photo through the extractor, which parses the figures", async () => {
    const receipt = await read(fx.thaiDigitsReceipt, { [at("r.png")]: png });
    expect(receipt.total).toBe(174.41);
    expect(receipt.date).toBe("2025-05-12");
    expect(receipt.lineItems).toHaveLength(2);
  });

  it("sends the type found in the file's first bytes, not the one in its name", async () => {
    let seen: string[] = [];
    await read(fx.thaiDigitsReceipt, { [at("photo.webp")]: jpeg }, {
      generate: async (args) => {
        seen = (args.images ?? []).map((i) => i.mediaType ?? "");
        return fx.thaiDigitsReceipt;
      },
    });
    expect(seen).toEqual(["image/jpeg"]);
  });

  it("refuses a PDF and a HEIC photo with what to send instead, without calling the model", async () => {
    const never = () => {
      throw new Error("the model must not be called");
    };
    const pdf = new TextEncoder().encode("%PDF-1.7\n...");
    expect(await refusal(read(never, { [at("r.pdf")]: pdf }))).toMatch(/PDF/);
    const heic = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0]);
    expect(await refusal(read(never, { [at("r.heic")]: heic }))).toMatch(/HEIC/);
    const text = new TextEncoder().encode("hello");
    expect(await refusal(read(never, { [at("r.txt")]: text }))).toMatch(/JPEG, PNG or WebP/);
  });

  it("refuses a missing or empty file, too many photos, and photos over the size limit", async () => {
    const opts = { paths: [at("gone.png")], readFile: reader({}), model: "test/model", generate: async () => fx.thaiDigitsReceipt };
    expect(await refusal(readDocument(opts))).toMatch(/send the photo again/);
    expect(await refusal(read(fx.thaiDigitsReceipt, { [at("e.png")]: new Uint8Array() }))).toMatch(/empty/);
    const five = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [at(`${i}.png`), png]));
    expect(await refusal(read(fx.thaiDigitsReceipt, five))).toMatch(/At most 4/);
    expect(await refusal(read(fx.thaiDigitsReceipt, { [at("big.png")]: png }, { maxBytes: 1000 }))).toMatch(/larger than/);
  });

  it("turns the extractor's refusals into messages a person can act on", async () => {
    const handwritten = { ...fx.thaiDigitsReceipt, handwritten: true };
    expect(await refusal(read(handwritten, { [at("h.png")]: png }))).toMatch(/handwritten/);

    const different = { ...fx.thaiDigitsReceipt, sameDocument: false };
    expect(await refusal(read(different, { [at("1.png")]: png, [at("2.png")]: png }))).toMatch(/same document/);

    const busy = () => {
      throw Object.assign(new Error("rate limited"), { statusCode: 429 });
    };
    expect(await refusal(read(busy, { [at("b.png")]: png }))).toMatch(/busy/);

    const broken = () => {
      throw new TypeError("boom");
    };
    expect(await refusal(read(broken, { [at("x.png")]: png }))).toMatch(/could not be read \(TypeError\)/);
  });
});

describe("the session's documents", () => {
  it("gives each document its own id and keeps the latest ones", async () => {
    const receipt = await read(fx.thaiDigitsReceipt, { [at("r.png")]: png });
    let store = emptyStore();
    const ids: string[] = [];
    for (let i = 0; i < MAX_KEPT + 2; i++) {
      const added = addDocument(store, receipt, today);
      store = added.store;
      ids.push(added.id);
    }
    expect(ids[0]).toBe("doc-1");
    expect(store.documents).toHaveLength(MAX_KEPT);
    expect(() => findDocument(store, "doc-1")).toThrow(/no document doc-1/);
    expect(findDocument(store, ids.at(-1)!)).toEqual(receipt);

    const changed = { ...receipt, merchant: "อื่น" };
    expect(findDocument(replaceDocument(store, ids.at(-1)!, changed), ids.at(-1)!).merchant).toBe("อื่น");
  });
});

describe("applyCorrection", () => {
  it("parses values as the person typed them and runs every check again", async () => {
    const unreadable = await read(fx.unreadableAmountReceipt, { [at("r.png")]: png });
    expect(presentDocument("doc-1", unreadable).canExport).toBe(false);

    const fixed = applyCorrection(unreadable, { fields: { total: "฿๑๗๔.๔๑" } }, today);
    expect(fixed.total).toBe(174.41);
    const view = presentDocument("doc-1", fixed);
    expect(view.mustFix).toEqual([]);
    expect(view.canExport).toBe(true);
  });

  it("parses Thai dates and times with the document's own parser", async () => {
    const receipt = await read(fx.thaiDigitsReceipt, { [at("r.png")]: png });
    const fixed = applyCorrection(receipt, { fields: { date: "๓ ก.ย. ๖๘", time: "09.05 น." } }, today);
    expect(fixed.date).toBe("2025-09-03");
    expect(fixed.time).toBe("09:05");
  });

  it("refuses a value that is not an amount or a date instead of guessing", async () => {
    const receipt = await read(fx.thaiDigitsReceipt, { [at("r.png")]: png });
    expect(() => applyCorrection(receipt, { fields: { total: "about a hundred" } }, today)).toThrow(/not an amount/);
    expect(() => applyCorrection(receipt, { fields: { date: "yesterday" } }, today)).toThrow(/not a date/);
    expect(() => applyCorrection(receipt, { lineItems: [{ index: 9, amount: "1" }] }, today)).toThrow(/no line 9/);
  });

  it("edits, removes and adds line items, and checks them against the total again", async () => {
    const short = await read(fx.itemsMismatchReceipt, { [at("r.png")]: png });
    expect(short.flags.map((f) => f.code)).toContain("items_total_mismatch");

    const added = applyCorrection(short, { addLineItems: [{ description: "Croissant", quantity: "1", unitPrice: "33", amount: "33.00" }] }, today);
    expect(added.lineItems).toHaveLength(2);
    expect(added.flags.map((f) => f.code)).not.toContain("items_total_mismatch");

    const removed = applyCorrection(added, { lineItems: [{ index: 1, remove: true }] }, today);
    expect(removed.lineItems.map((l) => l.description)).toEqual(["ลาเต้เย็น"]);

    const edited = applyCorrection(added, { lineItems: [{ index: 0, quantity: "๒", unitPrice: "65" }] }, today);
    expect(edited.lineItems[0]).toMatchObject({ quantity: 2, unitPrice: 65 });
    expect(edited.lineItems[0]!.assumed).toBeUndefined();
  });

  it("keeps digits only in a tax ID, as the reading does", async () => {
    const receipt = await read(fx.thaiDigitsReceipt, { [at("r.png")]: png });
    expect(applyCorrection(receipt, { fields: { taxId: "0-1055-12345-67-8" } }, today).taxId).toBe("0105512345678");
  });
});

describe("exportDocument", () => {
  it("is refused while anything must still be fixed", async () => {
    const unreadable = await read(fx.unreadableAmountReceipt, { [at("r.png")]: png });
    expect(() => exportDocument("doc-1", unreadable, "csv")).toThrow(/Export is locked/);
    expect(() => exportDocument("doc-1", unreadable, "json")).toThrow(/Export is locked/);
  });

  it("exports CSV for Excel and JSON with the full structure once the document is clean", async () => {
    const receipt = await read(fx.thaiDigitsReceipt, { [at("r.png")]: png });
    const csv = exportDocument("doc-1", receipt, "csv");
    expect(csv.filename).toBe("doc-1.csv");
    expect(csv.content.startsWith("﻿")).toBe(true);
    const json = exportDocument("doc-1", receipt, "json");
    expect(JSON.parse(json.content).total).toBe(174.41);
  });

  it("keeps spreadsheet formulas in the document from running", async () => {
    const receipt = await read(fx.formulaInjectionReceipt, { [at("r.png")]: png });
    const { content } = exportDocument("doc-1", receipt, "csv");
    expect(content).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});
