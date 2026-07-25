import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { purgeUnclaimedAnonymousAssessments } = vi.hoisted(() => ({
  purgeUnclaimedAnonymousAssessments: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));
vi.mock("@/lib/assessments/purge", () => ({ purgeUnclaimedAnonymousAssessments }));

import { GET } from "@/app/api/cron/purge-anonymous/route";

const SECRET = "cron-secret-value-32-chars-minimum-x";

const req = (auth?: string, query = "") =>
  new Request(`http://localhost/api/cron/purge-anonymous${query}`, {
    headers: auth ? { authorization: auth } : {},
  });

const cleanReport = { cutoff: "2026-07-22T00:00:00.000Z", scanned: 2, purged: 2, skipped: 0, truncated: false, failedSteps: [] };

describe("GET /api/cron/purge-anonymous — the gate fails closed", () => {
  beforeEach(() => {
    purgeUnclaimedAnonymousAssessments.mockReset().mockResolvedValue(cleanReport);
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("purges when the bearer token matches", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, purged: 2 });
    expect(purgeUnclaimedAnonymousAssessments).toHaveBeenCalledWith({ tag: "admin" }, { dryRun: false });
  });

  it("404s an unauthenticated caller and never touches the database", async () => {
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
  });

  it("404s a wrong secret", async () => {
    const res = await GET(req("Bearer not-the-secret-value-32-chars-x"));
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
  });

  it("404s a bare token that is not a Bearer header", async () => {
    const res = await GET(req(SECRET));
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
  });

  // A rate limiter no-ops open when unconfigured; a delete trigger must not.
  it("refuses to run at all when CRON_SECRET is unset, and logs the misconfiguration", async () => {
    delete process.env.CRON_SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req("Bearer "));
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });
});

describe("GET /api/cron/purge-anonymous — reporting", () => {
  beforeEach(() => {
    purgeUnclaimedAnonymousAssessments.mockReset().mockResolvedValue(cleanReport);
    process.env.CRON_SECRET = SECRET;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("passes ?dryRun=1 through so the first production run can delete nothing", async () => {
    purgeUnclaimedAnonymousAssessments.mockResolvedValue({ ...cleanReport, purged: 0 });
    const res = await GET(req(`Bearer ${SECRET}`, "?dryRun=1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ dryRun: true, purged: 0 });
    expect(purgeUnclaimedAnonymousAssessments).toHaveBeenCalledWith({ tag: "admin" }, { dryRun: true });
  });

  it("logs the counts, which are the only record that outlives the deleted rows", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await GET(req(`Bearer ${SECRET}`));
    expect(log).toHaveBeenCalledWith(
      "[cron/purge-anonymous] run complete",
      expect.objectContaining({ scanned: 2, purged: 2 }),
    );
  });

  it("reports 500 on a partial failure instead of a green cron over a purge that did not run", async () => {
    purgeUnclaimedAnonymousAssessments.mockResolvedValue({ ...cleanReport, purged: 0, failedSteps: ["assessments:delete"] });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ ok: false, failedSteps: ["assessments:delete"] });
  });

  it("returns 500 rather than throwing when the purge blows up", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    purgeUnclaimedAnonymousAssessments.mockRejectedValue(new Error("connection reset"));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(err).toHaveBeenCalled();
  });
});
