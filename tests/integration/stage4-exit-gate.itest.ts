/**
 * MV-191 — Stage 4 exit gate: the document boundary, proven where it is actually enforced.
 *
 * The gate, verbatim from the plan (Stage 4 — Document collaboration, "Exit gate"):
 *
 *   > an unauthorized actor cannot upload, view, download, review, or enumerate a document, and
 *   > the authorized request-to-approval flow works.
 *
 * ## This file closes gaps; it does not re-prove what is already proven
 *
 * The coverage inventory that precedes it —
 * `docs/audits/2026-08-22-stage4-document-boundary-coverage.md` — maps all five negative verbs and
 * the positive walk to the assertion that covers each, by file and test name. Four verbs were
 * already covered at the database layer by MV-182/185/190's suites, and the positive walk by
 * `stage4-collaboration-walk.itest.ts`. Re-proving those here would cost the same and report the
 * same confidence while leaving the real hole open, so this file carries ONLY the four gaps the
 * inventory found:
 *
 *   1. ENUMERATE, in all four of its sub-modes — the three collaboration list reads, a direct row
 *      count on each collaboration table, a Storage listing of the `case/` prefix, and existence
 *      leaked through the difference between two error answers. Uncovered end to end at carve
 *      time: `.list(` appeared nowhere in `tests/integration/`, the only `count: "exact"` in the
 *      tree was on a student-data table, and the three list functions were mocked in every test
 *      that touched them.
 *   2. The ANONYMOUS caller on the two write verbs. `fixture.anon` was probed for `select` only.
 *   3. `mintCaseScopedDownloadUrl` — the one sanctioned way to reach the bytes — refusing an
 *      unauthorized actor against a REAL database rather than a mock.
 *   4. Existence parity: a reachable and an unreachable document must be indistinguishable.
 *
 * ## Why enumerate needs an existence proof beside every assertion
 *
 * The three list functions do not authorize. They filter by `case_id` and delegate to RLS, so an
 * unauthorized actor receives `{ ok: true, data: [] }` — a CORRECT refusal and an EMPTY TABLE
 * rendered identically. `expect(data).toEqual([])` would therefore pass against a fixture that
 * never seeded, against a case that does not exist, and against a policy that was deleted this
 * morning. Every denial below is paired with `proveVisibleToServiceRole`, which THROWS when the
 * rows are genuinely absent, so the denial cannot be satisfied by nothing being there.
 *
 * That is the same discipline `fixtures/tenancy.ts` states for the Stage 1 matrix, and it is the
 * reason a denial-only suite is otherwise inert as evidence: it passes identically against a
 * MISSING policy, because the actor is still refused — by the absence of a grant rather than by
 * the policy under test. Every policy this file claims to cover is mutation-tested, and the
 * mutant-to-test table is recorded on the card dossier.
 *
 * ## Harness
 *
 * Extends `fixtures/tenancy.ts` — the MV-153 harness — rather than starting a new one: the same
 * two real organizations, the same per-role AUTHENTICATED clients, the same service-role client
 * used only for seeding, teardown and existence proofs. It is a separate FILE rather than new
 * cells inside `tenant-isolation.itest.ts` because that suite owns Stage 1's canonical matrix and
 * pins its own shape (`CASE_VERBS`, `TS_ONLY_CELLS`, `DEFERRED_BY_DESIGN.length`); the Stage 4
 * suites already established the per-slice-file pattern over the shared fixture. The divergence
 * is recorded in the card's decision log, as the card requires.
 *
 * EVERY ASSERTION RUNS AS `authenticated` OR ANONYMOUS. A probe issued on the service-role client
 * holds BYPASSRLS and would make every denial pass while proving nothing.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));

import {
  listCaseDocumentVersions,
  listCaseDocumentReviews,
  getCaseDocumentVersion,
} from "@/lib/cases/document-collaboration-repo";
import { listCaseDocumentRequests } from "@/lib/cases/document-requests-repo";
import { mintCaseScopedDownloadUrl } from "@/lib/documents/signed-download";

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

assertLocalStack("stage4-exit-gate.itest.ts", url);

const REQUESTS = "case_document_requests";
const VERSIONS = "case_document_versions";
const REVIEWS = "case_document_reviews";
const BUCKET = "documents";

/**
 * A SKIPPED EXIT GATE REPORTS AS A PASSING ONE.
 *
 * Every other `*.itest.ts` in this tree opens with `describe.skipIf(...)`, which is right for a
 * suite that is one piece of evidence among many: a developer without the local stack should not
 * get a wall of red. It is WRONG for the file that decides whether a stage may be declared exited,
 * because "the gate found no configuration" and "the gate passed" then render identically in the
 * one place where that confusion is most expensive.
 *
 * So this block is deliberately NOT `skipIf`. It always runs, and it FAILS when the gate has
 * nothing to run against. The matrix below still skips — one loud failure is the signal; a
 * hundred is noise.
 */
describe("MV-191 Stage 4 exit gate — configuration", () => {
  it("FAILS rather than skips when the exit gate finds no Supabase configuration", () => {
    const missing = [
      url ? null : "SUPABASE_TEST_URL",
      serviceKey ? null : "SUPABASE_TEST_SERVICE_ROLE_KEY",
      anonKey ? null : "SUPABASE_TEST_ANON_KEY",
    ].filter((name): name is string => name !== null);

    expect(
      missing,
      `The Stage 4 exit gate cannot be taken without a local Supabase stack. Missing: ${missing.join(
        ", ",
      )}. A skipped gate is not a passed gate — start the stack and export the three variables, or ` +
        `do not report Stage 4 as exited.`,
    ).toEqual([]);
  });
});

describe.skipIf(!url || !serviceKey || !anonKey)("MV-191 Stage 4 exit gate — the document boundary", () => {
  let fixture: TenancyFixture;

  /** Organization A's case: linked student, `counsellorAssignedA` assigned. The target. */
  let caseA: string;
  /** Organization B's case. Nobody in org A holds any membership there. */
  let caseB: string;

  const createdRequests: string[] = [];
  const createdObjects: string[] = [];

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  let sequence = 0;
  const tag = (): string => `mv191-${fixture.stamp}-${(sequence += 1)}`;

  /** Seeded SERVICE-ROLE, so every denial below has something real to be denied. */
  const seedRequest = async (caseId: string, organizationId: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(REQUESTS)
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        kind: "passport",
        title: `MV-191 request ${tag()}`,
        requested_by: actor("adminA").id,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a request: ${error?.message}`);
    createdRequests.push(data.id);
    return data.id;
  };

  const seedVersion = async (
    caseId: string,
    organizationId: string,
    requestId: string,
    versionId: string,
    storagePath: string,
  ): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(VERSIONS)
      .insert({
        id: versionId,
        case_id: caseId,
        organization_id: organizationId,
        request_id: requestId,
        document_id: null,
        storage_path: storagePath,
        file_size: 2048,
        original_name: `${tag()}.pdf`,
        content_type: "application/pdf",
        uploaded_by: actor("adminA").id,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a version: ${error?.message}`);
    return data.id;
  };

  const seedReview = async (caseId: string, organizationId: string, versionId: string): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(REVIEWS)
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        version_id: versionId,
        decision: "accepted",
        note: `MV-191 review ${tag()}`,
        reviewed_by: actor("adminA").id,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a review: ${error?.message}`);
    return data.id;
  };

  const putObject = async (key: string, body: string): Promise<void> => {
    const { error } = await fixture.admin.storage
      .from(BUCKET)
      .upload(key, Buffer.from(body, "utf8"), { contentType: "text/plain", upsert: true });
    if (error) throw new Error(`HARNESS DEFECT: could not upload ${key}: ${error.message}`);
    createdObjects.push(key);
  };

  /**
   * The guard that stops every "sees nothing" below from passing vacuously. An RLS SELECT refusal
   * returns ZERO ROWS AND NO ERROR, which is the same observation as an empty table, a fixture
   * that never seeded, or a row a previous test removed. This THROWS on genuine absence.
   */
  const proveVisibleToServiceRole = async (
    table: typeof REQUESTS | typeof VERSIONS | typeof REVIEWS,
    caseId: string,
    atLeast: number,
  ): Promise<void> => {
    const { data, error } = await fixture.admin.from(table).select("id").eq("case_id", caseId);
    if (error) throw new Error(`HARNESS DEFECT: existence proof failed on ${table}: ${error.message}`);
    const seen = (data ?? []).length;
    if (seen < atLeast) {
      throw new Error(
        `HARNESS DEFECT: ${table} holds ${seen} row(s) for case ${caseId}, expected at least ${atLeast}. ` +
          `A denial against an empty table proves nothing.`,
      );
    }
  };

  /** The actors who must be refused, and the one who must not. */
  const DENIED_ACTORS: ReadonlyArray<{ key: ActorKey; why: string }> = [
    { key: "counsellorUnassignedA", why: "in the tenant, but not on this case" },
    { key: "counsellorAssignedB", why: "staff of the OTHER organization" },
    { key: "outsider", why: "a member of no organization at all" },
  ];

  let requestA: string;
  let versionA: string;
  let reviewA: string;
  let caseObjectKey: string;

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    caseA = fixture.cases.orgAssignedA;
    caseB = fixture.cases.orgAssignedB;

    requestA = await seedRequest(caseA, fixture.orgA);
    versionA = randomUUID();
    caseObjectKey = `case/${caseA}/${versionA}`;
    await putObject(caseObjectKey, "MV-191 exit gate bytes");
    await seedVersion(caseA, fixture.orgA, requestA, versionA, caseObjectKey);
    reviewA = await seedReview(caseA, fixture.orgA, versionA);
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    if (createdObjects.length) await fixture.admin.storage.from(BUCKET).remove(createdObjects);
    if (createdRequests.length) await fixture.admin.from(REQUESTS).delete().in("id", createdRequests);
    await fixture.teardown();
  }, 180_000);

  // ===================================================================================
  // The fixture can EXPRESS what the file tests. Three slices running, a mutant has found
  // a fixture that could not — so this is asserted rather than assumed.
  // ===================================================================================
  describe("the fixture can express the thing under test", () => {
    it("seeded a real SECOND organization, so cross-organization denial is expressible at all", async () => {
      expect(fixture.orgA).not.toBe(fixture.orgB);

      // `NULL = ANY(...)` is NULL, so a null-org case is readable by nobody and a fixture copied
      // from production shape — where every case is personal and carries a null org — could not
      // tell a working tenant boundary from a broken one.
      const { data, error } = await fixture.admin
        .from("cases")
        .select("id, organization_id")
        .in("id", [caseA, caseB]);
      expect(error).toBeNull();
      const orgs = new Map((data ?? []).map((r) => [r.id, r.organization_id]));
      expect(orgs.get(caseA)).toBe(fixture.orgA);
      expect(orgs.get(caseB)).toBe(fixture.orgB);
      expect(orgs.get(caseA)).not.toBeNull();
      expect(orgs.get(caseB)).not.toBeNull();
    });

    it("seeded a request, a version and a review on case A, and real bytes behind the version", async () => {
      await proveVisibleToServiceRole(REQUESTS, caseA, 1);
      await proveVisibleToServiceRole(VERSIONS, caseA, 1);
      await proveVisibleToServiceRole(REVIEWS, caseA, 1);

      const { data, error } = await fixture.admin.storage.from(BUCKET).download(caseObjectKey);
      expect(error).toBeNull();
      expect(await data!.text()).toBe("MV-191 exit gate bytes");
    });

    it("holds every denied actor as a real signed-in `authenticated` user, not a bare id", () => {
      for (const { key } of DENIED_ACTORS) {
        expect(actor(key).id, `${key} id`).toMatch(/^[0-9a-f-]{36}$/);
        expect(actor(key).accessToken.split(".").length, `${key} token`).toBe(3);
      }
    });
  });

  // ===================================================================================
  // ENUMERATE — sub-mode 1: the three collaboration list reads
  // ===================================================================================
  describe("enumerate — the three collaboration list reads", () => {
    for (const { key, why } of DENIED_ACTORS) {
      it(`${key} (${why}) learns NOTHING from listCaseDocumentRequests`, async () => {
        await proveVisibleToServiceRole(REQUESTS, caseA, 1);
        const result = await listCaseDocumentRequests(caseA, actor(key).client);
        expect(result.ok).toBe(true);
        expect(result.ok && result.data).toEqual([]);
      });

      it(`${key} (${why}) learns NOTHING from listCaseDocumentVersions`, async () => {
        await proveVisibleToServiceRole(VERSIONS, caseA, 1);
        const result = await listCaseDocumentVersions(caseA, actor(key).client);
        expect(result.ok).toBe(true);
        expect(result.ok && result.data).toEqual([]);
      });

      it(`${key} (${why}) learns NOTHING from listCaseDocumentReviews`, async () => {
        await proveVisibleToServiceRole(REVIEWS, caseA, 1);
        const result = await listCaseDocumentReviews(caseA, actor(key).client);
        expect(result.ok).toBe(true);
        expect(result.ok && result.data).toEqual([]);
      });
    }

    it("the ANONYMOUS caller learns nothing from any of the three", async () => {
      await proveVisibleToServiceRole(REQUESTS, caseA, 1);
      await proveVisibleToServiceRole(VERSIONS, caseA, 1);
      await proveVisibleToServiceRole(REVIEWS, caseA, 1);

      const requests = await listCaseDocumentRequests(caseA, fixture.anon);
      const versions = await listCaseDocumentVersions(caseA, fixture.anon);
      const reviews = await listCaseDocumentReviews(caseA, fixture.anon);

      // `anon` holds no grant at all, so PostgREST answers 42501 and the repo reports the
      // outage rather than an empty list. Either shape is a refusal; NEITHER may carry a row.
      expect(requests.ok ? requests.data : []).toEqual([]);
      expect(versions.ok ? versions.data : []).toEqual([]);
      expect(reviews.ok ? reviews.data : []).toEqual([]);
    });

    // A denial-only matrix cannot tell a correct refusal from a broken feature. If the three
    // functions returned [] for EVERYONE the twelve assertions above would still be green.
    it("CONTROL — the assigned counsellor DOES see all three, so the denials mean something", async () => {
      const requests = await listCaseDocumentRequests(caseA, actor("counsellorAssignedA").client);
      const versions = await listCaseDocumentVersions(caseA, actor("counsellorAssignedA").client);
      const reviews = await listCaseDocumentReviews(caseA, actor("counsellorAssignedA").client);

      expect(requests.ok && requests.data.map((r) => r.id)).toContain(requestA);
      expect(versions.ok && versions.data.map((v) => v.id)).toContain(versionA);
      expect(reviews.ok && reviews.data.map((r) => r.id)).toContain(reviewA);
    });

    it("CONTROL — the LINKED STUDENT sees what has been asked of them and what they filed", async () => {
      const requests = await listCaseDocumentRequests(caseA, actor("studentA").client);
      const versions = await listCaseDocumentVersions(caseA, actor("studentA").client);

      expect(requests.ok && requests.data.map((r) => r.id)).toContain(requestA);
      expect(versions.ok && versions.data.map((v) => v.id)).toContain(versionA);
    });
  });

  // ===================================================================================
  // ENUMERATE — sub-mode 2: a direct row COUNT
  //
  // A count is the purest enumeration primitive: it answers "how many are there" while
  // returning no row at all, so a policy that filters ROWS but leaks a COUNT would be
  // invisible to every "sees nothing" test in the tree.
  // ===================================================================================
  describe("enumerate — a direct row count leaks no cardinality", () => {
    for (const table of [REQUESTS, VERSIONS, REVIEWS] as const) {
      for (const { key, why } of DENIED_ACTORS) {
        it(`${key} (${why}) counts ZERO on ${table}, while the service role counts more`, async () => {
          const { count: truth } = await fixture.admin
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("case_id", caseA);
          if ((truth ?? 0) < 1) {
            throw new Error(`HARNESS DEFECT: ${table} has no row on case ${caseA}; a zero count proves nothing.`);
          }

          const { count } = await actor(key)
            .client.from(table)
            .select("id", { count: "exact", head: true })
            .eq("case_id", caseA);

          expect(count ?? 0).toBe(0);
        });
      }
    }

    it("CONTROL — the assigned counsellor's count is NOT zero", async () => {
      const { count } = await actor("counsellorAssignedA")
        .client.from(VERSIONS)
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseA);
      expect(count ?? 0).toBeGreaterThan(0);
    });
  });

  // ===================================================================================
  // ENUMERATE — sub-mode 3: a Storage LISTING of the case/ prefix
  //
  // MV-190 proved the bytes cannot be DOWNLOADED. Listing is the separate question of
  // whether the KEY can be discovered — and a key is `case/<case_id>/<version_id>`, so a
  // readable listing hands out case ids and version ids even if every object stays shut.
  // ===================================================================================
  describe("enumerate — the Storage listing of the case/ prefix", () => {
    const listAs = async (client: TenancyFixture["anon"], prefix: string) =>
      client.storage.from(BUCKET).list(prefix, { limit: 100 });

    it("the service role CAN list the case object — so an empty listing below is a refusal, not an absence", async () => {
      const { data, error } = await listAs(fixture.admin, `case/${caseA}`);
      expect(error).toBeNull();
      expect((data ?? []).map((o) => o.name)).toContain(versionA);
    });

    for (const { key, why } of DENIED_ACTORS) {
      it(`${key} (${why}) lists NOTHING under case/<case A>`, async () => {
        const { data } = await listAs(actor(key).client, `case/${caseA}`);
        expect(data ?? []).toEqual([]);
      });
    }

    it("the ASSIGNED counsellor also lists nothing — the prefix is deny-by-default for everyone", async () => {
      // Not a bug: MV-190 D4 declines a `storage.objects` policy for `case/` deliberately, because
      // the bucket's client-facing policies key on `foldername[1] = auth.uid()::text` and `case` is
      // never a uid. The ONLY sanctioned way in is `mintCaseScopedDownloadUrl`, exercised below.
      const { data } = await listAs(actor("counsellorAssignedA").client, `case/${caseA}`);
      expect(data ?? []).toEqual([]);
    });

    it("the ANONYMOUS caller lists nothing", async () => {
      const { data } = await listAs(fixture.anon, `case/${caseA}`);
      expect(data ?? []).toEqual([]);
    });

    it("listing the BARE case/ root discloses no case id", async () => {
      // The sharper version of the same leak: `case/` alone would enumerate every case that has
      // ever carried a document, across every tenant, without naming one.
      for (const { key } of DENIED_ACTORS) {
        const { data } = await listAs(actor(key).client, "case");
        expect(data ?? [], `${key} listing case/`).toEqual([]);
      }
      const { data: anonData } = await listAs(fixture.anon, "case");
      expect(anonData ?? []).toEqual([]);
    });

    it("CONTROL — an actor CAN list their own uid-keyed prefix, so listing is not broken outright", async () => {
      const ownKey = `${actor("counsellorAssignedA").id}/mv191/${randomUUID()}.txt`;
      await putObject(ownKey, "MV-191 control bytes");

      const { data, error } = await listAs(actor("counsellorAssignedA").client, `${actor("counsellorAssignedA").id}/mv191`);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });
  });

  // ===================================================================================
  // ENUMERATE — sub-mode 4: existence must not leak through the difference between answers
  //
  // The routes order their checks so this holds today — MV-186's version route authorizes
  // BEFORE it looks the request up. It is one reordering away from being false and nothing
  // else in the tree would notice, so it is asserted rather than inherited.
  // ===================================================================================
  describe("enumerate — a refused actor cannot tell 'exists' from 'no such thing'", () => {
    for (const { key, why } of DENIED_ACTORS) {
      it(`${key} (${why}) gets the SAME answer for a real version id and a fabricated one`, async () => {
        const real = await getCaseDocumentVersion(versionA, caseA, actor(key).client);
        const fabricated = await getCaseDocumentVersion(randomUUID(), caseA, actor(key).client);

        // Both must be the "no such row" shape. If the real id ever answered differently, the
        // difference itself would confirm the document exists.
        expect(real).toEqual(fabricated);
        expect(real.ok && real.data).toBeNull();
      });
    }

    it("CONTROL — the assigned counsellor CAN tell them apart, so the parity above is not universal blindness", async () => {
      const real = await getCaseDocumentVersion(versionA, caseA, actor("counsellorAssignedA").client);
      const fabricated = await getCaseDocumentVersion(randomUUID(), caseA, actor("counsellorAssignedA").client);

      expect(real.ok && real.data?.id).toBe(versionA);
      expect(fabricated.ok && fabricated.data).toBeNull();
      expect(real).not.toEqual(fabricated);
    });

    it("the mint answers a refused actor identically whether the object exists or not", async () => {
      const forReal = await mintCaseScopedDownloadUrl({
        actorUserId: actor("counsellorUnassignedA").id,
        caseId: caseA,
        storagePath: caseObjectKey,
        db: actor("counsellorUnassignedA").client,
        storage: fixture.admin.storage,
      });
      const forFiction = await mintCaseScopedDownloadUrl({
        actorUserId: actor("counsellorUnassignedA").id,
        caseId: caseA,
        storagePath: `case/${caseA}/${randomUUID()}`,
        db: actor("counsellorUnassignedA").client,
        storage: fixture.admin.storage,
      });

      expect(forReal).toEqual(forFiction);
      expect(forReal.ok).toBe(false);
      expect(!forReal.ok && forReal.kind).toBe("denied");
    });
  });

  // ===================================================================================
  // DOWNLOAD — the one sanctioned way in, against a real database
  //
  // The inventory found this covered only by mocks. A mocked permission layer proves the
  // mint calls it; it does not prove the answer the real database gives.
  // ===================================================================================
  describe("download — mintCaseScopedDownloadUrl against real Postgres", () => {
    for (const { key, why } of DENIED_ACTORS) {
      it(`REFUSES ${key} (${why}) — and the refusal is a DENIAL, not a mint failure`, async () => {
        const result = await mintCaseScopedDownloadUrl({
          actorUserId: actor(key).id,
          caseId: caseA,
          storagePath: caseObjectKey,
          db: actor(key).client,
          storage: fixture.admin.storage,
        });

        expect(result.ok).toBe(false);
        // The distinction matters: `mint-failed` is retryable and NOT a statement about access,
        // so a route that turned a genuine denial into one would report the wrong thing forever.
        expect(!result.ok && result.kind).toBe("denied");
      });
    }

    it("REFUSES the LINKED STUDENT a path that belongs to ANOTHER case", async () => {
      const result = await mintCaseScopedDownloadUrl({
        actorUserId: actor("studentA").id,
        caseId: caseA,
        storagePath: `case/${caseB}/${randomUUID()}`,
        db: actor("studentA").client,
        storage: fixture.admin.storage,
      });

      expect(result.ok).toBe(false);
      // Authorized for case A, but the key names case B — a different refusal from a denial, and
      // the one that catches a caller splicing a foreign path onto a case it may legitimately read.
      expect(!result.ok && result.kind).toBe("path-outside-case");
    });

    it("CONTROL — MINTS for the assigned counsellor, and the URL really fetches the bytes", async () => {
      const result = await mintCaseScopedDownloadUrl({
        actorUserId: actor("counsellorAssignedA").id,
        caseId: caseA,
        storagePath: caseObjectKey,
        db: actor("counsellorAssignedA").client,
        storage: fixture.admin.storage,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const response = await fetch(result.url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("MV-191 exit gate bytes");
    });

    it("CONTROL — MINTS for the linked student on their own case", async () => {
      const result = await mintCaseScopedDownloadUrl({
        actorUserId: actor("studentA").id,
        caseId: caseA,
        storagePath: caseObjectKey,
        db: actor("studentA").client,
        storage: fixture.admin.storage,
      });
      expect(result.ok).toBe(true);
    });
  });

  // ===================================================================================
  // UPLOAD and REVIEW — the anonymous caller
  //
  // The existing suites probe `fixture.anon` for `select` only. These two are the write
  // half of the same actor.
  // ===================================================================================
  describe("upload and review — the ANONYMOUS caller", () => {
    it("an anonymous client may NOT insert a version", async () => {
      const { error } = await fixture.anon.from(VERSIONS).insert({
        case_id: caseA,
        organization_id: fixture.orgA,
        request_id: requestA,
        document_id: null,
        storage_path: `case/${caseA}/${randomUUID()}`,
        file_size: 2048,
        original_name: `${tag()}.pdf`,
        content_type: "application/pdf",
        uploaded_by: actor("adminA").id,
      } as never);

      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
    });

    it("an anonymous client may NOT insert a review", async () => {
      const { error } = await fixture.anon.from(REVIEWS).insert({
        case_id: caseA,
        organization_id: fixture.orgA,
        version_id: versionA,
        decision: "accepted",
        note: `MV-191 anon review ${tag()}`,
        reviewed_by: actor("adminA").id,
      } as never);

      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
    });

    it("an anonymous client may NOT insert a request", async () => {
      const { error } = await fixture.anon.from(REQUESTS).insert({
        case_id: caseA,
        organization_id: fixture.orgA,
        kind: "passport",
        title: `MV-191 anon request ${tag()}`,
        requested_by: actor("adminA").id,
      } as never);

      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
    });

    it("an anonymous client may NOT upload bytes under the case/ prefix", async () => {
      const { error } = await fixture.anon.storage
        .from(BUCKET)
        .upload(`case/${caseA}/${randomUUID()}`, Buffer.from("anon bytes", "utf8"), {
          contentType: "text/plain",
        });
      expect(error).not.toBeNull();
    });

    it("nothing the anonymous caller attempted actually landed", async () => {
      // Four refusals above, asserted on the ERROR each call returned. This asserts the other
      // half — that the table is unchanged — so a future client that swallowed its error, or a
      // PostgREST that reported one while still writing, could not pass the block above.
      const { count } = await fixture.admin
        .from(VERSIONS)
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseA);
      expect(count).toBe(1);

      const { count: reviews } = await fixture.admin
        .from(REVIEWS)
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseA);
      expect(reviews).toBe(1);

      const { count: requests } = await fixture.admin
        .from(REQUESTS)
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseA);
      expect(requests).toBe(1);
    });
  });
});
