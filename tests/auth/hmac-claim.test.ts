import { describe, test, expect, beforeAll, vi } from "vitest";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

import { signClaim, verifyClaim } from "@/lib/auth/hmac-claim";

const VALID_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

describe("hmac-claim", () => {
  test("signed token verifies", () => {
    const token = signClaim(VALID_UUID, Date.now() + 60_000);
    const verified = verifyClaim(token);
    expect(verified?.assessmentId).toBe(VALID_UUID);
  });

  test("expired token rejected", () => {
    const token = signClaim(VALID_UUID, Date.now() - 1000);
    expect(verifyClaim(token)).toBeNull();
  });

  test("tampered assessmentId rejected", () => {
    const token = signClaim(VALID_UUID, Date.now() + 60_000);
    const tampered = token.replace(VALID_UUID, "22222222-2222-2222-2222-222222222222");
    expect(verifyClaim(tampered)).toBeNull();
  });

  test("missing signature rejected", () => {
    expect(verifyClaim(`${VALID_UUID}.${Date.now() + 60_000}`)).toBeNull();
  });

  test("non-UUID assessmentId rejected", () => {
    expect(() => signClaim("not-a-uuid", Date.now() + 60_000)).toThrow();
  });

  test("garbage token rejected", () => {
    expect(verifyClaim("garbage")).toBeNull();
    expect(verifyClaim("")).toBeNull();
    expect(verifyClaim("a.b.c")).toBeNull();
  });

  test("forged signature with wrong secret rejected", () => {
    const token = signClaim(VALID_UUID, Date.now() + 60_000);
    const [id, exp] = token.split(".");
    const fakeSig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(verifyClaim(`${id}.${exp}.${fakeSig}`)).toBeNull();
  });
});
