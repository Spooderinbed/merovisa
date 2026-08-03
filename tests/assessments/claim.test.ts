import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const { claimAssessment, createLead, getAssessmentClaimState, healAssessmentCase, upsertProfileForCase, getProfileForCase, from, update, updateCalls, updateResults } = vi.hoisted(() => {
  const claimAssessment = vi.fn();
  const healAssessmentCase = vi.fn();
  const createLead = vi.fn();
  const getAssessmentClaimState = vi.fn();
  const upsertProfileForCase = vi.fn();
  const getProfileForCase = vi.fn();

  // Records every .update(...) chain so tests can assert demote-then-promote order + filters.
  const updateCalls: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  // Per-call result selected by payload: { is_primary: true } → promote, else demote.
  const updateResults: { demote: { error: unknown }; promote: { error: unknown } } = {
    demote: { error: null },
    promote: { error: null },
  };

  const update = vi.fn((payload: Record<string, unknown>) => {
    const entry: { payload: Record<string, unknown>; filters: Array<[string, unknown]> } = { payload, filters: [] };
    updateCalls.push(entry);
    const result = payload?.is_primary === true ? updateResults.promote : updateResults.demote;
    // Chainable thenable: .eq()/.is() return the builder; awaiting it resolves to { error }.
    const builder: Record<string, unknown> = {
      eq: vi.fn((col: string, val: unknown) => { entry.filters.push([col, val]); return builder; }),
      is: vi.fn((col: string, val: unknown) => { entry.filters.push([col, val]); return builder; }),
      or: vi.fn((expr: string) => { entry.filters.push(["or", expr]); return builder; }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  });

  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { profile_snapshot: { destination: "australia" } }, error: null }) }) });
  const from = vi.fn(() => ({ update, select }));
  return { claimAssessment, createLead, getAssessmentClaimState, healAssessmentCase, upsertProfileForCase, getProfileForCase, from, update, updateCalls, updateResults };
});
const fakeAdmin = { from } as never;

vi.mock("@/lib/assessments/repo", () => ({ claimAssessment, createLead, getAssessmentClaimState, healAssessmentCase }));
vi.mock("@/lib/profiles/repo", () => ({ upsertProfileForCase, getProfileForCase }));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
});

import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { AssessmentClaimError } from "@/lib/assessments/errors";

describe("claimAndBootstrapProfile", () => {
  beforeEach(() => {
    claimAssessment.mockReset();
    createLead.mockReset();
    getAssessmentClaimState.mockReset();
    // Default: the row is gone (purged/deleted) unless a test says otherwise.
    getAssessmentClaimState.mockResolvedValue(null);
    healAssessmentCase.mockReset();
    healAssessmentCase.mockResolvedValue(true);
    upsertProfileForCase.mockReset();
    getProfileForCase.mockReset();
    from.mockClear();
    update.mockClear();
    updateCalls.length = 0;
    updateResults.demote = { error: null };
    updateResults.promote = { error: null };
  });

  it("returns claimed:false when claimAssessment fails", async () => {
    claimAssessment.mockResolvedValue(false);
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", user_metadata: { full_name: "Aarav Sharma" } },
    });
    expect(out.claimed).toBe(false);
    expect(upsertProfileForCase).not.toHaveBeenCalled();
  });

  // MV-130: a failed claim is not one dead end — each cause is read back and reported
  // as a distinct, honest reason so the /assess seam can recover the student correctly.
  describe("classifies why a claim missed (MV-130 / audit C-9)", () => {
    it("reports 'expired' when the row is gone (purged/deleted/never persisted)", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue(null);
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
      expect(out).toEqual({ claimed: false, reason: "expired" });
    });

    it("reports 'already-mine' when the row is already owned by this user (a re-claim)", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: "u1", caseId: "case-1", expired: false });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
      expect(out).toEqual({ claimed: false, reason: "already-mine" });
      // A re-claim must never re-bootstrap or re-record a lead.
      expect(upsertProfileForCase).not.toHaveBeenCalled();
      expect(createLead).not.toHaveBeenCalled();
    });

    it("reports 'claimed' when the row is bound to another account", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: "someone-else", caseId: "case-9", expired: false });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
      expect(out).toEqual({ claimed: false, reason: "claimed" });
    });

    it("reports 'expired' when the row is unclaimed but past its life", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: null, caseId: null, expired: true });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
      expect(out).toEqual({ claimed: false, reason: "expired" });
    });

    it("reports the retryable 'error' when the row is still claimable but the write missed", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: null, caseId: null, expired: false });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
      expect(out).toEqual({ claimed: false, reason: "error" });
    });

    it("reports the retryable 'error' on a transient claim WRITE failure, without reading state", async () => {
      claimAssessment.mockRejectedValue(new AssessmentClaimError(new Error("ETIMEDOUT")));
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
      expect(out).toEqual({ claimed: false, reason: "error" });
      expect(getAssessmentClaimState).not.toHaveBeenCalled();
    });

    it("does not swallow a non-claim error thrown by the write", async () => {
      claimAssessment.mockRejectedValue(new Error("unexpected"));
      await expect(
        claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } }),
      ).rejects.toThrow("unexpected");
    });
  });

  it("bootstraps profile when claim succeeds and user has no profile", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue(null);
    upsertProfileForCase.mockResolvedValue("p1");
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", user_metadata: { full_name: "Aarav Sharma" } },
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfileForCase).toHaveBeenCalled();
    const call = upsertProfileForCase.mock.calls[0]![1];
    // MV-157: the bootstrap is keyed on the CASE. `owner` is no longer a caller
    // parameter anywhere — it is derived from `cases.student_user_id` inside the
    // dual-write helper, which is what makes owner/case_id disagreement
    // structurally unreachable.
    expect(call.caseId).toBe("case-1");
    expect(call).not.toHaveProperty("owner");
    expect(call.sections.personal?.name).toBe("Aarav Sharma");
  });

  it("does not overwrite existing profile when claim succeeds", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: { personal: { name: "Old" } }, completeness: 8 });
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", user_metadata: { full_name: "Aarav Sharma" } },
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfileForCase).not.toHaveBeenCalled();
  });

  it("records a lead (email + assessmentId) when the claim succeeds", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", email: "aarav@example.com", user_metadata: { full_name: "Aarav" } },
    });
    expect(createLead).toHaveBeenCalledWith(fakeAdmin, {
      email: "aarav@example.com",
      assessmentId: "a1",
    });
  });

  it("does not record a lead when the claim fails", async () => {
    claimAssessment.mockResolvedValue(false);
    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", email: "aarav@example.com" },
    });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("does not record a lead when no email is present", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("still returns claimed:true when the lead insert fails (best-effort)", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    createLead.mockRejectedValue(new Error("fk violation"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", email: "aarav@example.com" },
    });
    expect(out.claimed).toBe(true);
    errSpy.mockRestore();
  });

  it("on a re-claim, demotes the existing primary then promotes the new assessment (newest-wins)", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });

    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a-new", user: { id: "u1", email: "aarav@example.com" },
    });

    const demote = updateCalls.find((c) => c.payload.is_primary === false);
    const promote = updateCalls.find((c) => c.payload.is_primary === true);

    // Demote any existing primary FIRST, under BOTH live predicates (MV-158 §D).
    // `assessments_primary_idx (owner) WHERE is_primary` and MV-155's
    // `(case_id) WHERE is_primary` are both live through this window. A demote
    // scoped to case_id alone leaves a same-owner primary in another case, the
    // promote then trips the LEGACY index, the error is logged rather than
    // thrown, and the dashboard stays pinned to the first assessment ever
    // claimed — the MV-16 regression. The "case-model" rewrite is the wrong one
    // here, which is exactly why it is pinned.
    expect(demote).toBeDefined();
    expect(demote!.filters).toEqual([["or", "owner.eq.u1,case_id.eq.case-1"], ["is_primary", true]]);
    // …then promote the just-claimed row (owner has no primary now → no index conflict).
    expect(promote).toBeDefined();
    expect(promote!.filters).toEqual([["id", "a-new"]]);
  });

  it("surfaces a failed promote instead of swallowing it (claim still succeeds)", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    updateResults.promote = { error: { message: "primary index conflict" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a-new", user: { id: "u1", email: "aarav@example.com" },
    });

    expect(out.claimed).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(
      "[claim] promote new primary failed",
      expect.objectContaining({ assessmentId: "a-new", error: { message: "primary index conflict" } }),
    );
    errSpy.mockRestore();
  });

  // ---------------------------------------------------------------------
  // MV-158 §A/§B — personal-case resolution runs BEFORE the bind.
  // ---------------------------------------------------------------------
  it("resolves the personal case BEFORE touching the assessment row", async () => {
    // Ordering is what keeps the new failure leg honestly retryable: nothing has
    // been written to the student's row when resolution fails, so "try again" is
    // TRUE. The reverse order produces a bound-but-case-less row — the one state
    // this card exists to make unreachable.
    const order: string[] = [];
    ensurePersonalCase.mockImplementation(async () => { order.push("resolve"); return "case-1"; });
    claimAssessment.mockImplementation(async () => { order.push("claim"); return true; });
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });

    await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(order).toEqual(["resolve", "claim"]);
  });

  it("F4 — a personal-case resolution failure is the retryable 'error', never 'expired'", async () => {
    // Telling a student their still-present assessment is gone is the exact
    // dishonesty MV-130 was built to remove.
    ensurePersonalCase.mockResolvedValue(null);

    const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(out).toEqual({ claimed: false, reason: "error" });
    expect(claimAssessment).not.toHaveBeenCalled();
    expect(upsertProfileForCase).not.toHaveBeenCalled();
  });

  it("F2 — an `already-mine` row with a null case_id is HEALED, not merely landed on", async () => {
    // Without this, a student whose row was bound before the claim path learned
    // about cases re-runs a claim that already "succeeded", is told
    // `already-mine`, lands on the assessment — and still sees an empty
    // dashboard, because every case-scoped read filters on a column their row
    // does not carry.
    claimAssessment.mockResolvedValue(false);
    getAssessmentClaimState.mockResolvedValue({ owner: "u1", caseId: null, expired: false });

    const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(out).toEqual({ claimed: false, reason: "already-mine" });
    expect(healAssessmentCase).toHaveBeenCalledWith(fakeAdmin, {
      id: "a1", userId: "u1", caseId: "case-1",
    });
  });

  it("F1 — an `already-mine` row that ALREADY has its case is not re-written", async () => {
    claimAssessment.mockResolvedValue(false);
    getAssessmentClaimState.mockResolvedValue({ owner: "u1", caseId: "case-1", expired: false });

    const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(out).toEqual({ claimed: false, reason: "already-mine" });
    expect(healAssessmentCase).not.toHaveBeenCalled();
  });

  it("F3 — another account's row is never healed onto the caller's case", async () => {
    claimAssessment.mockResolvedValue(false);
    getAssessmentClaimState.mockResolvedValue({ owner: "someone-else", caseId: null, expired: false });

    const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(out).toEqual({ claimed: false, reason: "claimed" });
    expect(healAssessmentCase).not.toHaveBeenCalled();
  });

  it("binds the resolved case on the claim itself", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });

    await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(claimAssessment).toHaveBeenCalledWith(
      fakeAdmin,
      expect.objectContaining({ id: "a1", userId: "u1", caseId: "case-1" }),
    );
  });

  it("takes the profile name from the session, with no provider-named parameter", async () => {
    // `googleName` was a Google-only name on a parameter three providers use.
    // The session object removes it: an email-OTP user with only `name` set gets
    // the same treatment as a Google user with `full_name`.
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue(null);
    upsertProfileForCase.mockResolvedValue("p1");

    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1",
      user: { id: "u1", email: "asha@example.com", user_metadata: { name: "Asha G" } },
    });

    expect(upsertProfileForCase.mock.calls[0]![1].sections.personal?.name).toBe("Asha G");
  });

  it("takes the lead email from the session", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });

    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", user: { id: "u1", email: "session@example.com" },
    });

    expect(createLead).toHaveBeenCalledWith(fakeAdmin, {
      email: "session@example.com", assessmentId: "a1",
    });
  });

  it("a bootstrap failure does not fail the claim, and is logged", async () => {
    // The row is already bound and the student is already converted; failing the
    // claim now would be a lie about what happened.
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue(null);
    upsertProfileForCase.mockResolvedValue(null);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", user: { id: "u1" } });

    expect(out.claimed).toBe(true);
    expect(errSpy).toHaveBeenCalledWith("[claim] profile bootstrap failed", expect.anything());
    errSpy.mockRestore();
  });

  it("the promote is neither unconditional nor moved before the demote", async () => {
    // Pinned because the "simplification" looks cleaner and re-creates MV-16.
    claimAssessment.mockResolvedValue(true);
    getProfileForCase.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });

    await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a-new", user: { id: "u1" } });

    const demoteIdx = updateCalls.findIndex((c) => c.payload.is_primary === false);
    const promoteIdx = updateCalls.findIndex((c) => c.payload.is_primary === true);
    expect(demoteIdx).toBeGreaterThanOrEqual(0);
    expect(promoteIdx).toBeGreaterThan(demoteIdx);
  });
});
