import { describe, it, expect } from "vitest";
import { computeReadiness } from "@/lib/checklist/readiness";
import { generateChecklist } from "@/lib/checklist/generator";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

// Minimal item builder — defaults to a required now-stage pure-info row; override per case.
const item = (over: Partial<ChecklistItem> & Pick<ChecklistItem, "key">): ChecklistItem => ({
  kind: null,
  label: "x",
  group: "identity",
  stage: "now",
  requirement: "required",
  status: "info",
  ...over,
});

describe("computeReadiness", () => {
  it("counts required vault rows by stage; 'have' and 'obtained' are ready, 'missing' is not", () => {
    const items = [
      item({ key: "a", kind: "passport", stage: "now", status: "have" }),
      item({ key: "b", kind: "national-id", stage: "now", status: "obtained" }),
      item({ key: "c", kind: "bachelors-transcript", stage: "now", status: "missing" }),
      item({ key: "d", kind: "coe", stage: "after-offer", status: "missing" }),
    ];
    const r = computeReadiness(items);
    expect(r.now).toEqual({ ready: 2, total: 3 });
    expect(r.afterOffer).toEqual({ ready: 0, total: 1 });
  });

  it("excludes recommended items from the rollup entirely", () => {
    const items = [
      item({ key: "req", kind: "passport", status: "have" }),
      item({ key: "rec", kind: "birth-certificate", requirement: "recommended", status: "have" }),
    ];
    expect(computeReadiness(items).now).toEqual({ ready: 1, total: 1 });
  });

  it("excludes pure-info rows (kind null, not plan-linked) even when required — they are uncompletable", () => {
    const items = [
      item({ key: "fin-nrb-remittance", status: "info" }), // required info, no plan link
      item({ key: "passport", kind: "passport", status: "missing" }),
    ];
    expect(computeReadiness(items).now).toEqual({ ready: 0, total: 1 });
  });

  it("counts plan-mirrored required rows; ready only when the linked plan state is 'done'", () => {
    const items = [item({ key: "doc-preparation", infoKind: "note" })]; // in CHECKLIST_PLAN_LINKS
    expect(computeReadiness(items, {}).now).toEqual({ ready: 0, total: 1 });
    expect(computeReadiness(items, { "doc-preparation": "open" }).now).toEqual({ ready: 0, total: 1 });
    expect(computeReadiness(items, { "doc-preparation": "in-progress" }).now).toEqual({ ready: 0, total: 1 });
    expect(computeReadiness(items, { "doc-preparation": "done" }).now).toEqual({ ready: 1, total: 1 });
  });

  it("readyToApplyNow is true only when every now-stage required completable item is done", () => {
    const done = [item({ key: "passport", kind: "passport", status: "have" })];
    expect(computeReadiness(done).readyToApplyNow).toBe(true);

    const oneMissing = [
      ...done,
      item({ key: "coe", kind: "coe", stage: "now", status: "missing" }),
    ];
    expect(computeReadiness(oneMissing).readyToApplyNow).toBe(false);
  });

  it("readyToApplyNow is false when there are no completable now-stage required items", () => {
    const items = [item({ key: "coe", kind: "coe", stage: "after-offer", status: "missing" })];
    const r = computeReadiness(items);
    expect(r.now).toEqual({ ready: 0, total: 0 });
    expect(r.readyToApplyNow).toBe(false);
  });

  it("derives an honest denominator from a real generated checklist (drops the one uncompletable required info row)", () => {
    const program: Program = {
      id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
      field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
      minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
      source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
    };
    const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });
    const r = computeReadiness(items);

    const requiredNow = items.filter((i) => i.stage === "now" && i.requirement === "required");
    const requiredAfter = items.filter((i) => i.stage === "after-offer" && i.requirement === "required");
    // fin-nrb-remittance is required but pure-info (no vault binding, no plan link) → not completable.
    expect(requiredNow.some((i) => i.key === "fin-nrb-remittance")).toBe(true);
    expect(r.now.total).toBe(requiredNow.length - 1); // exactly that one row dropped
    expect(r.afterOffer.total).toBe(requiredAfter.length); // every after-offer required row is completable
    expect(r.now.ready).toBe(0);
    expect(r.afterOffer.ready).toBe(0);
    expect(r.readyToApplyNow).toBe(false);
  });
});
