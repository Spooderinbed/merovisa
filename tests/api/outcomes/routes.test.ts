import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getUser,
  freezePredictionForProgram,
  getPredictionById,
  insertAttempt,
  getAttemptById,
  listEventTypesForAttempt,
  insertEvent,
  getOutcomesForCase,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  freezePredictionForProgram: vi.fn(),
  getPredictionById: vi.fn(),
  insertAttempt: vi.fn(),
  getAttemptById: vi.fn(),
  listEventTypesForAttempt: vi.fn(),
  insertEvent: vi.fn(),
  getOutcomesForCase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/outcomes/freeze", () => ({ freezePredictionForProgram }));
vi.mock("@/lib/outcomes/repo", () => ({
  getPredictionById,
  insertAttempt,
  getAttemptById,
  listEventTypesForAttempt,
  insertEvent,
  getOutcomesForCase,
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

import { POST as predictionPOST } from "@/app/api/outcomes/prediction/route";
import { POST as attemptPOST } from "@/app/api/outcomes/attempt/route";
import { POST as eventPOST } from "@/app/api/outcomes/event/route";
import { GET as outcomesGET } from "@/app/api/outcomes/route";

const UUID = "11111111-1111-4111-8111-111111111111";
const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const signedIn = () => getUser.mockResolvedValue({ data: { user: { id: "owner1" } } });
const signedOut = () => getUser.mockResolvedValue({ data: { user: null } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/outcomes/prediction (F16 freeze)", () => {
  it("401s when signed out", async () => {
    signedOut();
    expect((await predictionPOST(post("http://x/api/outcomes/prediction", { programId: "p1" }))).status).toBe(401);
  });

  it("422s on an invalid body", async () => {
    signedIn();
    expect((await predictionPOST(post("http://x/api/outcomes/prediction", { programId: "" }))).status).toBe(422);
    expect(freezePredictionForProgram).not.toHaveBeenCalled();
  });

  it("400s on invalid JSON", async () => {
    signedIn();
    const req = new Request("http://x/api/outcomes/prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect((await predictionPOST(req)).status).toBe(400);
  });

  it("201s on a fresh freeze, deriving owner from the session", async () => {
    signedIn();
    freezePredictionForProgram.mockResolvedValue({ ok: true, prediction: { id: "pred1" }, created: true });
    const res = await predictionPOST(post("http://x/api/outcomes/prediction", { programId: "p1" }));
    expect(res.status).toBe(201);
    expect(freezePredictionForProgram).toHaveBeenCalledWith(expect.anything(), "case-1", "p1");
  });

  it("200s on an idempotent re-freeze (created: false)", async () => {
    signedIn();
    freezePredictionForProgram.mockResolvedValue({ ok: true, prediction: { id: "pred1" }, created: false });
    expect((await predictionPOST(post("http://x/api/outcomes/prediction", { programId: "p1" }))).status).toBe(200);
  });

  it("passes through the freeze failure status (409 no assessment)", async () => {
    signedIn();
    freezePredictionForProgram.mockResolvedValue({ ok: false, status: 409, error: "no primary assessment" });
    expect((await predictionPOST(post("http://x/api/outcomes/prediction", { programId: "p1" }))).status).toBe(409);
  });
});

describe("POST /api/outcomes/attempt", () => {
  it("401s when signed out", async () => {
    signedOut();
    expect((await attemptPOST(post("http://x/api/outcomes/attempt", { predictionId: UUID }))).status).toBe(401);
  });

  it("422s on a missing prediction id", async () => {
    signedIn();
    expect((await attemptPOST(post("http://x/api/outcomes/attempt", {}))).status).toBe(422);
  });

  it("404s when the prediction is unknown / not owned", async () => {
    signedIn();
    getPredictionById.mockResolvedValue(null);
    expect((await attemptPOST(post("http://x/api/outcomes/attempt", { predictionId: UUID }))).status).toBe(404);
  });

  it("201s and takes program_id from the prediction, not the client", async () => {
    signedIn();
    getPredictionById.mockResolvedValue({ id: UUID, programId: "p1", owner: "owner1" });
    insertAttempt.mockResolvedValue({ id: "att1", programId: "p1" });
    const res = await attemptPOST(post("http://x/api/outcomes/attempt", { predictionId: UUID, intake: "2027-02" }));
    expect(res.status).toBe(201);
    expect(insertAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ caseId: "case-1", predictionId: UUID, programId: "p1", intake: "2027-02" }),
    );
  });
});

describe("POST /api/outcomes/event", () => {
  it("401s when signed out", async () => {
    signedOut();
    expect(
      (await eventPOST(post("http://x/api/outcomes/event", { attemptId: UUID, eventType: "applied", occurredAt: "2026-06-20T10:00:00Z" }))).status,
    ).toBe(401);
  });

  it("422s on a reason code that does not belong to the gate", async () => {
    signedIn();
    const res = await eventPOST(
      post("http://x/api/outcomes/event", {
        attemptId: UUID,
        eventType: "visa_refused",
        occurredAt: "2026-06-20T10:00:00Z",
        reasonCode: "academic_below_threshold", // admission code on a visa refusal
      }),
    );
    expect(res.status).toBe(422);
  });

  it("404s when the attempt is unknown", async () => {
    signedIn();
    getAttemptById.mockResolvedValue(null);
    const res = await eventPOST(
      post("http://x/api/outcomes/event", { attemptId: UUID, eventType: "applied", occurredAt: "2026-06-20T10:00:00Z" }),
    );
    expect(res.status).toBe(404);
  });

  it("409s on an illegal transition (visa grant before applying)", async () => {
    signedIn();
    getAttemptById.mockResolvedValue({ id: UUID, owner: "owner1" });
    listEventTypesForAttempt.mockResolvedValue([]);
    const res = await eventPOST(
      post("http://x/api/outcomes/event", { attemptId: UUID, eventType: "visa_granted", occurredAt: "2026-06-20T10:00:00Z" }),
    );
    expect(res.status).toBe(409);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("201s and derives gate + decision authority + self_reported source server-side", async () => {
    signedIn();
    getAttemptById.mockResolvedValue({ id: UUID, owner: "owner1" });
    listEventTypesForAttempt.mockResolvedValue(["applied"]);
    insertEvent.mockResolvedValue({ id: "ev1", eventType: "offer_received" });
    const res = await eventPOST(
      post("http://x/api/outcomes/event", { attemptId: UUID, eventType: "offer_received", occurredAt: "2026-06-20T10:00:00Z" }),
    );
    expect(res.status).toBe(201);
    expect(insertEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseId: "case-1",
        attemptId: UUID,
        eventType: "offer_received",
        gate: "admission",
        decisionAuthority: "institution",
        source: "self_reported",
      }),
    );
  });
});

describe("GET /api/outcomes", () => {
  it("401s when signed out", async () => {
    signedOut();
    expect((await outcomesGET()).status).toBe(401);
  });

  it("returns the user's predictions/attempts/events", async () => {
    signedIn();
    getOutcomesForCase.mockResolvedValue({ predictions: [{ id: "pred1" }], attempts: [], events: [] });
    const res = await outcomesGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.predictions).toHaveLength(1);
    expect(getOutcomesForCase).toHaveBeenCalledWith(expect.anything(), "case-1");
  });
});
