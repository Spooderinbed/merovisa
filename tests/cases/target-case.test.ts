import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolvePersonalCaseId, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

import {
  requestedCaseId,
  resolveTargetCase,
  targetCaseResponse,
} from "@/lib/cases/target-case";

/**
 * MV-172 — the one place a case-scoped write route decides WHICH case it is
 * writing to.
 *
 * Spec F-8 (amended by this slice to **seven** routes) names the defect this
 * module exists to close: every one of those routes resolved the ACTOR's own
 * personal case and accepted no case id, so rendering the same controls inside a
 * counsellor's case route would have written the student's shortlist, checklist
 * tick, plan action and profile edit onto **the counsellor's own case**. RLS
 * cannot catch that — the counsellor legitimately may reach their own case — so
 * the write succeeds against the wrong student.
 *
 * The property under test is therefore not "a case id is accepted". It is:
 *
 * - a requested case id is **authorized**, never trusted (plan line 354, "knowing
 *   a case ID grants no access"); and
 * - when one is requested, the actor's personal case is **never consulted**, so a
 *   mis-scoped write has no fallback to land on silently.
 */

const ACTOR = "actor-user-id";
const REQUESTED = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSONAL = "bbbbbbbb-0000-4000-8000-000000000002";
const db = { from: vi.fn() } as never;

const allow = { decision: { allowed: true, requiredScope: "assigned", reason: null }, context: {} };
const deny = (reason: string) => ({
  decision: { allowed: false, requiredScope: null, reason },
  context: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  resolvePersonalCaseId.mockResolvedValue(PERSONAL);
  checkCasePermission.mockResolvedValue(allow);
});

describe("requestedCaseId — reading the id off a request body", () => {
  test("returns the value when the body carries one", () => {
    expect(requestedCaseId({ caseId: REQUESTED, kind: "ielts" })).toBe(REQUESTED);
  });

  test("returns undefined for a body that names no case", () => {
    expect(requestedCaseId({ kind: "ielts" })).toBeUndefined();
    expect(requestedCaseId(null)).toBeUndefined();
    expect(requestedCaseId("not an object")).toBeUndefined();
  });

  test("passes a non-string through unchanged rather than coercing it", () => {
    // Coercing here would turn a malformed request into a well-formed one; the
    // uuid check in `resolveTargetCase` is the single gate, and it must see the
    // value the client actually sent.
    expect(requestedCaseId({ caseId: 7 })).toBe(7);
  });
});

describe("resolveTargetCase — no case id requested (the personal surfaces)", () => {
  test("resolves the actor's own personal case and authorizes it", async () => {
    const result = await resolveTargetCase(ACTOR, undefined, "case.update", db);

    expect(result).toEqual({ ok: true, caseId: PERSONAL });
    expect(resolvePersonalCaseId).toHaveBeenCalledWith(ACTOR, db);
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, PERSONAL, "case.update", db);
  });

  test("reports no-personal-case WITHOUT asking the permission layer about a null case", async () => {
    resolvePersonalCaseId.mockResolvedValue(null);

    const result = await resolveTargetCase(ACTOR, undefined, "case.update", db);

    expect(result).toEqual({ ok: false, kind: "no-personal-case" });
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  test("reports the denial reason verbatim so an outage stays distinguishable", async () => {
    checkCasePermission.mockResolvedValue(deny("lookup-failed"));

    const result = await resolveTargetCase(ACTOR, undefined, "case.update", db);

    expect(result).toEqual({ ok: false, kind: "denied", reason: "lookup-failed" });
  });
});

describe("resolveTargetCase — a case id IS requested (the case route)", () => {
  test("authorizes the REQUESTED case, not the actor's own", async () => {
    const result = await resolveTargetCase(ACTOR, REQUESTED, "case.update", db);

    expect(result).toEqual({ ok: true, caseId: REQUESTED });
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, REQUESTED, "case.update", db);
  });

  test("NEVER resolves the actor's personal case — a wrong-case write must have nowhere to land", async () => {
    // The whole of F-8's failure mode 1. If the personal case is resolved at all,
    // a route that mishandles the requested id falls back to the counsellor's own
    // case and the write succeeds against the wrong student.
    await resolveTargetCase(ACTOR, REQUESTED, "case.update", db);

    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
  });

  test("a requested case the actor may not reach is DENIED, and the personal case is not substituted", async () => {
    checkCasePermission.mockResolvedValue(deny("not-assigned"));

    const result = await resolveTargetCase(ACTOR, REQUESTED, "case.update", db);

    expect(result).toEqual({ ok: false, kind: "denied", reason: "not-assigned" });
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
  });

  test.each([
    ["a non-uuid string", "case-the-client-asked-for"],
    ["an empty string", ""],
    ["a number", 7],
    ["an object", { id: REQUESTED }],
    ["null", null],
  ])("refuses %s as malformed, before any query", async (_label, value) => {
    // `null` is deliberately malformed rather than "absent": a client that sends
    // `caseId: null` is naming a case badly, not declining to name one, and
    // silently treating it as the personal case is how a broken case route would
    // start writing to the counsellor's own data without anything going red.
    const result = await resolveTargetCase(ACTOR, value, "case.update", db);

    expect(result).toEqual({ ok: false, kind: "malformed" });
    expect(checkCasePermission).not.toHaveBeenCalled();
    expect(resolvePersonalCaseId).not.toHaveBeenCalled();
  });
});

describe("targetCaseResponse — the status each refusal owes", () => {
  test("malformed is 400 — no retry fixes it, and it says nothing about access", async () => {
    const res = targetCaseResponse({ ok: false, kind: "malformed" }, "no workspace");
    expect(res.status).toBe(400);
  });

  test("no personal case carries the CALLER's message, because the routes disagree on it", async () => {
    const res = targetCaseResponse(
      { ok: false, kind: "no-personal-case" },
      "Couldn't save your profile",
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Couldn't save your profile" });
  });

  test.each([
    ["lookup-failed", 500],
    ["unknown-case", 404],
    ["not-assigned", 403],
    ["membership-inactive", 403],
  ])("a %s denial answers %i — the three outcomes must not collapse", (reason, status) => {
    const res = targetCaseResponse({ ok: false, kind: "denied", reason: reason as never }, "x");
    expect(res.status).toBe(status);
  });
});
