import { describe, it, expect } from "vitest";
import { parsePrList, matchPrsToCards, summarizeAreas, ciState, reconcile } from "../../docs/kanban/pr-enrich.mjs";

/**
 * MV-148. The founder runs parallel sessions, one card per branch per PR, so the board
 * has to say which PR belongs to which card and whether it is green. That data is
 * DERIVED at build time from one `gh pr list` call and is never written into board.json
 * — it is the same class of field as ageDays. These tests pin the two things that make
 * that safe: the join is a pure function of (cards, prs), and every failure mode of the
 * `gh` call degrades to "no enrichment" rather than a broken board.
 */

const pr = (over: Record<string, unknown> = {}) => ({
  number: 100,
  title: "A pull request",
  url: "https://github.com/o/r/pull/100",
  headRefName: "mv-1-slug",
  isDraft: false,
  state: "OPEN",
  reviewDecision: "",
  statusCheckRollup: [],
  files: [],
  additions: 0,
  deletions: 0,
  ...over,
});
const card = (over: Record<string, unknown> = {}) => ({ id: "MV-1", col: "inprogress", title: "A card", ...over });

describe("parsePrList", () => {
  it("parses a well-formed gh array", () => {
    const out = parsePrList(JSON.stringify([pr()]));
    expect(out.error).toBeNull();
    expect(out.prs).toHaveLength(1);
    expect(out.prs[0]?.number).toBe(100);
  });

  it("reports malformed gh output as an error rather than an empty PR list", () => {
    // A truncated or error-prefixed stdout must not read as "this repo has no PRs" —
    // that would silently blank every chip and look identical to a quiet board.
    const out = parsePrList('{"message":"Bad credentials"');
    expect(out.prs).toEqual([]);
    expect(out.error).toMatch(/could not be parsed/i);
  });

  it("reports valid JSON that is not an array as an error", () => {
    const out = parsePrList('{"message":"Not Found"}');
    expect(out.prs).toEqual([]);
    expect(out.error).toBeTruthy();
  });

  it("treats an empty array as a successful empty result", () => {
    const out = parsePrList("[]");
    expect(out.prs).toEqual([]);
    expect(out.error).toBeNull();
  });
});

describe("matchPrsToCards", () => {
  it("joins on the MV-id in the head branch name, case-insensitively", () => {
    const byCard = matchPrsToCards([card({ id: "MV-148" })], [pr({ headRefName: "mv-148-board-pr-enrichment" })]);
    expect(byCard.get("MV-148")?.map((p) => p.number)).toEqual([100]);
  });

  it("falls back to the PR title when the branch carries no MV-id", () => {
    // Real shape: PR #97's branch was mv-132-fx-guard but plenty of branches are
    // conventional-commit named, so the title is the second key.
    const byCard = matchPrsToCards([card({ id: "MV-132" })], [pr({ headRefName: "fix/fx-guard", title: "MV-132 — source the FX rates" })]);
    expect(byCard.get("MV-132")?.map((p) => p.number)).toEqual([100]);
  });

  it("ignores the title when the branch already names a card", () => {
    // "MV-148 supersedes MV-130" must not staple this PR onto MV-130's row. Branch
    // wins outright, or a passing mention silently cross-links two parallel sessions.
    const cards = [card({ id: "MV-148" }), card({ id: "MV-130" })];
    const byCard = matchPrsToCards(cards, [pr({ headRefName: "mv-148-board", title: "MV-148 supersedes MV-130" })]);
    expect(byCard.get("MV-148")).toHaveLength(1);
    expect(byCard.get("MV-130")).toBeUndefined();
  });

  it("matches a renumbered card through its formerId", () => {
    // MV-125 records formerId MV-99: branches and PRs permanently use the old id.
    const byCard = matchPrsToCards([card({ id: "MV-125", formerId: "MV-99" })], [pr({ headRefName: "mv-99-step4-multi-subject" })]);
    expect(byCard.get("MV-125")?.map((p) => p.number)).toEqual([100]);
  });

  it("does not let MV-1 claim MV-12's branch", () => {
    const byCard = matchPrsToCards([card({ id: "MV-1" }), card({ id: "MV-12" })], [pr({ headRefName: "mv-12-something" })]);
    expect(byCard.get("MV-1")).toBeUndefined();
    expect(byCard.get("MV-12")).toHaveLength(1);
  });

  it("shows every PR for a card, open ones first then newest", () => {
    // Parallel-session reality: a card can have a merged first attempt and an open follow-up.
    const prs = [
      pr({ number: 80, state: "MERGED", headRefName: "mv-5-first" }),
      pr({ number: 91, state: "OPEN", headRefName: "mv-5-retry" }),
      pr({ number: 95, state: "OPEN", headRefName: "mv-5-retry-2" }),
    ];
    const byCard = matchPrsToCards([card({ id: "MV-5" })], prs);
    expect(byCard.get("MV-5")?.map((p) => p.number)).toEqual([95, 91, 80]);
  });

  it("omits cards with no matching PR entirely", () => {
    const byCard = matchPrsToCards([card({ id: "MV-7" })], [pr({ headRefName: "mv-8-other" })]);
    expect(byCard.has("MV-7")).toBe(false);
  });

  it("normalises the PR fields the board renders", () => {
    const byCard = matchPrsToCards(
      [card({ id: "MV-9" })],
      [pr({ headRefName: "mv-9-x", state: "MERGED", reviewDecision: "CHANGES_REQUESTED", isDraft: true, additions: 40, deletions: 3 })],
    );
    const p = byCard.get("MV-9")?.[0];
    expect(p).toMatchObject({ state: "merged", review: "changes_requested", draft: true, additions: 40, deletions: 3 });
  });

  it("reads an absent review decision as no review yet, not as a decision", () => {
    const byCard = matchPrsToCards([card({ id: "MV-9" })], [pr({ headRefName: "mv-9-x", reviewDecision: "" })]);
    expect(byCard.get("MV-9")?.[0]?.review).toBeNull();
  });

  it("survives PR rows missing the optional fields", () => {
    // gh omits fields it cannot resolve; a null statusCheckRollup must not throw.
    const byCard = matchPrsToCards([card({ id: "MV-9" })], [{ number: 5, headRefName: "mv-9-x" }]);
    const p = byCard.get("MV-9")?.[0];
    expect(p?.number).toBe(5);
    expect(p?.ci.state).toBe("none");
    expect(p?.areas).toEqual([]);
  });
});

describe("ciState", () => {
  it("is passing when every check succeeded", () => {
    const s = ciState([
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
      { __typename: "StatusContext", state: "SUCCESS" },
    ]);
    expect(s).toMatchObject({ state: "passing", passed: 2, failed: 0, pending: 0 });
  });

  it("is failing when any check failed, even alongside passes", () => {
    const s = ciState([
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
    ]);
    expect(s).toMatchObject({ state: "failing", passed: 1, failed: 1 });
  });

  it("is pending while a check is still running and nothing has failed", () => {
    const s = ciState([
      { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    ]);
    expect(s).toMatchObject({ state: "pending", pending: 1, passed: 1 });
  });

  it("counts a failure ahead of a still-running check", () => {
    // Waiting on a run that cannot go green is not "pending" — the founder needs to see red now.
    const s = ciState([
      { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null },
      { __typename: "StatusContext", state: "FAILURE" },
    ]);
    expect(s.state).toBe("failing");
  });

  it("counts a skipped or neutral check as passing, not failing", () => {
    const s = ciState([{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SKIPPED" }]);
    expect(s.state).toBe("passing");
  });

  it("reports no checks at all as none", () => {
    expect(ciState([]).state).toBe("none");
    expect(ciState(undefined).state).toBe("none");
  });
});

describe("summarizeAreas", () => {
  it("rolls files up to their top-level directory, busiest first", () => {
    const areas = summarizeAreas([
      { path: "app/(app)/dashboard/page.tsx" },
      { path: "app/(marketing)/auth/page.tsx" },
      { path: "lib/goals/conflicts.ts" },
      { path: "app/api/route.ts" },
    ]);
    expect(areas).toEqual([
      { dir: "app", files: 3 },
      { dir: "lib", files: 1 },
    ]);
  });

  it("labels a repo-root file rather than inventing a directory for it", () => {
    expect(summarizeAreas([{ path: ".env.example" }])).toEqual([{ dir: "(root)", files: 1 }]);
  });

  it("returns nothing for a PR with no file list", () => {
    expect(summarizeAreas(undefined)).toEqual([]);
    expect(summarizeAreas([])).toEqual([]);
  });
});

describe("reconcile", () => {
  it("warns when an In Review card has no PR at all", () => {
    const byCard = matchPrsToCards([], []);
    const warnings = reconcile([card({ id: "MV-20", col: "inreview" })], byCard);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/MV-20/);
    expect(warnings[0]).toMatch(/no open PR/i);
  });

  it("warns when a merged PR belongs to a card that is not done", () => {
    const cards = [card({ id: "MV-21", col: "inprogress" })];
    const byCard = matchPrsToCards(cards, [pr({ number: 77, state: "MERGED", headRefName: "mv-21-x" })]);
    const warnings = reconcile(cards, byCard);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/#77/);
    expect(warnings[0]).toMatch(/merged/i);
  });

  it("raises exactly one warning for an In Review card whose PR already merged", () => {
    // Both rules describe this card; reporting it twice trains the founder to skim past warnings.
    const cards = [card({ id: "MV-22", col: "inreview" })];
    const byCard = matchPrsToCards(cards, [pr({ number: 78, state: "MERGED", headRefName: "mv-22-x" })]);
    const warnings = reconcile(cards, byCard);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/merged/i);
  });

  it("stays silent on a healthy board", () => {
    const cards = [card({ id: "MV-23", col: "inreview" }), card({ id: "MV-24", col: "done" })];
    const byCard = matchPrsToCards(cards, [
      pr({ number: 79, state: "OPEN", headRefName: "mv-23-x" }),
      pr({ number: 60, state: "MERGED", headRefName: "mv-24-x" }),
    ]);
    expect(reconcile(cards, byCard)).toEqual([]);
  });

  it("says nothing about a closed-unmerged PR on an In Progress card", () => {
    // Abandoning an attempt and reopening is normal; only merged-but-not-done is drift.
    const cards = [card({ id: "MV-25", col: "inprogress" })];
    const byCard = matchPrsToCards(cards, [pr({ number: 81, state: "CLOSED", headRefName: "mv-25-x" })]);
    expect(reconcile(cards, byCard)).toEqual([]);
  });

  it("does not warn about a draft PR on an In Review card", () => {
    const cards = [card({ id: "MV-26", col: "inreview" })];
    const byCard = matchPrsToCards(cards, [pr({ number: 82, state: "OPEN", isDraft: true, headRefName: "mv-26-x" })]);
    expect(reconcile(cards, byCard)).toEqual([]);
  });
});
