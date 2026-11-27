import { describe, expect, it, vi } from "vitest";
import { MAX_DECODE_SIDE, SCAN_PASSES, effectiveScale, scanForSlipQr, tiles, type Pixels, type Region, type ScanDeps } from "./qr-scan";

/** The example slip QR text from the Slip Verify guide. */
const SLIP_QR = "004000060000010103002021900021231231212000115102TH91049C30";

/** Fake pixels that carry their own size, so a fake decoder can decide by it. */
const fake = (width: number, height: number): Pixels => ({ data: new Uint8ClampedArray(4), width, height });

/** Deps for a picture of this size; `reads(region, scale)` says what the decoder would find there. */
function deps(size: { width: number; height: number }, reads: (region: Region, scale: number) => string | null) {
  const looks: { region: Region; scale: number }[] = [];
  let current: { region: Region; scale: number } | null = null;
  const d: ScanDeps = {
    pixels(region, scale) {
      current = { region, scale };
      looks.push(current);
      return fake(Math.round(size.width * region[2] * scale), Math.round(size.height * region[3] * scale));
    },
    decode() {
      return current ? reads(current.region, current.scale) : null;
    },
    yieldNow: vi.fn(async () => {}),
  };
  return { d, looks };
}

const SIZE = { width: 960, height: 1280 };

describe("scanForSlipQr", () => {
  it("stops at the first look that finds the code", async () => {
    const { d, looks } = deps(SIZE, () => SLIP_QR);
    const found = await scanForSlipQr(SIZE, d);
    expect(found?.payload).toBe(SLIP_QR);
    expect(found?.qr).toEqual({ sendingBank: "002", transRef: "0002123123121200011" });
    expect(looks).toHaveLength(1);
  });

  it("looks at the cheap, full-size parts before enlarging anything", async () => {
    const { d, looks } = deps(SIZE, () => null);
    await scanForSlipQr(SIZE, d);
    const firstEnlarged = looks.findIndex((l) => l.scale > 1);
    expect(firstEnlarged).toBeGreaterThan(0);
    expect(looks.slice(0, firstEnlarged).every((l) => l.scale === 1)).toBe(true);
    expect(firstEnlarged).toBe(SCAN_PASSES[0]!.regions.length);
  });

  it("finds a code that only shows once a part is enlarged (a small code in a photo of a screen)", async () => {
    // visible only in the bottom-right tile of the grid, at 2x
    const { d, looks } = deps(SIZE, (region, scale) => (scale >= 2 && region[0] > 0.3 && region[1] > 0.3 ? SLIP_QR : null));
    const found = await scanForSlipQr(SIZE, d);
    expect(found?.payload).toBe(SLIP_QR);
    expect(looks.at(-1)!.scale).toBeGreaterThanOrEqual(2);
  });

  it("skips text that is not a bank slip code, and keeps looking", async () => {
    // a web link first, then a payment QR code, then the slip's own code
    let n = 0;
    const answers = ["https://example.com/promo", "00020101021129370016A000000677010111011300668123456785802TH5303764540510.006304ABCD", SLIP_QR];
    const { d } = deps(SIZE, () => answers[Math.min(n++, 2)]!);
    expect((await scanForSlipQr(SIZE, d))?.payload).toBe(SLIP_QR);
  });

  it("ignores a code whose checksum fails, as a misread would", async () => {
    const { d } = deps(SIZE, () => SLIP_QR.replace("0002123123121200011", "0002123123121200012"));
    expect(await scanForSlipQr(SIZE, d)).toBeNull();
  });

  it("returns null when nothing is found anywhere, after every look", async () => {
    const { d, looks } = deps(SIZE, () => null);
    expect(await scanForSlipQr(SIZE, d)).toBeNull();
    const expected = SCAN_PASSES.reduce((sum, p) => sum + p.regions.length, 0);
    expect(looks).toHaveLength(expected);
  });

  it("never hands the decoder a picture past the size limit", async () => {
    const big = { width: 3024, height: 4032 };
    const sizes: number[] = [];
    const { d } = deps(big, () => null);
    const original = d.pixels;
    d.pixels = (region, scale) => {
      const p = original(region, scale);
      sizes.push(Math.max(p.width, p.height));
      return p;
    };
    await scanForSlipQr(big, d);
    // the first pass looks at the picture as it is; the enlarging passes stay under the limit
    const enlarging = sizes.slice(SCAN_PASSES[0]!.regions.length);
    expect(enlarging.every((s) => s <= MAX_DECODE_SIDE + 1)).toBe(true);
  });

  it("skips an enlarging pass when the picture is already large, since it would repeat the first", async () => {
    const huge = { width: 4000, height: 6000 };
    const { d, looks } = deps(huge, () => null);
    await scanForSlipQr(huge, d);
    expect(looks.every((l) => l.scale === 1 || l.scale >= 1.15)).toBe(true);
    expect(looks.length).toBeLessThan(SCAN_PASSES.reduce((s, p) => s + p.regions.length, 0));
  });

  it("gives the page a chance to breathe between looks", async () => {
    const { d, looks } = deps(SIZE, () => null);
    await scanForSlipQr(SIZE, d);
    expect((d.yieldNow as ReturnType<typeof vi.fn>).mock.calls.length).toBe(looks.length);
  });
});

describe("tiles and effectiveScale", () => {
  it("covers the whole picture with overlapping tiles that stay inside it", () => {
    const grid = tiles(3);
    expect(grid).toHaveLength(9);
    for (const [x, y, w, h] of grid) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(1.000001);
      expect(y + h).toBeLessThanOrEqual(1.000001);
      expect(w).toBeGreaterThan(1 / 3);
    }
    // the first and last tiles touch the corners
    expect(grid[0]!.slice(0, 2)).toEqual([0, 0]);
    expect(grid[8]![0]! + grid[8]![2]!).toBeCloseTo(1);
  });

  it("limits the enlargement by the longest side of the part", () => {
    expect(effectiveScale(960, 1280, [0, 0, 1, 1], 2)).toBe(1.875); // 2400 / 1280
    expect(effectiveScale(960, 1280, [0, 0, 0.33, 0.33], 2)).toBe(2);
    expect(effectiveScale(4000, 6000, [0, 0, 1, 1], 2)).toBeCloseTo(0.4);
  });
});
