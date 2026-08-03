import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  freezePredictionForProgram,
  insertAttempt,
  listAttemptsForPrediction,
  listEventTypesForAttempt,
  insertEvent,
} = vi.hoisted(() => ({
  freezePredictionForProgram: vi.fn(),
  insertAttempt: vi.fn(),
  listAttemptsForPrediction: vi.fn(),
  listEventTypesForAttempt: vi.fn(),
  insertEvent: vi.fn(),
}));

vi.mock("@/lib/outcomes/freeze", () => ({ freezePredictionForProgram }));
vi.mock("@/lib/outcomes/repo", () => ({
  insertAttempt,
  listAttemptsForPrediction,
  listEventTypesForAttempt,
  insertEvent,
}));

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

import { captureApplication } from "@/lib/outcomes/on-apply";

const db = {} as never;
const PRED = { id: "pred1", programId: "prog1" };
const ATTEMPT = {
  id: "att1",
  owner: "u1",
  predictionId: "pred1",
  programId: "prog1",
  institutionId: null,
  intake: null,
  externalRef: null,
  createdAt: "2026-06-20T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  freezePredictionForProgram.mockResolvedValue({ ok: true, prediction: PRED, created: true });
  listAttemptsForPrediction.mockResolvedValue([]);
  insertAttempt.mockResolvedValue(ATTEMPT);
  listEventTypesForAttempt.mockResolvedValue([]);
  insertEvent.mockResolvedValue({ id: "ev1", eventType: "applied" });
});

describe("captureApplication — root applied event (MV-08 funnel unblock)", () => {
  it("writes a root 'applied' outcome_event when opening a new attempt", async () => {
    const res = await captureApplication(db, "u1", "prog1");
    expect(res).toEqual({ captured: true, attempt: ATTEMPT, created: true });
    // gate/decisionAuthority/source are derived server-side, mirroring /api/outcomes/event;
    // occurredAt anchors to the attempt's open time so the funnel root is deterministic.
    expect(insertEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        caseId: "u1",
        attemptId: "att1",
        eventType: "applied",
        gate: null,
        decisionAuthority: "student",
        source: "self_reported",
        occurredAt: "2026-06-20T10:00:00Z",
      }),
    );
  });

  it("does not duplicate the applied event when one already exists (idempotent)", async () => {
    listAttemptsForPrediction.mockResolvedValue([ATTEMPT]);
    listEventTypesForAttempt.mockResolvedValue(["applied"]);
    const res = await captureApplication(db, "u1", "prog1");
    expect(res).toEqual({ captured: true, attempt: ATTEMPT, created: false });
    expect(insertEvent).not.toHaveBeenCalled();
    expect(insertAttempt).not.toHaveBeenCalled();
  });

  it("heals an existing attempt that is missing its applied event", async () => {
    // The old buggy path opened an attempt but never wrote the root event,
    // dead-ending the funnel at the first self-report (409). Re-applying repairs it.
    listAttemptsForPrediction.mockResolvedValue([ATTEMPT]);
    listEventTypesForAttempt.mockResolvedValue([]);
    const res = await captureApplication(db, "u1", "prog1");
    expect(res).toEqual({ captured: true, attempt: ATTEMPT, created: false });
    expect(insertEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ eventType: "applied", attemptId: "att1" }),
    );
  });

  it("returns captured:false without writing an event when there is no prediction to freeze", async () => {
    freezePredictionForProgram.mockResolvedValue({
      ok: false,
      status: 409,
      error: "no primary assessment to anchor the prediction",
    });
    const res = await captureApplication(db, "u1", "prog1");
    expect(res).toEqual({
      captured: false,
      reason: "no primary assessment to anchor the prediction",
    });
    expect(insertEvent).not.toHaveBeenCalled();
  });
});
