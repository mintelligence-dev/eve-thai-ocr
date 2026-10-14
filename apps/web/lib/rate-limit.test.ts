import { describe, expect, it } from "vitest";
import { clientKey, createLimiter } from "./rate-limit";

describe("createLimiter", () => {
  it("allows up to the limit then blocks with a retry time", () => {
    let t = 0;
    const l = createLimiter(2, 60_000, () => t);
    expect(l.hit("a")).toEqual({ ok: true });
    expect(l.hit("a")).toEqual({ ok: true });
    t = 10_000;
    expect(l.hit("a")).toEqual({ ok: false, retryAfterSec: 50 });
  });

  it("tracks keys independently", () => {
    const l = createLimiter(1, 60_000, () => 0);
    expect(l.hit("a").ok).toBe(true);
    expect(l.hit("b").ok).toBe(true);
    expect(l.hit("a").ok).toBe(false);
  });

  it("opens a new window after the old one expires", () => {
    let t = 0;
    const l = createLimiter(1, 60_000, () => t);
    l.hit("a");
    expect(l.hit("a").ok).toBe(false);
    t = 60_000;
    expect(l.hit("a").ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip then unknown", () => {
    expect(clientKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
