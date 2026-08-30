import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { fakeCaseDb, type CaseDbFixture } from "../helpers/fake-case-db";
import { LIST_ROW_CAP } from "@/lib/cases/list-repo";
import { QUEUE_BATCH_SIZE } from "@/lib/cases/queue-repo";
import { CHECKLIST_PLAN_LINKS } from "@/lib/checklist/plan-links";
import { planStatesForChecklist } from "@/lib/checklist/plan-links";

vi.mock("server-only", () => ({}));

const { readCaseVisaRisk, readCaseSubmittability } = await import("@/lib/cases/case-frame");

/**
 * MV-200 criterion 1 — MEASURE BEFORE CHANGING ANYTHING.
 *
 * The card calls this slice "deliberately last, and deliberately small… no design
 * investment beyond sorting numbers already computed", and warns in its own words:
 *
 *   > "The students list renders every case in the org. Two per-case judgement reads
 *   > computed per row is a fan-out… Decide deliberately whether the reads are computed
 *   > on read, cached, or persisted — and write the decision down."
 *
 * So the measurement is mostly about COST, and it is taken by counting real queries
 * through the real readers rather than by estimating. MV-196's criterion 1 rewrote its
 * card, MV-198's confirmed one and MV-199's confirmed-and-strengthened one; this file
 * checks the premise before a line is built.
 *
 * It asserts what the codebase does TODAY. Assertions expected to be rewritten by the
 * slice say so where they are made.
 */

const CASE = "22222222-2222-4222-a222-222222222222";
const PROGRAM = "33333333-3333-4333-a333-333333333333";

const programRow = {
  id: PROGRAM,
  university_id: "u1",
  name: "Master of IT",
  level: "masters",
  field: "computer-science",
  tuition_min: 40000,
  tuition_max: 45000,
  tuition_currency: "AUD",
  min_grade: 65,
  min_english: 6.5,
  min_english_band: 6,
  intakes: ["feb"],
  source: "https://example.edu/it",
  last_verified: "2026-01-01",
  data_quality: "primary",
  notes: null,
};

const SECTIONS = {
  academic: { degree: "bachelors", gradeSystem: "percentage-nepal", gradePercent: 72 },
  english: { test: "ielts", overall: 7 },
  finance: { total: 15_000_000, currency: "NPR", source: "education-loan" },
  destination: { primary: "australia" },
};

const fixture = (): CaseDbFixture => ({
  user_program_state: [{ case_id: CASE, program_id: PROGRAM, status: "shortlisted" } as never],
  programs: [programRow as never],
  profiles: [{ case_id: CASE, sections: SECTIONS } as never],
  documents: [{ case_id: CASE, kind: "passport" } as never],
  document_status: [{ case_id: CASE, kind: "national-id", obtained: true } as never],
  plan_items: [],
});

/** Distinct tables a read touched, and how many round trips it spent. */
async function cost(run: (db: ReturnType<typeof fakeCaseDb>) => Promise<unknown>) {
  const db = fakeCaseDb(fixture());
  await run(db);
  return { queries: db.queries.length, tables: [...new Set(db.queries.map((q) => q.table))].sort() };
}

describe("MV-200 — what one row of the caseload would cost, measured", () => {
  it("the visa read spends ONE round trip per case", async () => {
    const measured = await cost((db) =>
      readCaseVisaRisk(CASE, { isStaffOnCase: true, hasLinkedStudent: true }, db.client),
    );
    expect(measured).toEqual({ queries: 1, tables: ["profiles"] });
  });

  it("the submittability read spends SIX, across six different tables", async () => {
    const measured = await cost((db) =>
      readCaseSubmittability(CASE, { isStaffOnCase: true }, db.client),
    );
    expect(measured.queries).toBe(6);
    expect(measured.tables).toEqual([
      "document_status",
      "documents",
      "plan_items",
      "profiles",
      "programs",
      "user_program_state",
    ]);
  });

  it("…and that SIX is a floor, not a constant: `programs` is read once PER CANDIDATE", async () => {
    // `readCaseSubmittability` resolves the shortlist tier and then calls `getProgram`
    // for each candidate id — a fan-out inside the fan-out. A case with three
    // shortlisted programs costs eight, not six, so the per-row cost is set by the
    // consultancy's data rather than by the code. It is also the clearest argument for
    // reading the catalogue once for the whole page instead of per case.
    const db = fakeCaseDb({
      ...fixture(),
      user_program_state: [
        { case_id: CASE, program_id: PROGRAM, status: "shortlisted" } as never,
        { case_id: CASE, program_id: "p-2", status: "shortlisted" } as never,
      ],
      programs: [programRow as never, { ...programRow, id: "p-2", name: "Master of DS" } as never],
    });
    await readCaseSubmittability(CASE, { isStaffOnCase: true }, db.client);
    expect(db.queries.filter((q) => q.table === "programs").length).toBe(2);
    expect(db.queries.length).toBe(7);
  });

  it("SO THE NAIVE ROLLUP IS 7 ROUND TRIPS PER ROW, and the list caps at 500 rows", () => {
    // The number the card asked to be written down. Calling the per-case readers once
    // per row — the obvious implementation — is up to 3,500 sequential round trips for
    // one page render. "A correct answer that takes eight seconds to list forty
    // students fails the card"; this is that failure, quantified before it is written.
    const perRow = 1 + 6;
    expect(LIST_ROW_CAP).toBe(500);
    expect(perRow * LIST_ROW_CAP).toBe(3500);
  });

  it("the batched alternative is bounded by TABLES, not by rows", () => {
    // Five of the six sources are keyed by `case_id`, so one `.in()` per chunk answers
    // for a whole page of cases; `programs` is a catalogue keyed by program id and is
    // read once. At the queue's existing chunk size that is ~66 round trips for the
    // same 500 cases, against 3,500 — the difference between the two designs.
    const caseKeyed = ["profiles", "user_program_state", "documents", "document_status", "plan_items"];
    const chunks = Math.ceil(LIST_ROW_CAP / QUEUE_BATCH_SIZE);
    expect(QUEUE_BATCH_SIZE).toBe(40);
    expect(caseKeyed.length * chunks + 1).toBe(66);
  });
});

describe("MV-200 — the precedent the queue already set", () => {
  const root = process.cwd();
  const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

  it("the queue ALREADY batches its enrichments, and never calls a per-case reader", () => {
    // `listCaseQueue` reads memberships, assignments, plan items and document requests
    // in chunked `.in()` queries and derives per row. So the shape MV-200 needs is not
    // an invention — it is the shape three enrichments already use.
    const repo = read("lib", "cases", "queue-repo.ts");
    expect(/readCaseAssignee|readCaseNextStep|readCaseLodgement|readCaseVisaRisk/.test(repo)).toBe(false);
    expect(/\.in\("case_id"/.test(repo)).toBe(true);
  });

  it("a batched enrichment gets its OWN derive when it can say less — and says so", () => {
    // `deriveQueueLodgement` is not `deriveLodgement`. The batch filters at the database
    // (`status = 'outstanding'`) so the row ceiling bounds open work rather than a
    // consultancy's whole history, and the cost is that it cannot tell an all-resolved
    // case from one nobody asked anything of — so it reports the weaker
    // `none-outstanding` instead of `clear`.
    //
    // This is the precedent for MV-200's criterion 3. "No parallel re-derivation" has to
    // mean the JUDGEMENT is the same function; where the batched INPUTS are genuinely
    // thinner, a queue-side derive that says less is the honest answer, not a bug.
    const lodgement = read("lib", "cases", "lodgement.ts");
    expect(/export function deriveQueueLodgement/.test(lodgement)).toBe(true);
    expect(/export function deriveLodgement/.test(lodgement)).toBe(true);
  });

  /**
   * The same scan over CODE only, so a comment ABOUT a thing is not the thing.
   *
   * Block comments are stripped whole rather than line-by-line: this repo's JSX
   * comments open with `{/*` and their continuation lines start with neither `//`
   * nor `*`, so a per-line filter reads them as code. That is not hypothetical — it
   * is how this probe first mis-measured the queue table.
   */
  const inCode = (source: string, re: RegExp) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((line) => !/^\s*\/\//.test(line))
      .some((line) => re.test(line));

  it("THE GAP: no queue row carries either judgement today", () => {
    // Expected to fail once the slice ships — replace with a positive assertion about
    // the new columns rather than deleting it (MV-198 and MV-199 both did exactly that).
    expect(inCode(read("lib", "cases", "queue.ts"), /VisaRisk|Submittability|visaRisk|submittability/)).toBe(false);
    expect(inCode(read("components", "workspace", "case-queue-table.tsx"), /[Vv]isa|[Ss]ubmittab|[Ee]vidence/)).toBe(false);
  });

  it("…but the table RESERVED the column, and wrote down the rule for it", () => {
    // Found by this probe, and it changes the build: `case-queue-table.tsx` already
    // carries a comment holding the slot open, exactly as `case-decision-strip.tsx` held
    // MV-198's panel slot since MV-183. It also states the rule this slice inherits:
    //
    //   "The visa read's column stays omitted entirely until its stage ships — forty
    //    rows of 'Coming soon' is worse than no column."
    //
    // So the column is not a free-form design decision, and the honest handling of a
    // read that cannot be stated is already decided: omit, never placeholder.
    const table = read("components", "workspace", "case-queue-table.tsx");
    expect(/visa read's column stays omitted entirely until its stage ships/.test(table)).toBe(true);
    expect(/Coming soon[\s\S]*is worse than no column/.test(table)).toBe(true);
  });
});

describe("MV-200 — the trap in reusing what the queue already reads", () => {
  it("the queue's plan read is `status = todo` ONLY, and the rollup needs `done`", () => {
    // The sharpest finding here, and it is invisible until it is wrong.
    //
    // `listCaseQueue` already fetches plan items — but filtered to `status = 'todo'`,
    // because all it wants is the next action. Submittability wants the OPPOSITE end:
    // `planStatesForChecklist` completes a checklist row when its linked plan item is
    // `done`, and a `todo`-filtered read contains no `done` row by construction.
    //
    // So reusing the queue's `planByCase` would report EVERY plan-linked requirement as
    // outstanding on EVERY case — a wrong denominator on every row, with no error and
    // nothing on screen to suggest it. MV-200 needs its own plan read, or the queue's
    // must widen; either way the decision has to be deliberate.
    const repo = readFileSync(join(process.cwd(), "lib", "cases", "queue-repo.ts"), "utf8");
    expect(/\.eq\("status", "todo"\)/.test(repo)).toBe(true);

    const doneRow = {
      // `PlanItemRow.id` is a NUMBER, not a string — the runtime never noticed, and
      // `tsc` did. Left explicit so a copied fixture does not reintroduce it.
      id: 1,
      owner: null,
      kind: CHECKLIST_PLAN_LINKS["doc-preparation"]!,
      impact: "medium" as const,
      title: "t",
      body: null,
      liftEstimate: null,
      timeEstimate: null,
      status: "done" as const,
      createdAt: "2026-08-01T00:00:00Z",
      completedAt: null,
      startedAt: null,
    };
    expect(planStatesForChecklist([doneRow])).toEqual({ "doc-preparation": "done" });
    // And the queue's filter would have dropped exactly that row.
    expect(planStatesForChecklist([{ ...doneRow, status: "todo" }])).toEqual({
      "doc-preparation": "open",
    });
  });

  it("three of the five case-keyed reads have NO natural database-side filter", () => {
    // `listOutstandingDocumentRequestsByCase` can filter at the database because
    // "outstanding" is the only status it wants, and its header says why that matters:
    // resolved requests accumulate forever, so an unfiltered batch grows with history
    // and is SILENTLY cut at PostgREST's max_rows.
    //
    // Submittability's inputs have no such filter — every document, every status row and
    // every plan item on a case is load-bearing. So the ceiling risk is real and needs
    // its own answer (a smaller chunk, a ceiling check that fails the column, or both);
    // it cannot be inherited from the requests batch.
    const requests = readFileSync(join(process.cwd(), "lib", "cases", "document-requests-repo.ts"), "utf8");
    expect(/\.eq\("status", "outstanding"\)/.test(requests)).toBe(true);
    expect(/DOCUMENT_REQUEST_ROW_CEILING/.test(requests)).toBe(true);
  });
});
