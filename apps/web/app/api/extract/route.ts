import { extractReceipt } from "@thai-receipt-reader/extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel rejects request bodies above 4.5 MB, so stay under that.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives one image, sends it to the model, returns the extraction. The image
 * lives only in memory for the duration of the request: it is never written to
 * disk or storage, and nothing from the document is logged.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart form data with an 'image' field.", 400);
  }

  const file = form.get("image");
  if (!(file instanceof File)) return error("Missing 'image' file.", 400);
  if (!TYPES.has(file.type)) return error("Only JPEG, PNG or WebP images are supported.", 415);
  if (file.size === 0) return error("The file is empty.", 400);
  if (file.size > MAX_BYTES) return error("Image is larger than 4 MB.", 413);

  try {
    const { receipt } = await extractReceipt({
      image: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type,
      model: process.env.RECEIPT_MODEL || undefined,
      abortSignal: request.signal,
    });
    return Response.json({ receipt }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Log the error class only; messages can echo model output from the document.
    console.error("extract failed:", e instanceof Error ? e.name : "unknown");
    return error("Extraction failed. Check the model configuration and try again.", 502);
  }
}
