import { describe, it, expect } from "vitest";
import {
  PredictionInputSchema,
  AttemptInputSchema,
  EventInputSchema,
} from "@/lib/validation/outcomes";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("PredictionInputSchema (F16: client names the program, never the verdict; assessment derived server-side)", () => {
  it("accepts a program reference (assessment_id is derived server-side, not the body)", () => {
    const r = PredictionInputSchema.safeParse({ programId: "usyd-mit" });
    expect(r.success).toBe(true);
  });

  it("strips client verdict / snapshot / rule_version AND any assessmentId (server recomputes + derives)", () => {
    const r = PredictionInputSchema.safeParse({
      programId: "usyd-mit",
      assessmentId: UUID,
      verdict: "strong",
      scoreSnapshot: { gradeGap: 0 },
      ruleVersion: "v9.9.9",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("verdict" in r.data).toBe(false);
      expect("scoreSnapshot" in r.data).toBe(false);
      expect("ruleVersion" in r.data).toBe(false);
      expect("assessmentId" in r.data).toBe(false);
    }
  });

  it("rejects a blank program id", () => {
    expect(PredictionInputSchema.safeParse({ programId: "" }).success).toBe(false);
  });
});

describe("AttemptInputSchema", () => {
  it("accepts a prediction reference with optional institution/intake/ref", () => {
    expect(AttemptInputSchema.safeParse({ predictionId: UUID }).success).toBe(true);
    expect(
      AttemptInputSchema.safeParse({
        predictionId: UUID,
        institutionId: "usyd",
        intake: "2027-02",
        externalRef: "APP-123",
      }).success,
    ).toBe(true);
  });

  it("rejects a missing/invalid prediction id", () => {
    expect(AttemptInputSchema.safeParse({}).success).toBe(false);
    expect(AttemptInputSchema.safeParse({ predictionId: "nope" }).success).toBe(false);
  });
});

describe("EventInputSchema", () => {
  it("accepts a neutral event without a reason code", () => {
    const r = EventInputSchema.safeParse({
      attemptId: UUID2,
      eventType: "offer_received",
      occurredAt: "2026-06-20T10:00:00Z",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a refusal with a gate-appropriate reason code", () => {
    expect(
      EventInputSchema.safeParse({
        attemptId: UUID2,
        eventType: "visa_refused",
        occurredAt: "2026-06-20T10:00:00Z",
        reasonCode: "gs_intent",
      }).success,
    ).toBe(true);
    expect(
      EventInputSchema.safeParse({
        attemptId: UUID2,
        eventType: "application_rejected",
        occurredAt: "2026-06-20T10:00:00Z",
        reasonCode: "academic_below_threshold",
      }).success,
    ).toBe(true);
  });

  it("rejects a reason code on a non-negative outcome", () => {
    expect(
      EventInputSchema.safeParse({
        attemptId: UUID2,
        eventType: "offer_received",
        occurredAt: "2026-06-20T10:00:00Z",
        reasonCode: "gs_intent",
      }).success,
    ).toBe(false);
  });

  it("rejects a reason code from the wrong gate", () => {
    // an admission reason on a visa refusal
    expect(
      EventInputSchema.safeParse({
        attemptId: UUID2,
        eventType: "visa_refused",
        occurredAt: "2026-06-20T10:00:00Z",
        reasonCode: "academic_below_threshold",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown event type and a bad timestamp", () => {
    expect(
      EventInputSchema.safeParse({ attemptId: UUID2, eventType: "teleported", occurredAt: "2026-06-20T10:00:00Z" }).success,
    ).toBe(false);
    expect(
      EventInputSchema.safeParse({ attemptId: UUID2, eventType: "applied", occurredAt: "not-a-date" }).success,
    ).toBe(false);
  });
});
