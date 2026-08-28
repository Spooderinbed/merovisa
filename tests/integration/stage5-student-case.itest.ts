/**
 * MV-195 — Stage 5 slice 3: the student's view of their consultancy case, asserted against a
 * REAL database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs against a
 * stack it hosts itself.
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 * `tests/cases/student-case-route.test.ts` and `tests/app/student-consultancy-pages.test.tsx`
 * prove the APP layer: which claim the gate asks for, which refusal each outcome renders, and
 * what the page does and does not put in its markup. Neither can prove Postgres agrees, and
 * the app layer is explicitly NOT the tenant boundary (`lib/cases/README.md`) — RLS evaluated
 * as the authenticated user is. **Case authorization is enforced in both layers
 * independently, so a single-layer mutant survives at full green**; this file is the other
 * layer.
 *
 * **AN RLS SUITE THAT ONLY ASSERTS DENIALS PASSES IDENTICALLY AGAINST A MISSING POLICY.** A
 * table with RLS forced and no policy at all denies everything. So every denial below is
 * PAIRED with the positive proving the policy admits the actor it is supposed to admit, and
 * every silent denial is paired with a service-role existence proof so it cannot be satisfied
 * by a fixture that never seeded.
 *
 * `supabase/rehearsal/MV-195-mutation.sql` is the other half: mutants that WIDEN (never drop
 * — a drop leaves every denial green), each naming the tests it must turn red.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ONE THE CARD TURNS ON — DECISION D, MEASURED HERE
 * ---------------------------------------------------------------------------------------
 * "How much of the consultancy case does the student see, and can they ANSWER?" was to be
 * settled by measuring the policies rather than by preference. The measurement is the two
 * describe blocks named `decision D`, and it is a clean split:
 *
 *   READ  — `case_document_requests_select_actor`, `case_document_versions_select_actor` and
 *           `case_document_reviews_select_actor` all ride `private.actor_case_ids()`, whose
 *           first disjunct is `student_user_id = auth.uid()`. The linked student sees all
 *           three, rejection notes included.
 *   WRITE — every INSERT policy on those tables, and `case_document_requests_update_staff`,
 *           ride `private.can_staff_case`, which is `can_access_case` MINUS the student
 *           disjunct. The linked student writes nothing.
 *
 * So answering a request needs a new policy and a new column grant — a MIGRATION — and the
 * card makes that a separate slice. These tests are what makes that a measurement rather than
 * a claim, and what will fail the day somebody widens one of those policies by accident.
 *
 * EVERY ASSERTION RUNS AS `authenticated`. A probe issued on the service-role client bypasses
 * every policy and proves nothing; service-role appears here only to seed, to prove a row
 * exists so a silent denial is distinguishable from an absent fixture, and to clean up.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The modules under test are `import "server-only"`; in the node lane that marker package
// resolves to the entry that throws on import. The established repo idiom.
vi.mock("server-only", () => ({}));

import {
  assertLocalStack,
  createStudentDataSeeder,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type StudentCaseRows,
  type StudentDataSeeder,
  type TenancyFixture,
} from "./fixtures/tenancy";
import { listLinkedConsultancyCases } from "@/lib/cases/linked-consultancy-cases";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage5-student-case.itest.ts", url);

describe.skipIf(!url || !serviceKey || !anonKey)("MV-195 Stage 5 — the student's consultancy case", () => {
  let fixture: TenancyFixture;

  /** Organization A, linked student `studentA`, `counsellorAssignedA` assigned. */
  let consultancyCase: string;
  /** `organization_id IS NULL`, same student. The half that must never cross. */
  let personalCase: string;
  /** Organization B, linked student `studentB`. The other side of every read denial. */
  let otherStudentCase: string;

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  /** Real student rows on the personal case, so "no data crosses" is asserted over real data. */
  let seeder: StudentDataSeeder;
  let personalRows: StudentCaseRows;

  /** The request/version/review chain the student is supposed to be able to READ. */
  let requestId: string;
  let versionId: string;
  let reviewId: string;

  /** The three Stage 4 tables this file seeds, as the generated types spell them. */
  type SeededTable =
    | "case_document_requests"
    | "case_document_versions"
    | "case_document_reviews";

  const seeded: Array<{ table: SeededTable; id: string }> = [];

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    consultancyCase = fixture.cases.orgAssignedA;
    personalCase = fixture.cases.personalA;
    otherStudentCase = fixture.cases.orgAssignedB;

    seeder = createStudentDataSeeder(fixture);
    // A REAL catalogue row: `user_program_state.program_id` is a FK into `public.programs`.
    const { data: programs } = await fixture.admin.from("programs").select("id").limit(1);
    const programId = (programs ?? [])[0]?.id;
    if (!programId) throw new Error("HARNESS DEFECT: the programs catalogue is empty");
    personalRows = await seeder.seedStudentCase({
      label: "mv195-personal",
      caseId: personalCase,
      owner: actor("studentA").id,
      programId,
      documentKind: "passport",
    });

    // The chain, seeded through the service role: a consultancy ASKS, a file ARRIVES, and a
    // counsellor JUDGES it. All three rows are what the student must be able to read.
    const request = await fixture.admin
      .from("case_document_requests")
      .insert({
        case_id: consultancyCase,
        organization_id: fixture.orgA,
        kind: "passport",
        title: "MV-195 passport bio page",
        note: "MV-195 the page with your photo on it",
        requested_by: actor("counsellorAssignedA").id,
      })
      .select("id")
      .single();
    if (request.error || !request.data) {
      throw new Error(`HARNESS DEFECT: could not seed a request: ${request.error?.message}`);
    }
    requestId = request.data.id;
    seeded.push({ table: "case_document_requests", id: requestId });

    const version = await fixture.admin
      .from("case_document_versions")
      .insert({
        case_id: consultancyCase,
        organization_id: fixture.orgA,
        request_id: requestId,
        storage_path: `case/${consultancyCase}/mv195`,
        file_size: 1024,
        original_name: "mv195-passport.pdf",
        content_type: "application/pdf",
        uploaded_by: actor("counsellorAssignedA").id,
      })
      .select("id")
      .single();
    if (version.error || !version.data) {
      throw new Error(`HARNESS DEFECT: could not seed a version: ${version.error?.message}`);
    }
    versionId = version.data.id;
    seeded.push({ table: "case_document_versions", id: versionId });

    const review = await fixture.admin
      .from("case_document_reviews")
      .insert({
        case_id: consultancyCase,
        organization_id: fixture.orgA,
        version_id: versionId,
        decision: "rejected",
        note: "MV-195 the photo page is cut off at the bottom",
        reviewed_by: actor("counsellorAssignedA").id,
      })
      .select("id")
      .single();
    if (review.error || !review.data) {
      throw new Error(`HARNESS DEFECT: could not seed a review: ${review.error?.message}`);
    }
    reviewId = review.data.id;
    seeded.push({ table: "case_document_reviews", id: reviewId });
  }, 60_000);

  afterAll(async () => {
    // Reverse order: reviews reference versions reference requests reference cases, and every
    // student-data table references `cases` with ON DELETE RESTRICT.
    for (const row of [...seeded].reverse()) {
      await fixture.admin.from(row.table).delete().eq("id", row.id);
    }
    if (seeder) await seeder.cleanup();
    if (fixture) await fixture.teardown();
  });

  // =====================================================================================
  // Controls — the fixture is real and the clients are RLS-scoped
  // =====================================================================================
  describe("controls", () => {
    it("seeds one student holding BOTH a consultancy case and a personal case", () => {
      // Without this the separation assertions below would be satisfied by a student who
      // held only one case — the founder decision would read as honoured by an empty shape.
      expect(fixture.caseOrg.orgAssignedA).toBe(fixture.orgA);
      expect(fixture.caseOrg.personalA).toBeNull();
      expect(consultancyCase).not.toBe(personalCase);
      expect(personalRows.profile).toBeTruthy();
    });

    it("the three rows a student must be able to read really exist", async () => {
      // The existence proof behind every silent denial below: a policy refusal and an absent
      // fixture both look like zero rows through an RLS-scoped client.
      for (const { table, id } of seeded) {
        const { data } = await fixture.admin.from(table).select("id").eq("id", id).maybeSingle();
        expect(data, `${table} row ${id} was not seeded`).not.toBeNull();
      }
    });
  });

  // =====================================================================================
  // The resolvers — the founder decision, on real rows, through a real JWT
  // =====================================================================================
  describe("MV-195 criterion 4 — the two resolvers are a matched pair", () => {
    it("the consultancy resolver returns the CONSULTANCY case and not the personal one", async () => {
      const result = await listLinkedConsultancyCases(
        actor("studentA").id,
        actor("studentA").client,
      );

      expect(result.ok).toBe(true);
      const ids = result.ok ? result.data.map((c) => c.id) : [];
      expect(ids).toContain(consultancyCase);
      expect(ids).not.toContain(personalCase);
    });

    it("the personal resolver returns the PERSONAL case, with both in reach", async () => {
      // The regression this slice is most able to cause: `resolvePersonalCaseId` is the only
      // place a `(student)` route turns an actor into a case id, so if it ever answered with
      // the consultancy case the whole `(student)` family would re-point at a workspace the
      // consultancy owns. Asserted here against a database where BOTH rows are visible to
      // the actor, which is the only condition under which the predicate is load-bearing.
      const personal = await resolvePersonalCaseId(actor("studentA").id, actor("studentA").client);

      expect(personal).toBe(personalCase);
      expect(personal).not.toBe(consultancyCase);
    });

    it("another student's consultancy case is invisible, and their own is not", async () => {
      // Paired, so the denial cannot be satisfied by a policy that admits nobody.
      const mine = await listLinkedConsultancyCases(actor("studentA").id, actor("studentA").client);
      const theirs = await listLinkedConsultancyCases(actor("studentB").id, actor("studentB").client);

      expect(mine.ok && mine.data.map((c) => c.id)).not.toContain(otherStudentCase);
      expect(theirs.ok && theirs.data.map((c) => c.id)).toContain(otherStudentCase);
      expect(theirs.ok && theirs.data.map((c) => c.id)).not.toContain(consultancyCase);
    });

    it("an outsider holds no consultancy case at all", async () => {
      const result = await listLinkedConsultancyCases(
        actor("outsider").id,
        actor("outsider").client,
      );

      expect(result).toEqual({ ok: true, data: [] });
    });
  });

  // =====================================================================================
  // Decision D, half one: the student may READ
  // =====================================================================================
  describe("decision D — the linked student READS what has been asked of them", () => {
    it("sees the request their consultancy made", async () => {
      const { data, error } = await actor("studentA")
        .client.from("case_document_requests")
        .select("id, title, note")
        .eq("case_id", consultancyCase);

      expect(error).toBeNull();
      expect((data ?? []).map((r) => r.id)).toContain(requestId);
    });

    it("sees the version that arrived against it", async () => {
      const { data, error } = await actor("studentA")
        .client.from("case_document_versions")
        .select("id")
        .eq("case_id", consultancyCase);

      expect(error).toBeNull();
      expect((data ?? []).map((r) => r.id)).toContain(versionId);
    });

    it("sees the REJECTION NOTE — the half of the model that is any use to them", async () => {
      // MV-185 stores the note for exactly this reader: "rejected" with no words is a wall,
      // and this surface is where it stops being one.
      const { data, error } = await actor("studentA")
        .client.from("case_document_reviews")
        .select("id, decision, note")
        .eq("case_id", consultancyCase);

      expect(error).toBeNull();
      const mine = (data ?? []).find((r) => r.id === reviewId);
      expect(mine?.decision).toBe("rejected");
      expect(mine?.note).toContain("cut off at the bottom");
    });

    it("a DIFFERENT student sees none of the three, though all three exist", async () => {
      for (const table of [
        "case_document_requests",
        "case_document_versions",
        "case_document_reviews",
      ] as const) {
        const { data, error } = await actor("studentB")
          .client.from(table)
          .select("id")
          .eq("case_id", consultancyCase);

        expect(error, `${table} errored rather than filtering`).toBeNull();
        expect(data ?? [], `${table} leaked to another student`).toEqual([]);
      }
    });
  });

  // =====================================================================================
  // Decision D, half two: the student may WRITE NOTHING
  // =====================================================================================
  describe("decision D — the linked student may not ANSWER, which is why this slice is read-only", () => {
    it("cannot upload a version against their own case", async () => {
      // `case_document_versions_insert_staff`'s FIRST conjunct is `can_staff_case`, which is
      // `can_access_case` minus the student disjunct — precisely so the student's own link
      // cannot launder them into the counsellor's chair on their own file.
      const { error } = await actor("studentA")
        .client.from("case_document_versions")
        .insert({
          case_id: consultancyCase,
          organization_id: fixture.orgA,
          request_id: requestId,
          storage_path: `case/${consultancyCase}/student-attempt`,
          file_size: 1,
          original_name: "student-attempt.pdf",
          uploaded_by: actor("studentA").id,
        })
        .select("id");

      expect(error?.code).toBe("42501");
    });

    it("cannot review — a student must not judge their own file", async () => {
      const { error } = await actor("studentA")
        .client.from("case_document_reviews")
        .insert({
          case_id: consultancyCase,
          organization_id: fixture.orgA,
          version_id: versionId,
          decision: "accepted",
          reviewed_by: actor("studentA").id,
        })
        .select("id");

      expect(error?.code).toBe("42501");
    });

    it("cannot mint a request against themselves", async () => {
      const { error } = await actor("studentA")
        .client.from("case_document_requests")
        .insert({
          case_id: consultancyCase,
          organization_id: fixture.orgA,
          kind: "passport",
          title: "MV-195 student-minted",
          requested_by: actor("studentA").id,
        })
        .select("id");

      expect(error?.code).toBe("42501");
    });

    it("cannot mark a request resolved by hand", async () => {
      // A policy refusal on UPDATE is not an error — Postgres reports zero rows affected —
      // so this asserts the row count AND reads the row back to prove it did not move.
      const { data, error } = await actor("studentA")
        .client.from("case_document_requests")
        .update({ status: "resolved" })
        .eq("id", requestId)
        .select("id");

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      const after = await fixture.admin
        .from("case_document_requests")
        .select("status")
        .eq("id", requestId)
        .single();
      expect(after.data?.status).toBe("outstanding");
    });

    it("CONTROL: the assigned counsellor CAN do all four, so the denials are about the STUDENT", async () => {
      // Without this, every assertion above is satisfied by a table nobody may write at all —
      // which a dropped policy produces just as well as a correct one.
      const counsellor = actor("counsellorAssignedA");

      const minted = await counsellor.client
        .from("case_document_requests")
        .insert({
          case_id: consultancyCase,
          organization_id: fixture.orgA,
          kind: "birth-certificate",
          title: "MV-195 control request",
          requested_by: counsellor.id,
        })
        .select("id")
        .single();
      expect(minted.error).toBeNull();
      const controlRequest = minted.data!.id;
      seeded.push({ table: "case_document_requests", id: controlRequest });

      const uploaded = await counsellor.client
        .from("case_document_versions")
        .insert({
          case_id: consultancyCase,
          organization_id: fixture.orgA,
          request_id: controlRequest,
          storage_path: `case/${consultancyCase}/control`,
          file_size: 2,
          original_name: "control.pdf",
          uploaded_by: counsellor.id,
        })
        .select("id")
        .single();
      expect(uploaded.error).toBeNull();
      const controlVersion = uploaded.data!.id;
      seeded.push({ table: "case_document_versions", id: controlVersion });

      const judged = await counsellor.client
        .from("case_document_reviews")
        .insert({
          case_id: consultancyCase,
          organization_id: fixture.orgA,
          version_id: controlVersion,
          decision: "accepted",
          reviewed_by: counsellor.id,
        })
        .select("id")
        .single();
      expect(judged.error).toBeNull();
      seeded.push({ table: "case_document_reviews", id: judged.data!.id });
    });
  });

  // =====================================================================================
  // Decision A, measured: why the student surface names no consultancy
  // =====================================================================================
  describe("decision A — the student cannot read the organization, so the surface names none", () => {
    it("the linked student cannot read their consultancy's `organizations` row", async () => {
      // `organizations_select_member` rides `private.actor_org_ids()`, i.e. an
      // `organization_memberships` row — and `student` is deliberately not a membership role.
      // So "do not leak the organization's internal naming" is not merely a design choice on
      // the page; there is nothing for it to leak.
      const { data, error } = await actor("studentA")
        .client.from("organizations")
        .select("id, name")
        .eq("id", fixture.orgA);

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it("CONTROL: a member of that organization CAN read it", async () => {
      const { data, error } = await actor("adminA")
        .client.from("organizations")
        .select("id")
        .eq("id", fixture.orgA);

      expect(error).toBeNull();
      expect((data ?? []).map((o) => o.id)).toContain(fixture.orgA);
    });
  });

  // =====================================================================================
  // Criterion 5 — the personal case is untouched, asserted on both sides
  // =====================================================================================
  describe("MV-195 criterion 5 — the two cases stay separate", () => {
    const caseRow = async (id: string): Promise<Record<string, unknown>> => {
      const { data, error } = await fixture.admin.from("cases").select("*").eq("id", id).single();
      if (error || !data) throw new Error(`HARNESS DEFECT: could not read case ${id}`);
      return data as unknown as Record<string, unknown>;
    };

    /** The student-owned tables MV-159 migrated onto `case_id`, as the generated types spell them. */
    type CaseScopedTable = "profiles" | "documents" | "plan_items" | "assessments";

    const rowsOn = async (table: CaseScopedTable, id: string): Promise<unknown[]> => {
      const { data, error } = await fixture.admin.from(table).select("*").eq("case_id", id);
      if (error) throw new Error(`HARNESS DEFECT: could not read ${table}: ${error.message}`);
      return (data ?? []) as unknown[];
    };

    it("CONTROL: the personal case really carries the student's own rows", async () => {
      expect((await caseRow(personalCase)).student_user_id).toBe(actor("studentA").id);
      expect(await rowsOn("profiles", personalCase)).toHaveLength(1);
      expect((await rowsOn("documents", personalCase)).length).toBeGreaterThan(0);
    });

    it("the personal case is BYTE-FOR-BYTE untouched by reading the consultancy case", async () => {
      const before = {
        row: await caseRow(personalCase),
        profiles: await rowsOn("profiles", personalCase),
        documents: await rowsOn("documents", personalCase),
      };

      // Everything the student surface does, in one pass.
      await listLinkedConsultancyCases(actor("studentA").id, actor("studentA").client);
      await resolvePersonalCaseId(actor("studentA").id, actor("studentA").client);
      await actor("studentA").client.from("case_document_requests").select("*").eq("case_id", consultancyCase);
      await actor("studentA").client.from("case_document_versions").select("*").eq("case_id", consultancyCase);
      await actor("studentA").client.from("case_document_reviews").select("*").eq("case_id", consultancyCase);

      expect(await caseRow(personalCase)).toEqual(before.row);
      expect(await rowsOn("profiles", personalCase)).toEqual(before.profiles);
      expect(await rowsOn("documents", personalCase)).toEqual(before.documents);
    });

    it("nothing from the personal case reached the consultancy case", async () => {
      // The other direction, and the one the founder decision names as a DEFECT rather than
      // a nicety: a helpful "we brought your profile over" would show up here as rows.
      for (const table of ["profiles", "documents", "plan_items", "assessments"] as const) {
        expect(await rowsOn(table, consultancyCase), `${table} crossed`).toEqual([]);
      }
    });
  });
});
