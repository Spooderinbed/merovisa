import { describe, it, expect } from "vitest";
import {
  eventGate,
  eventDecisionAuthority,
  isNegativeOutcome,
} from "@/lib/outcomes/events";
import { EVENT_TYPES } from "@/lib/outcomes/types";

describe("eventGate", () => {
  it("assigns admission-side events to the admission gate", () => {
    expect(eventGate("offer_received")).toBe("admission");
    expect(eventGate("conditional_offer")).toBe("admission");
    expect(eventGate("application_rejected")).toBe("admission");
    expect(eventGate("offer_accepted")).toBe("admission");
    expect(eventGate("coe_issued")).toBe("admission");
  });

  it("assigns visa-side events to the visa gate", () => {
    expect(eventGate("visa_lodged")).toBe("visa");
    expect(eventGate("visa_granted")).toBe("visa");
    expect(eventGate("visa_refused")).toBe("visa");
  });

  it("leaves neutral steps with no gate (null)", () => {
    expect(eventGate("applied")).toBeNull();
    expect(eventGate("enrolled")).toBeNull();
    expect(eventGate("withdrawn")).toBeNull();
  });

  it("returns a value for every event type", () => {
    for (const t of EVENT_TYPES) {
      const g = eventGate(t);
      expect(g === null || g === "admission" || g === "visa").toBe(true);
    }
  });
});

describe("eventDecisionAuthority", () => {
  it("attributes the decision to the institution for admission outcomes", () => {
    expect(eventDecisionAuthority("offer_received")).toBe("institution");
    expect(eventDecisionAuthority("conditional_offer")).toBe("institution");
    expect(eventDecisionAuthority("application_rejected")).toBe("institution");
    expect(eventDecisionAuthority("coe_issued")).toBe("institution");
  });

  it("attributes visa decisions to DHA", () => {
    expect(eventDecisionAuthority("visa_granted")).toBe("dha");
    expect(eventDecisionAuthority("visa_refused")).toBe("dha");
  });

  it("attributes student-driven steps to the student", () => {
    expect(eventDecisionAuthority("applied")).toBe("student");
    expect(eventDecisionAuthority("offer_accepted")).toBe("student");
    expect(eventDecisionAuthority("visa_lodged")).toBe("student");
    expect(eventDecisionAuthority("withdrawn")).toBe("student");
  });

  it("returns a defined authority for every event type", () => {
    for (const t of EVENT_TYPES) {
      expect(eventDecisionAuthority(t)).toBeTruthy();
    }
  });
});

describe("isNegativeOutcome", () => {
  it("is true only for rejections and refusals", () => {
    expect(isNegativeOutcome("application_rejected")).toBe(true);
    expect(isNegativeOutcome("visa_refused")).toBe(true);
  });

  it("is false for neutral and positive events", () => {
    expect(isNegativeOutcome("applied")).toBe(false);
    expect(isNegativeOutcome("offer_received")).toBe(false);
    expect(isNegativeOutcome("visa_granted")).toBe(false);
    expect(isNegativeOutcome("withdrawn")).toBe(false);
  });
});
