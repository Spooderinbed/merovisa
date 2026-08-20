/**
 * MV-183 — the lodgement read, asserted against a real database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs against
 * a stack it hosts itself.
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
 * `tests/cases/outstanding-requests-batch.test.ts` proves the BATCHING against a fake: one
 * query per chunk, a resolved row filtered out, a failed read reported as an outage. What it
 * cannot prove is that the query the queue actually sends is RLS-SCOPED — the fake has no
 * policies, so a batched `.in(case_id, [...])` that quietly crossed a tenant boundary would
 * pass every unit test in this slice.
 *
 * That risk is specific to this slice's shape. The single-case read filters on ONE case the
 * caller already authorized; the batched read hands Postgres a LIST and trusts
 * `case_document_requests_select_actor` to narrow it. This file is the proof that it does —
 * and, per `lib/cases/README.md` and MV-182's own suite, an RLS assertion that only checks a
 * denial passes identically against a missing policy, so every denial below is paired with the
 * positive read that proves the policy admits who it should.
 *
 * EVERY ASSERTION RUNS AS `authenticated`. The service-role client seeds and proves existence
 * only; a probe issued on it would bypass every policy and measure nothing.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The repository under test is an `import "server-only"` module; the marker package throws
// outside a React Server Component. Same line, same reason, as every other integration suite
// that exercises a repository (`stage3-write-grants.itest.ts:44`).
vi.mock("server-only", () => ({}));

import { listOutstandingDocumentRequestsByCase } from "@/lib/cases/document-requests-repo";
import { deriveLodgement, deriveQueueLodgement } from "@/lib/cases/lodgement";
import {
  assertLocalStack,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type TenancyFixture,
} from "./fixtures/tenancy";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage4-lodgement-read.itest.ts", url);

const TABLE = "case_document_requests";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-183 lodgement read", () => {
  let fixture: TenancyFixture;

  /** Organization A's case: `counsellorAssignedA` is its primary counsellor. */
  let caseA: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there at all. */
  let caseB: string;

  const created: string[] = [];
  const actor = (key: ActorKey): Actor => fixture.actors[key];

  const seedRequest = async (
    caseId: string,
    organizationId: string,
    requestedBy: string,
    over: { title?: string; status?: string; due_at?: string | null } = {},
  ): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(TABLE)
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        kind: "passport",
        title: over.title ?? `MV-183 probe ${fixture.stamp}-${created.length}`,
        status: over.status ?? "outstanding",
        due_at: over.due_at ?? null,
        requested_by: requestedBy,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a request: ${error?.message}`);
    created.push(data.id);
    return data.id;
  };

  /** Turns "the fixture never seeded this" into a loud failure instead of a passing denial. */
  const proveExists = async (id: string): Promise<void> => {
    const { data, error } = await fixture.admin.from(TABLE).select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`HARNESS DEFECT: existence proof failed: ${error.message}`);
    if (!data) {
      throw new Error(
        `HARNESS DEFECT: ${TABLE} row ${id} does not exist, so "sees nothing" proves nothing.`,
      );
    }
  };

  let onB: string;

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    caseA = fixture.cases.orgAssignedA;
    caseB = fixture.cases.orgAssignedB;

    // Case A: two outstanding (one dated, one not) plus one already resolved — the exact
    // mixture the blocker selection has to order correctly.
    await seedRequest(caseA, fixture.orgA, actor("adminA").id, {
      title: "MV-183 later",
      due_at: "2026-12-01T00:00:00.000Z",
    });
    await seedRequest(caseA, fixture.orgA, actor("adminA").id, {
      title: "MV-183 soonest",
      due_at: "2026-09-01T00:00:00.000Z",
    });
    await seedRequest(caseA, fixture.orgA, actor("adminA").id, {
      title: "MV-183 resolved",
      status: "resolved",
      due_at: "2026-01-01T00:00:00.000Z",
    });

    onB = await seedRequest(caseB, fixture.orgB, actor("adminB").id, { title: "MV-183 org B" });
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    if (created.length) await fixture.admin.from(TABLE).delete().in("id", created);
    await fixture.teardown();
  }, 180_000);

  // ===================================================================================
  // The batched read, through RLS
  // ===================================================================================
  describe("the batched read is RLS-scoped", () => {
    it("an assigned counsellor gets their own case's outstanding rows", async () => {
      const result = await listOutstandingDocumentRequestsByCase(
        [caseA],
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The POSITIVE half: without it, the denial below would pass against a table with no
      // policy at all.
      expect(result.byCase.get(caseA)?.map((r) => r.title).sort()).toEqual([
        "MV-183 later",
        "MV-183 soonest",
      ]);
    });

    it("a case id from ANOTHER organization is narrowed away inside the same batch", async () => {
      // The shape this file exists for: the queue hands Postgres a LIST of case ids, so the
      // policy — not the app — has to remove the ones this actor may not see. A batch that
      // leaked would still look correct to every unit test in this slice.
      await proveExists(onB);

      const result = await listOutstandingDocumentRequestsByCase(
        [caseA, caseB],
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.byCase.has(caseA)).toBe(true);
      expect(result.byCase.has(caseB)).toBe(false);
    });

    it("an outsider's batch comes back empty rather than partly filled", async () => {
      await proveExists(onB);

      const result = await listOutstandingDocumentRequestsByCase(
        [caseA, caseB],
        actor("outsider").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.byCase.size).toBe(0);
    });

    it("an org admin sees their whole organization's case", async () => {
      const result = await listOutstandingDocumentRequestsByCase([caseA], actor("adminA").client);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.byCase.get(caseA)).toHaveLength(2);
    });
  });

  // ===================================================================================
  // What the read MEANS, end to end
  // ===================================================================================
  describe("the derivation, against real rows", () => {
    it("blocks on the soonest-due outstanding request and ignores the resolved one", async () => {
      const result = await listOutstandingDocumentRequestsByCase([caseA], actor("adminA").client);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const read = deriveQueueLodgement(result.byCase.get(caseA) ?? []);

      expect(read.state).toBe("blocked");
      if (read.state !== "blocked") return;
      // "MV-183 resolved" is due earliest of all three and must never be the blocker.
      expect(read.blocker.title).toBe("MV-183 soonest");
      expect(read.otherOutstanding).toBe(1);
    });

    it("a case with nothing outstanding reports none-outstanding, not clear", async () => {
      const result = await listOutstandingDocumentRequestsByCase(
        [fixture.cases.orgUnassignedA],
        actor("adminA").client,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(deriveQueueLodgement(result.byCase.get(fixture.cases.orgUnassignedA) ?? []).state).toBe(
        "none-outstanding",
      );
    });

    it("the panel's whole-list read tells an untouched case from a chased one", async () => {
      // Read through the same authenticated client the page uses, then derive.
      const { data, error } = await actor("adminA")
        .client.from(TABLE)
        .select("id, kind, title, note, status, due_at, created_at, resolved_at")
        .eq("case_id", fixture.cases.orgUnassignedA);
      expect(error).toBeNull();

      const rows = (data ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        dueAt: r.due_at,
        createdAt: r.created_at,
      }));

      // Nothing has ever been requested on this case, so it must NOT borrow the word a
      // fully-chased case earned.
      expect(rows).toHaveLength(0);
      expect(deriveLodgement(rows).state).toBe("nothing-requested");
    });
  });
});
