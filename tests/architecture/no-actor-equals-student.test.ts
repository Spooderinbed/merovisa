import { describe, test, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
 * ## The WRITE-side half is the second `describe` block below (MV-160 §D)
 *
 * MV-157 shipped this file as the read-side half and pointed at MV-160 §D for
 * the complementary sweep: no `owner:` key in an insert or upsert payload outside
 * a justified allowlist, and no exported repository function taking a user id as
 * its scoping argument. That block is now here, so the two halves share one
 * detector idiom and one failure vocabulary.
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

function walk(dir: string, extensions: ReadonlySet<string> = SCANNED_EXTENSIONS, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".claude") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, extensions, out);
    } else if (extensions.has(path.extname(full))) {
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

/* ---------------------------------------------------------------------------------------- *
 * MV-160 §D — THE WRITE-SIDE HALF.
 *
 * The read-side block above asks "does anything still SCOPE by the actor's user id". This one
 * asks the two write-side questions the card pairs with it: does any insert/upsert payload
 * still NAME `owner` outside a justified allowlist, and does any exported repository function
 * still take a user id as its SCOPING argument.
 *
 * ## Why the payload detector is structural rather than a line regex
 *
 * A regex for `owner:` matches 33 lines in this tree, and 32 of them are type declarations
 * (`owner: string | null;`) or read-side mappings (`owner: r.owner`). Flagging those would
 * make the guard so noisy it would be deleted. The detector therefore finds `.insert(`,
 * `.upsert(` and `.update(` call sites, takes the BALANCED argument text of each, and looks
 * for an `owner` key inside it — i.e. it detects the BEHAVIOUR (writing the column), which is
 * the correction the canonical access matrix made to MV-151's fence. A rename of the variable
 * does not launder it; only removing the write does.
 *
 * ## The one allowlisted payload, and why it is not the file the card named
 *
 * MV-160 §D says the single allowlisted `owner:` payload is "MV-157's writer helper
 * (`lib/cases/dual-write.ts`)". Measured against the tree: `lib/cases/dual-write.ts` performs
 * NO write at all — it reads `cases`, derives `{ case_id, owner }` and RETURNS the fragment,
 * which twelve call sites spread into their own payloads. It carries no `.insert(` or
 * `.upsert(`, so a payload-scoped detector never sees it. The single literal `owner:` write
 * payload in the tree is `lib/assessments/repo.ts`'s `createAnonymousAssessment`, which
 * MV-157 §E's own header already nominates for exactly this allowlist, by exactly this
 * reason. The COUNT the card fixes at one is right; the path is not. Corrected here, on the
 * card, and in the Stage 2 matrix spec §12.
 *
 * The card's other requirement — that DELETING the dual-write must also turn this red, so the
 * allowlist is not read as a licence to remove it — is carried by the choke-point block
 * below rather than by the payload allowlist, because a module the payload detector cannot see
 * cannot be pinned by a payload entry.
 * ---------------------------------------------------------------------------------------- */

/** The card's four directories. `.mjs` is in because `scripts/` is mostly `.mjs`. */
const WRITE_SCANNED_DIRS = ["lib", "app", "components", "scripts"];
const WRITE_SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);

/** Comments are stripped first: a `.insert(` inside a JSDoc block is prose, not a write. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** The text between `source[open]`'s parentheses, respecting nesting and string literals. */
function balancedArgument(source: string, open: number): string {
  let depth = 0;
  let quote = "";
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** An `owner` key in an object literal — not `...ownership`, not `case_owner:`. */
const OWNER_PAYLOAD_KEY = /(?:^|[{,[\s])owner\s*:/;

function ownerPayloadFormsIn(source: string): string[] {
  const src = stripComments(source);
  const hits = new Set<string>();
  for (const match of src.matchAll(/\.(insert|upsert|update)\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    if (OWNER_PAYLOAD_KEY.test(balancedArgument(src, open))) hits.add(`.${match[1]}({ … owner: … })`);
  }
  return [...hits];
}

/** EXACTLY ONE ENTRY. A test asserts the count in both directions. */
const OWNER_PAYLOAD_ALLOW_LIST: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: "lib/assessments/repo.ts",
    reason:
      "`createAnonymousAssessment` writes the LITERAL `owner: null` on a row that has no case at " +
      "all. That is not a dual-write: it is the anonymous carve-out — matrix spec §3, " +
      "`owner IS NULL ⇒ case_id IS NULL` — the state MV-135's 3-day purge keys on and the state a " +
      "claim transitions a row OUT of. There is no case id in scope to derive an owner from and " +
      "therefore no pair that could disagree. Every other ownership payload in the tree spreads a " +
      "value produced by `lib/cases/dual-write.ts`, which is pinned separately below.",
  },
];

/**
 * The deriving choke point. Not a payload site — it returns fragments — so it is pinned by its
 * exports and its importers instead.
 */
const DUAL_WRITE_MODULE = "lib/cases/dual-write.ts";
// MV-168 retired `caseUpsertColumns` — the upsert seam it existed for is gone, and the module's
// own header records why. Two exports, both still the deriving choke point.
const DUAL_WRITE_EXPORTS = ["caseWriteColumns", "caseBindColumns"] as const;
const DUAL_WRITE_CONSUMERS = [
  "lib/profiles/repo.ts",
  "lib/documents/repo.ts",
  "lib/documents/status-repo.ts",
  "lib/matches/repo.ts",
  "lib/outcomes/repo.ts",
  "lib/plan/invalidate.ts",
  "lib/assessments/claim.ts",
];

/** Repository modules for the migrated domains — the scope-argument rule applies to these. */
const REPOSITORY_SUFFIX = "repo.ts";
const USER_ID_PARAM = /\b(userId|user_id|ownerId|owner_id|actorId|uid)\b/;

const USER_SCOPED_REPO_ALLOW_LIST: ReadonlyArray<{ fn: string; reason: string }> = [
  {
    fn: "healAssessmentCase",
    reason:
      "MV-158's claim repair. Its SCOPING argument is `caseId`; `userId` is an additional " +
      "OWNERSHIP PROOF, not the scope — the row it repairs has no case yet, so `owner` is the only " +
      "evidence at that instant that the caller may touch it, and dropping the parameter would let " +
      "a caller bind someone else's orphaned assessment to their own case. Registered rather than " +
      "removed for the same reason its `.eq(\"owner\", …)` is registered on the read side above.",
  },
];

describe("MV-160 §D — no write path names `owner`, and no repository is scoped by a user id", () => {
  const files = WRITE_SCANNED_DIRS.filter((dir) => existsSync(path.join(REPO_ROOT, dir))).flatMap((dir) =>
    walk(path.join(REPO_ROOT, dir), WRITE_SCANNED_EXTENSIONS),
  );
  const allowedPayloadPaths = new Set(OWNER_PAYLOAD_ALLOW_LIST.map((e) => e.path));

  test("the write-side scan reaches all four of the card's directories", () => {
    const relatives = files.map(relative);
    expect(relatives.length).toBeGreaterThan(100);
    for (const dir of WRITE_SCANNED_DIRS) {
      expect(
        relatives.some((r) => r.startsWith(`${dir}/`)),
        `the sweep never reached ${dir}/ — MV-160 §D names all four`,
      ).toBe(true);
    }
  });

  test("only the allow-listed path writes an `owner:` payload key", () => {
    const offenders = files
      .map((file) => ({ rel: relative(file), forms: ownerPayloadFormsIn(readFileSync(file, "utf8")) }))
      .filter((entry) => entry.forms.length > 0 && !allowedPayloadPaths.has(entry.rel))
      .map((entry) => `${entry.rel} — ${entry.forms.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  test("the payload allow-list holds EXACTLY ONE entry, and it still carries a payload", () => {
    // Both directions. A second `owner:` write appearing anywhere fails the test above; the
    // count here fails if someone answers that by adding a second allow-list entry instead.
    expect(OWNER_PAYLOAD_ALLOW_LIST).toHaveLength(1);
    for (const { path: rel, reason } of OWNER_PAYLOAD_ALLOW_LIST) {
      expect(reason.length).toBeGreaterThan(40);
      expect(
        ownerPayloadFormsIn(readFileSync(path.join(REPO_ROOT, rel), "utf8")),
        `${rel} no longer writes an owner payload — drop its allow-list entry`,
      ).not.toEqual([]);
    }
  });

  test("the payload detector fires on every evasion shape — and on none of the innocents", () => {
    for (const source of [
      'db.from("profiles").insert({ owner: userId, case_id: caseId })',
      'db.from("documents").upsert({ owner: userId }, { onConflict: "case_id,kind" })',
      'db.from("plan_items").update({ owner: userId }).eq("id", id)',
      'db.from("profiles").insert([{ case_id: caseId, owner: userId }])',
      'db.from("profiles").insert({\n  case_id: caseId,\n  owner: userId,\n})',
      'db.from("profiles").insert({ sections, owner: resolve(caseId).owner })',
    ]) {
      expect(ownerPayloadFormsIn(source), `not detected: ${source}`).not.toEqual([]);
    }
    // The innocents. Flagging any of these makes the guard noisy enough to be deleted, which
    // is how a guard actually dies — and the spread is the SHAPE THE FIX TAKES, so a detector
    // that fired on it would punish the migration it exists to enforce.
    for (const source of [
      'db.from("profiles").insert({ ...ownership, sections })',
      "interface Row { owner: string | null }",
      "return rows.map((r) => ({ id: r.id, owner: r.owner }))",
      'db.from("profiles").select("owner").eq("case_id", caseId)',
      'db.from("profiles").insert({ case_owner: x })',
    ]) {
      expect(ownerPayloadFormsIn(source), `false positive: ${source}`).toEqual([]);
    }
  });

  test("M4b — the dual-write choke point exists, derives, and is still WIRED UP", () => {
    // The card's guard against the allow-list being read as a licence to delete the
    // dual-write. Removing `lib/cases/dual-write.ts`, or unhooking any repository from it,
    // fails HERE — which is what makes "the dual-write survives Stage 2 and is removed in
    // Stage 6, with the owner columns" an enforced decision rather than a comment.
    const chokePoint = readFileSync(path.join(REPO_ROOT, DUAL_WRITE_MODULE), "utf8");
    for (const exported of DUAL_WRITE_EXPORTS) {
      expect(chokePoint, `${DUAL_WRITE_MODULE} no longer exports ${exported}`).toContain(`export async function ${exported}`);
    }
    // It DERIVES and returns; it must not itself become a write site, or the single-choke-point
    // argument stops being checkable by the payload detector above.
    expect(ownerPayloadFormsIn(chokePoint), `${DUAL_WRITE_MODULE} has become a write site`).toEqual([]);

    const importers = files
      .filter((file) => /from\s+["'](?:@\/)?(?:\.\.?\/)*(?:lib\/)?cases\/dual-write["']/.test(readFileSync(file, "utf8")))
      .map(relative);
    for (const consumer of DUAL_WRITE_CONSUMERS) {
      expect(importers, `${consumer} no longer derives its ownership columns from the choke point`).toContain(consumer);
    }
  });

  test("no exported repository function takes a user id as its scoping argument", () => {
    // MV-160 §D. The scope of a migrated domain is a `caseId`, never an Auth user — that IS
    // "case-scoped repositories no longer depend on actor equals student", stated at the
    // signature level so a regression is visible in a diff rather than in a policy failure.
    const allowedFns = new Set(USER_SCOPED_REPO_ALLOW_LIST.map((e) => e.fn));
    const offenders: string[] = [];
    for (const file of files.filter((f) => relative(f).startsWith("lib/") && f.endsWith(REPOSITORY_SUFFIX))) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = match[1]!;
        const params = balancedArgument(source, match.index + match[0].length - 1);
        if (USER_ID_PARAM.test(params) && !allowedFns.has(name)) {
          offenders.push(`${relative(file)} — ${name}(${params.replace(/\s+/g, " ").trim().slice(0, 80)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every scope-argument exemption still earns its place, with a reason", () => {
    // The mirror, and the half that rots. An exemption left behind after the parameter was
    // removed quietly re-opens the hole for the next author who "adds it back to a function
    // that was already on the list".
    const sources = files
      .filter((f) => relative(f).startsWith("lib/") && f.endsWith(REPOSITORY_SUFFIX))
      .map((f) => stripComments(readFileSync(f, "utf8")))
      .join("\n");
    for (const { fn, reason } of USER_SCOPED_REPO_ALLOW_LIST) {
      const match = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\s*\\(`).exec(sources);
      expect(match, `${fn} is no longer an exported repository function — drop its exemption`).not.toBeNull();
      expect(
        USER_ID_PARAM.test(balancedArgument(sources, match!.index + match![0].length - 1)),
        `${fn} no longer takes a user id — drop its exemption`,
      ).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});
