import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * MV-157 §B — the owner-predicate allow-list, pinned so a re-introduced
 * `actor equals student` predicate FAILS rather than merges.
 *
 * ## Why this is a test and not a review convention
 *
 * MV-157 moved every case-scoped read onto `case_id` alone. Until MV-159 replaces
 * the policies, the database still enforces the LEGACY owner-scoped ones — so a
 * re-introduced `.eq("owner", …)` produces *correct results* in Stage 2 and fails
 * only when MV-159 removes the owner predicate, in a different PR with a
 * different author. There is no runtime signal. A grep that runs in CI is the
 * signal.
 *
 * ## The distinction this file encodes, because it is subtle and load-bearing
 *
 * `.eq("owner", <an actor id>)` is the actor-equals-student predicate Stage 2
 * removes. `.is("owner", null)` is NOT: an anonymous assessment is DEFINED by
 * `owner IS NULL` (spec §3's carve-out), MV-135's purge keys on exactly that, and
 * `claimAssessment`'s guard is what stops a caller binding someone else's row.
 * Scanning for the wrong one of those two would either miss the defect or demand
 * the deletion of the anonymous model. Only `.eq` is scanned.
 *
 * ## Related, and deliberately NOT duplicated here
 *
 * MV-160 §D owns the complementary sweep — no exported repository function takes
 * a user id as its scoping argument, and no `owner:` key appears in an insert or
 * upsert payload outside the single allowlisted writer helper
 * (`lib/cases/dual-write.ts`). This file is the READ-side half, shipped with the
 * card that made it true.
 */

const REPO_ROOT = process.cwd();
const SCANNED_DIRS = ["lib", "app"];
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * The complete, reviewed allow-list. Every entry is a path that legitimately
 * scopes by the Auth user rather than by a case, WITH the reason — an entry
 * without a live reason is a defect, not an exemption.
 */
const OWNER_PREDICATE_ALLOW_LIST: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: "lib/assessments/repo.ts",
    reason:
      "The CLAIM path (MV-158). `healAssessmentCase` repairs an owned, case-less row and MUST be " +
      "scoped `owner = caller` so it can only ever repair a row the caller already owns — the " +
      "owner column is the only proof of that at the moment of repair, since the row has no case " +
      "yet. (`claimAssessment`'s own guard uses `.is(\"owner\", null)`, which this scan " +
      "deliberately does not match.)",
  },
  {
    path: "app/api/account/delete/route.ts",
    reason:
      "Auth-account teardown. It must remove everything belonging to the departing AUTH USER and " +
      "must NOT touch a consultancy case that also holds their data (plan line 514) — so the " +
      "AUTH USER, not a case, is the correct axis. Deliberately still owner-keyed through Stage 6.",
  },
  {
    path: "lib/supabase/service-role-exceptions.ts",
    reason: "Prose only — the registry's own documentation quotes the retired Stage 1 pattern.",
  },
];

const ALLOWED_PATHS = new Set(OWNER_PREDICATE_ALLOW_LIST.map((entry) => entry.path));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".claude") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SCANNED_EXTENSIONS.has(path.extname(full))) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative, forward slashes, so an assertion message is copy-pasteable. */
function relative(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

describe("no repository or route scopes case data by `owner = actor`", () => {
  const files = SCANNED_DIRS.flatMap((dir) => walk(path.join(REPO_ROOT, dir)));

  test("the scan actually reaches the tree it claims to cover", () => {
    // A sweep that silently matched zero files would pass forever. Pin that it
    // sees a realistic number of modules and, specifically, the repositories this
    // card moved.
    expect(files.length).toBeGreaterThan(100);
    const relatives = files.map(relative);
    for (const repo of [
      "lib/profiles/repo.ts",
      "lib/assessments/repo.ts",
      "lib/plan/repo.ts",
      "lib/matches/repo.ts",
      "lib/documents/repo.ts",
      "lib/documents/status-repo.ts",
      "lib/outcomes/repo.ts",
    ]) {
      expect(relatives).toContain(repo);
    }
  });

  test("only the allow-listed paths carry an `.eq(\"owner\", …)` predicate", () => {
    const offenders = files
      .filter((file) => /\.eq\(\s*["']owner["']/.test(readFileSync(file, "utf8")))
      .map(relative)
      .filter((rel) => !ALLOWED_PATHS.has(rel));

    expect(offenders).toEqual([]);
  });

  test("every allow-list entry still earns its place — no stale exemptions", () => {
    // The mirror of the rule above, and the half that rots: an entry left behind
    // after its predicate was removed quietly re-opens a hole for the next author
    // who "adds it back to a file that was already on the list".
    for (const { path: rel, reason } of OWNER_PREDICATE_ALLOW_LIST) {
      const full = path.join(REPO_ROOT, rel);
      const source = readFileSync(full, "utf8");
      expect(/owner/.test(source), `${rel} no longer mentions owner — drop its allow-list entry`).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  test("the ANONYMOUS carve-out is untouched — `.is(\"owner\", null)` still guards the purge and the claim", () => {
    // The inverse assertion. If a future author "finishes the migration" by
    // deleting these, MV-135's retention stops distinguishing a converted
    // student's row from an abandoned one, and the claim guard stops being the
    // thing that prevents binding someone else's assessment.
    const purge = readFileSync(path.join(REPO_ROOT, "lib/assessments/purge.ts"), "utf8");
    expect(purge).toMatch(/\.is\(\s*["']owner["']\s*,\s*null\s*\)/);
    expect(purge).not.toMatch(/\.is\(\s*["']case_id["']/);

    const repo = readFileSync(path.join(REPO_ROOT, "lib/assessments/repo.ts"), "utf8");
    expect(repo).toMatch(/\.is\(\s*["']owner["']\s*,\s*null\s*\)/);
  });
});
