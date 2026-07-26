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

  // Without this the byte comparison is never exercised on a rejection: every other
  // negative differs in LENGTH, so the cheap length check short-circuits and
  // crypto.timingSafeEqual could be deleted outright with the suite still green.
  it("404s a wrong secret of exactly the right length", async () => {
    const sameLengthWrong = "X".repeat(SECRET.length);
    expect(sameLengthWrong).toHaveLength(SECRET.length);
    const res = await GET(req(`Bearer ${sameLengthWrong}`));
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
  });

  it("404s a bare token that is not a Bearer header", async () => {
    const res = await GET(req(SECRET));
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
  });

  // A rate limiter no-ops open when unconfigured; a delete trigger must not.
  it("refuses to run at all when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer "));
    expect(res.status).toBe(404);
    expect(purgeUnclaimedAnonymousAssessments).not.toHaveBeenCalled();
  });
});

// The failure mode of a fail-closed gate is retention silently stopping while /trust keeps
// promising students deletion — so a rejected SCHEDULED run has to be loud.
describe("GET /api/cron/purge-anonymous — a wedged gate raises the alarm", () => {
  const cronReq = (auth?: string) =>
    new Request("http://localhost/api/cron/purge-anonymous", {
      headers: { "x-vercel-cron": "1", ...(auth ? { authorization: auth } : {}) },
    });

  beforeEach(() => {
    purgeUnclaimedAnonymousAssessments.mockReset().mockResolvedValue(cleanReport);
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("logs when the scheduler is rejected because the secret is unset", async () => {
    delete process.env.CRON_SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(cronReq("Bearer anything"))).status).toBe(404);
    expect(err).toHaveBeenCalled();
  });

  // Rotating CRON_SECRET in Vercel without redeploying wedges the gate exactly this way.
  it("logs when the scheduler is rejected because the secret no longer matches", async () => {
    process.env.CRON_SECRET = SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(cronReq("Bearer stale-rotated-secret"))).status).toBe(404);
    expect(err).toHaveBeenCalled();
  });

  // …but a scanner on the same URL must not be able to drown that daily signal.
  it("stays silent for unauthenticated traffic that is not the scheduler", async () => {
    delete process.env.CRON_SECRET;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(req())).status).toBe(404);
    expect(err).not.toHaveBeenCalled();
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

  // The rehearsal switch is typed by hand, once, against production. A near-miss spelling
  // must NOT silently arm the irreversible branch.
  it.each(["?dryRun", "?dryrun=1", "?dryRun=true", "?dryRun=0"])(
    "treats %s as a dry run rather than falling through to a real delete",
    async (query) => {
      await GET(req(`Bearer ${SECRET}`, query));
      expect(purgeUnclaimedAnonymousAssessments).toHaveBeenCalledWith({ tag: "admin" }, { dryRun: true });
    },
  );

  it("only arms the real delete when the parameter is absent entirely", async () => {
    await GET(req(`Bearer ${SECRET}`));
    expect(purgeUnclaimedAnonymousAssessments).toHaveBeenCalledWith({ tag: "admin" }, { dryRun: false });
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
