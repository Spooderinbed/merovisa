/**
 * MV-196 — Stage 5 slice 4, CRITERION 1: what a linked student's write to a consultancy case
 * actually does TODAY, measured against a real database BEFORE anything is changed.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE IS A MEASUREMENT, AND IT IS SUPPOSED TO BE RED
 * ---------------------------------------------------------------------------------------
 * `CASE_PERMISSION_MATRIX.student["case.update"]` is `"linked"` (`lib/cases/permissions.ts`).
 * Stage 1 wrote that down as a forward-looking caution in `lib/cases/README.md` — there were no
 * linked students then, so it cost nothing. MV-194 made it live: a student who accepts an
 * invitation is `cases.student_user_id` on an ORG-OWNED case, and `"linked"` is satisfied by
 * exactly that column.
 *
 * So the assertions below state the boundary the card INTENDS, not the behaviour that exists.
 * Every one that fails is the gap, quantified. The card's criterion 1 is explicit that this
 * comes first: "If the measurement contradicts facts 1–4, the card is wrong and gets rewritten,
 * not worked around."
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH LAYERS ARE PROBED, SEPARATELY
 * ---------------------------------------------------------------------------------------
 * `lib/cases/README.md`: "This layer allowing something the database denies is a BROKEN
 * FEATURE; the database allowing something this layer denies is a SECURITY HOLE." The two
 * layers are enforced independently, so a single-layer mutant survives at full green — and a
 * TypeScript-only gate is not a boundary at all against a caller who skips TypeScript.
 *
 * That caller is not hypothetical. `NEXT_PUBLIC_SUPABASE_URL` and the anon key ship in client
 * JS and the student's access token sits in their own browser, so PostgREST is directly
 * reachable by any signed-in student. **Layer 2 below is issued exactly the way such a caller
 * would issue it**: `actor("studentA").client`, an RLS-scoped client holding that student's own
 * JWT, talking straight to PostgREST with no route in between.
 *
 * EVERY ASSERTION RUNS AS `authenticated`. Service-role appears only to seed, to prove a row
 * exists so a silent denial is distinguishable from an absent fixture, and to clean up.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE TRAP THIS FILE HAD TO AVOID — AND THE STALE PROSE ABOUT IT
 * ---------------------------------------------------------------------------------------
 * `user_program_state` and `document_status` carry MV-155 §H's `mv155_derive_case_id_from_owner`
 * trigger. It is widely described — in the plan, and in this suite's own fixture doc-comment —
 * as OVERWRITING `case_id` with the owner's personal case whenever `owner` is not null, which
 * would silently redirect an org-case probe home and read as "denied".
 *
 * **It has not behaved that way since MV-159**, which added the `new.case_id is null` qualifier:
 * the trigger now derives INTO THE GAP and never over an existing binding. Measured, not
 * assumed — see the pinned test at the bottom, which asserts both halves.
 *
 * Two consequences, and they pull in opposite directions. The consultancy rows are still seeded
 * `owner: null` (the shape MV-156 exists to permit, and what a consultancy row looks like). But
 * the "accidental defence" that shape was thought to be working around DOES NOT EXIST: an
 * owner-bearing row naming an org case stays on the org case. Nothing at the trigger layer
 * stands between a linked student and a consultancy case.
 *
 * Run locally: see the header of `stage5-student-case.itest.ts`. LOCAL STACK ONLY.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The modules under test are `import "server-only"`; in the node lane that marker package
// resolves to the entry that throws on import. The established repo idiom.
vi.mock("server-only", () => ({}));

import {
  assertLocalStack,
  createStudentDataSeeder,
  readGrantedWriteSurface,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type StudentCaseRows,
  type StudentDataSeeder,
  type TenancyFixture,
} from "./fixtures/tenancy";
import { resolveTargetCase } from "@/lib/cases/target-case";
import type { CaseAuthorizationClient } from "@/lib/cases/context";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage5-student-write-boundary.itest.ts", url);

describe.skipIf(!url || !serviceKey || !anonKey)(
  "MV-196 Stage 5 — the linked student's write boundary, as it stands today",
  () => {
    let fixture: TenancyFixture;

    /** Organization A, linked student `studentA`, `counsellorAssignedA` assigned. */
    let consultancyCase: string;
    /** `organization_id IS NULL`, same student. */
    let personalCase: string;

    const actor = (key: ActorKey): Actor => fixture.actors[key];
    /** The fixture's clients are `SupabaseClient<Database>`; the case layer takes the narrower
     *  read-only shape it actually uses. Structural, not a widening. */
    const authClient = (key: ActorKey): CaseAuthorizationClient =>
      actor(key).client as unknown as CaseAuthorizationClient;

    let seeder: StudentDataSeeder;
    /** Real student rows ON THE CONSULTANCY CASE — `owner: null`, per the trigger note above. */
    let orgRows: StudentCaseRows;
    /** The same shape on the personal case, so every denial has its matching permission. */
    let personalRows: StudentCaseRows;

    /** Further catalogue rows, so an insert probe cannot collide with a seeded row on
     *  `(case_id, program_id)` and report `23505` where it means `42501`. A DISTINCT id per
     *  probe is required rather than merely a second one, because a probe that is ADMITTED
     *  leaves its row behind and the next probe would then collide with that. */
    let probeProgramId: string;
    let triggerProgramId: string;

    /**
     * Rows the student SUCCEEDED in writing — i.e. the gap, as rows. The seeder cannot track
     * these (it did not create them), and every one of these tables references `cases` with ON
     * DELETE RESTRICT, so leaving them behind fails `fixture.teardown()` with `23503` and
     * poisons every later suite against this long-lived local stack.
     */
    const strays: Array<{ table: string; id: string | number }> = [];

    beforeAll(async () => {
      fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
      consultancyCase = fixture.cases.orgAssignedA;
      personalCase = fixture.cases.personalA;

      seeder = createStudentDataSeeder(fixture);

      // REAL catalogue rows: `user_program_state.program_id` is a FK into `public.programs`.
      const { data: programs } = await fixture.admin.from("programs").select("id").limit(3);
      const [seedProgramId, probeId, triggerId] = (programs ?? []).map((p) => p.id);
      if (!seedProgramId || !probeId || !triggerId) {
        throw new Error("HARNESS DEFECT: the programs catalogue has fewer than 3 rows");
      }
      probeProgramId = probeId;
      triggerProgramId = triggerId;

      orgRows = await seeder.seedStudentCase({
        label: "mv196-consultancy",
        caseId: consultancyCase,
        owner: null,
        programId: seedProgramId,
        documentKind: "passport",
      });
      personalRows = await seeder.seedStudentCase({
        label: "mv196-personal",
        caseId: personalCase,
        owner: actor("studentA").id,
        programId: seedProgramId,
        documentKind: "passport",
      });
    }, 60_000);

    afterAll(async () => {
      // The strays FIRST, and unconditionally: while the gap is open these rows exist, and
      // while it is closed this loop is a no-op. Either way teardown must be able to run.
      for (const stray of [...strays].reverse()) {
        await fixture.admin.from(stray.table as "profiles").delete().eq("id", stray.id as string);
      }
      // MUST precede teardown: every student table references `cases` ON DELETE RESTRICT.
      if (seeder) await seeder.cleanup();
      if (fixture) await fixture.teardown();
    });

    /**
     * One insert attempt as the student, with whatever it managed to create recorded for
     * cleanup. Returns the PostgREST error code, or `null` when the write was ADMITTED —
     * which is the value the measurement is actually about.
     */
    const studentInsert = async (
      table: "user_program_state" | "document_status" | "program_predictions" | "application_attempts" | "outcome_events",
      payload: Record<string, unknown>,
    ): Promise<string | null> => {
      const { data, error } = await actor("studentA")
        .client.from(table)
        .insert(payload as never)
        .select("id");
      for (const row of data ?? []) strays.push({ table, id: (row as { id: string }).id });
      return error?.code ?? null;
    };

    /**
     * Re-issues a seeded row through a DIFFERENT client, so every enum, check constraint and
     * foreign key is valid BY CONSTRUCTION. Guessing a `status` or an `event_type` wrong yields
     * `22P02`/`23514` and would read as a refusal the policy never made.
     */
    const cloneForInsert = async (
      table: "user_program_state" | "document_status" | "program_predictions" | "application_attempts" | "outcome_events",
      id: string,
      overrides: Record<string, unknown> = {},
    ): Promise<Record<string, unknown>> => {
      const { data, error } = await fixture.admin.from(table).select("*").eq("id", id).single();
      if (error || !data) throw new Error(`HARNESS DEFECT: could not read ${table} ${id}`);
      const row = { ...(data as Record<string, unknown>) };
      delete row.id;
      delete row.created_at;
      delete row.updated_at;
      return { ...row, ...overrides };
    };

    // =================================================================================
    // Controls — green NOW and green AFTER the fix. Without these, every denial below is
    // satisfied just as well by a table nobody may write at all.
    // =================================================================================
    describe("controls", () => {
      it("seeds ONE student holding both an org-owned case and a personal case", () => {
        expect(fixture.caseOrg.orgAssignedA).toBe(fixture.orgA);
        expect(fixture.caseOrg.personalA).toBeNull();
        expect(consultancyCase).not.toBe(personalCase);
      });

      it("the student is genuinely LINKED to the consultancy case", async () => {
        // The whole premise. `"linked"` is satisfied by this column and nothing else, so if the
        // fixture did not set it the gap under measurement would not exist here at all.
        const { data } = await fixture.admin
          .from("cases")
          .select("student_user_id, organization_id")
          .eq("id", consultancyCase)
          .single();
        expect(data?.student_user_id).toBe(actor("studentA").id);
        expect(data?.organization_id).toBe(fixture.orgA);
      });

      it("the rows every write probe targets really exist", async () => {
        const targets: Array<[string, string]> = [
          ["profiles", orgRows.profile],
          ["plan_items", orgRows.openPlanItem],
          ["documents", orgRows.document],
          ["user_program_state", orgRows.programState],
          ["document_status", orgRows.documentStatus],
          ["program_predictions", orgRows.prediction],
          ["application_attempts", orgRows.attempt],
          ["outcome_events", orgRows.outcomeEvent],
        ];
        for (const [table, id] of targets) {
          const col = table === "plan_items" ? Number(id) : id;
          const { data } = await fixture.admin
            .from(table as "profiles")
            .select("id")
            .eq("id", col as string)
            .maybeSingle();
          expect(data, `${table} row ${id} was not seeded`).not.toBeNull();
        }
      });

      it("CONTROL: the assigned counsellor RESOLVES case.update on the consultancy case", async () => {
        const result = await resolveTargetCase(
          actor("counsellorAssignedA").id,
          consultancyCase,
          "case.update",
          authClient("counsellorAssignedA"),
        );
        expect(result.ok).toBe(true);
        expect(result.ok && result.caseId).toBe(consultancyCase);
      });

      it("CONTROL: the student RESOLVES case.update on their OWN personal case", async () => {
        // The permission this slice must not break. A fix that denies here has not narrowed the
        // student's reach, it has removed the student version's ability to write at all.
        const result = await resolveTargetCase(
          actor("studentA").id,
          personalCase,
          "case.update",
          authClient("studentA"),
        );
        expect(result.ok).toBe(true);
        expect(result.ok && result.caseId).toBe(personalCase);
      });

      it("CONTROL: the student may write their OWN case through PostgREST", async () => {
        // The other half of the same guarantee, one layer down. Every RLS denial below is only
        // meaningful because this succeeds.
        const { data, error } = await actor("studentA")
          .client.from("profiles")
          .update({ completeness: 42 })
          .eq("id", personalRows.profile)
          .select("id");
        expect(error).toBeNull();
        expect((data ?? []).map((r) => r.id)).toContain(personalRows.profile);
      });
    });

    // =================================================================================
    // LAYER 1 — the TypeScript gate. RED TODAY: `student → case.update → "linked"`.
    // =================================================================================
    describe("layer 1 (TypeScript) — the linked student must not resolve case.update", () => {
      it("resolveTargetCase DENIES the student on the consultancy case", async () => {
        // The single assertion the whole slice turns on. Today `"linked"` admits them and this
        // returns `{ ok: true }`, which is the gap stated as a value.
        const result = await resolveTargetCase(
          actor("studentA").id,
          consultancyCase,
          "case.update",
          authClient("studentA"),
        );
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.kind).toBe("denied");
      });

      it("...and a student with NO link to it is denied too, as they already are", async () => {
        // Pairs the assertion above: it must fail for `studentA` because of the PERMISSION, not
        // because `resolveTargetCase` denies everyone.
        const result = await resolveTargetCase(
          actor("studentB").id,
          consultancyCase,
          "case.update",
          authClient("studentB"),
        );
        expect(result.ok).toBe(false);
      });
    });

    // =================================================================================
    // LAYER 2 — RLS, probed the way a student's own browser could probe it.
    // =================================================================================
    describe("layer 2 (RLS) — the linked student's direct PostgREST writes on the org case", () => {
      it("cannot UPDATE the case profile", async () => {
        // Criterion 1 names this one explicitly. A policy refusal on UPDATE is not an error —
        // Postgres reports zero rows — so this asserts the row count AND reads the row back.
        const before = await fixture.admin
          .from("profiles")
          .select("completeness")
          .eq("id", orgRows.profile)
          .single();

        const { data, error } = await actor("studentA")
          .client.from("profiles")
          .update({ completeness: 99 })
          .eq("id", orgRows.profile)
          .select("id");

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);

        const after = await fixture.admin
          .from("profiles")
          .select("completeness")
          .eq("id", orgRows.profile)
          .single();
        expect(after.data?.completeness).toBe(before.data?.completeness);
      });

      it("cannot UPDATE a plan item on the case", async () => {
        // `plan_items.id` is BIGINT where every other id here is a uuid.
        const { data, error } = await actor("studentA")
          .client.from("plan_items")
          .update({ status: "done" })
          .eq("id", Number(orgRows.openPlanItem))
          .select("id");

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);

        const after = await fixture.admin
          .from("plan_items")
          .select("status")
          .eq("id", Number(orgRows.openPlanItem))
          .single();
        expect(after.data?.status).not.toBe("done");
      });

      it("cannot DELETE a document from the case", async () => {
        const { data, error } = await actor("studentA")
          .client.from("documents")
          .delete()
          .eq("id", orgRows.document)
          .select("id");

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);

        const after = await fixture.admin
          .from("documents")
          .select("id")
          .eq("id", orgRows.document)
          .maybeSingle();
        expect(after.data, "the document was destroyed").not.toBeNull();
      });

      it("cannot INSERT shortlist state onto the case", async () => {
        const payload = await cloneForInsert("user_program_state", orgRows.programState, {
          program_id: probeProgramId,
        });
        expect(await studentInsert("user_program_state", payload)).toBe("42501");
      });

      it("cannot INSERT a checklist tick onto the case", async () => {
        const payload = await cloneForInsert("document_status", orgRows.documentStatus, {
          kind: "birth-certificate",
        });
        expect(await studentInsert("document_status", payload)).toBe("42501");
      });

      it("cannot INSERT a prediction, an attempt or an outcome onto the case", async () => {
        // The three tables that carry the case's JUDGEMENT — a student writing here would be
        // authoring the consultancy's own record of the advice it gave.
        //
        // ALL THREE ARE MEASURED BEFORE ANYTHING IS ASSERTED. A loop that asserts per iteration
        // stops at the first refusal that is missing and reports the remaining tables as
        // untested — which is how the first run of this file said "application_attempts" and
        // said nothing at all about `outcome_events`.
        const measured = {
          program_predictions: await studentInsert(
            "program_predictions",
            await cloneForInsert("program_predictions", orgRows.prediction),
          ),
          application_attempts: await studentInsert(
            "application_attempts",
            await cloneForInsert("application_attempts", orgRows.attempt),
          ),
          outcome_events: await studentInsert(
            "outcome_events",
            await cloneForInsert("outcome_events", orgRows.outcomeEvent),
          ),
        };

        expect(measured).toEqual({
          program_predictions: "42501",
          application_attempts: "42501",
          outcome_events: "42501",
        });
      });
    });

    // =================================================================================
    // Two facts the fix has to be designed AROUND, pinned so they cannot quietly change.
    // =================================================================================
    describe("pinned — the shape of the surface being closed", () => {
      it("`documents` grants `authenticated` no INSERT, so RLS can NEVER catch an upload", async () => {
        // This is why `app/api/documents/upload/route.ts` writes through the service-role admin
        // client, and therefore why the TypeScript gate is the ONLY gate on that route. It is
        // the one place where "the database is the real boundary" is not available as a fallback
        // — which is what makes layer 1 above load-bearing rather than belt-and-braces.
        const granted = readGrantedWriteSurface(["documents"]);
        expect(granted).not.toContain("documents.insert");
      });

      it("the MV-155 §H trigger derives INTO THE GAP only — it does not redirect a named case", async () => {
        // MEASURED, BECAUSE THE PROSE ABOUT IT IS STALE. `mv155_derive_case_id_from_owner` is
        // widely described — including in this suite's own fixture doc-comment — as OVERWRITING
        // `case_id` with the owner's personal case whenever `owner` is not null. It has not done
        // that since MV-159 added the `new.case_id is null` qualifier:
        //
        //     if new.case_id is null and new.owner is not null then ... end if;
        //
        // The difference is the whole question of whether there is an accidental second line of
        // defence here. There is NOT. An owner-bearing row naming an org case stays on the org
        // case, so nothing at the trigger layer stands between a linked student and a
        // consultancy case — which is why the two probes below are asserted TOGETHER.
        const derived = await fixture.admin
          .from("user_program_state")
          .insert({
            owner: actor("studentA").id,
            case_id: null,
            program_id: triggerProgramId,
            status: "shortlisted",
          } as never)
          .select("id, case_id")
          .single();
        if (derived.data?.id) strays.push({ table: "user_program_state", id: derived.data.id });

        const named = await fixture.admin
          .from("user_program_state")
          .insert({
            owner: actor("studentA").id,
            case_id: consultancyCase,
            program_id: triggerProgramId,
            status: "shortlisted",
          } as never)
          .select("id, case_id")
          .single();
        if (named.data?.id) strays.push({ table: "user_program_state", id: named.data.id });

        expect(derived.error).toBeNull();
        expect(named.error).toBeNull();
        expect({
          gapWasFilled: derived.data?.case_id === personalCase,
          namedCaseSurvived: named.data?.case_id === consultancyCase,
        }).toEqual({ gapWasFilled: true, namedCaseSurvived: true });
      });
    });
  },
);
