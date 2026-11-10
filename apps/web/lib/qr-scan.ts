/**
 * The plan for finding a slip's QR code in a picture, without any browser or library
 * in it: what to look at, in what order, and when to give up. The pixels and the
 * decoding are passed in, so the plan can be tested, and run on real photos in Node.
 *
 * A photo of a screen (tilted, with glare and moiré) can hide a QR code that a screenshot
 * would not, and a QR code that is small in the picture may only be found once that part
 * is enlarged. So the cheap looks come first and the enlarged ones after.
 */
import { parseSlipQr, type SlipQr } from "@thai-receipt-reader/extractor/core";

export interface FoundSlipQr {
  /** The QR text exactly as read. */
  payload: string;
  qr: SlipQr;
}

/** A part of the picture as fractions: x, y, width, height. */
export type Region = readonly [x: number, y: number, w: number, h: number];

export interface Pixels {
  /** RGBA, as from a canvas. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ScanDeps {
  /** The pixels of `region`, enlarged (or shrunk) by `scale`. */
  pixels(region: Region, scale: number): Pixels;
  /** The text of a QR code found in these pixels, or null. */
  decode(pixels: Pixels): string | null;
  /** Called between looks, so a page can stay responsive. */
  yieldNow?(): Promise<void>;
}

/** The longest side handed to the decoder. Larger takes long on a phone and finds nothing more. */
export const MAX_DECODE_SIDE = 2400;

/** `n` x `n` overlapping tiles (each a bit larger than 1/n, so a QR code on a seam is whole in one). */
export function tiles(n: number, overlap = 0.25): Region[] {
  const size = Math.min(1, 1 / n + overlap);
  const out: Region[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) out.push([Math.min(col / n, 1 - size), Math.min(row / n, 1 - size), size, size]);
  }
  return out;
}

export interface ScanPass {
  regions: readonly Region[];
  /** How much to enlarge the region; a pass is skipped when the size limit leaves nothing to gain. */
  scale: number;
}

/**
 * Cheapest first. The first pass is what screenshots need: the whole picture, then parts
 * of it. The later ones enlarge the lower half (where the code usually is), the whole
 * picture, and a 3 x 3 grid, which is what photos of a screen needed.
 */
export const SCAN_PASSES: readonly ScanPass[] = [
  {
    scale: 1,
    regions: [
      [0, 0, 1, 1],
      [0, 0.5, 1, 0.5],
      [0, 0, 1, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ],
  },
  { scale: 2, regions: [[0, 0.5, 1, 0.5]] },
  { scale: 2, regions: [[0, 0, 1, 1]] },
  // from the bottom right: a slip's QR code sits near its end, and on the right
  { scale: 2, regions: tiles(3).reverse() },
];

/** The scale to really use: as asked, but never past the size limit. Values near 1 or below mean "no gain". */
export function effectiveScale(width: number, height: number, region: Region, scale: number): number {
  const longest = Math.max(width * region[2], height * region[3]);
  return Math.min(scale, MAX_DECODE_SIDE / longest);
}

/** Look for a bank slip QR code in a picture of the given size. Text that is not one (another QR code, a misread) is skipped. */
export async function scanForSlipQr(size: { width: number; height: number }, deps: ScanDeps): Promise<FoundSlipQr | null> {
  for (const pass of SCAN_PASSES) {
    for (const region of pass.regions) {
      const scale = pass.scale === 1 ? 1 : effectiveScale(size.width, size.height, region, pass.scale);
      // an enlarging pass that the size limit shrinks to (almost) the original size repeats pass one
      if (pass.scale > 1 && scale < 1.15) continue;
      const text = deps.decode(deps.pixels(region, scale));
      const qr = text ? parseSlipQr(text) : null;
      if (text && qr) return { payload: text.trim(), qr };
      await deps.yieldNow?.();
    }
  }
  return null;
}
