import { describe, expect, it } from "vitest";
import { MAX_SIDE } from "./image";
import { MAX_PAGE_SIDE, MIN_PAGE_SHORT_SIDE, isPdfFile, looksLikePdf, pdfRenderScale } from "./pdf";

const text = (s: string) => new TextEncoder().encode(s);

describe("isPdfFile", () => {
  it("accepts the PDF type or a .pdf name, in any case", () => {
    expect(isPdfFile({ name: "bill", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "BILL.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "bill.pdf", type: "application/octet-stream" })).toBe(true);
  });
  it("rejects images and other files", () => {
    expect(isPdfFile({ name: "bill.jpg", type: "image/jpeg" })).toBe(false);
    expect(isPdfFile({ name: "pdf", type: "" })).toBe(false);
    expect(isPdfFile({ name: "bill.pdf.exe", type: "" })).toBe(false);
  });
});

describe("looksLikePdf", () => {
  it("recognises the PDF header", () => {
    expect(looksLikePdf(text("%PDF-1.7\n%âãÏÓ"))).toBe(true);
  });
  it("allows a little junk before the header, as the standard does, but not a lot", () => {
    expect(looksLikePdf(text("\n\n  junk\n%PDF-1.4"))).toBe(true);
    expect(looksLikePdf(text("x".repeat(2000) + "%PDF-1.4"))).toBe(false);
  });
  it("rejects files that only claim to be PDFs", () => {
    expect(looksLikePdf(text("<html>not a pdf</html>"))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
    expect(looksLikePdf(text("%PDF"))).toBe(false); // header cut short
  });
});

describe("pdfRenderScale", () => {
  const size = (w: number, h: number) => {
    const s = pdfRenderScale(w, h);
    return { w: Math.round(w * s), h: Math.round(h * s) };
  };
  it("fits an ordinary A4 page to the usual maximum on its long side", () => {
    expect(size(595, 842).h).toBe(MAX_SIDE);
    expect(size(842, 595).w).toBe(MAX_SIDE); // landscape
  });
  it("renders a tall, narrow till receipt wider so the text stays readable", () => {
    // 80 mm wide, 280 mm tall (about 227 x 800 pt): a normal fit would be only ~580 px wide
    const { w, h } = size(227, 800);
    expect(w).toBeGreaterThanOrEqual(MIN_PAGE_SHORT_SIDE);
    expect(h).toBeLessThanOrEqual(MAX_PAGE_SIDE);
    expect(h).toBeGreaterThan(MAX_SIDE); // larger than a normal page would be
  });
  it("stops at the hard maximum when a page is too tall to reach the minimum width", () => {
    // 600 mm tall: the height limit is reached first, so the width stays below the minimum
    const { w, h } = size(227, 1700);
    expect(h).toBe(MAX_PAGE_SIDE);
    expect(w).toBeLessThan(MIN_PAGE_SHORT_SIDE);
  });
  it("never exceeds the hard maximum, even for an absurdly tall page", () => {
    expect(size(200, 20_000).h).toBeLessThanOrEqual(MAX_PAGE_SIDE);
  });
  it("falls back to 1 for a page with no size", () => {
    expect(pdfRenderScale(0, 100)).toBe(1);
    expect(pdfRenderScale(NaN, 100)).toBe(1);
  });
});
