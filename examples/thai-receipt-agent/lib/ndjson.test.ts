import { describe, expect, it } from "vitest";
import { readNdjson } from "./ndjson";

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(x));
      c.close();
    },
  });
const enc = (s: string) => new TextEncoder().encode(s);
const collect = async (s: ReadableStream<Uint8Array>) => {
  const out: unknown[] = [];
  for await (const x of readNdjson(s)) out.push(x);
  return out;
};

describe("readNdjson", () => {
  it("yields one object per line", async () => {
    expect(await collect(streamOf([enc('{"a":1}\n{"a":2}\n')]))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("handles a line split across chunks", async () => {
    expect(await collect(streamOf([enc('{"type":"par'), enc('tial"}\n{"ty'), enc('pe":"final"}\n')]))).toEqual([
      { type: "partial" }, { type: "final" },
    ]);
  });

  it("handles a multi-byte Thai character split in the middle of its bytes", async () => {
    const bytes = enc('{"merchant":"ร้านกาแฟ"}\n');
    const cut = bytes.indexOf(0xe0) + 1; // inside the first Thai character
    expect(await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]))).toEqual([{ merchant: "ร้านกาแฟ" }]);
  });

  it("parses a last line that has no trailing newline, and skips blank lines", async () => {
    expect(await collect(streamOf([enc('{"a":1}\n\n\n{"a":2}')]))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("yields nothing for an empty stream and throws on a broken line", async () => {
    expect(await collect(streamOf([]))).toEqual([]);
    await expect(collect(streamOf([enc("not json\n")]))).rejects.toThrow();
  });
});
