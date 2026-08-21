import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

import {
  SIGNED_DOWNLOAD_TTL_SECONDS,
  mintCaseScopedDownloadUrl,
} from "@/lib/documents/signed-download";

/**
 * MV-190 — the signed-download helper (card criteria 2 and 3).
 *
 * ## Why the authorization lives INSIDE the helper
 *
 * A signed URL bypasses Storage RLS by design. Once minted it is an unauthenticated bearer of the
 * bytes: anyone holding the string can fetch them, from anywhere, until it expires. So the only
 * place a case check can possibly bite is BEFORE the mint, in our own code — which means "the
 * caller must remember to authorize first" is not a property, it is a hope.
 *
 * `mintCaseScopedDownloadUrl` therefore performs `checkCasePermission` itself. There is no
 * argument that lets a caller assert it already checked, and no ordering for a caller to get
 * wrong. Every test below that asserts a refusal asserts it **on the mint call** — `createSignedUrl`
 * was never reached — and not on a fetch returning 404, which would be evidence about the Storage
 * service rather than about us.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";
const ACTOR = "44444444-4444-4444-8444-444444444444";

const createSignedUrl = vi.fn();
const storage = { from: vi.fn(() => ({ createSignedUrl })) };
const db = { from: vi.fn() } as never;

const allow = () => checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
const deny = (reason: string | null) =>
  checkCasePermission.mockResolvedValue({ decision: { allowed: false, reason }, context: {} });

beforeEach(() => {
  vi.clearAllMocks();
  createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/object" }, error: null });
  allow();
});

const mint = (over: Partial<Parameters<typeof mintCaseScopedDownloadUrl>[0]> = {}) =>
  mintCaseScopedDownloadUrl({
    actorUserId: ACTOR,
    caseId: CASE_A,
    storagePath: `case/${CASE_A}/${VERSION}`,
    db,
    storage: storage as never,
    ...over,
  });

describe("SIGNED_DOWNLOAD_TTL_SECONDS", () => {
  it("is a NUMBER, and it is 60", () => {
    // Criterion 3 asks for the TTL "asserted as a number, not 'short' in prose". A comment saying
    // "short-lived" is not a test; this is. Sixty seconds is enough for a browser to follow the
    // redirect and not enough for the string to be worth keeping.
    expect(typeof SIGNED_DOWNLOAD_TTL_SECONDS).toBe("number");
    expect(SIGNED_DOWNLOAD_TTL_SECONDS).toBe(60);
  });

  it("is the default the helper actually passes to Storage", async () => {
    // A constant nothing reads is decoration. This pins that the exported number is the one that
    // reaches `createSignedUrl`, so raising the constant raises the real TTL.
    await mint();
    expect(createSignedUrl).toHaveBeenCalledWith(`case/${CASE_A}/${VERSION}`, 60);
  });
});

describe("mintCaseScopedDownloadUrl — the happy path", () => {
  it("authorizes the case and returns the url", async () => {
    const result = await mint();
    expect(result).toEqual({ ok: true, url: "https://signed.example/object" });
  });

  it("asks the permission layer about the REQUESTED case, on the client it was handed", async () => {
    await mint();
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE_A, "case.read", db);
  });

  it("waits for the case DECISION before it reaches Storage", async () => {
    // Order, asserted as order. Both calls happening is not the property — a route that minted
    // first and checked after would satisfy a "both were called" assertion exactly as well.
    //
    // THE YIELD IS THE TEST. Written without it this assertion recorded when the permission call
    // was INVOKED, not when it ANSWERED — so an implementation that started the check and awaited
    // it after the mint (a plausible "parallelise these two" refactor) still produced
    // ["check", "mint"] and stayed green. Measured: that exact mutant left this test passing until
    // the yield was added. With the yield the mock resolves a microtask later, so only an
    // implementation that genuinely awaits the decision first can record "check" first.
    const order: string[] = [];
    checkCasePermission.mockImplementation(async () => {
      await Promise.resolve();
      order.push("check");
      return { decision: { allowed: true }, context: {} };
    });
    createSignedUrl.mockImplementation(async () => {
      order.push("mint");
      return { data: { signedUrl: "https://signed.example/object" }, error: null };
    });
    await mint();
    expect(order).toEqual(["check", "mint"]);
  });

  it("mints a vault path too, since a counsellor reaches the vault the same way", async () => {
    // The card's criterion 2 covers "vault or collaboration". An owner-keyed path is authorized by
    // the case-filtered row read that produced it; this helper adds the case check and the TTL.
    const result = await mint({ storagePath: `${ACTOR}/passport/${VERSION}.pdf` });
    expect(result).toEqual({ ok: true, url: "https://signed.example/object" });
  });

  it("takes a different permission when the caller needs one", async () => {
    await mint({ permission: "case.update" });
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE_A, "case.update", db);
  });
});

describe("mintCaseScopedDownloadUrl — refusals happen ON THE MINT CALL", () => {
  it("REFUSES a denied case and never calls Storage", async () => {
    deny("not-assigned");
    const result = await mint();
    expect(result).toEqual({ ok: false, kind: "denied", reason: "not-assigned" });
    // THE ASSERTION THAT MATTERS. A URL that was minted and then discarded has already been
    // created; nothing downstream can un-mint it.
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("carries the denial REASON through, so the route can keep 403/404/500 apart", async () => {
    deny("unknown-case");
    expect(await mint()).toEqual({ ok: false, kind: "denied", reason: "unknown-case" });
  });

  it("reports a lookup failure as a denial with its reason, never as a silent allow", async () => {
    deny("lookup-failed");
    const result = await mint();
    expect(result).toEqual({ ok: false, kind: "denied", reason: "lookup-failed" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("REFUSES a malformed case id before it asks the permission layer anything", async () => {
    // `cases.id` is a uuid, so a malformed value raises 22P02 inside the lookup and returns
    // `lookup-failed` — an outage on our side reported for a bad request (`lib/cases/path-ids.ts`
    // states the same for route segments). Refusing on format keeps the two apart.
    const result = await mint({ caseId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, kind: "malformed" });
    expect(checkCasePermission).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("REFUSES a case-keyed path belonging to ANOTHER case, even though the case check passed", async () => {
    // The cross-case hole in one test. `checkCasePermission` answers about the CASE and the
    // signature is about the PATH; without this the two never meet, and an actor legitimately
    // authorized on case A walks off with case B's bytes.
    const result = await mint({ storagePath: `case/${CASE_B}/${VERSION}` });
    expect(result).toEqual({ ok: false, kind: "path-outside-case" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("REFUSES an empty path rather than asking Storage to sign nothing", async () => {
    const result = await mint({ storagePath: "  " });
    expect(result).toEqual({ ok: false, kind: "malformed" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("reports a Storage failure as mint-failed, not as a denial", async () => {
    // "We could not sign it" and "you may not have it" are different sentences and must not
    // collapse: the first is retryable and the second sends a legitimate counsellor to ask a
    // colleague for access they already hold.
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await mint()).toEqual({ ok: false, kind: "mint-failed" });
  });

  it("reports a Storage response with no url as mint-failed", async () => {
    createSignedUrl.mockResolvedValue({ data: {}, error: null });
    expect(await mint()).toEqual({ ok: false, kind: "mint-failed" });
  });

  it("reports a THROWN Storage client as mint-failed rather than propagating", async () => {
    createSignedUrl.mockRejectedValue(new Error("network"));
    expect(await mint()).toEqual({ ok: false, kind: "mint-failed" });
  });
});
