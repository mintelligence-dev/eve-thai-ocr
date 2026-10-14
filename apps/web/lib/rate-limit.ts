export interface Limiter {
  /** Records one hit for `key`. */
  hit(key: string): { ok: true } | { ok: false; retryAfterSec: number };
}

/**
 * Fixed-window counter held in memory. On serverless this is per instance, so
 * it is a best-effort guard against casual abuse and runaway loops, not a hard
 * cap. Pair it with a Vercel Firewall rate-limit rule and an AI Gateway budget
 * (see README) for limits that hold across instances.
 */
export function createLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): Limiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    hit(key) {
      const t = now();
      if (windows.size > 5000) {
        for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
      }
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
      }
      w.count += 1;
      return { ok: true };
    },
  };
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Per-visitor and whole-site limits, configurable through env vars. */
export const perVisitor = createLimiter(int(process.env.RATE_LIMIT_PER_HOUR, 10), HOUR);
export const wholeSite = createLimiter(int(process.env.RATE_LIMIT_PER_DAY, 200), DAY);

/** Best-effort client IP. On Vercel, x-forwarded-for is set by the platform. */
export function clientKey(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
