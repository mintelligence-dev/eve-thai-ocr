/**
 * Find the bank's "Slip Verify" QR code in the photos of a transfer slip, in the
 * browser. The photos never leave the device here: only the text of the QR code
 * is sent on, and only when the person asks for the check. What to look at, and in
 * what order, is in qr-scan.ts.
 */
import { scanForSlipQr, type FoundSlipQr, type Pixels, type Region } from "./qr-scan";

export type { FoundSlipQr } from "./qr-scan";

/** Pixels of a part of an image, scaled, drawn on a canvas. */
function pixelsOf(bitmap: ImageBitmap, [fx, fy, fw, fh]: Region, scale: number): Pixels {
  const sx = Math.floor(bitmap.width * fx);
  const sy = Math.floor(bitmap.height * fy);
  const sw = Math.max(1, Math.floor(bitmap.width * fw));
  const sh = Math.max(1, Math.floor(bitmap.height * fh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data, width, height };
}

/** Look in each photo in turn; the first slip QR code found is returned. */
export async function findSlipQr(files: File[]): Promise<FoundSlipQr | null> {
  const { default: jsQR } = await import("jsqr");
  for (const file of files) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      continue;
    }
    try {
      const found = await scanForSlipQr(bitmap, {
        pixels: (region, scale) => pixelsOf(bitmap, region, scale),
        decode: (p) => jsQR(p.data, p.width, p.height, { inversionAttempts: "attemptBoth" })?.data ?? null,
        yieldNow: () => new Promise((resolve) => setTimeout(resolve, 0)),
      });
      if (found) return found;
    } finally {
      bitmap.close();
    }
  }
  return null;
}
