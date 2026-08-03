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
 * the deletion of the anonymous model. `.is` is deliberately never scanned.
 *
 * ## Why the scan is a LIST of forms rather than one `.eq` regex
 *
 * The first version matched `.eq("owner"` and nothing else, and PostgREST offers
 * at least five other ways to write the same predicate — every one of which would
 * have merged silently. That was not hypothetical: **this very PR shipped one.**
 * `lib/assessments/claim.ts`'s demote uses
 * `.or("owner.eq.<uid>,case_id.eq.<cid>")`, which is CORRECT (the demote has to
 * satisfy both live primary indexes) but was invisible to the guard, and the file
 * was absent from an allow-list whose own header called itself "complete". A
 * guard that a correct predicate can slip past is a guard an incorrect one can
 * slip past.
 *
 * The indirect form is the subtle one: `const OWNER_COL = "owner"` followed by
 * `.eq(OWNER_COL, actorId)` defeats every literal pattern. It is detected
 * structurally instead — a file that binds a constant to the string `"owner"` AND
 * passes a bare identifier as a filter column is flagged, and must justify itself
 * on the list like everything else.
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
 * Every way PostgREST lets you write `owner = <something>` from supabase-js.
 *
 * Each entry is a form the ORIGINAL `.eq("owner"` scan missed. They are listed
 * individually rather than folded into one permissive regex so a failure message
 * names the form that fired, and so adding a new client method is a visible edit
 * here rather than a silent gap.
 */
const OWNER_PREDICATE_FORMS: ReadonlyArray<{ form: string; pattern: RegExp }> = [
  { form: '.eq("owner", …)', pattern: /\.eq\(\s*["'`]owner["'`]/ },
  { form: '.neq("owner", …)', pattern: /\.neq\(\s*["'`]owner["'`]/ },
  { form: '.in("owner", […])', pattern: /\.in\(\s*["'`]owner["'`]/ },
  { form: '.filter("owner", …)', pattern: /\.filter\(\s*["'`]owner["'`]/ },
  { form: '.match({ owner: … })', pattern: /\.match\(\s*\{[^}]*\bowner\s*:/ },
  // The raw-PostgREST string forms: `.or("owner.eq.x,…")`, `.not("owner","eq",…)`
  // and the same inside `.or("and(owner.eq.x,…)")`.
  { form: '.or(/.not( "owner.<op>.…" )', pattern: /\.(?:or|not)\(\s*[`"'][^`"']*\bowner\.(?:eq|neq|in)\b/ },
];

/**
 * The indirect dodge: a constant bound to `"owner"` and then used as a filter
 * column. Both halves must be present in the same file for it to fire.
 */
const OWNER_CONSTANT = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=\n]+)?=\s*["'`]owner["'`]/;
const IDENTIFIER_FILTER_COLUMN = /\.(?:eq|neq|in|filter|is)\(\s*[A-Za-z_$][\w$.]*\s*,/;

function ownerPredicateFormsIn(source: string): string[] {
  const hits = OWNER_PREDICATE_FORMS.filter(({ pattern }) => pattern.test(source)).map((f) => f.form);
  if (OWNER_CONSTANT.test(source) && IDENTIFIER_FILTER_COLUMN.test(source)) {
    hits.push('.eq(<constant bound to "owner">, …)');
  }
  return hits;
}

/**
 * The complete, reviewed allow-list. Every entry is a path that legitimately
 * scopes by the Auth user rather than by a case, WITH the reason — an entry
 * without a live reason is a defect, not an exemption.
 */
const OWNER_PREDICATE_ALLOW_LIST: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: "lib/assessments/claim.ts",
    reason:
      "THE DEMOTE, and it was missed by the first version of this scan because it is written " +
      "`.or(\"owner.eq.<uid>,case_id.eq.<cid>\")` rather than `.eq`. The predicate is CORRECT and " +
      "must not be narrowed: `assessments_primary_idx (owner) WHERE is_primary` and MV-155's " +
      "`(case_id) WHERE is_primary` are BOTH live until MV-160 drops the legacy one, so a demote " +
      "scoped to `case_id` alone leaves a same-owner primary in another case, the promote trips " +
      "the surviving owner index, and MV-16's pinned-dashboard regression comes back. It is " +
      "listed because it was invisible, not because it is wrong.",
  },
  {
    path: "lib/cases/residue.ts",
    reason:
      "The MV-155 residue adopt. It repairs rows that have an `owner` and no `case_id`, so the " +
      "owner column is the ONLY axis those rows have — a case-scoped predicate would match " +
      "exactly the rows that do not need repairing. Scoped `owner = <the case's " +
      "student_user_id>` (read through the dual-write choke point, never a parameter) AND " +
      "`case_id IS NULL`, so it can never re-point a row already bound to another case.",
  },
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

  test("only the allow-listed paths carry an owner predicate, in ANY of its forms", () => {
    const offenders = files
      .map((file) => ({ rel: relative(file), forms: ownerPredicateFormsIn(readFileSync(file, "utf8")) }))
      .filter((entry) => entry.forms.length > 0 && !ALLOWED_PATHS.has(entry.rel))
      .map((entry) => `${entry.rel} — ${entry.forms.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  test("the widened scan actually detects each form — the guard is not inert", () => {
    // A list of regexes nobody exercised is a list of regexes that quietly match
    // nothing. Each form is fed the shape it exists to catch, and the anonymous
    // carve-out is fed to all of them to prove none of them fires on it.
    const samples: Array<[string, string]> = [
      ['.eq("owner", …)', 'db.from("profiles").eq("owner", userId)'],
      ['.neq("owner", …)', 'db.from("profiles").neq("owner", userId)'],
      ['.in("owner", […])', 'db.from("profiles").in("owner", [userId])'],
      ['.filter("owner", …)', 'db.from("profiles").filter("owner", "eq", userId)'],
      ['.match({ owner: … })', 'db.from("profiles").match({ owner: userId })'],
      ['.or(/.not( "owner.<op>.…" )', 'db.from("a").or(`owner.eq.${userId},case_id.eq.${caseId}`)'],
      [
        '.eq(<constant bound to "owner">, …)',
        'const OWNER_COL = "owner";\ndb.from("profiles").eq(OWNER_COL, userId)',
      ],
    ];
    for (const [form, source] of samples) {
      expect(ownerPredicateFormsIn(source), `the "${form}" form is not detected`).toContain(form);
    }
    expect(ownerPredicateFormsIn('db.from("assessments").is("owner", null)')).toEqual([]);
  });

  test("every allow-list entry still earns its place — no stale exemptions", () => {
    // The mirror of the rule above, and the half that rots: an entry left behind
    // after its predicate was removed quietly re-opens a hole for the next author
    // who "adds it back to a file that was already on the list". The check is now
    // the STRONG one: the file must still carry a predicate in one of the scanned
    // forms, not merely mention the word "owner" somewhere.
    const PROSE_ONLY = new Set(["lib/supabase/service-role-exceptions.ts"]);
    for (const { path: rel, reason } of OWNER_PREDICATE_ALLOW_LIST) {
      const source = readFileSync(path.join(REPO_ROOT, rel), "utf8");
      if (PROSE_ONLY.has(rel)) {
        expect(/owner/.test(source), `${rel} no longer mentions owner — drop its allow-list entry`).toBe(true);
      } else {
        expect(
          ownerPredicateFormsIn(source),
          `${rel} no longer carries an owner predicate — drop its allow-list entry`,
        ).not.toEqual([]);
      }
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
