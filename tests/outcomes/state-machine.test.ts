import { describe, it, expect } from "vitest";
import { canRecordEvent, selfReportNextEvents } from "@/lib/outcomes/state-machine";
import type { EventType } from "@/lib/outcomes/types";

const APPLIED: EventType[] = ["applied"];
const THROUGH_OFFER: EventType[] = ["applied", "offer_received"];
const THROUGH_ACCEPT: EventType[] = ["applied", "offer_received", "offer_accepted"];
const THROUGH_COE: EventType[] = [...THROUGH_ACCEPT, "coe_issued"];
const THROUGH_LODGE: EventType[] = [...THROUGH_COE, "visa_lodged"];

describe("canRecordEvent — root", () => {
  it("allows 'applied' as the first event", () => {
    expect(canRecordEvent([], "applied").ok).toBe(true);
  });

  it("rejects a duplicate 'applied'", () => {
    expect(canRecordEvent(APPLIED, "applied").ok).toBe(false);
  });

  it("rejects any non-root event before 'applied'", () => {
    expect(canRecordEvent([], "offer_received").ok).toBe(false);
    // the canonical illegal ordering: a visa grant before the student even applied
    expect(canRecordEvent([], "visa_granted").ok).toBe(false);
  });
});

describe("canRecordEvent — admission chain", () => {
  it("allows an offer / conditional offer / rejection once applied", () => {
    expect(canRecordEvent(APPLIED, "offer_received").ok).toBe(true);
    expect(canRecordEvent(APPLIED, "conditional_offer").ok).toBe(true);
    expect(canRecordEvent(APPLIED, "application_rejected").ok).toBe(true);
  });

  it("requires an offer before it can be accepted", () => {
    expect(canRecordEvent(APPLIED, "offer_accepted").ok).toBe(false);
    expect(canRecordEvent(THROUGH_OFFER, "offer_accepted").ok).toBe(true);
  });

  it("requires an accepted offer before a CoE is issued", () => {
    expect(canRecordEvent(APPLIED, "coe_issued").ok).toBe(false);
    expect(canRecordEvent(THROUGH_ACCEPT, "coe_issued").ok).toBe(true);
  });

  it("rejects conflicting admission terminals (offer vs rejection)", () => {
    expect(canRecordEvent(THROUGH_OFFER, "application_rejected").ok).toBe(false);
    expect(canRecordEvent(["applied", "application_rejected"], "offer_received").ok).toBe(false);
  });
});

describe("canRecordEvent — visa chain", () => {
  it("requires a CoE before a visa can be lodged", () => {
    expect(canRecordEvent(THROUGH_ACCEPT, "visa_lodged").ok).toBe(false);
    expect(canRecordEvent(THROUGH_COE, "visa_lodged").ok).toBe(true);
  });

  it("requires a lodged visa before a grant or refusal", () => {
    expect(canRecordEvent(THROUGH_COE, "visa_granted").ok).toBe(false);
    expect(canRecordEvent(THROUGH_LODGE, "visa_granted").ok).toBe(true);
    expect(canRecordEvent(THROUGH_LODGE, "visa_refused").ok).toBe(true);
  });

  it("rejects conflicting visa terminals (grant vs refusal)", () => {
    expect(canRecordEvent([...THROUGH_LODGE, "visa_refused"], "visa_granted").ok).toBe(false);
    expect(canRecordEvent([...THROUGH_LODGE, "visa_granted"], "visa_refused").ok).toBe(false);
  });

  it("requires a granted visa before enrolment", () => {
    expect(canRecordEvent(THROUGH_LODGE, "enrolled").ok).toBe(false);
    expect(canRecordEvent([...THROUGH_LODGE, "visa_granted"], "enrolled").ok).toBe(true);
  });
});

describe("canRecordEvent — withdrawal", () => {
  it("can withdraw any time after applying", () => {
    expect(canRecordEvent(APPLIED, "withdrawn").ok).toBe(true);
    expect(canRecordEvent(THROUGH_COE, "withdrawn").ok).toBe(true);
  });

  it("cannot withdraw before applying", () => {
    expect(canRecordEvent([], "withdrawn").ok).toBe(false);
  });
});

describe("canRecordEvent — rejection carries a reason", () => {
  it("returns a human-readable reason when illegal", () => {
    const r = canRecordEvent([], "visa_granted");
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe("string");
    expect(r.reason!.length).toBeGreaterThan(0);
  });
});

describe("selfReportNextEvents — what a student can report next", () => {
  it("offers the offer/rejection fork after applying (not the visa chain yet)", () => {
    expect(selfReportNextEvents(APPLIED)).toEqual(["offer_received", "application_rejected"]);
  });

  it("offers only accepting the offer once one is received (rejection is no longer legal)", () => {
    expect(selfReportNextEvents(THROUGH_OFFER)).toEqual(["offer_accepted"]);
  });

  it("walks the admission chain one legal step at a time", () => {
    expect(selfReportNextEvents(THROUGH_ACCEPT)).toEqual(["coe_issued"]);
    expect(selfReportNextEvents(THROUGH_COE)).toEqual(["visa_lodged"]);
  });

  it("offers both visa decisions once the visa is lodged", () => {
    expect(selfReportNextEvents(THROUGH_LODGE)).toEqual(["visa_granted", "visa_refused"]);
  });

  it("offers enrolment after a granted visa", () => {
    expect(selfReportNextEvents([...THROUGH_LODGE, "visa_granted"])).toEqual(["enrolled"]);
  });

  it("offers nothing at a terminal outcome", () => {
    expect(selfReportNextEvents(["applied", "application_rejected"])).toEqual([]);
    expect(selfReportNextEvents([...THROUGH_LODGE, "visa_refused"])).toEqual([]);
    expect(selfReportNextEvents([...THROUGH_LODGE, "visa_granted", "enrolled"])).toEqual([]);
  });

  it("never includes the root 'applied' or a quiet 'withdrawn' in the self-report buttons", () => {
    const all = [
      ...selfReportNextEvents(APPLIED),
      ...selfReportNextEvents(THROUGH_OFFER),
      ...selfReportNextEvents(THROUGH_LODGE),
    ];
    expect(all).not.toContain("applied");
    expect(all).not.toContain("withdrawn");
  });

  it("offers nothing before the application is even recorded (defensive)", () => {
    expect(selfReportNextEvents([])).toEqual([]);
  });
});
