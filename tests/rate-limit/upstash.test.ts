import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Ensure no Upstash env vars in test environment
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
});

describe("rate-limit no-op fallback", () => {
  test("checkRateLimit allows requests when env vars absent", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit/upstash");
    expect(await checkRateLimit("test", "1.2.3.4", 1, "1 s")).toBe(true);
    expect(await checkRateLimit("test", "1.2.3.4", 1, "1 s")).toBe(true);
    expect(await checkRateLimit("test", "1.2.3.4", 1, "1 s")).toBe(true);
  });
});

describe("ipFromRequest", () => {
  test("returns x-forwarded-for first value", async () => {
    const { ipFromRequest } = await import("@/lib/rate-limit/upstash");
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(ipFromRequest(req)).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip", async () => {
    const { ipFromRequest } = await import("@/lib/rate-limit/upstash");
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(ipFromRequest(req)).toBe("9.9.9.9");
  });

  test("returns 'unknown' when no IP headers", async () => {
    const { ipFromRequest } = await import("@/lib/rate-limit/upstash");
    const req = new Request("http://localhost/");
    expect(ipFromRequest(req)).toBe("unknown");
  });
});
