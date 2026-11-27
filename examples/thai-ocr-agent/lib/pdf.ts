/**
 * PDF support, in the browser: each page of a PDF becomes a JPEG, and from there
 * it is handled exactly like a photo (several pages are read as one document and
 * checked to be the same one). Nothing is uploaded here, and the server never
 * receives a PDF.
 *
 * The PDF library (pdf.js) is large, so it is only loaded when a PDF is chosen.
 */
import { ImageError, MAX_INPUT_BYTES, MAX_SIDE, canvasToJpegFile } from "./image";

export class PdfError extends Error {
  constructor(
    readonly code: "pdf_encrypted" | "pdf_too_many_pages" | "pdf_unreadable",
    /** For pdf_too_many_pages: how many pages the file has. */
    readonly pages?: number,
  ) {
    super(code);
  }
}

/** Longest side of a rendered page. Allows a very tall receipt to stay readable. */
export const MAX_PAGE_SIDE = 4096;
/** A page narrower than this many pixels is rendered larger, as far as MAX_PAGE_SIDE allows. */
export const MIN_PAGE_SHORT_SIDE = 900;

/** Does the name or the declared type say "PDF"? The content is checked separately. */
export function isPdfFile(file: { name: string; type: string }): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Is this a PDF by its first bytes? The standard allows junk before the header,
 * but only within the first 1024 bytes, so look there. The file name and the
 * type the browser reports are chosen by the sender.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let i = 0; i + marker.length <= head.length; i++) {
    if (marker.every((b, k) => head[i + k] === b)) return true;
  }
  return false;
}

/**
 * How much to scale a page (given in PDF points, 1/72 inch) so that text stays
 * readable without making a huge image. An ordinary page is fitted to MAX_SIDE
 * on its long side. A very tall, narrow page (a long till receipt saved as one
 * page) would come out too thin that way, so it is rendered larger until its
 * short side reaches MIN_PAGE_SHORT_SIDE, but never beyond MAX_PAGE_SIDE.
 */
export function pdfRenderScale(widthPt: number, heightPt: number): number {
  const long = Math.max(widthPt, heightPt);
  const short = Math.min(widthPt, heightPt);
  if (!(long > 0) || !(short > 0)) return 1;
  const fit = MAX_SIDE / long;
  if (short * fit >= MIN_PAGE_SHORT_SIDE) return fit;
  return Math.min(MIN_PAGE_SHORT_SIDE / short, MAX_PAGE_SIDE / long);
}

/**
 * Render the pages of a PDF as JPEG files, in page order.
 *
 * `maxPages` is how many more photos the page can take. A PDF with more pages is
 * refused instead of being cut short: it may be several receipts or a statement,
 * and silently dropping pages would give a wrong answer.
 */
export async function pdfToImages(file: File, maxPages: number): Promise<File[]> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("too_large");
  const data = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(data)) throw new PdfError("pdf_unreadable");

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  // enableXfa off: XFA forms contain scripts and are not receipts.
  const task = pdfjs.getDocument({ data, enableXfa: false });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => {});
    if (e instanceof Error && e.name === "PasswordException") throw new PdfError("pdf_encrypted");
    throw new PdfError("pdf_unreadable");
  }

  try {
    if (doc.numPages > maxPages) throw new PdfError("pdf_too_many_pages", doc.numPages);
    const base = file.name.replace(/\.[^.]+$/, "") || "receipt";
    const out: File[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        const [w, h] = [page.view[2]! - page.view[0]!, page.view[3]! - page.view[1]!];
        const viewport = page.getViewport({ scale: pdfRenderScale(Math.abs(w), Math.abs(h)) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        // White paper: a page with no background would otherwise turn black as JPEG.
        await page.render({ canvas, viewport, background: "#fff" }).promise;
        out.push(await canvasToJpegFile(canvas, doc.numPages > 1 ? `${base}-p${n}` : base));
        canvas.width = canvas.height = 0; // release the pixels
      } finally {
        page.cleanup();
      }
    }
    return out;
  } catch (e) {
    if (e instanceof PdfError || e instanceof ImageError) throw e;
    throw new PdfError("pdf_unreadable");
  } finally {
    await task.destroy(); // stops the worker and frees the document
  }
}
