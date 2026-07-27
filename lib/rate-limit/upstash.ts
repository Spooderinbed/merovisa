import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const cache = new Map<string, Ratelimit>();

/**
 * The shared Redis connection, or null when Upstash is not configured.
 * Exposed for counters that need reset semantics a sliding window can't express
 * (see lib/auth/otp-attempts) — everything else should use checkRateLimit.
 */
export function getRedis(): Redis | null {
  return redis;
}

function getLimiter(
  name: string,
  limit: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
): Ratelimit | null {
  if (!redis) return null;
  const key = `${name}:${limit}:${window}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: `mv:${name}`,
        analytics: false,
      }),
    );
  }
  return cache.get(key)!;
}

/**
 * Check rate limit. Returns true if the request is allowed.
 * No-ops to true when Upstash env vars are not configured.
 */
export async function checkRateLimit(
  name: string,
  key: string,
  limit: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
): Promise<boolean> {
  const limiter = getLimiter(name, limit, window);
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch (e) {
    console.error("[rate-limit] limiter threw, allowing request:", e);
    return true;
  }
}

/** Extract the client IP from headers. Falls back to "unknown" so the limit
 * still bites unknown clients in aggregate (better than nothing). */
export function ipFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return (fwd.split(",")[0] ?? fwd).trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
