import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const { claimAssessment, createLead, getAssessmentClaimState, upsertProfile, getProfile, from, update, updateCalls, updateResults } = vi.hoisted(() => {
  const claimAssessment = vi.fn();
  const createLead = vi.fn();
  const getAssessmentClaimState = vi.fn();
  const upsertProfile = vi.fn();
  const getProfile = vi.fn();

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
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  });

  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { profile_snapshot: { destination: "australia" } }, error: null }) }) });
  const from = vi.fn(() => ({ update, select }));
  return { claimAssessment, createLead, getAssessmentClaimState, upsertProfile, getProfile, from, update, updateCalls, updateResults };
});
const fakeAdmin = { from } as never;

vi.mock("@/lib/assessments/repo", () => ({ claimAssessment, createLead, getAssessmentClaimState }));
vi.mock("@/lib/profiles/repo", () => ({ upsertProfile, getProfile }));

import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { AssessmentClaimError } from "@/lib/assessments/errors";

describe("claimAndBootstrapProfile", () => {
  beforeEach(() => {
    claimAssessment.mockReset();
    createLead.mockReset();
    getAssessmentClaimState.mockReset();
    // Default: the row is gone (purged/deleted) unless a test says otherwise.
    getAssessmentClaimState.mockResolvedValue(null);
    upsertProfile.mockReset();
    getProfile.mockReset();
    from.mockClear();
    update.mockClear();
    updateCalls.length = 0;
    updateResults.demote = { error: null };
    updateResults.promote = { error: null };
  });

  it("returns claimed:false when claimAssessment fails", async () => {
    claimAssessment.mockResolvedValue(false);
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(false);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  // MV-130: a failed claim is not one dead end — each cause is read back and reported
  // as a distinct, honest reason so the /assess seam can recover the student correctly.
  describe("classifies why a claim missed (MV-130 / audit C-9)", () => {
    it("reports 'expired' when the row is gone (purged/deleted/never persisted)", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue(null);
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
      expect(out).toEqual({ claimed: false, reason: "expired" });
    });

    it("reports 'already-mine' when the row is already owned by this user (a re-claim)", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: "u1", expired: false });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
      expect(out).toEqual({ claimed: false, reason: "already-mine" });
      // A re-claim must never re-bootstrap or re-record a lead.
      expect(upsertProfile).not.toHaveBeenCalled();
      expect(createLead).not.toHaveBeenCalled();
    });

    it("reports 'claimed' when the row is bound to another account", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: "someone-else", expired: false });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
      expect(out).toEqual({ claimed: false, reason: "claimed" });
    });

    it("reports 'expired' when the row is unclaimed but past its life", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: null, expired: true });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
      expect(out).toEqual({ claimed: false, reason: "expired" });
    });

    it("reports the retryable 'error' when the row is still claimable but the write missed", async () => {
      claimAssessment.mockResolvedValue(false);
      getAssessmentClaimState.mockResolvedValue({ owner: null, expired: false });
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
      expect(out).toEqual({ claimed: false, reason: "error" });
    });

    it("reports the retryable 'error' on a transient claim WRITE failure, without reading state", async () => {
      claimAssessment.mockRejectedValue(new AssessmentClaimError(new Error("ETIMEDOUT")));
      const out = await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
      expect(out).toEqual({ claimed: false, reason: "error" });
      expect(getAssessmentClaimState).not.toHaveBeenCalled();
    });

    it("does not swallow a non-claim error thrown by the write", async () => {
      claimAssessment.mockRejectedValue(new Error("unexpected"));
      await expect(
        claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" }),
      ).rejects.toThrow("unexpected");
    });
  });

  it("bootstraps profile when claim succeeds and user has no profile", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue("p1");
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfile).toHaveBeenCalled();
    const call = upsertProfile.mock.calls[0]![1];
    expect(call.owner).toBe("u1");
    expect(call.sections.personal?.name).toBe("Aarav Sharma");
  });

  it("does not overwrite existing profile when claim succeeds", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: { personal: { name: "Old" } }, completeness: 8 });
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("records a lead (email + assessmentId) when the claim succeeds", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav", email: "aarav@example.com",
    });
    expect(createLead).toHaveBeenCalledWith(fakeAdmin, {
      email: "aarav@example.com",
      assessmentId: "a1",
    });
  });

  it("does not record a lead when the claim fails", async () => {
    claimAssessment.mockResolvedValue(false);
    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", email: "aarav@example.com",
    });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("does not record a lead when no email is present", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    await claimAndBootstrapProfile(fakeAdmin, { assessmentId: "a1", userId: "u1" });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("still returns claimed:true when the lead insert fails (best-effort)", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    createLead.mockRejectedValue(new Error("fk violation"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", email: "aarav@example.com",
    });
    expect(out.claimed).toBe(true);
    errSpy.mockRestore();
  });

  it("on a re-claim, demotes the existing primary then promotes the new assessment (newest-wins)", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });

    await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a-new", userId: "u1", email: "aarav@example.com",
    });

    const demote = updateCalls.find((c) => c.payload.is_primary === false);
    const promote = updateCalls.find((c) => c.payload.is_primary === true);

    // Demote any existing primary for this owner first…
    expect(demote).toBeDefined();
    expect(demote!.filters).toEqual([["owner", "u1"], ["is_primary", true]]);
    // …then promote the just-claimed row (owner has no primary now → no index conflict).
    expect(promote).toBeDefined();
    expect(promote!.filters).toEqual([["id", "a-new"]]);
  });

  it("surfaces a failed promote instead of swallowing it (claim still succeeds)", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: {}, completeness: 8 });
    updateResults.promote = { error: { message: "primary index conflict" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a-new", userId: "u1", email: "aarav@example.com",
    });

    expect(out.claimed).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(
      "[claim] promote new primary failed",
      expect.objectContaining({ assessmentId: "a-new", error: { message: "primary index conflict" } }),
    );
    errSpy.mockRestore();
  });
});
