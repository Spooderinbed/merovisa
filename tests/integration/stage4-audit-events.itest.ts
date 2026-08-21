/**
 * MV-189 — Stage 4 slice 5: document-access audit events, asserted against a real database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs
 * against a stack it hosts itself.
 *
 * Run locally:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npx vitest run --config vitest.integration.config.ts tests/integration/stage4-audit-events.itest.ts
 *
 * Skips cleanly (never fails) when those env vars are absent — SO A GREEN `npm test` IS NOT
 * EVIDENCE THIS FILE RAN. Read the count. LOCAL STACK ONLY.
 *
 * -------------------------------------------------------------------------------------
 * WHAT THIS FILE IS EVIDENCE FOR
 * -------------------------------------------------------------------------------------
 * Spec §8 took three decisions that only Postgres can confirm:
 *
 *   D11 — the write is a direct INSERT because `private` is not an exposed PostgREST
 *         schema. Asserted here so the claim keeps being true in CI rather than only on
 *         the day it was measured: `/rest/v1/rpc/write_audit_event` must stay unreachable.
 *
 *   D12 — the writer THROWS rather than silently succeeding. A PostgREST `42501` RESOLVES
 *         rather than rejecting (MISTAKES.md, Silent failures), so "it did not throw" is
 *         not the same as "a row was written" — the row is read back.
 *
 *   D15 — `organization_id` decides whether the log is readable AT ALL.
 *         `audit_events_select_admin` is `USING (organization_id = ANY (…))`, and
 *         `NULL = ANY(…)` is `NULL`, not `true`.
 *
 * -------------------------------------------------------------------------------------
 * THE FIXTURE TRAP THIS FILE IS BUILT AROUND
 * -------------------------------------------------------------------------------------
 * "An org admin can read the audit row" passes VACUOUSLY against a null-org fixture: the
 * row is unreadable, the admin reads nothing, and "no rows" is exactly what a correct
 * denial looks like too. Every production case today has `organization_id = NULL`, so a
 * test written against production-shaped data would prove nothing while looking green.
 *
 * This is the third appearance of that shape — MV-190's all-digit uuid made
 * `.toUpperCase()` a no-op, MV-186's 10-byte PDF never reached the signature check it was
 * written for, and both are in MISTAKES.md. So the ORDER here is deliberate: the CONTROL
 * ("the fixture can express readability at all") runs first and is a separate `it`, and
 * only then does anything assert a denial. If the control fails, the denials below are
 * known to be worthless rather than quietly trusted.
 *
 * EVERY READ ASSERTION RUNS AS `authenticated`. A probe on the service-role client
 * bypasses every policy and proves nothing; `fixture.admin` appears only in seeding,
 * teardown, and explicit existence proofs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// The writer is `server-only`; in the node lane that module throws on import.
vi.mock("server-only", () => ({}));

import { assertLocalStack, seedTenancyFixture, type TenancyFixture } from "./fixtures/tenancy";
import { writeAuditEvent, AuditWriteError } from "@/lib/audit/write-audit-event";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage4-audit-events.itest.ts", url);

const resolveDbContainer = (): string => {
  if (process.env.SUPABASE_TEST_DB_CONTAINER) return process.env.SUPABASE_TEST_DB_CONTAINER;
  const [first] = execFileSync(
    "docker",
    ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  )
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  if (first === undefined) throw new Error("no running supabase_db_* container found");
  return first;
};

describe.skipIf(!url || !serviceKey || !anonKey)("MV-189 Stage 4 document access audit", () => {
  let fixture: TenancyFixture;
  let dbContainer: string;

  /** Ids this file wrote, removed in teardown so a re-run starts clean. */
  const writtenIds: string[] = [];

  /** A tag unique to this run, so assertions never collide with the fixture's own rows. */
  const runTag = randomUUID();

  /** An org-A row and a deliberately null-org row, both written by the REAL writer. */
  let orgScopedEntity: string;
  let nullOrgEntity: string;

  beforeAll(async () => {
    dbContainer = resolveDbContainer();
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });

    orgScopedEntity = randomUUID();
    nullOrgEntity = randomUUID();

    // Written through the REAL writer on the REAL service-role client — this is the code
    // path the five routes take, not a hand-rolled insert that could diverge from it.
    await writeAuditEvent(fixture.admin as never, {
      actorUserId: fixture.actors.counsellorAssignedA.id,
      organizationId: fixture.orgA,
      caseId: fixture.cases.orgAssignedA,
      action: "document.viewed",
      entityType: `document-${runTag}`,
      entityId: orgScopedEntity,
      metadata: { kind: "passport", mime_type: "application/pdf", byte_size: 1024 },
    });

    await writeAuditEvent(fixture.admin as never, {
      actorUserId: fixture.actors.studentA.id,
      organizationId: null,
      caseId: fixture.cases.personalA,
      action: "document.uploaded",
      entityType: `document-${runTag}`,
      entityId: nullOrgEntity,
      metadata: { kind: "passport" },
    });

    const { data } = await fixture.admin
      .from("audit_events")
      .select("id")
      .eq("entity_type", `document-${runTag}`);
    for (const row of data ?? []) writtenIds.push(row.id);
  });

  afterAll(async () => {
    if (writtenIds.length) await fixture.admin.from("audit_events").delete().in("id", writtenIds);
    await fixture.teardown();
  });

  /** Rows this run wrote, as seen by one actor's RLS-scoped client. */
  const rowsSeenBy = async (client: TenancyFixture["admin"], entityId: string) => {
    const { data, error } = await client
      .from("audit_events")
      .select("id, organization_id, actor_user_id, action, entity_id, metadata")
      .eq("entity_id", entityId);
    // An RLS denial is zero rows and NO error. An actual error is a different failure and
    // must not be read as a denial.
    expect(error, "read errored rather than returning rows").toBeNull();
    return data ?? [];
  };

  describe("the write landed at all (D12 — a 42501 resolves, so read it back)", () => {
    it("wrote exactly two rows through the real writer", async () => {
      const { data, error } = await fixture.admin
        .from("audit_events")
        .select("id")
        .eq("entity_type", `document-${runTag}`);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });

    it("D14: records the authenticated human, not a service identity", async () => {
      const { data } = await fixture.admin
        .from("audit_events")
        .select("actor_user_id")
        .eq("entity_id", orgScopedEntity)
        .single();
      expect(data?.actor_user_id).toBe(fixture.actors.counsellorAssignedA.id);
    });

    it("D15: stores the organization the case actually belongs to", async () => {
      const { data } = await fixture.admin
        .from("audit_events")
        .select("organization_id")
        .eq("entity_id", orgScopedEntity)
        .single();
      expect(data?.organization_id).toBe(fixture.orgA);
    });

    it("D13: stores only allow-listed metadata keys", async () => {
      const { data } = await fixture.admin
        .from("audit_events")
        .select("metadata")
        .eq("entity_id", orgScopedEntity)
        .single();
      expect(Object.keys((data?.metadata ?? {}) as object).sort()).toEqual([
        "byte_size",
        "kind",
        "mime_type",
      ]);
    });
  });

  /* ---------------------------------------------------------------- *
   * D15 — the readability property, control FIRST
   * ---------------------------------------------------------------- */

  describe("D15 — organization_id decides whether the log is readable at all", () => {
    it("CONTROL: the fixture can express readability — org A's admin DOES read an org-A row", async () => {
      // If this fails, every denial below is worthless rather than proven. It is a separate
      // `it` for exactly that reason: a bundled control cannot be told apart from the
      // assertion it is supposed to license.
      const rows = await rowsSeenBy(fixture.actors.adminA.client, orgScopedEntity);
      expect(rows, "org A's admin cannot see org A's own audit row").toHaveLength(1);
    });

    it("org B's admin sees none of org A's rows", async () => {
      const rows = await rowsSeenBy(fixture.actors.adminB.client, orgScopedEntity);
      expect(rows).toHaveLength(0);
    });

    it("a NULL-org row is readable by org A's admin — no", async () => {
      // The write-only property, made visible. This is not a bug being pinned; it is WHY
      // `organization_id` must carry the case's real org rather than being left null for
      // convenience. Today every production case is personal, so every row would land here.
      const rows = await rowsSeenBy(fixture.actors.adminA.client, nullOrgEntity);
      expect(rows).toHaveLength(0);
    });

    it("a NULL-org row is readable by org B's admin either — no", async () => {
      const rows = await rowsSeenBy(fixture.actors.adminB.client, nullOrgEntity);
      expect(rows).toHaveLength(0);
    });

    it("a NULL-org row is not readable by the student it is about", async () => {
      const rows = await rowsSeenBy(fixture.actors.studentA.client, nullOrgEntity);
      expect(rows).toHaveLength(0);
    });

    it("a non-admin counsellor in org A cannot read org A's audit log", async () => {
      // The policy is `actor_admin_org_ids()`, not `actor_org_ids()` — being in the tenant
      // is not enough. Paired with the CONTROL above, this is a real discrimination.
      const rows = await rowsSeenBy(fixture.actors.counsellorAssignedA.client, orgScopedEntity);
      expect(rows).toHaveLength(0);
    });

    it("the linked student on the org case cannot read its audit log", async () => {
      const rows = await rowsSeenBy(fixture.actors.studentA.client, orgScopedEntity);
      expect(rows).toHaveLength(0);
    });

    it("an outsider with no membership anywhere reads nothing", async () => {
      const rows = await rowsSeenBy(fixture.actors.outsider.client, orgScopedEntity);
      expect(rows).toHaveLength(0);
    });

    it("anon reads nothing", async () => {
      const { data } = await fixture.anon
        .from("audit_events")
        .select("id")
        .eq("entity_id", orgScopedEntity);
      expect(data ?? []).toHaveLength(0);
    });
  });

  /* ---------------------------------------------------------------- *
   * Append-only, and the D11 exposure claim
   * ---------------------------------------------------------------- */

  describe("append-only is a database property, not a convention", () => {
    it("the trigger raises for service_role, which holds UPDATE and bypasses RLS", () => {
      // The UPDATE is issued BARE — no `exception when others`, no `do $$` — so psql exits
      // non-zero and execFileSync throws. That is deliberate: an earlier version wrapped it
      // in an exception handler and asserted on stdout, but `raise notice` goes to STDERR,
      // so the assertion compared against an empty string. Letting the statement fail for
      // real means the test cannot pass unless the trigger genuinely refused the write.
      let stderr = "";
      let threw = false;
      try {
        execFileSync(
          "docker",
          [
            "exec",
            dbContainer,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-tAX",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            `set role service_role; update public.audit_events set action = 'tampered' where entity_id = '${orgScopedEntity}';`,
          ],
          { encoding: "utf8", stdio: "pipe" },
        );
      } catch (e) {
        threw = true;
        stderr = String((e as { stderr?: string }).stderr ?? "");
      }
      expect(threw, "the UPDATE succeeded — append-only is not enforced").toBe(true);
      expect(stderr).toContain("append-only");
    });

    it("the action is unchanged after that attempt", async () => {
      const { data } = await fixture.admin
        .from("audit_events")
        .select("action")
        .eq("entity_id", orgScopedEntity)
        .single();
      expect(data?.action).toBe("document.viewed");
    });
  });

  describe("D11 — private.write_audit_event stays unreachable from the Data API", () => {
    it("the rpc endpoint 404s, because PostgREST only searches exposed schemas", async () => {
      const res = await fetch(`${url}/rest/v1/rpc/write_audit_event`, {
        method: "POST",
        headers: {
          apikey: serviceKey!,
          Authorization: `Bearer ${serviceKey!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_action: "probe.itest" }),
      });
      expect(res.status).toBe(404);
      // The message names `public`, which is the point: the grant is not the blocker.
      expect(JSON.stringify(await res.json())).toContain("public.write_audit_event");
    });

    it("forcing the private schema is refused with the exposed-schema list", async () => {
      const res = await fetch(`${url}/rest/v1/rpc/write_audit_event`, {
        method: "POST",
        headers: {
          apikey: serviceKey!,
          Authorization: `Bearer ${serviceKey!}`,
          "Content-Type": "application/json",
          "Content-Profile": "private",
        },
        body: JSON.stringify({ p_action: "probe.itest" }),
      });
      expect(res.status).toBe(406);
      expect(JSON.stringify(await res.json())).toContain("Only the following schemas are exposed");
    });

    it("neither probe wrote a row", async () => {
      const { data } = await fixture.admin
        .from("audit_events")
        .select("id")
        .eq("action", "probe.itest");
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("D12 — the writer refuses rather than writing a bad row", () => {
    it("throws on a metadata key outside the allow-list, and writes nothing", async () => {
      const entityId = randomUUID();
      await expect(
        writeAuditEvent(fixture.admin as never, {
          actorUserId: fixture.actors.adminA.id,
          organizationId: fixture.orgA,
          caseId: fixture.cases.orgAssignedA,
          action: "document.viewed",
          entityType: `document-${runTag}`,
          entityId,
          metadata: { original_name: "Ram_Bahadur_passport_2026.pdf" } as never,
        }),
      ).rejects.toThrow(AuditWriteError);

      const { data } = await fixture.admin
        .from("audit_events")
        .select("id")
        .eq("entity_id", entityId);
      expect(data ?? []).toHaveLength(0);
    });
  });
});
