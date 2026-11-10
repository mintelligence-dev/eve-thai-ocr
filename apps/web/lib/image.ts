/**
 * Prepare a photo for upload, in the browser: fix its orientation, shrink it and
 * re-encode it as JPEG. A phone photo is often 3-8 MB and 4000+ px wide; the
 * models read a receipt just as well at ~2000 px, so this makes uploads small
 * and fast and keeps them under the server's 4 MB limit. Nothing leaves the
 * device here.
 */

/** Longest side after shrinking. Text on a receipt stays readable at this size. */
export const MAX_SIDE = 2048;
/** A PNG or WebP already this small, and not huge in pixels, is sent as is. */
export const KEEP_UNDER_BYTES = 1_500_000;
/** Refuse absurdly large inputs before trying to decode them. */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
/** The server's upload limit (Vercel rejects request bodies above 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Below this many pixels on the short side, text is probably too small to read. */
export const MIN_SIDE_WARN = 600;

const SERVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Scale (width, height) down to fit `max` on the long side. Never scales up. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Should this image be re-encoded before upload? Always for JPEG: a phone photo
 * carries an EXIF rotation tag (which the model may ignore, reading the photo
 * sideways) and often the GPS location of the shot. Re-encoding bakes the
 * rotation into the pixels and drops all metadata.
 */
export function needsResize(file: { size: number; type: string }, width: number, height: number): boolean {
  return (
    file.type === "image/jpeg" ||
    !SERVER_TYPES.includes(file.type) ||
    file.size > KEEP_UNDER_BYTES ||
    Math.max(width, height) > MAX_SIDE * 1.15
  );
}

export interface PreparedImage {
  file: File;
  width: number;
  height: number;
  resized: boolean;
}

export class ImageError extends Error {
  constructor(readonly code: "decode_failed" | "too_large" | "bad_type") {
    super(code);
  }
}

/**
 * Encode a canvas as JPEG, lowering the quality until it fits the upload limit.
 * Throws ImageError("too_large") if even the lowest quality is over it.
 */
export async function canvasToJpegFile(canvas: HTMLCanvasElement, baseName: string): Promise<File> {
  for (const quality of [0.9, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  }
  throw new ImageError("too_large");
}

/** Decode, orient, shrink and re-encode. Throws ImageError with a code the UI can translate. */
export async function prepareImage(input: File): Promise<PreparedImage> {
  if (!input.type.startsWith("image/")) throw new ImageError("bad_type");
  if (input.size > MAX_INPUT_BYTES) throw new ImageError("too_large");

  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the EXIF rotation, so a sideways phone photo comes out upright.
    bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("decode_failed");
  }

  try {
    const { width, height } = bitmap;
    if (!needsResize(input, width, height)) {
      return { file: input, width, height, resized: false };
    }

    const target = fitWithin(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("decode_failed");
    // A white background: PNGs with transparency would otherwise turn black as JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const file = await canvasToJpegFile(canvas, input.name.replace(/\.[^.]+$/, "") || "receipt");
    return { file, width: target.width, height: target.height, resized: true };
  } finally {
    bitmap.close();
  }
}
