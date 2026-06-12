import { describe, it, expect } from "vitest";
import { CHECKLIST_PLAN_LINKS, planStatesForChecklist } from "@/lib/checklist/plan-links";
import { VISA_PREP_KINDS } from "@/lib/plan/phases";
import { generateChecklist } from "@/lib/checklist/generator";
import type { PlanItemRow } from "@/lib/plan/types";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

const program: Program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};

let nextId = 1;
const row = (kind: string, status: PlanItemRow["status"], extra?: Partial<PlanItemRow>): PlanItemRow => ({
  id: nextId++, owner: "u1", kind, impact: "medium", title: "t", body: null,
  liftEstimate: null, timeEstimate: null, status, createdAt: "2026-06-01T00:00:00Z",
  completedAt: null, startedAt: null, ...extra,
});

describe("CHECKLIST_PLAN_LINKS", () => {
  const items = generateChecklist({ program, sections: {}, uploadedKinds: new Set<DocumentKind>() });

  it("maps only checklist keys the generator actually emits", () => {
    const keys = new Set(items.map((i) => i.key));
    for (const checklistKey of Object.keys(CHECKLIST_PLAN_LINKS)) {
      expect(keys.has(checklistKey), `checklist key ${checklistKey} missing from generator`).toBe(true);
    }
  });

  it("maps only info rows — vault-bound document rows keep the vault as their authority", () => {
    for (const checklistKey of Object.keys(CHECKLIST_PLAN_LINKS)) {
      const item = items.find((i) => i.key === checklistKey)!;
      expect(item.kind, `${checklistKey} must not be a vault-bound document row`).toBeNull();
    }
  });

  it("targets only real plan kinds (all declared AU visa-prep actions)", () => {
    for (const planKind of Object.values(CHECKLIST_PLAN_LINKS)) {
      expect(VISA_PREP_KINDS).toContain(planKind);
    }
  });

  it("covers the four after-offer step rows, the translations note, and the agent check", () => {
    expect(CHECKLIST_PLAN_LINKS).toEqual({
      "noc-application": "apply-for-noc",
      biometrics: "prepare-biometrics",
      "police-certificate": "prepare-police-certificate",
      "doc-preparation": "translate-certify-documents",
      "gs-responses": "prepare-gs-answers",
      "agent-marn": "verify-agent-marn",
    });
  });
});

describe("planStatesForChecklist", () => {
  it("returns open for an unstarted todo row", () => {
    expect(planStatesForChecklist([row("apply-for-noc", "todo")])).toEqual({ "noc-application": "open" });
  });

  it("returns in-progress for a started todo row", () => {
    const rows = [row("prepare-biometrics", "todo", { startedAt: "2026-06-09T00:00:00Z" })];
    expect(planStatesForChecklist(rows)).toEqual({ biometrics: "in-progress" });
  });

  it("returns done for a done row", () => {
    expect(planStatesForChecklist([row("prepare-police-certificate", "done")])).toEqual({
      "police-certificate": "done",
    });
  });

  it("omits dismissed kinds — the user declined the plan action", () => {
    expect(planStatesForChecklist([row("translate-certify-documents", "dismissed")])).toEqual({});
  });

  it("omits kinds with no plan row and ignores unmapped plan kinds", () => {
    // prepare-health-exam is a real VISA_PREP_KIND with no checklist mirror in
    // CHECKLIST_PLAN_LINKS (prepare-gs-answers is now mapped via gs-responses).
    expect(planStatesForChecklist([row("prepare-health-exam", "todo")])).toEqual({});
  });

  it("prefers the open row over older closed history", () => {
    const rows = [
      row("apply-for-noc", "dismissed", { createdAt: "2026-05-01T00:00:00Z" }),
      row("apply-for-noc", "todo", { createdAt: "2026-06-01T00:00:00Z" }),
    ];
    expect(planStatesForChecklist(rows)).toEqual({ "noc-application": "open" });
  });

  it("lets the newest closed row decide when nothing is open", () => {
    const doneNewest = [
      row("apply-for-noc", "dismissed", { createdAt: "2026-05-01T00:00:00Z" }),
      row("apply-for-noc", "done", { createdAt: "2026-06-01T00:00:00Z" }),
    ];
    expect(planStatesForChecklist(doneNewest)).toEqual({ "noc-application": "done" });

    const dismissedNewest = [
      row("apply-for-noc", "done", { createdAt: "2026-05-01T00:00:00Z" }),
      row("apply-for-noc", "dismissed", { createdAt: "2026-06-01T00:00:00Z" }),
    ];
    expect(planStatesForChecklist(dismissedNewest)).toEqual({});
  });
});
