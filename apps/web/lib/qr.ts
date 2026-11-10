/**
 * Find the bank's "Slip Verify" QR code in the photos of a transfer slip, in the
 * browser. The photos never leave the device here: only the text of the QR code
 * is sent on, and only when the person asks for the check.
 */
import { parseSlipQr, type SlipQr } from "@thai-receipt-reader/extractor/core";

export interface FoundSlipQr {
  /** The QR text exactly as read. */
  payload: string;
  qr: SlipQr;
}

/** Regions to try, as fractions of the image: the whole image, then overlapping parts. */
export const SCAN_REGIONS: readonly (readonly [x: number, y: number, w: number, h: number])[] = [
  [0, 0, 1, 1],
  [0, 0.5, 1, 0.5], // bottom half: the slip's QR code is usually near the end
  [0, 0, 1, 0.5],
  [0, 0.5, 0.5, 0.5],
  [0.5, 0.5, 0.5, 0.5],
];

/**
 * A reader finds one QR code per call, and a slip can carry others (a payment QR,
 * an app promotion). Looking at parts of the image as well as the whole gives the
 * slip's own code a chance to be the one found.
 */
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
      for (const [fx, fy, fw, fh] of SCAN_REGIONS) {
        const sx = Math.floor(bitmap.width * fx);
        const sy = Math.floor(bitmap.height * fy);
        const sw = Math.max(1, Math.floor(bitmap.width * fw));
        const sh = Math.max(1, Math.floor(bitmap.height * fh));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        const { data } = ctx.getImageData(0, 0, sw, sh);
        const code = jsQR(data, sw, sh, { inversionAttempts: "attemptBoth" });
        const qr = code ? parseSlipQr(code.data) : null;
        if (code && qr) return { payload: code.data.trim(), qr };
      }
    } finally {
      bitmap.close();
    }
  }
  return null;
}
