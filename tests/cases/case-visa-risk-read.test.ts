import { describe, it, expect, vi } from "vitest";
import { fakeCaseDb, sawQuery } from "../helpers/fake-case-db";

vi.mock("server-only", () => ({}));

const { readCaseVisaRisk } = await import("@/lib/cases/case-frame");

/**
 * MV-198 criterion 8 — the reading half of the visa-risk read, and who may take it.
 *
 * The derivation is pure and tested in `tests/judgement/visa-risk.test.ts`. What is
 * asserted here is everything the pure function cannot see: who is allowed to ask, a
 * query that FAILED versus a case with nothing recorded, and the fact that an
 * unlinked case costs no round trip at all.
 *
 * ## Why staff-only lives here rather than in the permission matrix
 *
 * The card asked for "an explicit verb" through `checkCasePermission`, denied in RLS
 * *and* in TypeScript. That is not achievable as written, for a reason worth stating
 * rather than working around: **this read is DERIVED, not stored.** There is no
 * judgement table, so there is no policy to deny and nothing to mutation-test. Its
 * one data source is `profiles`, which RLS already governs — and RLS correctly LETS
 * the linked student read their own profile, so a "denied in RLS" assertion about the
 * student would be asserting something false.
 *
 * The staff-only rule is therefore a product decision about a derived presentation
 * (spec's open decision 3), not a tenant boundary. It is enforced here, at the read,
 * so a future caller cannot forget it — and the real tenant boundary (a foreign-org
 * member) is enforced where it always was: `openCaseRoute` plus RLS on `profiles`,
 * already covered by `tests/integration/tenant-isolation.itest.ts`.
 */

const CASE = "22222222-2222-4222-a222-222222222222";

const STAFF = { isStaffOnCase: true, hasLinkedStudent: true };

/** Enough for the engine to have something to say: funded, IELTS 7, no gap. */
const SECTIONS = {
  academic: { degree: "bachelors", gradeSystem: "percentage-nepal", gradePercent: 72 },
  english: { test: "ielts", overall: 7 },
  finance: { total: 15_000_000, currency: "NPR", source: "education-loan" },
  destination: { primary: "australia" },
};

function db(sections: unknown = SECTIONS, options = {}) {
  return fakeCaseDb(
    { profiles: [{ case_id: CASE, sections } as never] },
    options,
  );
}

describe("readCaseVisaRisk — who may take the read", () => {
  it("gives a non-staff viewer nothing, and does not read the profile", async () => {
    // `null`, not a "withheld" panel. A withheld visa read would advertise to the
    // student that a judgement about them exists and is being kept from them, which
    // is worse than not showing the region at all.
    const client = db();
    const read = await readCaseVisaRisk(
      CASE,
      { isStaffOnCase: false, hasLinkedStudent: true },
      client.client,
    );
    expect(read).toBeNull();
    expect(client.queries).toEqual([]);
    // Not vacuous: the same client DOES answer for a staff viewer, so an empty
    // `queries` above means the read was withheld and not that the fake was inert.
    expect((await readCaseVisaRisk(CASE, STAFF, client.client))?.state).toBe("read");
  });

  it("gives staff a read", async () => {
    const read = await readCaseVisaRisk(CASE, STAFF, db().client);
    expect(read?.state).toBe("read");
  });
});

describe("readCaseVisaRisk — the absences, kept apart", () => {
  it("an unlinked case abstains without spending a round trip", async () => {
    const client = db();
    const read = await readCaseVisaRisk(
      CASE,
      { isStaffOnCase: true, hasLinkedStudent: false },
      client.client,
    );
    expect(read).toEqual({ state: "no-linked-student" });
    expect(client.queries).toEqual([]);
  });

  it("a FAILED profile read says unavailable, never insufficient", async () => {
    // The whole point of the distinction. Both leave the panel with no band, but one
    // says "there is nothing recorded" and the other says "we could not find out",
    // and only one of them is true (spec §5).
    const client = db(SECTIONS, { errorOn: { profiles: { message: "boom" } } });
    expect(await readCaseVisaRisk(CASE, STAFF, client.client)).toEqual({ state: "unavailable" });
  });

  it("a thrown profile read also says unavailable", async () => {
    const client = db(SECTIONS, { throwOn: ["profiles"] });
    expect(await readCaseVisaRisk(CASE, STAFF, client.client)).toEqual({ state: "unavailable" });
  });

  it("a case with no profile row is insufficient data", async () => {
    const client = fakeCaseDb({ profiles: [] });
    expect(await readCaseVisaRisk(CASE, STAFF, client.client)).toEqual({ state: "insufficient-data" });
  });

  it("a profile with no sections is insufficient data, not a Reach", async () => {
    // `sectionsToStudentProfile({})` returns a fully-shaped profile of DEFAULTS —
    // grade 0, budget 0, no English — which the engine scores as a bad case. Handing
    // that to the panel would tell a counsellor that an untouched case is a refusal
    // risk. The emptiness has to be caught before the engine sees it.
    const read = await readCaseVisaRisk(CASE, STAFF, db({}).client);
    expect(read).toEqual({ state: "insufficient-data" });
  });

  it("a null `sections` column is insufficient data too", async () => {
    const read = await readCaseVisaRisk(CASE, STAFF, db(null).client);
    expect(read).toEqual({ state: "insufficient-data" });
  });
});

describe("readCaseVisaRisk — the read is scoped to this case", () => {
  it("filters the profile read on the case id", async () => {
    const client = db();
    await readCaseVisaRisk(CASE, STAFF, client.client);
    expect(sawQuery(client.queries, "profiles", [["case_id", CASE]])).toBe(true);
  });

  it("reads exactly one table — the judgement is derived, not stored", async () => {
    // If this ever reads a second table, the "derived, not stored" reasoning in this
    // file's header stops holding and criterion 8 has to be revisited.
    const client = db();
    await readCaseVisaRisk(CASE, STAFF, client.client);
    expect([...new Set(client.queries.map((q) => q.table))]).toEqual(["profiles"]);
  });
});
