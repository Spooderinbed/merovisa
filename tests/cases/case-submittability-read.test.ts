import { describe, it, expect, vi } from "vitest";
import { fakeCaseDb, sawQuery, type CaseDbFixture, type CaseDbTable } from "../helpers/fake-case-db";

vi.mock("server-only", () => ({}));

const { readCaseSubmittability } = await import("@/lib/cases/case-frame");

/**
 * MV-199 criterion 2 (the reading half) and criterion 6 — the case-scoped submittability
 * read, and who may take it.
 *
 * The judgement is pure and tested in `tests/judgement/submittability.test.ts`. What is
 * asserted here is everything the pure function cannot see: who may ask, which tables the
 * answer actually depends on, and a read that FAILED versus a case with nothing on it.
 *
 * ## The same criterion-8 correction MV-198 made, for the same reason
 *
 * This read is **derived, not stored**. There is no submittability table, so there is no
 * policy to deny and nothing to mutation-test. Its sources — `user_program_state`,
 * `programs`, `profiles`, `documents`, `document_status`, `plan_items` — are already
 * governed by RLS and already covered by `tests/integration/tenant-isolation.itest.ts`.
 * Staff-only is a product decision about a derived presentation, enforced at the read so
 * a later caller has to overturn it deliberately rather than inherit it by forgetting.
 *
 * ## Unlike the visa read, this one does NOT need a linked student
 *
 * MV-198 abstains on an unlinked case because it scores a STUDENT's profile, and a
 * consultancy-entered profile with nobody behind it is exactly the data the spec says not
 * to judge. Submittability judges DOCUMENTS, which a consultancy-entered case has from the
 * day a counsellor uploads the first one. Withholding it there would blank the answer for
 * every case in a consultancy that has not started inviting students.
 */

const CASE = "22222222-2222-4222-a222-222222222222";
const PROGRAM = "33333333-3333-4333-a333-333333333333";
const STAFF = { isStaffOnCase: true };

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

function fixture(over: CaseDbFixture = {}): CaseDbFixture {
  return {
    user_program_state: [{ case_id: CASE, program_id: PROGRAM, status: "shortlisted" } as never],
    programs: [programRow as never],
    profiles: [{ case_id: CASE, sections: { finance: { source: "self-funded" } } } as never],
    documents: [{ case_id: CASE, kind: "passport" } as never],
    document_status: [{ case_id: CASE, kind: "national-id", obtained: true } as never],
    plan_items: [],
    ...over,
  };
}

describe("readCaseSubmittability — who may take the read", () => {
  it("gives a non-staff viewer nothing, and reads no table at all", async () => {
    const client = fakeCaseDb(fixture());
    expect(await readCaseSubmittability(CASE, { isStaffOnCase: false }, client.client)).toBeNull();
    expect(client.queries).toEqual([]);
    // Not vacuous: the same client DOES answer for a staff viewer, so the empty
    // `queries` above means the read was withheld and not that the fake was inert.
    expect((await readCaseSubmittability(CASE, STAFF, client.client))?.state).toBe("read");
  });
});

describe("readCaseSubmittability — what the answer depends on", () => {
  it("states the read for the shortlisted program, and names it", async () => {
    const read = await readCaseSubmittability(CASE, STAFF, fakeCaseDb(fixture()).client);
    if (read?.state !== "read") throw new Error(`expected a read, got ${read?.state}`);
    expect(read.program).toEqual({ id: PROGRAM, name: "Master of IT" });
  });

  it("reads the case's DOCUMENTS and its PLAN — both, because the rollup needs both", async () => {
    // The measured constraint: `CHECKLIST_PLAN_LINKS` rows complete only when their plan
    // action is done, so a submittability read built on documents alone would report a
    // fully-uploaded case as blocked on a row nothing can upload.
    const client = fakeCaseDb(fixture());
    await readCaseSubmittability(CASE, STAFF, client.client);
    for (const table of [
      "user_program_state", "programs", "profiles", "documents", "document_status", "plan_items",
    ] as const) {
      expect([...new Set(client.queries.map((q) => q.table))]).toContain(table);
    }
  });

  it("scopes every case-keyed read to this case", async () => {
    const client = fakeCaseDb(fixture());
    await readCaseSubmittability(CASE, STAFF, client.client);
    for (const table of [
      "user_program_state", "profiles", "documents", "document_status", "plan_items",
    ] as const) {
      expect(sawQuery(client.queries, table, [["case_id", CASE]])).toBe(true);
    }
  });

  it("an uploaded document and a done plan item both move the answer", async () => {
    // Not scoring-inert, proved through the I/O path rather than only in the pure model.
    const bare = await readCaseSubmittability(
      CASE,
      STAFF,
      fakeCaseDb(fixture({ documents: [], document_status: [] })).client,
    );
    const full = await readCaseSubmittability(CASE, STAFF, fakeCaseDb(fixture()).client);
    if (bare?.state !== "read" || full?.state !== "read") throw new Error("expected reads");
    expect(full.apply.ready).toBe(bare.apply.ready + 2);

    const planned = await readCaseSubmittability(
      CASE,
      STAFF,
      fakeCaseDb(
        fixture({
          plan_items: [
            {
              case_id: CASE,
              id: "plan-1",
              kind: "translate-certify-documents",
              status: "done",
              created_at: "2026-08-01T00:00:00Z",
              started_at: null,
            } as never,
          ],
        }),
      ).client,
    );
    if (planned?.state !== "read") throw new Error("expected a read");
    expect(planned.apply.ready).toBe(full.apply.ready + 1);
  });

  it("does not require a linked student — a consultancy-entered case still has documents", async () => {
    const read = await readCaseSubmittability(
      CASE,
      STAFF,
      fakeCaseDb(fixture({ profiles: [] })).client,
    );
    if (read?.state !== "read") throw new Error(`expected a read, got ${read?.state}`);
    expect(read.apply.total).toBeGreaterThan(0);
  });
});

describe("readCaseSubmittability — the absences, kept apart", () => {
  it("an empty shortlist abstains after ONE round trip, not six", async () => {
    const client = fakeCaseDb(fixture({ user_program_state: [] }));
    expect(await readCaseSubmittability(CASE, STAFF, client.client)).toEqual({ state: "no-program" });
    expect([...new Set(client.queries.map((q) => q.table))]).toEqual(["user_program_state"]);
  });

  it("a withdrawn-only shortlist is no program either", async () => {
    const client = fakeCaseDb(
      fixture({
        user_program_state: [{ case_id: CASE, program_id: PROGRAM, status: "withdrawn" } as never],
      }),
    );
    expect(await readCaseSubmittability(CASE, STAFF, client.client)).toEqual({ state: "no-program" });
  });

  it("a shortlisted program that is no longer in the catalogue is no program", async () => {
    const client = fakeCaseDb(fixture({ programs: [] }));
    expect(await readCaseSubmittability(CASE, STAFF, client.client)).toEqual({ state: "no-program" });
  });

  it("ANY failed source says unavailable — never a thinner answer that looks true", async () => {
    // Every repo below throws on a PostgREST error rather than returning empty (MV-133),
    // which is what makes this distinction possible at all. An empty `documents` list
    // wearing a failed read would report a fully-evidenced case as having uploaded
    // nothing, and a counsellor would chase documents the student already sent.
    const tables: CaseDbTable[] = [
      "user_program_state", "programs", "profiles", "documents", "document_status", "plan_items",
    ];
    for (const table of tables) {
      const client = fakeCaseDb(fixture(), { errorOn: { [table]: { message: "boom" } } });
      expect(await readCaseSubmittability(CASE, STAFF, client.client)).toEqual({
        state: "unavailable",
      });
    }
  });

  it("a thrown read says unavailable too", async () => {
    const client = fakeCaseDb(fixture(), { throwOn: ["documents"] });
    expect(await readCaseSubmittability(CASE, STAFF, client.client)).toEqual({
      state: "unavailable",
    });
  });
});
