import { describe, it, expect } from "vitest";
import { generateChecklist } from "@/lib/checklist/generator";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

const baseProgram: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};
const noKinds = new Set<DocumentKind>();
const keys = (items: ChecklistItem[]) => items.map((i) => i.key);
const byKey = (items: ChecklistItem[], k: string) => items.find((i) => i.key === k);

describe("generateChecklist", () => {
  it("always requires passport + national id (identity, now)", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "passport")).toMatchObject({ kind: "passport", stage: "now", requirement: "required", group: "identity", status: "missing" });
    expect(byKey(items, "national-id")?.requirement).toBe("required");
  });

  it("requires bachelor's transcript for a masters program, not a master's transcript", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "bachelors-transcript")).toMatchObject({ requirement: "required", stage: "now" });
    expect(keys(items)).not.toContain("masters-transcript");
  });

  it("requires +2 and SLC for a bachelors program", () => {
    const items = generateChecklist({ program: { ...baseProgram, level: "bachelors" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "plus-two")?.requirement).toBe("required");
    expect(byKey(items, "slc-see")?.requirement).toBe("required");
    expect(keys(items)).not.toContain("bachelors-transcript");
  });

  it("marks an uploaded kind as have", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: new Set<DocumentKind>(["passport"]) });
    expect(byKey(items, "passport")?.status).toBe("have");
    expect(byKey(items, "national-id")?.status).toBe("missing");
  });

  it("states the program's English requirement and sources it", () => {
    const eng = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "english");
    expect(eng?.requirement).toBe("required");
    expect(eng?.note).toContain("IELTS 6.5");
    expect(eng?.note).toContain("each band ≥ 6");
    expect(eng?.source?.url).toBe("https://example.edu/it");
  });

  it("defaults the English kind to the student's test when known", () => {
    const items = generateChecklist({ program: baseProgram, sections: { english: { test: "pte" } }, uploadedKinds: noKinds });
    expect(byKey(items, "english")?.kind).toBe("pte");
  });

  it("adds nursing deltas: band-7 note + AHPRA info item", () => {
    const items = generateChecklist({ program: { ...baseProgram, field: "nursing" }, sections: {}, uploadedKinds: noKinds });
    expect(byKey(items, "english")?.note).toContain("each band ≥ 7");
    expect(byKey(items, "ahpra")).toMatchObject({ kind: null, status: "info", group: "academic" });
  });

  it("self-funded → bank statement required, no sponsor income", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(keys(items)).not.toContain("fin-sponsor");
  });

  it("parents-family → bank statement + sponsor income required", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "parents-family" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(byKey(items, "fin-sponsor")?.requirement).toBe("required");
  });

  it("education-loan → loan sanction required, bank recommended", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-loan")?.requirement).toBe("required");
    expect(byKey(items, "fin-bank")?.requirement).toBe("recommended");
  });

  it("mixed → bank + loan required, sponsor recommended", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "mixed" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-bank")?.requirement).toBe("required");
    expect(byKey(items, "fin-loan")?.requirement).toBe("required");
    expect(byKey(items, "fin-sponsor")?.requirement).toBe("recommended");
  });

  it("scholarship-dependent → informational award-letter item (kind null)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "scholarship-dependent" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-scholarship")).toMatchObject({ kind: null, status: "info", requirement: "required" });
  });

  it("unknown funding → general proof-of-funds bank item with the DHA figure", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.requirement).toBe("required");
    expect(bank?.note).toMatch(/29[,.]?710/);
  });

  it("attaches the DHA source to the first required financial item only", () => {
    const items = generateChecklist({ program: baseProgram, sections: { finance: { source: "education-loan" } }, uploadedKinds: noKinds });
    expect(byKey(items, "fin-loan")?.source?.url).toContain("immi.homeaffairs.gov.au");
    expect(byKey(items, "fin-bank")?.source).toBeUndefined();
  });

  it("adds the AL3 seasoning note by default; omits it for L2", () => {
    const l3 = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds });
    expect(byKey(l3, "fin-bank")?.note).toContain("Level 3");
    const l2 = generateChecklist({ program: baseProgram, sections: { finance: { source: "self-funded" } }, uploadedKinds: noKinds, nepalAssessmentLevel: "L2" });
    expect(byKey(l2, "fin-bank")?.note).not.toContain("Level 3");
  });

  it("adds employment docs when work title is set", () => {
    const items = generateChecklist({ program: baseProgram, sections: { work: { title: "Analyst" } }, uploadedKinds: noKinds });
    expect(byKey(items, "employment-letter")).toBeTruthy();
    expect(byKey(items, "salary-slip")).toBeTruthy();
  });

  it("adds an employment letter for a study gap even with no job (no salary slip)", () => {
    const items = generateChecklist({ program: baseProgram, sections: { gap: { years: 2 } }, uploadedKinds: noKinds });
    expect(byKey(items, "employment-letter")?.note).toContain("study gap");
    expect(keys(items)).not.toContain("salary-slip");
  });

  it("omits employment docs when neither work nor gap applies", () => {
    expect(keys(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }))).not.toContain("employment-letter");
  });

  it("places all visa documents in the after-offer stage, required", () => {
    const items = generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds });
    for (const k of ["offer-letter", "coe", "oshc", "medical"]) {
      expect(byKey(items, k)?.stage).toBe("after-offer");
      expect(byKey(items, k)?.requirement).toBe("required");
    }
  });

  it("sources the CoE item from DHA and states you need it for the visa", () => {
    const coe = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "coe");
    expect(coe?.note).toContain("student visa application");
    expect(coe?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("enriches the OSHC item with start timing + full duration and sources it", () => {
    const oshc = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "oshc");
    expect(oshc?.note).toContain("at least a week");
    expect(oshc?.note?.toLowerCase()).toContain("full");
    expect(oshc?.source?.url).toContain("immi.homeaffairs.gov.au");
  });

  it("states travel in the financial coverage note (still names the DHA figure)", () => {
    const bank = byKey(generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: noKinds }), "fin-bank");
    expect(bank?.note?.toLowerCase()).toContain("travel");
    expect(bank?.note).toMatch(/29[,.]?710/);
  });
});
