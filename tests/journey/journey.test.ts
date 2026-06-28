import { describe, it, expect } from "vitest";
import { buildJourney, deriveJourneySignals, type Journey, type JourneyKey, type JourneySignals } from "@/lib/journey/journey";

const base: JourneySignals = {
  hasAssessment: true,
  profilePct: 0,
  shortlistCount: 0,
  planEngaged: false,
  documentCount: 0,
  applyAttempted: false,
  applyGranted: false,
};
const get = (j: Journey, key: JourneyKey) => j.stages.find((s) => s.key === key)!;

describe("buildJourney — stage status (real signals only, never over-claim)", () => {
  it("orders the six stages Assessed → Profile → Matches → Plan → Documents → Apply", () => {
    const keys = buildJourney(base).stages.map((s) => s.key);
    expect(keys).toEqual(["assessed", "profile", "matches", "plan", "documents", "apply"]);
  });
  it("marks Assessed done when a scored assessment exists, todo otherwise", () => {
    expect(get(buildJourney({ ...base, hasAssessment: true }), "assessed").status).toBe("done");
    expect(get(buildJourney({ ...base, hasAssessment: false }), "assessed").status).toBe("todo");
  });
  it("bands Profile by completeness — done at 100, in-progress 1–99, todo at 0", () => {
    expect(get(buildJourney({ ...base, profilePct: 100 }), "profile").status).toBe("done");
    expect(get(buildJourney({ ...base, profilePct: 40 }), "profile").status).toBe("in-progress");
    expect(get(buildJourney({ ...base, profilePct: 0 }), "profile").status).toBe("todo");
  });
  it("marks Matches done only when ≥1 program is shortlisted, with the word 'shortlisted' (never 'done')", () => {
    const done = get(buildJourney({ ...base, shortlistCount: 2 }), "matches");
    expect(done.status).toBe("done");
    expect(done.word).toBe("shortlisted");
    expect(get(buildJourney({ ...base, shortlistCount: 0 }), "matches").status).toBe("todo");
  });
  it("never marks Plan or Documents 'done' — only in-progress on real engagement", () => {
    const j = buildJourney({ ...base, planEngaged: true, documentCount: 3 });
    expect(get(j, "plan").status).toBe("in-progress");
    expect(get(j, "documents").status).toBe("in-progress");
    // Even fully maxed, the cheap global signals must not read "done".
    const maxed = buildJourney({ ...base, profilePct: 100, planEngaged: true, documentCount: 9, applyGranted: true });
    expect(get(maxed, "plan").status).not.toBe("done");
    expect(get(maxed, "documents").status).not.toBe("done");
  });
  it("marks Apply done only on a granted outcome (word 'granted'); in-progress on an attempt", () => {
    const granted = get(buildJourney({ ...base, applyGranted: true }), "apply");
    expect(granted.status).toBe("done");
    expect(granted.word).toBe("granted");
    expect(get(buildJourney({ ...base, applyAttempted: true }), "apply").status).toBe("in-progress");
    expect(get(buildJourney({ ...base, applyAttempted: false }), "apply").status).toBe("todo");
  });
});

describe("buildJourney — 'you are here' frontier", () => {
  it("returns exactly one current node", () => {
    expect(buildJourney({ ...base, profilePct: 50 }).stages.filter((s) => s.current).length).toBe(1);
  });
  it("points a fresh signed-in user (only Assessed done) at Profile as 'next'", () => {
    const j = buildJourney(base);
    expect(get(j, "assessed").current).toBe(false);
    const profile = get(j, "profile");
    expect(profile.current).toBe(true);
    expect(profile.word).toBe("next");
  });
  it("sits current on the furthest reached stage when it is in-progress", () => {
    // assessed done, profile done, matches todo, plan in-progress → frontier = plan
    const j = buildJourney({ ...base, profilePct: 100, planEngaged: true });
    expect(get(j, "plan").current).toBe(true);
  });
  it("keeps a stage skipped behind the frontier visibly upcoming (honest gap)", () => {
    // documents uploaded but matches never shortlisted
    const j = buildJourney({ ...base, profilePct: 100, documentCount: 2 });
    expect(get(j, "documents").current).toBe(true);
    const matches = get(j, "matches");
    expect(matches.status).toBe("todo");
    expect(matches.current).toBe(false);
    expect(matches.word).toBe("upcoming");
  });
  it("rests current on Apply when the journey is complete (granted)", () => {
    const j = buildJourney({ ...base, profilePct: 100, shortlistCount: 1, planEngaged: true, documentCount: 1, applyAttempted: true, applyGranted: true });
    expect(get(j, "apply").current).toBe(true);
    expect(get(j, "apply").word).toBe("granted");
  });
});

describe("buildJourney — accessibility summary", () => {
  it("names every stage's word-state in order", () => {
    expect(buildJourney(base).ariaLabel).toBe(
      "Your journey — Assessed: assessed; Profile: next; Matches: upcoming; Plan: upcoming; Documents: upcoming; Apply: upcoming.",
    );
  });
});

describe("deriveJourneySignals — honest signal derivation from repo data", () => {
  const raw = {
    hasAssessment: true,
    profilePct: 0,
    shortlistCount: 0,
    planItems: [] as ReadonlyArray<{ startedAt: string | null; status: string }>,
    documentCount: 0,
    attemptCount: 0,
    events: [] as ReadonlyArray<import("@/lib/outcomes/types").EventType>,
  };
  it("treats a plan as engaged when any item is started OR completed (Codex #3: a finished plan still counts)", () => {
    expect(deriveJourneySignals({ ...raw, planItems: [{ startedAt: null, status: "done" }] }).planEngaged).toBe(true);
    expect(deriveJourneySignals({ ...raw, planItems: [{ startedAt: "2026-06-01T00:00:00Z", status: "todo" }] }).planEngaged).toBe(true);
  });
  it("does not treat a freshly generated, untouched (or only-dismissed) plan as engaged", () => {
    expect(
      deriveJourneySignals({ ...raw, planItems: [{ startedAt: null, status: "todo" }, { startedAt: null, status: "dismissed" }] }).planEngaged,
    ).toBe(false);
  });
  it("derives applyGranted from a visa_granted or enrolled event, but not from a lodged-only attempt", () => {
    expect(deriveJourneySignals({ ...raw, attemptCount: 1, events: ["applied", "visa_granted"] }).applyGranted).toBe(true);
    expect(deriveJourneySignals({ ...raw, attemptCount: 1, events: ["enrolled"] }).applyGranted).toBe(true);
    expect(deriveJourneySignals({ ...raw, attemptCount: 1, events: ["applied", "visa_lodged"] }).applyGranted).toBe(false);
  });
  it("derives applyAttempted from the attempt count", () => {
    expect(deriveJourneySignals({ ...raw, attemptCount: 2 }).applyAttempted).toBe(true);
    expect(deriveJourneySignals({ ...raw, attemptCount: 0 }).applyAttempted).toBe(false);
  });
});
