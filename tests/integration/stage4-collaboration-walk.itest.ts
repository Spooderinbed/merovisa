import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedTenancyFixture, type TenancyFixture, type Actor, type ActorKey } from "./fixtures/tenancy";
import {
  deriveRequestProgress,
  canResolveByHand,
  type CaseDocumentReviewRow,
  type CaseDocumentVersionRow,
} from "@/lib/cases/document-collaboration";

/**
 * MV-186 — the UI's derivation, checked against the DATABASE's derivation on the same rows.
 *
 * Run locally:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npx vitest run --config vitest.integration.config.ts tests/integration/stage4-collaboration-walk.itest.ts
 *
 * Skips cleanly (never fails) when those vars are absent — SO A GREEN `npm test` IS NOT EVIDENCE
 * THIS FILE RAN. Read the count.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS EVIDENCE FOR, AND WHY IT IS NOT A COPY OF MV-185'S
 * ---------------------------------------------------------------------------------------
 * `stage4-document-collaboration.itest.ts` already proves what the SCHEMA does: the policies,
 * the grants, the two forbidden grants, the append-only fence, and that
 * `private.document_request_derived_status` resolves and re-opens a request correctly. None of
 * that is repeated here.
 *
 * This file proves the one thing that suite cannot: **`deriveRequestProgress` and the database
 * trigger agree.** They are two independent implementations of the same sentence — "the newest
 * version's newest review decides" — written in TypeScript and in SQL, ordered by
 * `(created_at, id) DESC` in both. Spec §7.1 (D6) says out loud that a UI sorting differently
 * "would render a state the trigger disagrees with", and nothing in the default test lane can
 * catch that: the unit tests use hand-written fixtures whose ordering is whatever the test
 * author typed, and the SQL is not running.
 *
 * So every step of the walk below asserts BOTH answers on the SAME rows, read back out of
 * Postgres — including the microsecond-tie case, which is the one the `id` tiebreak exists for
 * and the one a hand-written fixture can only simulate.
 *
 * Rows are seeded SERVICE-ROLE deliberately. Whether an actor MAY write them is MV-185's
 * question and is answered exhaustively there; this file is about what the rows MEAN once they
 * exist, so it seeds them the shortest way and spends its assertions on the derivation.
 */

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

const REQUESTS = "case_document_requests";
const VERSIONS = "case_document_versions";
const REVIEWS = "case_document_reviews";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-186 the collaboration walk", () => {
  let fixture: TenancyFixture;
  let caseA: string;
  const createdRequests: string[] = [];

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  let sequence = 0;
  const tag = (): string => `mv186-${fixture.stamp}-${(sequence += 1)}`;

  const seedRequest = async (): Promise<string> => {
    const { data, error } = await fixture.admin
      .from(REQUESTS)
      .insert({
        case_id: caseA,
        organization_id: fixture.orgA,
        kind: "passport",
        title: `MV-186 request ${tag()}`,
        requested_by: actor("adminA").id,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a request: ${error?.message}`);
    createdRequests.push(data.id);
    return data.id;
  };

  /** `createdAt` may be forced, so the microsecond-tie case can be built on purpose. */
  const seedVersion = async (requestId: string, createdAt?: string): Promise<string> => {
    const row: Record<string, unknown> = {
      case_id: caseA,
      organization_id: fixture.orgA,
      request_id: requestId,
      document_id: null,
      storage_path: `case/${caseA}/${crypto.randomUUID()}`,
      file_size: 2048,
      original_name: `${tag()}.pdf`,
      content_type: "application/pdf",
      uploaded_by: actor("adminA").id,
    };
    if (createdAt) row.created_at = createdAt;
    const { data, error } = await fixture.admin.from(VERSIONS).insert(row as never).select("id").single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a version: ${error?.message}`);
    return data.id;
  };

  const seedReview = async (
    versionId: string,
    decision: "accepted" | "rejected",
    createdAt?: string,
  ): Promise<string> => {
    const row: Record<string, unknown> = {
      case_id: caseA,
      organization_id: fixture.orgA,
      version_id: versionId,
      decision,
      note: decision === "rejected" ? `MV-186 reason ${tag()}` : null,
      reviewed_by: actor("adminA").id,
    };
    if (createdAt) row.created_at = createdAt;
    const { data, error } = await fixture.admin.from(REVIEWS).insert(row as never).select("id").single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not seed a review: ${error?.message}`);
    return data.id;
  };

  /**
   * The rows as the REPOSITORY would hand them to the derivation, read back out of Postgres —
   * so the ordering under test is the database's real `created_at`, not a string a test author
   * typed. This is the whole point of running the walk here.
   */
  const readRows = async (
    requestId: string,
  ): Promise<{
    request: { id: string; status: string };
    versions: CaseDocumentVersionRow[];
    reviews: CaseDocumentReviewRow[];
  }> => {
    const req = await fixture.admin.from(REQUESTS).select("id, status").eq("id", requestId).single();
    if (req.error || !req.data) throw new Error(`HARNESS DEFECT: request read failed: ${req.error?.message}`);

    const vs = await fixture.admin
      .from(VERSIONS)
      .select("id, request_id, storage_path, file_size, original_name, content_type, created_at")
      .eq("case_id", caseA);
    if (vs.error) throw new Error(`HARNESS DEFECT: versions read failed: ${vs.error.message}`);

    const rs = await fixture.admin
      .from(REVIEWS)
      .select("id, version_id, decision, note, created_at")
      .eq("case_id", caseA);
    if (rs.error) throw new Error(`HARNESS DEFECT: reviews read failed: ${rs.error.message}`);

    return {
      request: { id: req.data.id, status: req.data.status },
      versions: (vs.data ?? []).map((r) => ({
        id: r.id,
        requestId: r.request_id,
        storagePath: r.storage_path,
        fileSize: r.file_size,
        originalName: r.original_name,
        contentType: r.content_type,
        createdAt: r.created_at,
      })),
      reviews: (rs.data ?? []).map((r) => ({
        id: r.id,
        versionId: r.version_id,
        decision: r.decision,
        note: r.note,
        createdAt: r.created_at,
      })),
    };
  };

  /**
   * The assertion this file exists for: the UI's state and the DATABASE's status say the same
   * thing about the same rows.
   *
   * `accepted` and `received-by-hand` are the two states that mean `resolved`; every other state
   * means `outstanding`. Anything else is the drift spec §7.1 warns about.
   */
  const expectAgreement = async (requestId: string, expected: string) => {
    const { request, versions, reviews } = await readRows(requestId);
    const progress = deriveRequestProgress(request, versions, reviews);
    expect(progress.state, "the UI derivation disagrees with the rows").toBe(expected);
    const uiSaysResolved = progress.state === "accepted" || progress.state === "received-by-hand";
    expect(
      request.status,
      `the UI says "${progress.state}" and the trigger wrote "${request.status}"`,
    ).toBe(uiSaysResolved ? "resolved" : "outstanding");
    return progress;
  };

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    caseA = fixture.cases.orgAssignedA;
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    // Versions and reviews cascade from their request.
    if (createdRequests.length) await fixture.admin.from(REQUESTS).delete().in("id", createdRequests);
    await fixture.teardown();
  }, 180_000);

  it("walks request -> upload -> reject -> re-upload -> accept, agreeing with the trigger at every step", async () => {
    const requestId = await seedRequest();

    // 1. Asked for, nothing arrived. The derivation ABSTAINS (returns NULL) so the trigger has
    //    written nothing and `status` is still its default.
    const asked = await expectAgreement(requestId, "awaiting-upload");
    expect(canResolveByHand(asked)).toBe(true);

    // 2. A file arrives. The request is STILL `outstanding` at the database — and this is the
    //    state the column cannot express, because the work is now OURS and not the student's.
    const first = await seedVersion(requestId);
    const arrived = await expectAgreement(requestId, "awaiting-review");
    expect(arrived.newestVersion?.id).toBe(first);
    // And the manual verb is gone: `guard_document_request_status` would refuse it from here.
    expect(canResolveByHand(arrived)).toBe(false);

    // 3. Rejected. Still `outstanding`, and the NOTE is what the student is owed.
    await seedReview(first, "rejected");
    const rejected = await expectAgreement(requestId, "rejected");
    expect(rejected.newestReview?.note).toBeTruthy();

    // 4. Re-uploaded. "Re-upload after a rejection is the point of the model" — there is no
    //    `unique (request_id)` — and the old rejection becomes history rather than the judgement.
    const second = await seedVersion(requestId);
    const reuploaded = await expectAgreement(requestId, "awaiting-review");
    expect(reuploaded.newestVersion?.id).toBe(second);
    expect(reuploaded.newestReview).toBeNull();
    expect(reuploaded.versionCount).toBe(2);

    // 5. Accepted. NOW it resolves, and the trigger is what wrote that.
    await seedReview(second, "accepted");
    await expectAgreement(requestId, "accepted");
  }, 120_000);

  it("agrees on accept-then-reject: the NEWEST review is the judgement, not any accepted one", async () => {
    const requestId = await seedRequest();
    const version = await seedVersion(requestId);

    await seedReview(version, "accepted");
    await expectAgreement(requestId, "accepted");

    // The migration: "a reviewer who accepts and then rejects has rejected, and
    // `exists (… 'accepted')` would call that resolved forever."
    await seedReview(version, "rejected");
    await expectAgreement(requestId, "rejected");
  }, 120_000);

  it("agrees when two versions share a timestamp TO THE MICROSECOND — the id tiebreak, for real", async () => {
    // The case the `id` tiebreak exists for, and the one a hand-written fixture can only
    // simulate: `created_at` forced identical on both rows, so `created_at` alone is not a total
    // order and the answer depends entirely on the tiebreak. If the UI and the SQL broke ties
    // differently, THIS is where they would part company.
    const requestId = await seedRequest();
    const stamp = "2026-08-21T09:00:00.000000+00";
    const a = await seedVersion(requestId, stamp);
    const b = await seedVersion(requestId, stamp);

    // Accept only the one the DATABASE considers newest, which is the greater id.
    const newest = a > b ? a : b;
    await seedReview(newest, "accepted");

    const progress = await expectAgreement(requestId, "accepted");
    expect(progress.newestVersion?.id).toBe(newest);
  }, 120_000);

  it("agrees that reviewing the OLDER of two tied versions leaves the request outstanding", async () => {
    // The mirror image, and the assertion that makes the one above non-vacuous: accepting the
    // version the tiebreak does NOT pick must change nothing, in both implementations.
    const requestId = await seedRequest();
    const stamp = "2026-08-21T10:00:00.000000+00";
    const a = await seedVersion(requestId, stamp);
    const b = await seedVersion(requestId, stamp);

    const older = a > b ? b : a;
    await seedReview(older, "accepted");

    const progress = await expectAgreement(requestId, "awaiting-review");
    expect(progress.newestVersion?.id).toBe(a > b ? a : b);
  }, 120_000);

  it("agrees on a request resolved BY HAND, and never calls it accepted", async () => {
    const requestId = await seedRequest();

    // MV-182's manual verb, service-role here. The derivation abstains because there are no
    // versions, so the guard trigger lets it through — the branch spec §7.1 calls
    // `received-by-hand`.
    const { error } = await fixture.admin
      .from(REQUESTS)
      .update({ status: "resolved" } as never)
      .eq("id", requestId);
    expect(error, "the manual verb must still work on a request with no versions").toBeNull();

    const progress = await expectAgreement(requestId, "received-by-hand");
    // The distinction the state exists for: `resolved` here means a counsellor's tick, and
    // nobody checked a file, because there is no file.
    expect(progress.newestVersion).toBeNull();
    expect(progress.state).not.toBe("accepted");
  }, 120_000);

  it("confirms the guard REFUSES a hand-written status once a version exists", async () => {
    // The reason `canResolveByHand` gates the UI control at all. Without this the UI rule would
    // be a style choice; with it, rendering the control would be offering a `23514`.
    const requestId = await seedRequest();
    const version = await seedVersion(requestId);
    await seedReview(version, "rejected");

    const { error } = await fixture.admin
      .from(REQUESTS)
      .update({ status: "resolved" } as never)
      .eq("id", requestId);

    expect(error?.code, "the guard trigger let a contradicting status through").toBe("23514");
    await expectAgreement(requestId, "rejected");
  }, 120_000);
});
