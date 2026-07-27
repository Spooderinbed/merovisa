import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const { getRedis } = vi.hoisted(() => ({ getRedis: vi.fn() }));
vi.mock("@/lib/rate-limit/upstash", () => ({ getRedis }));

import { MAX_OTP_ATTEMPTS, recordOtpAttempt, clearOtpAttempts } from "@/lib/auth/otp-attempts";

function fakeRedis() {
  const store = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    incr: vi.fn(async (k: string) => {
      const n = (store.get(k) ?? 0) + 1;
      store.set(k, n);
      return n;
    }),
    expire: vi.fn(async (k: string, s: number) => {
      ttls.set(k, s);
      return 1;
    }),
    del: vi.fn(async (k: string) => {
      store.delete(k);
      return 1;
    }),
  };
}

describe("otp attempt counter", () => {
  beforeEach(() => getRedis.mockReset());

  it("counts attempts per address, independently", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    expect(await recordOtpAttempt("victim@example.com")).toBe(1);
    expect(await recordOtpAttempt("victim@example.com")).toBe(2);
    expect(await recordOtpAttempt("someone-else@example.com")).toBe(1);
  });

  // The whole point of reserving with INCR rather than reading first: a burst of
  // concurrent guesses must consume distinct numbers, or they all pass one stale
  // read and the cap means nothing against the very attacker it targets.
  it("hands every concurrent attempt a distinct number", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => recordOtpAttempt("victim@example.com")),
    );
    expect(new Set(results).size).toBe(20);
    expect(Math.max(...results)).toBe(20);
  });

  // The counter must die with the code it guards, so a stale count from an hour
  // ago can't burn a freshly issued one.
  it("expires the counter alongside the code it guards", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);
    await recordOtpAttempt("a@b.com");
    expect([...redis.ttls.values()][0]).toBe(3600);
  });

  it("sets the expiry once, not on every failure", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);
    await recordOtpAttempt("a@b.com");
    await recordOtpAttempt("a@b.com");
    await recordOtpAttempt("a@b.com");
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  // This is what keeps the control from becoming a lockout weapon: sending a new
  // code wipes the count, so a victim always has a way back in.
  it("clears the count so a fresh code starts clean", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);
    await recordOtpAttempt("a@b.com");
    await recordOtpAttempt("a@b.com");
    await clearOtpAttempts("a@b.com");
    expect(await recordOtpAttempt("a@b.com")).toBe(1);
  });

  // Email OTP is the only credential these accounts have. If Redis is missing or
  // throwing, refusing every sign-in would be a worse outage than the brute-force
  // risk, so this fails open — matching checkRateLimit's posture.
  it("fails open when Upstash is not configured", async () => {
    getRedis.mockReturnValue(null);
    expect(await recordOtpAttempt("a@b.com")).toBe(0);
    await expect(clearOtpAttempts("a@b.com")).resolves.toBeUndefined();
  });

  it("fails open when Redis throws", async () => {
    getRedis.mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error("down")),
      expire: vi.fn(),
      del: vi.fn().mockRejectedValue(new Error("down")),
    });
    expect(await recordOtpAttempt("a@b.com")).toBe(0);
    await expect(clearOtpAttempts("a@b.com")).resolves.toBeUndefined();
  });

  it("caps guesses per code low enough to be useless against a 6-digit space", () => {
    // 5 guesses per code x 5 codes per address per hour (the send limit) = 25/hour,
    // against 1,000,000 codes. The rotating-IP attack this closes could otherwise
    // reach ~500k guesses in the code's lifetime.
    expect(MAX_OTP_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});
