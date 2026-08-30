import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { generateChecklist } from "@/lib/checklist/generator";
import { computeReadiness } from "@/lib/checklist/readiness";
import { CHECKLIST_PLAN_LINKS } from "@/lib/checklist/plan-links";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { Program } from "@/lib/programs/types";
import type { DocumentKind } from "@/lib/documents/types";

/**
 * MV-199 criterion 1 — MEASURE BEFORE CHANGING ANYTHING.
 *
 * The card's premise is that this is "the mechanical half": *"Every input already
 * exists in the database… The work is a deterministic rollup plus a ranked blocker,
 * not a model."* MV-196's criterion 1 rewrote its own card and MV-198's confirmed
 * one, so this file checks the premise piece by piece before a line is built.
 *
 * It asserts what the codebase does TODAY. Assertions expected to be rewritten by
 * the slice say so where they are made.
 */

const baseProgram: Program = {
  id: "p1",
  universityId: "u1",
  name: "Master of IT",
  level: "masters",
  field: "computer-science",
  tuitionMin: 40000,
  tuitionMax: 45000,
  tuitionCurrency: "AUD",
  minGrade: 65,
  minEnglish: 6.5,
  minEnglishBand: 6,
  intakes: ["feb"],
  source: "https://example.edu/it",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
  notes: null,
};

const nothingUploaded = new Set<DocumentKind>();

const checklist = (uploaded: Set<DocumentKind> = nothingUploaded): ChecklistItem[] =>
  generateChecklist({ program: baseProgram, sections: {}, uploadedKinds: uploaded });

const requiredOf = (items: ChecklistItem[]) => items.filter((i) => i.requirement === "required");

describe("MV-199 — what the checklist already computes", () => {
  it("PREMISE HOLDS: a truthful DENOMINATOR exists — required items per program", () => {
    // This is the fact the card rests on, and it is easy to doubt, because
    // `submittability-panel.tsx` says in its own header that there is "no 'documents
    // needed' anywhere". That statement is true OF ITS OWN SOURCE — it reads
    // `case_document_requests`, which records only what a counsellor thought to ask
    // for. The checklist generator is a different source and it does know.
    const required = requiredOf(checklist());
    expect(required.length).toBeGreaterThan(0);

    // MEASURED CORRECTION to a natural assumption: a "required" row is NOT always a
    // document. Some carry `kind: null` and `status: "info"` — a step or a note the
    // student must do but cannot upload. Every required row that IS document-backed
    // is `missing` on an empty case; the info rows have no completion signal at all.
    const documentBacked = required.filter((i) => i.kind !== null);
    const informational = required.filter((i) => i.kind === null);
    expect(documentBacked.length).toBeGreaterThan(0);
    expect(informational.length).toBeGreaterThan(0);
    expect(documentBacked.every((i) => i.status === "missing")).toBe(true);
    expect(informational.every((i) => i.status === "info")).toBe(true);
  });

  it("each item already carries requirement, stage and a completion status", () => {
    const passport = checklist().find((i) => i.key === "passport");
    expect(passport).toMatchObject({ requirement: "required", stage: "now", status: "missing" });
    expect(checklist(new Set<DocumentKind>(["passport"])).find((i) => i.key === "passport")?.status)
      .toBe("have");
  });

  it("SOME required items already carry source/lastVerified, and some do not", () => {
    // Criterion 4 wants provenance on every blocking item. Measured baseline: the
    // coverage is PARTIAL, so the slice must render provenance where it exists and
    // make no sourced claim where it does not — it cannot assume every row has one.
    const required = requiredOf(checklist());
    const sourced = required.filter((i) => i.source?.url);
    expect(sourced.length).toBeGreaterThan(0);
    expect(sourced.length).toBeLessThan(required.length);
  });

  it("PREMISE HOLDS, AND MORE: the ROLLUP itself already exists", () => {
    // The card says the work is "a deterministic rollup plus a ranked blocker".
    // Half of that is already written: `computeReadiness` is an honest per-stage
    // "X of Y required ready" that excludes recommended and uncompletable rows.
    const readiness = computeReadiness(checklist());
    expect(readiness.now.total).toBeGreaterThan(0);
    expect(readiness.now.ready).toBe(0);
    expect(readiness.readyToApplyNow).toBe(false);
  });

  it("and it moves when a required document arrives", () => {
    const before = computeReadiness(checklist());
    const after = computeReadiness(checklist(new Set<DocumentKind>(["passport"])));
    expect(after.now.ready).toBeGreaterThan(before.now.ready);
  });
});

describe("MV-199 — what it does NOT compute", () => {
  it("there is NO single blocking item — the rollup returns counts only", () => {
    // The card's second read, and the differentiated one: "a list of eleven missing
    // things is what the existing checklist already shows and is not this card".
    const readiness = computeReadiness(checklist());
    expect(Object.keys(readiness).sort()).toEqual(["afterOffer", "now", "readyToApplyNow"]);
    expect(readiness).not.toHaveProperty("blocker");
  });

  it("there is NO ranking signal on a checklist item to rank a blocker BY", () => {
    // So criterion 3's "written, tested ranking rule" cannot be a sort over an
    // existing field; it has to be authored, and the order items happen to be
    // generated in must not become the rule by accident.
    const item = checklist()[0]!;
    for (const field of ["rank", "priority", "order", "weight", "severity"]) {
      expect(item).not.toHaveProperty(field);
    }
  });

  it("`readyToApplyNow` means READY TO APPLY, not ready to LODGE", () => {
    // The distinction the slice must not blur. `readyToApplyNow` is scoped to the
    // `now` stage and deliberately ignores `after-offer` — the visa-stage documents.
    // The card is about SUBMITTABILITY (lodgement), so this flag is not the answer
    // it wants, and reusing it under a lodgement heading would overclaim.
    const items = checklist();
    const afterOffer = items.filter((i) => i.stage === "after-offer" && i.requirement === "required");
    expect(afterOffer.length).toBeGreaterThan(0);

    const nowKinds = new Set<DocumentKind>(
      items.filter((i) => i.stage === "now" && i.kind !== null).map((i) => i.kind!),
    );

    // MEASURED, and a real constraint on this slice: uploading every now-stage
    // DOCUMENT is not enough. `readyToApplyNow` also depends on PLAN state — rows
    // in CHECKLIST_PLAN_LINKS complete only when their linked plan action is "done".
    // So a submittability read built on this rollup inherits a dependency on
    // `plan_items`, and a case-scoped version has to read that too.
    expect(computeReadiness(checklist(nowKinds)).readyToApplyNow).toBe(false);

    const allPlanDone = Object.fromEntries(
      Object.keys(CHECKLIST_PLAN_LINKS).map((key) => [key, "done" as const]),
    );
    const readiness = computeReadiness(checklist(nowKinds), allPlanDone);

    // Now it says ready to APPLY — while after-offer work is still outstanding.
    expect(readiness.readyToApplyNow).toBe(true);
    expect(readiness.afterOffer.ready).toBeLessThan(readiness.afterOffer.total);
  });
});

describe("MV-199 — where the rollup lives, and where it does not", () => {
  const root = process.cwd();

  function filesUnder(dir: string, exts: string[]): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...filesUnder(full, exts));
      else if (exts.some((e) => entry.endsWith(e))) out.push(full);
    }
    return out;
  }

  /** Split on /\r?\n/ — a bare "\n" matches zero lines on CRLF and goes vacuously true. */
  const mentions = (file: string, re: RegExp) =>
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .some((line) => re.test(line));

  it("THE GAP: no server-side, case-scoped read reaches the checklist rollup", () => {
    // `computeReadiness` is called from exactly one place — the student's checklist
    // VIEW component. Nothing in `lib/cases/` computes it, so the workspace cannot
    // ask "is this case submittable" without this slice existing.
    const callers = filesUnder(join(root, "lib"), [".ts"]).filter((f) =>
      mentions(f, /computeReadiness/),
    );
    expect(callers.map((f) => f.replace(root, "").replace(/\\/g, "/"))).toEqual([
      "/lib/checklist/readiness.ts",
    ]);
  });

  it("THE GAP: no workspace surface renders a checklist rollup or a blocker", () => {
    // Expected to fail once the slice ships — replace with a positive assertion
    // about the new surface rather than deleting it (MV-198 did exactly that).
    const offenders: string[] = [];
    for (const dir of ["components/workspace", join("app", "(app)", "workspace")]) {
      for (const file of filesUnder(join(root, dir), [".tsx", ".ts"])) {
        if (mentions(file, /computeReadiness|generateChecklist|ChecklistItem/)) {
          offenders.push(file.replace(root, "").replace(/\\/g, "/"));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the workspace's existing lodgement read sees document REQUESTS and nothing else", () => {
    // So the two notions of "outstanding" in this codebase do not meet: what a
    // counsellor ASKED FOR (`case_document_requests`, no denominator) and what the
    // program REQUIRES (the checklist, with one). Reconciling them is this slice's
    // real work, and neither may silently stand in for the other.
    const lodgement = readFileSync(join(root, "lib", "cases", "lodgement.ts"), "utf8");
    expect(/checklist/i.test(lodgement)).toBe(false);
    expect(/document_requests|DocumentRequest/.test(lodgement)).toBe(true);
  });
});
