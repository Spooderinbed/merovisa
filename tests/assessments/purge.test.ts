import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));

import {
  ANON_RETENTION_DAYS,
  anonRetentionCutoff,
  purgeUnclaimedAnonymousAssessments,
} from "@/lib/assessments/purge";
import { ASSESSMENT_TTL_DAYS } from "@/lib/assessments/expiry";
import { fakeSupabase, type FakeResult } from "../helpers/fake-supabase";

const NOW = new Date("2026-07-25T00:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** An overdue, unclaimed anonymous row: past its access expiry AND past the retention cutoff. */
function overdue(id: string, ageDays = ANON_RETENTION_DAYS + 1) {
  const created = new Date(NOW.getTime() - ageDays * MS_PER_DAY);
  return {
    id,
    owner: null,
    created_at: created.toISOString(),
    expires_at: new Date(created.getTime() + 3 * MS_PER_DAY).toISOString(),
  };
}

const noRows: FakeResult = { data: [], error: null };

afterEach(() => vi.restoreAllMocks());

describe("anonRetentionCutoff", () => {
  it("is exactly ANON_RETENTION_DAYS before now", () => {
    expect(anonRetentionCutoff(NOW)).toBe(
      new Date(NOW.getTime() - ANON_RETENTION_DAYS * MS_PER_DAY).toISOString(),
    );
  });

  // The policy: the deletion date IS the expiry date the student is already shown
  // ("Your assessment expires in 3 days"). Deriving it from ASSESSMENT_TTL_DAYS keeps
  // the promise and the purge from drifting apart if the TTL ever changes.
  it("never deletes a row that is still readable — the window is at least the access TTL", () => {
    expect(ANON_RETENTION_DAYS).toBeGreaterThanOrEqual(ASSESSMENT_TTL_DAYS);
  });
});

describe("purgeUnclaimedAnonymousAssessments — the scan", () => {
  it("selects only rows that are unclaimed AND past access expiry AND past the retention cutoff", async () => {
    const { client, calls } = fakeSupabase([{ data: [overdue("a1")], error: null }, { data: [{ id: "a1" }], error: null }]);
    await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls[0]).toEqual({ method: "from", args: ["assessments"] });
    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    // Never delete anything the visitor could still open (MV-28(b) recoverable read).
    expect(calls.some((c) => c.method === "lt" && c.args[0] === "expires_at" && c.args[1] === NOW.toISOString())).toBe(true);
    // …and only once it is also past the retention window.
    expect(calls.some((c) => c.method === "lt" && c.args[0] === "created_at" && c.args[1] === anonRetentionCutoff(NOW))).toBe(true);
  });

  it("never reads the sensitive payload columns — id/owner/timestamps only", async () => {
    const { client, calls } = fakeSupabase([{ data: [overdue("a1")], error: null }, { data: [{ id: "a1" }], error: null }]);
    await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    const projections = calls.filter((c) => c.method === "select").map((c) => String(c.args[0] ?? ""));
    expect(projections.length).toBeGreaterThan(0);
    for (const p of projections) {
      expect(p).not.toContain("profile_snapshot");
      expect(p).not.toContain("result");
      expect(p).not.toContain("*");
    }
  });

  it("bounds each run and reports when the batch was saturated, so a cap is never silent", async () => {
    const rows = [overdue("a1"), overdue("a2")];
    const { client, calls } = fakeSupabase([{ data: rows, error: null }, { data: rows.map((r) => ({ id: r.id })), error: null }]);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW, batchSize: 2 });

    expect(calls.some((c) => c.method === "limit" && c.args[0] === 2)).toBe(true);
    expect(report.truncated).toBe(true);
    expect(report.purged).toBe(2);
  });

  it("does not issue a delete when nothing is overdue", async () => {
    const { client, calls } = fakeSupabase(noRows);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls.some((c) => c.method === "delete")).toBe(false);
    expect(report).toMatchObject({ scanned: 0, purged: 0, skipped: 0, truncated: false, failedSteps: [] });
  });
});

describe("purgeUnclaimedAnonymousAssessments — the delete", () => {
  it("re-applies every guard on the delete and bounds it to the verified ids (defense in depth)", async () => {
    const { client, calls } = fakeSupabase([
      { data: [overdue("a1"), overdue("a2")], error: null },
      { data: [{ id: "a1" }, { id: "a2" }], error: null },
    ]);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    const deleteAt = calls.findIndex((c) => c.method === "delete");
    expect(deleteAt).toBeGreaterThan(-1);
    const afterDelete = calls.slice(deleteAt);
    expect(afterDelete.some((c) => c.method === "in" && c.args[0] === "id" && Array.isArray(c.args[1]) && (c.args[1] as string[]).length === 2)).toBe(true);
    expect(afterDelete.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(afterDelete.some((c) => c.method === "lt" && c.args[0] === "expires_at")).toBe(true);
    expect(afterDelete.some((c) => c.method === "lt" && c.args[0] === "created_at")).toBe(true);
    expect(report.purged).toBe(2);
  });

  // THE LANDMINE. A successful claim updates only { owner, claimed_at } — it never
  // extends expires_at (lib/assessments/repo.ts). So EVERY converted user's assessment
  // carries a permanently past expiry, exactly like an abandoned one. `owner is null` is
  // therefore the load-bearing guard: a purge keyed on expiry alone would delete the rows
  // belonging to the students who actually signed up.
  it("never purges a CLAIMED assessment, however long past its expiry", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const converted = { ...overdue("claimed-1", 400), owner: "user-1" };
    const { client, calls } = fakeSupabase([{ data: [converted], error: null }, noRows]);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls.some((c) => c.method === "delete")).toBe(false);
    expect(report).toMatchObject({ scanned: 1, purged: 0, skipped: 1 });
  });

  // MV-158 §E — THE CASE MODEL INVITES EXACTLY THE WRONG FIX HERE.
  //
  // `case_id is null` looks like the cleaner, more modern predicate and it
  // selects the same set TODAY. It is wrong, and the two tests below are what
  // stop it: an OWNED row with a null `case_id` — the residue of a partially
  // applied claim, or of a row claimed before the claim path learned about cases
  // — is a converted student's assessment. Re-keying the purge would make it
  // deletable. `owner is null` stays the load-bearing predicate.
  it("refuses an OWNED row whose case_id is null — the residue of a partial claim", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const residue = { ...overdue("residue-1", 400), owner: "user-1", case_id: null };
    const { client, calls } = fakeSupabase([{ data: [residue], error: null }, noRows]);

    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls.some((c) => c.method === "delete")).toBe(false);
    expect(report).toMatchObject({ scanned: 1, purged: 0, skipped: 1 });
  });

  it("still purges an UNCLAIMED, expired, case-less row — retention has not quietly stopped", async () => {
    const anonymous = { ...overdue("anon-1", 400), owner: null, case_id: null };
    const { client, calls } = fakeSupabase([
      { data: [anonymous], error: null },
      { data: [{ id: "anon-1" }], error: null },
    ]);

    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls.some((c) => c.method === "delete")).toBe(true);
    expect(report).toMatchObject({ scanned: 1, purged: 1, skipped: 0 });
  });

  it("scans on `owner is null`, never on `case_id is null`", async () => {
    const { client, calls } = fakeSupabase([noRows, noRows]);

    await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls.some((c) => c.method === "is" && c.args[0] === "owner" && c.args[1] === null)).toBe(true);
    expect(calls.some((c) => c.method === "is" && c.args[0] === "case_id")).toBe(false);
  });

  it("excludes a candidate that fails the app-layer re-check and counts it as skipped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A row claimed between the scan and the delete — the guard must drop it.
    const claimed = { ...overdue("a2"), owner: "user-1" };
    const { client, calls } = fakeSupabase([
      { data: [overdue("a1"), claimed], error: null },
      { data: [{ id: "a1" }], error: null },
    ]);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    const deleteAt = calls.findIndex((c) => c.method === "delete");
    const ids = calls.slice(deleteAt).find((c) => c.method === "in")?.args[1] as string[];
    expect(ids).toEqual(["a1"]);
    expect(report).toMatchObject({ scanned: 2, purged: 1, skipped: 1 });
    expect(warn).toHaveBeenCalled();
  });

  it("skips a candidate that is still readable, even if the scan returned it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const live = { ...overdue("a2"), expires_at: new Date(NOW.getTime() + MS_PER_DAY).toISOString() };
    const { client, calls } = fakeSupabase([{ data: [live], error: null }, noRows]);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(calls.some((c) => c.method === "delete")).toBe(false);
    expect(report).toMatchObject({ scanned: 1, purged: 0, skipped: 1 });
  });
});

describe("purgeUnclaimedAnonymousAssessments — failures are surfaced, never swallowed", () => {
  it("reports a failed scan and issues no delete", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = fakeSupabase({ data: null, error: { message: "boom" } });
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(report.failedSteps).toEqual(["assessments:scan"]);
    expect(report.purged).toBe(0);
    expect(calls.some((c) => c.method === "delete")).toBe(false);
    expect(err).toHaveBeenCalled();
  });

  it("reports a failed delete and never claims rows were purged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase([
      { data: [overdue("a1")], error: null },
      { data: null, error: { message: "deadlock" } },
    ]);
    const report = await purgeUnclaimedAnonymousAssessments(client, { now: NOW });

    expect(report.failedSteps).toEqual(["assessments:delete"]);
    expect(report.purged).toBe(0);
    expect(err).toHaveBeenCalled();
  });
});
