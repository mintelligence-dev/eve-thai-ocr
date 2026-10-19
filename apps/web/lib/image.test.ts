import { describe, expect, it } from "vitest";
import { KEEP_UNDER_BYTES, MAX_SIDE, fitWithin, needsResize } from "./image";
import { sniffImageType } from "./image-type";

describe("fitWithin", () => {
  it("shrinks the long side to the maximum, keeping the aspect ratio", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
  });
  it("never scales up", () => {
    expect(fitWithin(800, 1200)).toEqual({ width: 800, height: 1200 });
    expect(fitWithin(MAX_SIDE, 100)).toEqual({ width: MAX_SIDE, height: 100 });
  });
  it("keeps a very thin image at least 1px", () => {
    expect(fitWithin(10_000, 1).height).toBe(1);
  });
});

describe("needsResize", () => {
  const jpeg = (size: number) => ({ size, type: "image/jpeg" });
  const png = (size: number) => ({ size, type: "image/png" });
  it("leaves a small PNG or WebP alone", () => {
    expect(needsResize(png(200_000), 960, 1280)).toBe(false);
    expect(needsResize({ size: 200_000, type: "image/webp" }, 960, 1280)).toBe(false);
  });
  it("always re-encodes a JPEG, to bake in the rotation and drop EXIF metadata such as GPS", () => {
    expect(needsResize(jpeg(50_000), 960, 1280)).toBe(true);
  });
  it("re-encodes a big file, or a huge image, or an unsupported type", () => {
    expect(needsResize(png(KEEP_UNDER_BYTES + 1), 960, 1280)).toBe(true);
    expect(needsResize(png(900_000), 4000, 3000)).toBe(true);
    expect(needsResize({ size: 100_000, type: "image/heic" }, 960, 1280)).toBe(true);
    expect(needsResize({ size: 100_000, type: "image/gif" }, 960, 1280)).toBe(true);
  });
  it("tolerates an image just over the maximum side", () => {
    expect(needsResize(png(500_000), Math.floor(MAX_SIDE * 1.1), 1000)).toBe(false);
  });
});

describe("sniffImageType", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    const webp = new Uint8Array(12);
    webp.set([...("RIFF" + "\0\0\0\0" + "WEBP")].map((c) => c.charCodeAt(0)));
    expect(sniffImageType(webp)).toBe("image/webp");
  });
  it("rejects other files, including ones that only claim to be images", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    // RIFF but not WebP (e.g. WAV audio)
    const wav = new Uint8Array(12);
    wav.set([...("RIFF" + "\0\0\0\0" + "WAVE")].map((c) => c.charCodeAt(0)));
    expect(sniffImageType(wav)).toBeNull();
  });
});
