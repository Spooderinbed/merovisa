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

/**
 * MV-189 (spec §8.5, D15): the context carries a REAL organization id, because
 * `resolveTargetCase` now passes `context.organizationId` through onto the success
 * variant and an audit row written with a null organization is readable by NOBODY —
 * `NULL = ANY(…)` is `NULL` in SQL, not `true`.
 *
 * A `context: {}` fixture, which is what this was, cannot tell "the org is passed
 * through" from "the org is dropped": both produce `undefined`. So the fixture is given
 * something to lose before anything asserts that it is not lost.
 */
const ORG = "cccccccc-0000-4000-8000-000000000003";
const allow = {
  decision: { allowed: true, requiredScope: "assigned", reason: null },
  context: { organizationId: ORG },
};
const deny = (reason: string) => ({
  decision: { allowed: false, requiredScope: null, reason },
  context: { organizationId: null },
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

    expect(result).toEqual({ ok: true, caseId: PERSONAL, organizationId: ORG });
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

    expect(result).toEqual({ ok: true, caseId: REQUESTED, organizationId: ORG });
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, REQUESTED, "case.update", db);
  });

  /**
   * MV-189 (D15). Two separate sentences, because they fail for different reasons: the
   * first catches "the org was dropped", the second catches "the org was defaulted to
   * something non-null so the log looks readable when it is not".
   */
  test("carries the case's organization onto the success variant", async () => {
    const result = await resolveTargetCase(ACTOR, REQUESTED, "case.update", db);

    expect(result.ok).toBe(true);
    expect(result.ok && result.organizationId).toBe(ORG);
  });

  test("carries NULL — not undefined — for a personal case with no organization", async () => {
    // A personal case genuinely has no org, and that must be written as an explicit null:
    // `undefined` would omit the column on the audit insert rather than state the fact.
    checkCasePermission.mockResolvedValue({
      decision: { allowed: true, requiredScope: "owner", reason: null },
      context: { organizationId: null },
    });

    const result = await resolveTargetCase(ACTOR, REQUESTED, "case.update", db);

    expect(result).toEqual({ ok: true, caseId: REQUESTED, organizationId: null });
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
