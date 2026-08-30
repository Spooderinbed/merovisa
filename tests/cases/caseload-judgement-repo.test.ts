import { describe, it, expect, vi } from "vitest";
import { fakeCaseDb, type CaseDbFixture, type CaseDbTable } from "../helpers/fake-case-db";

vi.mock("server-only", () => ({}));

const { listCaseJudgementsByCase, JUDGEMENT_ROW_CEILING } = await import(
  "@/lib/cases/caseload-judgement-repo"
);
const { readCaseVisaRisk, readCaseSubmittability } = await import("@/lib/cases/case-frame");

/**
 * MV-200 criteria 2–3 — the batched caseload read.
 *
 * Criterion 1 measured that calling the two per-case readers once per row costs up to
 * 3,500 round trips for one page. This module answers the same two questions for a whole
 * page with a number of queries bounded by TABLES rather than by rows — and must reach
 * exactly the answers the per-case readers reach, or the queue and the case would
 * disagree about the same student.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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

/** Case A is fully populated; B has a profile and no shortlist; C has nothing at all. */
const fixture = (over: CaseDbFixture = {}): CaseDbFixture => ({
  user_program_state: [{ case_id: A, program_id: PROGRAM, status: "shortlisted" } as never],
  programs: [programRow as never],
  profiles: [
    { case_id: A, sections: SECTIONS } as never,
    { case_id: B, sections: SECTIONS } as never,
  ],
  documents: [{ case_id: A, kind: "passport" } as never],
  document_status: [{ case_id: A, kind: "national-id", obtained: true } as never],
  plan_items: [],
  ...over,
});

const LINKED = [
  { id: A, hasLinkedStudent: true },
  { id: B, hasLinkedStudent: true },
  { id: C, hasLinkedStudent: true },
];

async function run(fx: CaseDbFixture = fixture(), cases = LINKED, options = {}) {
  const db = fakeCaseDb(fx, options);
  const result = await listCaseJudgementsByCase(cases, db.client);
  return { result, db };
}

describe("listCaseJudgementsByCase — bounded by tables, not by rows", () => {
  it("answers for three cases in six queries, not twenty-one", () => {
    // The whole reason this module exists. Three cases through the per-case readers is
    // 3 x 7 = 21 round trips; batched it is one per source table plus the catalogue.
    return run().then(({ db }) => {
      expect(db.queries.length).toBe(6);
      expect([...new Set(db.queries.map((q) => q.table))].sort()).toEqual([
        "document_status",
        "documents",
        "plan_items",
        "profiles",
        "programs",
        "user_program_state",
      ]);
    });
  });

  it("filters every case-keyed read to the ids it was given", async () => {
    const { db } = await run();
    for (const table of ["profiles", "user_program_state", "documents", "document_status", "plan_items"]) {
      const query = db.queries.find((q) => q.table === table);
      const inFilter = query?.filters.find(([column]) => column === "case_id");
      expect(inFilter?.[1]).toEqual([A, B, C]);
    }
  });

  it("asks nothing at all for an empty caseload", async () => {
    const { result, db } = await run(fixture(), []);
    expect(db.queries).toEqual([]);
    expect(result.ok && result.byCase.size).toBe(0);
  });

  it("reads the catalogue once, for the union of every case's candidates", async () => {
    const { db } = await run(
      fixture({
        user_program_state: [
          { case_id: A, program_id: PROGRAM, status: "shortlisted" } as never,
          { case_id: B, program_id: PROGRAM, status: "shortlisted" } as never,
        ],
      }),
    );
    expect(db.queries.filter((q) => q.table === "programs").length).toBe(1);
  });

  it("skips the catalogue read entirely when no case has a shortlist", async () => {
    const { db } = await run(fixture({ user_program_state: [] }));
    expect(db.queries.filter((q) => q.table === "programs").length).toBe(0);
  });
});

describe("listCaseJudgementsByCase — the same answers the case surfaces give", () => {
  it("matches `readCaseVisaRisk` and `readCaseSubmittability` row for row", async () => {
    // Criterion 3, asserted rather than asserted-about. If the batched path ever drifts,
    // the queue and the case would say different things about one student — which is the
    // failure the card names as "two answers to the same question on two screens".
    const { result } = await run();
    if (!result.ok) throw new Error("expected a batched read");

    for (const { id, hasLinkedStudent } of LINKED) {
      const perCaseVisa = await readCaseVisaRisk(
        id,
        { isStaffOnCase: true, hasLinkedStudent },
        fakeCaseDb(fixture()).client,
      );
      const perCaseSubmittability = await readCaseSubmittability(
        id,
        { isStaffOnCase: true },
        fakeCaseDb(fixture()).client,
      );
      expect(result.byCase.get(id)?.visaRisk).toEqual(perCaseVisa);
      expect(result.byCase.get(id)?.submittability).toEqual(perCaseSubmittability);
    }
  });

  it("gives every case an entry — absence is a judgement, not a missing key", async () => {
    // Unlike the outstanding-requests batch, where a case with nothing is absent from the
    // map. Here "nothing recorded" is itself one of the answers, so a missing key could
    // only mean a bug.
    const { result } = await run();
    if (!result.ok) throw new Error("expected a batched read");
    expect([...result.byCase.keys()].sort()).toEqual([A, B, C].sort());
    expect(result.byCase.get(C)?.visaRisk).toEqual({ state: "insufficient-data" });
    expect(result.byCase.get(C)?.submittability).toEqual({ state: "no-program" });
    expect(result.byCase.get(B)?.submittability).toEqual({ state: "no-program" });
    expect(result.byCase.get(A)?.visaRisk.state).toBe("read");
  });

  it("an unlinked case abstains on the visa read but still gets a requirement read", async () => {
    const { result } = await run(fixture(), [{ id: A, hasLinkedStudent: false }]);
    if (!result.ok) throw new Error("expected a batched read");
    expect(result.byCase.get(A)?.visaRisk).toEqual({ state: "no-linked-student" });
    expect(result.byCase.get(A)?.submittability.state).toBe("read");
  });
});

describe("listCaseJudgementsByCase — the plan trap criterion 1 measured", () => {
  it("reads plan items of EVERY status, because `done` is what completes a requirement", async () => {
    // The queue's own plan read is `status = 'todo'` — it only wants the next action.
    // A rollup built on that read would report every plan-linked requirement as
    // outstanding on every case, silently. So this read carries no status filter, and
    // a `done` row has to move the answer.
    const { db } = await run();
    const plan = db.queries.find((q) => q.table === "plan_items");
    expect(plan?.filters.some(([column]) => column === "status")).toBe(false);

    const withDone = await run(
      fixture({
        plan_items: [
          {
            case_id: A,
            id: 1,
            kind: "translate-certify-documents",
            status: "done",
            created_at: "2026-08-01T00:00:00Z",
            started_at: null,
          } as never,
        ],
      }),
    );
    const before = (await run()).result;
    if (!before.ok || !withDone.result.ok) throw new Error("expected batched reads");
    const a = before.byCase.get(A)!.submittability;
    const b = withDone.result.byCase.get(A)!.submittability;
    if (a.state !== "read" || b.state !== "read") throw new Error("expected reads");
    expect(b.apply.ready).toBe(a.apply.ready + 1);
  });
});

describe("listCaseJudgementsByCase — the filters that would pass vacuously", () => {
  it("counts only document_status rows that are actually OBTAINED", async () => {
    // Without the `obtained = true` predicate every fixture row in the happy path still
    // matches, so the equality test above would pass against a read that counted
    // un-ticked boxes. This is the row that tells them apart.
    const { result } = await run(
      fixture({
        document_status: [
          { case_id: A, kind: "national-id", obtained: true } as never,
          { case_id: A, kind: "bachelors-transcript", obtained: false } as never,
        ],
      }),
    );
    const baseline = (await run()).result;
    if (!result.ok || !baseline.ok) throw new Error("expected batched reads");
    const withFalse = result.byCase.get(A)!.submittability;
    const plain = baseline.byCase.get(A)!.submittability;
    if (withFalse.state !== "read" || plain.state !== "read") throw new Error("expected reads");
    expect(withFalse.apply.ready).toBe(plain.apply.ready);
  });

  it("trips into `lookup-failed` at the row ceiling rather than trusting a prefix", async () => {
    // PostgREST truncates at `max_rows` SILENTLY, and a cut batch drops rows from the
    // cases at the tail of the chunk — rendering a fully-evidenced case as having
    // nothing. None of these reads has a database-side filter to bound it, so the
    // ceiling check is the only thing standing between a prefix and a false answer.
    const flood = Array.from(
      { length: JUDGEMENT_ROW_CEILING },
      (_, i) => ({ case_id: A, kind: `k-${i}` }) as never,
    );
    const { result } = await run(fixture({ documents: flood }));
    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
  });
});

describe("listCaseJudgementsByCase — a failed source fails the read", () => {
  it("any source erroring is `lookup-failed`, never a thinner answer that looks true", async () => {
    // Same rule as every other queue enrichment: a read that could not complete must not
    // wear the shape of a case with nothing on it. A failed `documents` read rendered as
    // an empty set would report a fully-evidenced caseload as having uploaded nothing.
    const tables: CaseDbTable[] = [
      "profiles",
      "user_program_state",
      "programs",
      "documents",
      "document_status",
      "plan_items",
    ];
    for (const table of tables) {
      const { result } = await run(fixture(), LINKED, {
        errorOn: { [table]: { message: "boom" } },
      });
      expect(result).toEqual({ ok: false, reason: "lookup-failed" });
    }
  });

  it("a thrown client is `lookup-failed` too", async () => {
    const { result } = await run(fixture(), LINKED, { throwOn: ["documents"] });
    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
  });
});
