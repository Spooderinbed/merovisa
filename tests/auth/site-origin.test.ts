import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";

/**
 * `resolveSiteOrigin` decides the ORIGIN half of the post-sign-in redirect
 * (`${origin}${destination}` in app/auth/callback/route.ts) and of the emailed
 * sign-in link (`emailRedirectTo` in app/api/auth/email/start/route.ts).
 * `safeNext` guards only the destination half, so nothing else stands between a
 * request header and the host a signed-in student is sent to.
 *
 * These tests pin the precedence table and, more importantly, the two bounds
 * MV-177 adds: the header is consulted only where a trusted edge is known to
 * overwrite it, and whatever it yields must parse to exactly an origin.
 */

/**
 * `vi.stubEnv` rather than assigning `process.env` directly: NODE_ENV is typed read-only, and
 * `vi.unstubAllEnvs` restores every key together so one case cannot leak into the next.
 */
type EnvKey = "NODE_ENV" | "NEXT_PUBLIC_SITE_URL" | "VERCEL" | "VERCEL_ENV";

function setEnv(key: EnvKey, value: string | undefined): void {
  vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A request as the function sees it on Vercel: internal url, public host in the headers. */
function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/auth/callback?code=abc", { headers });
}

/** The deployed shape these tests are about: no configured site URL. */
function unconfigured(): void {
  setEnv("NODE_ENV", "production");
  setEnv("NEXT_PUBLIC_SITE_URL", undefined);
}

describe("resolveSiteOrigin — precedence", () => {
  it("short-circuits to the request origin in local development", () => {
    setEnv("NODE_ENV", "development");
    setEnv("NEXT_PUBLIC_SITE_URL", "https://merovisa.vercel.app");
    setEnv("VERCEL", "1");
    expect(resolveSiteOrigin(req({ "x-forwarded-host": "merovisa.vercel.app" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("prefers NEXT_PUBLIC_SITE_URL over any header, and strips trailing slashes", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PUBLIC_SITE_URL", "https://merovisa.vercel.app/");
    setEnv("VERCEL", "1");
    expect(resolveSiteOrigin(req({ "x-forwarded-host": "attacker.example" }))).toBe(
      "https://merovisa.vercel.app",
    );
  });

  it("prefers NEXT_PUBLIC_SITE_URL off Vercel too", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PUBLIC_SITE_URL", "https://selfhosted.example");
    setEnv("VERCEL", undefined);
    setEnv("VERCEL_ENV", undefined);
    expect(resolveSiteOrigin(req({ "x-forwarded-host": "attacker.example" }))).toBe(
      "https://selfhosted.example",
    );
  });

  it("falls back to the request origin when nothing else identifies the site", () => {
    unconfigured();
    setEnv("VERCEL", "1");
    expect(resolveSiteOrigin(req())).toBe("http://localhost:3000");
  });
});

describe("resolveSiteOrigin — the header is trusted only behind a known edge", () => {
  it("honours x-forwarded-host on Vercel, so preview deployments still work", () => {
    // Vercel gives every PR its own *.vercel.app URL, which no single fixed
    // NEXT_PUBLIC_SITE_URL can express — this branch is why the fallback exists.
    unconfigured();
    setEnv("VERCEL", "1");
    expect(
      resolveSiteOrigin(
        req({ "x-forwarded-host": "merovisa-git-mv-177.vercel.app", "x-forwarded-proto": "https" }),
      ),
    ).toBe("https://merovisa-git-mv-177.vercel.app");
  });

  it("honours x-forwarded-host when only VERCEL_ENV identifies the runtime", () => {
    unconfigured();
    setEnv("VERCEL", undefined);
    setEnv("VERCEL_ENV", "production");
    expect(resolveSiteOrigin(req({ "x-forwarded-host": "merovisa.vercel.app" }))).toBe(
      "https://merovisa.vercel.app",
    );
  });

  it("IGNORES a forged x-forwarded-host off Vercel", () => {
    // The deployment this card is about: NEXT_PUBLIC_SITE_URL unset, behind a proxy
    // that passes the header through. Nothing overwrites it there, so it is not evidence.
    unconfigured();
    setEnv("VERCEL", undefined);
    setEnv("VERCEL_ENV", undefined);
    const origin = resolveSiteOrigin(req({ "x-forwarded-host": "attacker.example" }));
    expect(origin).not.toContain("attacker.example");
    expect(origin).toBe("http://localhost:3000");
  });

  it("IGNORES a forged bare host header off Vercel", () => {
    unconfigured();
    setEnv("VERCEL", undefined);
    setEnv("VERCEL_ENV", undefined);
    const origin = resolveSiteOrigin(req({ host: "attacker.example" }));
    expect(origin).not.toContain("attacker.example");
    expect(origin).toBe("http://localhost:3000");
  });

  it("falls back to http when x-forwarded-proto says so, without inventing https", () => {
    unconfigured();
    setEnv("VERCEL", "1");
    expect(
      resolveSiteOrigin(req({ "x-forwarded-host": "local.test", "x-forwarded-proto": "http" })),
    ).toBe("http://local.test");
  });
});

describe("resolveSiteOrigin — the header must parse to exactly an origin", () => {
  /** Every case here runs on Vercel, so only the structural guard can reject it. */
  function onVercel(headers: Record<string, string>): string {
    unconfigured();
    setEnv("VERCEL", "1");
    return resolveSiteOrigin(req(headers));
  }

  it("rejects a host whose userinfo disguises the real authority", () => {
    // https://merovisa.vercel.app@evil.example reads as the site; the authority is evil.example.
    const origin = onVercel({ "x-forwarded-host": "merovisa.vercel.app@evil.example" });
    expect(origin).toBe("http://localhost:3000");
  });

  it("does not throw on the comma-joined host a chain of proxies produces", () => {
    // `${proto}://${host}` would be "https://real.host, other.host" — unparseable, and
    // NextResponse.redirect throws on it, 500ing the sign-in page. It must degrade instead.
    let origin: string | undefined;
    expect(() => {
      origin = onVercel({ "x-forwarded-host": "real.host, other.host" });
    }).not.toThrow();
    expect(origin).toBe("http://localhost:3000");
    expect(() => new URL(origin!)).not.toThrow();
  });

  it("does not throw on a comma-joined x-forwarded-proto", () => {
    let origin: string | undefined;
    expect(() => {
      origin = onVercel({ "x-forwarded-host": "real.host", "x-forwarded-proto": "https, http" });
    }).not.toThrow();
    expect(origin).toBe("http://localhost:3000");
  });

  it("rejects a non-http(s) forwarded protocol", () => {
    expect(onVercel({ "x-forwarded-host": "real.host", "x-forwarded-proto": "javascript" })).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects a host carrying a path", () => {
    expect(onVercel({ "x-forwarded-host": "evil.example/merovisa.vercel.app" })).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects a host carrying a fragment", () => {
    expect(onVercel({ "x-forwarded-host": "evil.example/#" })).toBe("http://localhost:3000");
  });

  it("rejects a host carrying a query string", () => {
    expect(onVercel({ "x-forwarded-host": "evil.example/?a=b" })).toBe("http://localhost:3000");
  });

  it("rejects an empty host header rather than emitting a hostless origin", () => {
    expect(onVercel({ "x-forwarded-host": "" })).toBe("http://localhost:3000");
  });

  it("accepts a legitimate host carrying an explicit port", () => {
    expect(onVercel({ "x-forwarded-host": "staging.example:8443", "x-forwarded-proto": "https" })).toBe(
      "https://staging.example:8443",
    );
  });

  it("returns a value that is always its own origin", () => {
    // The guarantee the callers depend on: whatever comes back, `${origin}${destination}`
    // cannot smuggle a path, credential, or authority past the concatenation.
    for (const host of [
      "merovisa.vercel.app",
      "staging.example:8443",
      "merovisa.vercel.app@evil.example",
      "evil.example/#",
      "real.host, other.host",
    ]) {
      const origin = onVercel({ "x-forwarded-host": host });
      expect(new URL(origin).origin).toBe(origin);
    }
  });
});
