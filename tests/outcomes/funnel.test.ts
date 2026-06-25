import { describe, it, expect } from "vitest";
import { deriveFunnelStage, buildOutcomeFunnel } from "@/lib/outcomes/funnel";
import type { EventType } from "@/lib/outcomes/types";
import type { PredictionRow, AttemptRow, EventRow } from "@/lib/outcomes/repo";

const ev = (attemptId: string, eventType: EventType, occurredAt: string): EventRow => ({
  id: `e-${eventType}-${attemptId}`,
  owner: "u1",
  attemptId,
  eventType,
  gate: null,
  reasonCode: null,
  decisionAuthority: null,
  occurredAt,
  occurredOn: null,
  source: "self_reported",
  detail: {},
  recordedAt: occurredAt,
});

const prediction = (id: string, programId: string, verdict: string): PredictionRow => ({
  id,
  owner: "u1",
  assessmentId: "a1",
  programId,
  verdict,
  ruleVersion: "v0.5.0",
  scoreSnapshot: {},
  predictedAt: "2026-01-01T00:00:00Z",
});

const attempt = (id: string, predictionId: string, programId: string): AttemptRow => ({
  id,
  owner: "u1",
  predictionId,
  programId,
  institutionId: null,
  intake: "2026-02",
  externalRef: null,
  createdAt: "2026-01-02T00:00:00Z",
});

describe("deriveFunnelStage", () => {
  const cases: Array<[string, EventType[], string]> = [
    ["root applied only", ["applied"], "applied"],
    ["offer received", ["applied", "offer_received"], "offer"],
    ["conditional offer counts as offer", ["applied", "conditional_offer"], "offer"],
    ["rejection", ["applied", "application_rejected"], "rejected"],
    ["accepted offer", ["applied", "offer_received", "offer_accepted"], "accepted"],
    ["coe is still 'accepted' tier", ["applied", "offer_received", "offer_accepted", "coe_issued"], "accepted"],
    [
      "visa lodged",
      ["applied", "offer_received", "offer_accepted", "coe_issued", "visa_lodged"],
      "visa_lodged",
    ],
    [
      "visa granted",
      ["applied", "offer_received", "offer_accepted", "coe_issued", "visa_lodged", "visa_granted"],
      "visa_granted",
    ],
    [
      "visa refused outranks the accepted milestones it implies",
      ["applied", "offer_received", "offer_accepted", "coe_issued", "visa_lodged", "visa_refused"],
      "visa_refused",
    ],
    [
      "enrolled is the terminal positive",
      ["applied", "offer_received", "offer_accepted", "coe_issued", "visa_lodged", "visa_granted", "enrolled"],
      "enrolled",
    ],
    ["withdrawn is terminal even with an offer", ["applied", "offer_received", "withdrawn"], "withdrawn"],
    ["defensive: no events falls back to applied", [], "applied"],
  ];
  it.each(cases)("%s", (_label, events, expected) => {
    expect(deriveFunnelStage(events)).toBe(expected);
  });
});

describe("buildOutcomeFunnel", () => {
  const programLookup = new Map([
    ["prog-1", { programName: "Master of IT", universityName: "RMIT University" }],
    ["prog-2", { programName: "Master of Data Science", universityName: "Deakin University" }],
  ]);

  it("joins attempt → prediction (verdict) + program name, derives stage, sorts by recency", () => {
    const predictions = [prediction("pred-1", "prog-1", "strong"), prediction("pred-2", "prog-2", "possible")];
    const attempts = [attempt("att-1", "pred-1", "prog-1"), attempt("att-2", "pred-2", "prog-2")];
    const events = [
      ev("att-1", "applied", "2026-01-03T00:00:00Z"),
      ev("att-2", "applied", "2026-01-05T00:00:00Z"),
      ev("att-2", "offer_received", "2026-01-09T00:00:00Z"),
    ];

    const rows = buildOutcomeFunnel({ predictions, attempts, events, programLookup });

    expect(rows).toHaveLength(2);
    // att-2 updated more recently (offer on Jan 9) → first
    expect(rows[0]).toMatchObject({
      attemptId: "att-2",
      programName: "Master of Data Science",
      universityName: "Deakin University",
      verdict: "possible",
      stage: "offer",
      intake: "2026-02",
      lastUpdated: "2026-01-09T00:00:00Z",
    });
    expect(rows[1]).toMatchObject({
      attemptId: "att-1",
      programName: "Master of IT",
      verdict: "strong",
      stage: "applied",
      lastUpdated: "2026-01-03T00:00:00Z",
    });
  });

  it("attaches the legal next self-report milestones to each row", () => {
    const predictions = [prediction("pred-1", "prog-1", "strong"), prediction("pred-2", "prog-2", "possible")];
    const attempts = [attempt("att-1", "pred-1", "prog-1"), attempt("att-2", "pred-2", "prog-2")];
    const events = [
      ev("att-1", "applied", "2026-01-03T00:00:00Z"),
      ev("att-2", "applied", "2026-01-05T00:00:00Z"),
      ev("att-2", "offer_received", "2026-01-09T00:00:00Z"),
    ];

    const rows = buildOutcomeFunnel({ predictions, attempts, events, programLookup });
    const byId = new Map(rows.map((r) => [r.attemptId, r]));

    // applied-only → the offer/rejection fork; offer received → only accept it next.
    expect(byId.get("att-1")!.nextEvents).toEqual(["offer_received", "application_rejected"]);
    expect(byId.get("att-2")!.nextEvents).toEqual(["offer_accepted"]);
  });

  it("falls back gracefully when the program is not in the lookup", () => {
    const predictions = [prediction("pred-9", "prog-unknown", "reach")];
    const attempts = [attempt("att-9", "pred-9", "prog-unknown")];
    const events = [ev("att-9", "applied", "2026-01-03T00:00:00Z")];

    const rows = buildOutcomeFunnel({ predictions, attempts, events, programLookup });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.programName).toBe("Your program");
    expect(rows[0]!.universityName).toBeNull();
    expect(rows[0]!.verdict).toBe("reach");
  });

  it("ignores an attempt with no matching prediction (defensive)", () => {
    const attempts = [attempt("att-x", "pred-missing", "prog-1")];
    const events = [ev("att-x", "applied", "2026-01-03T00:00:00Z")];

    const rows = buildOutcomeFunnel({ predictions: [], attempts, events, programLookup });

    expect(rows).toHaveLength(0);
  });
});
