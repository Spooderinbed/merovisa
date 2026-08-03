import { describe, it, expect } from "vitest";
import {
  claimAssessment,
  getAssessmentById,
  getAssessmentClaimState,
  healAssessmentCase,
} from "@/lib/assessments/repo";
import { AssessmentClaimError } from "@/lib/assessments/errors";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("claimAssessment", () => {
  // ONE ownership value, produced by `caseBindColumns` in the real caller. The
  // signature used to take `userId` and `caseId` independently, which made this
  // the one repository able to write an `owner` disagreeing with its `case_id`
  // and falsified the structural guarantee `lib/cases/dual-write.ts` states (and
  // MV-160 §D is designed around). A test cannot express the disagreement any
  // more, which is the point — the type is the proof.
  const CLAIM = {
    id: "aid",
    ownership: { case_id: "case-1", owner: "user-1" },
    nowIso: "2026-06-03T00:00:00.000Z",
  };

  it("claims only an unowned, unexpired row and reports success", async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: "aid" }], error: null });

    expect(await claimAssessment(client, CLAIM)).toBe(true);
    expect(calls.some((c) => c.method === "update")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === "gt" && c.args[0] === "expires_at")).toBe(true);
  });

  it("binds owner, case_id AND claimed_at in ONE statement", async () => {
    // THE atomicity criterion (MV-158 §B), and it is only observable as "one
    // statement" — hence the call COUNT, not just the payload. Two sequential
    // updates would leave an owned-but-case-less row if the process died between
    // them: no error, no failed test, a successful sign-in, and the student's
    // assessment simply absent from the case-scoped dashboard they land on.
    const { client, calls } = fakeSupabase({ data: [{ id: "aid" }], error: null });

    await claimAssessment(client, CLAIM);

    const updates = calls.filter((c) => c.method === "update");
    expect(updates).toHaveLength(1);
    const payload = updates[0]!.args[0] as Record<string, unknown>;
    expect(payload.owner).toBe("user-1");
    expect(payload.case_id).toBe("case-1");
    expect(typeof payload.claimed_at).toBe("string");
  });

  it("keeps the guard predicate at exactly its old strength", async () => {
    // An already-claimed or expired row must still match nothing, so an
    // authenticated caller POSTing an arbitrary UUID to /api/assess/claim cannot
    // steal another account's assessment. The predicate IS the authorization on
    // that route.
    const { client, calls } = fakeSupabase({ data: [{ id: "aid" }], error: null });

    await claimAssessment(client, CLAIM);

    expect(calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "aid")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === "gt" && c.args[0] === "expires_at" && c.args[1] === CLAIM.nowIso)).toBe(true);
  });

  it("reports failure when no row matched (already claimed or expired)", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await claimAssessment(client, CLAIM)).toBe(false);
  });

  // MV-130: a DB/network error is NOT "no row matched". Collapsing it to `false` is
  // what let the sign-in seam tell a student their still-recoverable assessment was gone.
  it("throws a typed claim error on a DB failure, so callers can offer a retry", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "connection reset" } });
    await expect(claimAssessment(client, CLAIM)).rejects.toBeInstanceOf(AssessmentClaimError);
  });
});

describe("healAssessmentCase", () => {
  it("repairs an owned row whose case_id is null, scoped to that owner", async () => {
    // MV-158 F2. The runtime remedy for anything claimed in a window where the
    // reads had moved to case_id but the claim path had not; the bulk remedy
    // stays MV-160 §B's reconciliation sweep.
    const { client, calls } = fakeSupabase({ data: [{ id: "aid" }], error: null });

    expect(await healAssessmentCase(client, { id: "aid", userId: "u1", caseId: "case-1" })).toBe("repaired");
    const payload = calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(payload).toEqual({ case_id: "case-1" });
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "owner" && c.args[1] === "u1")).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "case_id" && c.args[1] === null)).toBe(true);
  });

  it("does NOT report success when the predicate matched no row", async () => {
    // It used to return `true` for this, which is "reported a repair it did not
    // perform" — and the caller decides whether to run the follow-up primary
    // repair off this answer, so the lie suppressed the second half of the fix.
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await healAssessmentCase(client, { id: "aid", userId: "u1", caseId: "case-1" })).toBe(
      "not-applicable",
    );
  });

  it("reports failure rather than throwing when the repair cannot be written", async () => {
    // A failed heal must not turn a successful `already-mine` into an error: the
    // student owns the row either way, and landing them on it is still right.
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await healAssessmentCase(client, { id: "aid", userId: "u1", caseId: "case-1" })).toBe("failed");
  });
});

describe("getAssessmentClaimState", () => {
  const NOW = "2026-06-03T00:00:00.000Z";

  it("returns null when the row no longer exists (purged/deleted)", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toBeNull();
  });

  it("reports the owner, the case, and that the row is still live", async () => {
    // `caseId` is read back so `classifyMiss` can tell an `already-mine` row that
    // is FINE from one that is owned but case-less and needs the F2 heal.
    const { client } = fakeSupabase({
      data: { owner: "u1", case_id: "case-1", expires_at: "2026-06-05T00:00:00.000Z" },
      error: null,
    });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toEqual({
      owner: "u1",
      caseId: "case-1",
      expired: false,
    });
  });

  it("reports a null caseId for an owned but case-less row", async () => {
    const { client } = fakeSupabase({
      data: { owner: "u1", case_id: null, expires_at: "2026-06-05T00:00:00.000Z" },
      error: null,
    });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toEqual({
      owner: "u1",
      caseId: null,
      expired: false,
    });
  });

  it("marks an unclaimed row past its expiry as expired", async () => {
    const { client } = fakeSupabase({
      data: { owner: null, case_id: null, expires_at: "2026-06-01T00:00:00.000Z" },
      error: null,
    });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toEqual({
      owner: null,
      caseId: null,
      expired: true,
    });
  });

  it("returns null on a read error rather than guessing", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await getAssessmentClaimState(client, "aid", NOW)).toBeNull();
  });
});

describe("getAssessmentById", () => {
  it("returns the row when RLS allows it", async () => {
    const row = { id: "aid", owner: "user-1", result: { result: { verdict: "possible" } } };
    const { client } = fakeSupabase({ data: row, error: null });
    const got = await getAssessmentById(client, "aid");
    expect(got).toEqual(row);
  });

  it("returns null when not found / not owner", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await getAssessmentById(client, "aid")).toBeNull();
  });
});
