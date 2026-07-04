# Merovisa skill-library authoring brief — 2026-07-04

You are one of 15 parallel authors building the retiring-fellow skill library for the merovisa repo
(`C:\Users\thapa\OneDrive\Desktop\work\merovisa`). Read this whole brief, then your charter section.

## Mission and audience

- Audience: **Sonnet-class AI agent sessions with ZERO conversational memory** (secondary: junior/mid human engineers).
  They will operate the in-repo kanban autonomously; a human founder only gates merges to master.
  Assume they know Next.js/TypeScript generally but know NOTHING about: this repo's history, the AU student-visa
  domain, the provenance/freshness machine, the kanban ritual, or the trust-first copy doctrine.
- Goal: a cheap session loading the right skill must be able to debug, extend, validate, and advance this project
  at a distinguished-fellow standard, without asking anyone.

## Founder-confirmed doctrine (fold into every relevant skill)

1. **Founder-gates everything outward** (unwritten until now — treat as the project's #1 non-negotiable):
   never merge/push to master yourself (master = production, Vercel auto-deploys), never `gh pr merge`,
   never `--admin`-bypass checks, PRs park at In Review awaiting founder go. Outward-facing actions confirm first.
2. **Trust-first copy bar** (unwritten non-negotiable #2): no fabricated claims/dates/stats anywhere; every
   user-facing fact traces to a source; honest empty/failure states; verdicts are bands, never percentages;
   no badge-theater/fake progress. This has repeatedly been enforced in review as a BUG class, not a style nit.
3. Repo-documented disciplines to encode with citations (founder considers these "written"): the freshness-alarm
   rule (never move `reverifyBy` forward without re-verifying the live source and recording evidence) and the
   goldens/version discipline (`WRITE_GOLDENS=1` + RULE_VERSION/CONFIG_VERSION bump only for intended scoring changes).
4. Hardest live problem (campaign target): **data freshness / re-verification** (MV-80, PR #36).
5. "Advance the state of the art" = all four: outcome-calibrated accuracy; self-maintaining sourced data;
   trust/provenance UX; consultancy-grade AI guide.

## Hard authoring rules (violations get your skill rejected in Phase 3)

- **GROUND TRUTH ONLY.** Every command, flag, path, count, and claim must be verified against the repo IN YOUR
  SESSION before you write it. The leads in your charter come from a discovery pass and MAY BE WRONG OR STALE —
  re-verify each one you use. Cite repo-relative `file:line` for load-bearing claims. If you cannot verify,
  label it explicitly `UNVERIFIED (as of 2026-07-04)` or omit it.
- **Read-only repo, except your own directory.** You may write ONLY inside `.claude/skills/<your-skill-name>/`.
  NO mutating git commands (status/log/show/diff/branch -a are fine). Do not run `npm run board`, harvest
  scripts, or anything that writes outside your dir. `FLIP_STATUS=1` and `WRITE_GOLDENS=1` are FORBIDDEN to run.
  You MAY run `npm test -- <specific file>`, `npx vitest run <file>`, `npx tsc --noEmit` (read-only effects only).
- **No private paths as load-bearing sources.** Never cite `C:\Users\thapa\...`, temp/scratchpad files, session
  memory, or this brief inside the skill. Repo-relative paths only. Embed the knowledge itself.
- **Date-stamp volatile facts** ("as of 2026-07-04, ..."). Anything that can drift (counts, versions, PR numbers,
  board state, red tests) gets a date and a re-verification command.
- **End with a `## Provenance and maintenance` section**: one-line re-verification commands for every drift-prone
  claim in the skill (e.g. `npm test -- tests/data/freshness.test.ts` to check the alarm state).
- **No oversell.** Unproven/unbuilt things stay labeled open/candidate. Never contradict CLAUDE.md or route
  around change control (e.g. never document a way to ship without the founder gate).
- **Windows-first commands.** The dev machine is Windows 11 + PowerShell 5.1 (repo under OneDrive; paths may
  contain spaces). Env-var one-liners must be shown PowerShell-style (`$env:X="1"; ...`) with the bash form as a
  secondary note — the bash-style `X=1 cmd` header comments in test files silently no-op in PowerShell.

## Skill format contract (writing-skills discipline)

- File: `.claude/skills/<name>/SKILL.md`. Optional extra files in the same dir ONLY for heavy reference
  (>100 lines) or executable scripts (`scripts/` subdir). Everything else inline.
- YAML frontmatter: `name` (letters/numbers/hyphens) + `description`. Description: third person, starts
  "Use when ...", ONLY triggering conditions/symptoms/error strings — NEVER a summary of the skill's process
  (models follow the summary and skip the body). Rich in searchable keywords (exact error messages, file names,
  symptoms, commands). Under ~500 chars.
- Imperative runbook voice. Copy-pasteable commands. Every jargon term defined at first use. Tables and
  checklists over prose. One excellent example beats three mediocre ones.
- Each skill MUST contain a "When NOT to use this skill" line-item list routing to the sibling skill by name.
- Discipline-enforcing skills (change-control, trust-and-copy, sourced-data, freshness-campaign) MUST include:
  a rationalization table ("Excuse | Reality") and a red-flags list ("if you think X, STOP").
- Target: SKILL.md scannable, roughly 150–450 lines. Overflow into a reference file in your dir.
- Do not copy audit/dossier text wholesale — distill, cite the repo doc for depth.

## The 15 siblings (cross-reference by these exact names)

| # | name | one-liner |
|---|------|-----------|
| 1 | merovisa-change-control | how work is picked, gated, reviewed, merged: kanban ritual + branch/PR/founder-gate flow |
| 2 | merovisa-debugging-playbook | symptom→triage table for this repo's known failure modes and traps |
| 3 | merovisa-failure-archaeology | the incident chronicle: settled battles, root causes, evidence, lessons |
| 4 | merovisa-architecture-contract | load-bearing design decisions, invariants, and known-weak points |
| 5 | np-au-corridor-reference | AU student-visa domain pack (subclass 500, GS, CoE/CRICOS, evidence levels) as used HERE |
| 6 | merovisa-sourced-data-and-freshness | the provenance machine: data modules, freshness guards, findings ledger, harvests |
| 7 | merovisa-build-and-env | environment from scratch: commands, env vars, config axes, Windows traps |
| 8 | merovisa-run-and-operate | running/deploying: dev server, Vercel model, Supabase ops, migrations |
| 9 | merovisa-testing-and-validation | suite anatomy, goldens discipline, itest lane, style guards, evidence bar |
| 10 | merovisa-design-system | frozen tokens, corridor theming, dark mode, motion, style-guard tests, imageless policy |
| 11 | merovisa-trust-and-copy | the trust-first copy bar: what counts as fabrication, honest states, house copy style |
| 12 | merovisa-docs-and-writing | docs-of-record boundaries, dossier template, stale-prose discipline |
| 13 | merovisa-freshness-campaign | EXECUTABLE decision-gated campaign for the live data re-verification problem (MV-80) |
| 14 | merovisa-research-methodology | how a hunch becomes an accepted result here: ledger lifecycle, evidence bar, adversarial review |
| 15 | merovisa-research-frontier | the four SOTA directions with assets, first steps in-repo, falsifiable milestones |

## Ownership boundaries (one home per fact)

- The kanban ritual mechanics live in #1 only; #12 covers the DOCUMENT boundaries/templates.
- The freshness SYSTEM lives in #6; the live CAMPAIGN to fix the current red lives in #13; the one-line
  "expected red" triage entry lives in #2 (pointing to #6/#13).
- Goldens discipline lives in #9; #1 references it as a gate.
- Token/corridor details live in #10; #2 gets only the symptom entries.
- Incidents live in #3 as the chronicle; other skills cite an incident by short name + commit, not retell it.

---

# Charters

## 1. merovisa-change-control (discipline skill)

Scope: how a change goes from idea to production. The kanban ritual (read board → refine/pick Ready card →
board.json col+entered edit → `npm run board` → TDD build → gate green → record evidence on dossier → In Review
→ founder merges). Columns/WIP (Backlog, Ready WIP 5, In Progress WIP 1, In Review WIP 3, Blocked, Done).
board.json hand-edited; board.md/board.html GENERATED — never hand-edit; regenerate+commit before any checkpoint.
Branch/PR flow: branch `mv-NN-slug` off origin/master (fetch first — stale local master has bitten), branch
BEFORE touching board.json, base every PR on master (stacked-PR base deletion auto-closed PR #42→refiled #43),
push branch freely (preview URL is non-prod), `gh pr create`, **founder-gated `gh pr merge`** — the #1
non-negotiable: master IS production (Vercel auto-deploys); never self-merge, never `--admin`. No GitHub branch
protection exists — every gate is procedural, which makes the discipline MORE binding, not less.
Include: board.json merge-conflict recipe (it is the hottest file — resolve board.json by hand-union, then
regenerate views); integration CI job is advisory (`continue-on-error: true`) — trust `validate`; what to do when
Ready is empty (refine top Backlog card per kanban README). Rationalization table + red flags required
(e.g. "checks are green so I can merge" → NO; "it's just a docs change" → still PR).
Leads to verify: docs/kanban/README.md (ritual :72-89, definition of ready :51-59, done :61-68, anti-drift :93-98,
dossier schema :102-136); docs/kanban/build.mjs; .github/workflows/ci.yml (validate job, integration
continue-on-error ~:37); git history for stacked-PR incident (#42/#43) and board conflict merges.

## 2. merovisa-debugging-playbook

Scope: a symptom→cause→discriminating-experiment→fix TABLE as the spine, one row per known failure mode, each with
its incident citation (cross-ref merovisa-failure-archaeology for the story). Rows to verify and include:
`npm test` red on tests/data/freshness.test.ts (EXPECTED — designed alarm; → #6/#13, never "fix" the date);
CI integration job red (advisory; env-export rot — fix parked on PR #35); every route 500s under Turbopack after
a `> nul` redirect created a literal `nul` file (Tailwind v4 scanner fatal; gitignore covers it, must clear .next);
searches/globs explode into ~99k files (.claude/worktrees/ holds full repo copies — always exclude);
"middleware.ts missing" (Next 16 renamed it: root proxy.ts is the entry, lib/supabase/middleware.ts the helper);
authed pages crash with placeholder Supabase env; CLAIM_HMAC_SECRET <32 chars throws same as missing;
dark mode absent in tests/SSR (data-theme="light" default; inline pre-paint script flips it);
utilities silently dead app-wide (unlayered CSS in globals.css outranks Tailwind layers — bit twice;
tests/styles/globals-layering.test.ts guards); WRITE_GOLDENS/FLIP_STATUS bash syntax silently no-ops in
PowerShell; `npm run test:integration` "passes" with everything skipped when SUPABASE_TEST_* unset;
swallowed-{error} class (read every returned error — leads: 50cc112, 105b362, 5291eb8); persist-miss dead-CTA
class (id:null → CTAs must retry in place, not link to /assess); OneDrive path quoting.
Also: HOW to debug here — systematic-debugging norms, reproduce-first, read the actual DB error, prefer
*.itest.ts against local Supabase for DB-write paths. When NOT: architecture questions → #4; test mechanics → #9.

## 3. merovisa-failure-archaeology (reference skill)

Scope: the chronicle. Format per entry: SYMPTOM → ROOT CAUSE → EVIDENCE (commits/PRs/files) → STATUS
(fixed/guarded/still-open) → LESSON. Mine git log + docs/audits/ + docs/kanban/cards/ YOURSELF; the discovery
pass found ~15 incidents you should verify and may extend:
(1) Codex pre-merge HOLD beat green 1544-test suite — dangling fund-release ref + fabricated "Since 1 Jan 2025"
CoE claim (c2967cf, MV-57); (2) OAuth callback bounced prod users to localhost, fix-of-a-fix (61e197d + hardening);
(3) mocked-DB tests shipped a swallowed-error bug — partial-unique index violation discarded (50cc112 → itest lane
bcc3fed); (4) the real-DB CI smoke itself rotted ~10 days (supabase CLI output rename; 3-commit chain, PR #35);
(5) stacked-PR auto-close (#42→#43); (6) board.json = merge-conflict magnet (141/300 commits); (7) journey-rail
spec superseded — "imposed a false funnel" (93b5fb2 never merged; 318c9f4 pivot); (8) Windows `nul` file 500s
(e02a09d); (9) stale-prose genre: card prose contradicts col state; PROJECT_STATUS mis-steered work twice
(8adcf2f, 7d20e49, docs/audits/2026-06-27-mv68-ground-truth-audit.md); (10) same invariant fixed at two layers —
CGPA normalized in engine but raw in profile editor (d0c450e, 7b34f8d); (11) persist-miss dead-CTA killed on 3
surfaces (966a978, 57cb3d7, 149b181); (12) orphaned/silent-failure code — createLead had zero prod callers, 0 leads
ever written (5291eb8, 105b362); (13) fabricated/theatrical UI removed as bugs (6237e00, b400a14, c00eba9, bec6dfe);
(14) designed-red freshness timer (PR #36 open); (15) PR #13 closed unmerged for state reasons; zero true reverts
exist — corrections are forward fixes. Also mine docs/audits/ for settled DECISIONS (e.g. refusal-reasons keep-out
policy 2026-06-16; strategic reassessment retiring the "% findings wired" metric — find the in-repo evidence).
When NOT: for the fix recipe → #2; for current work state → the board, not this skill.

## 4. merovisa-architecture-contract

Scope: load-bearing decisions + WHY + invariants + known-weak points. Route groups (marketing)/(focused)/(app);
17 API routes; auth: root proxy.ts → lib/supabase/middleware.ts updateSession (x-pathname header), (app)/layout.tsx
getUser() redirect, API routes each self-auth. lib/ (~25 modules) inventory with one-liners. 15 supabase/migrations,
12 tables, RLS enabled (mostly FORCE; documents got force in a later fix migration). Invariants with evidence:
scoring server-side + versioned (RULE_VERSION/CONFIG_VERSION), business logic in Next.js not DB, Zod safeParse on
API routes (~10), sourced data carries source+lastVerified (note: lastVerified is z.optional in at least
au-genuine-student.schema.ts — schema-encouraged not mandated). Known-weak points stated plainly: lib/scoring has
NO server-only import guard (convention only); Sentry listed in .env.example but unwired; no branch protection;
empty scaffolding dirs (components/progress, lib/progress); corridor accent tokens have zero consumers yet.
Expansion posture: source/destination countries as separate dimensions; corridor registry. MVP = Nepal→Australia.
When NOT: domain semantics → #5; data provenance internals → #6; theming internals → #10.

## 5. np-au-corridor-reference (domain reference)

Scope: the AU-student-visa domain a mid-level person lacks, AS IMPLEMENTED HERE. Subclass 500 student visa;
Genuine Student (GS) requirement incl. immigration-history and course-relevance factors (Ministerial Direction 106 —
find the in-repo citation in data/dossiers); CoE (Confirmation of Enrolment); CRICOS codes + provider directory
(harvested, ~1,669 providers); Nepal evidence levels (Regular/Streamlined/Undetermined, study-type 01 — harvested
DHA dataset); ART (Administrative Review Tribunal) review path + fee; funds/OSHC/fee figures (live in
lib/data/policy/* with provenance); refusal-reasons editorial keep-out policy (docs/audits/2026-06-16-...);
verdict philosophy: banded Strong/Possible/Reach, never percentages. For EVERY concept: define it, say where it
lives in code (file), where its provenance lives, and its volatility (what re-verification it needs). DO NOT
assert domain facts the repo doesn't evidence; label anything time-sensitive with the freshness caveat and route
to #6. When NOT: changing data values → #6/#13; scoring mechanics → #4 + code.

## 6. merovisa-sourced-data-and-freshness (discipline skill)

Scope: the provenance machine. Record shape: source + lastVerified + Provenance {findingRefs, volatility,
reverifyBy}; Zod enforcement via lib/data/schema/common.ts + per-module *.schema.ts; registry
lib/data/schema/registry.ts (DATA_MODULES) — the freshness guard walks it. TWO guards: tests/data/freshness.test.ts
(blanket; predicate `reverifyBy <= today` lexicographic string compare — fires ON the date) and
tests/data/scoring-freshness.test.ts (verdict-scoring inputs via CONFIG_PROVENANCE). Findings ledger:
docs/research-briefs/findings/*.jsonl (~1118 findings; status/used_by MACHINE-DERIVED by flip-status from code
findingRefs — never hand-edit; FLIP_STATUS=1 run mutates the jsonl). Governance split: hand-curated finding-traced
files (au-cricos-codes.ts) vs machine-harvested datasets (au-cricos-directory.ts, au-nepal-evidence-levels.ts —
OUTSIDE DATA_MODULES, module-level 6-month TTL, re-harvest due ~2026-12-22 via scripts/harvest-dha-evidentiary.mjs;
DHA endpoints are internal SharePoint, anonymous-POST, low concurrency + 403 backoff, never a runtime dependency).
Checklist: HOW TO ADD a data module (schema, registry, provenance, finding refs, tests). THE RULE with
rationalization table: a fired alarm is re-verified at the live source with recorded evidence, or it stays red —
extending reverifyBy blind is falsifying provenance (route the actual fix to #13).
When NOT: executing the current re-verification → #13; domain meaning of the records → #5.

## 7. merovisa-build-and-env (+ config axes)

Scope: environment from scratch on a fresh machine + every configuration axis. Commands (package.json): dev/build/
start/lint/typecheck/test/test:integration/test:watch/test:ui/board. Versions as of 2026-07-04 (Next 16.2.7 exact-
pinned, React 19.2.4, TS 5.9.3 strict + noUncheckedIndexedAccess, Tailwind v4.3 CSS-first — NO tailwind.config,
tokens in app/globals.css @theme; vitest 4.1.8 two configs; zod 4.4.3; CI Node 20, no engines field).
ENV CATALOG as a table: var | required? | failure mode | file:line — NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (authed
pages throw; build needs at least placeholders), SUPABASE_SERVICE_ROLE_KEY (admin client throws — anonymous persist/
claim/leads break), CLAIM_HMAC_SECRET (≥32 chars or throws; generation one-liner in .env.example), DEEPSEEK_API_KEY
(guide 503s calmly), UPSTASH_* (rate limits fail-OPEN), NEXT_PUBLIC_POSTHOG_* (silent no-op), NEXT_PUBLIC_SITE_URL
(callback origin fallback chain), ENABLE_DEV_SIGNIN + DEV_USER_EMAIL (triple-gated dev sign-in), NODE_ENV (gates
Zod validation of scoring data modules — validated everywhere except production), SENTRY_DSN (listed but UNWIRED).
Test-only toggles: WRITE_GOLDENS, FLIP_STATUS (mutating! → #9/#6), SUPABASE_TEST_URL/SUPABASE_TEST_SERVICE_ROLE_KEY.
Windows traps: OneDrive path + 'Research Documents' space (quote paths); literal `nul` file catastrophe; PowerShell
env syntax. README is largely stale create-next-app boilerplate except its env/auth section — say so.
When NOT: deploy/runtime ops → #8; test invocation details → #9.

## 8. merovisa-run-and-operate

Scope: running and deploying. Dev: `npm run dev` (Turbopack; .next cache clear fixes scanner poisoning). Prod
model: master = production; Vercel auto-deploys merges; NO vercel.json (dashboard-configured); .vercel/ is
gitignored linkage; preview deploys per PR branch. Supabase: hosted project is prod (README says schema applied);
local stack via `npx supabase start` (Docker; config.toml), status/env recipe for integration tests; migrations
live in supabase/migrations (15) — applying to prod is FOUNDER-GATED ops (cite how past prod migrations were
recorded on cards, e.g. MV-53's applied-migration note if verifiable). Degradation map in prod: guide 503 without
DEEPSEEK key, rate-limit fail-open without Upstash, analytics opt-in. Storage: documents vault bucket + RLS.
Runbook: verify a deploy (what to check), roll forward (no reverts in history — forward fixes are the norm),
where output lands (Vercel logs; PostHog if keyed). Include command anatomy for the board generator and harvest
script AS OPERATIONS (what they write, when it's safe). When NOT: env bootstrapping → #7; merge rules → #1.

## 9. merovisa-testing-and-validation

Scope: the evidence bar. Suite anatomy as of 2026-07-04: two vitest configs (unit jsdom vs integration node/
*.itest.ts 30s timeouts); ~257 test files / ~1608 tests; tests/ mirrors source; unit suite excludes **/.claude/**
and *.itest.ts. Goldens discipline (THE core): tests/scoring/characterization.test.ts pins scoring outputs via
tests/scoring/__fixtures__/golden-assessments.json (18 boundary-straddling profiles); non-scoring changes leave it
byte-identical; intended scoring changes = re-verify + `$env:WRITE_GOLDENS="1"; npx vitest run tests/scoring/characterization.test.ts`
+ RULE_VERSION/CONFIG_VERSION bump (verify exact mechanism); wall-clock is engineered out (relative years) — never
add absolute-year matrix cases. NO snapshot infra exists — "goldens" ≠ vitest snapshots. Style-guard tests
inventory (token count/names frozen at 23, WCAG contrast, corridor accent-only + marketing exclusion, cascade
layering, focus ring, reduced motion). Integration lane: skipIf on SUPABASE_TEST_*; CI asserts >0 passed AND
0 skipped; local recipe (PowerShell). FLIP_STATUS=1 is a write-mode data migration disguised as a test — never
casually. How to: run one file, one test by name, watch mode; add a test (TDD-first per CLAUDE.md working
principles); what a PR must prove (typecheck+lint+test green EXCEPT the designed freshness red — state precisely).
Trap: asserting exact current copy can PIN a fabricated claim (the tautological-test lesson) — assert honest
behavior, not verbatim strings (cross-ref #11). When NOT: CI/gate sequence → #1; the red freshness alarm → #6/#13.

## 10. merovisa-design-system

Scope: "calm authority" + elevated-calm system as shipped. Tailwind v4 CSS-first: tokens in app/globals.css @theme;
EXACTLY 23 color tokens × light/dark, names FROZEN (tests/styles/token-contrast.test.ts pins count+names+WCAG);
value-swaps only — new tokens are a deliberate test-updating decision. Dark mode: data-theme attr on <html>, SSR
default light, pre-paint OS-follow script (lib/theme/theme-init.ts); no user toggle. Corridor theming: lib/theme/
corridor.ts registry; [data-corridor="np-au"] blocks may override ONLY --accent/--accent-tint (test-enforced);
activated via `contents` wrappers; as of 2026-07-04 zero consumers (plumbing only, MV-96 in review); the
corridor-tokens test regexes are hardcoded to np-au — generalize before corridor #2. Radii 8/12/16/999; motion
cubic-bezier(.22,.61,.36,1); fonts Hanken Grotesk / IBM Plex Mono; sentence case; no ALL CAPS except mono labels.
Policy-only rules (NO automated guard — flag them as such): background-color-not-background shorthand (dark-mode
custom-property re-resolution bug; ::selection in globals.css itself still uses shorthand), imageless product body
(docs/imagery-policy.md — photography only marketing+auth; restraint IS the anti-AI-look defense). Unlayered-CSS
trap (bit twice; test guards now). CLAUDE.md hex values can lag globals.css — globals.css is the value source of
truth. When NOT: writing user-facing words → #11; token contrast test mechanics → #9.

## 11. merovisa-trust-and-copy (discipline skill)

Scope: the trust-first copy bar — this project's distinctive doctrine, enforced as a BUG class. The rules:
no fabricated claims/dates/stats (fabricated "Since 1 Jan 2025" CoE claim was a pre-merge HOLD; fake journey
tracker, gate teasers, false "saved data is safe" error copy, and a fixed 3000ms fake "Analyzing" timer were all
removed as bugs — cite commits via #3); every user-facing fact traces to a source (SourceLines/source-map patterns);
verdicts are BANDS (Strong/Possible/Reach) never percentages; honest empty/failure/terminal states (withdrawn =
neutral gray, never red; no inferred steps; aria labels never imply unreached milestones); gated content =
peek-through blur, not lock theater; no PBL/streaks/variable-reward patterns (founder design-formulas doctrine —
find in-repo evidence in docs/design/* if present, else mark founder-directive). House style: sentence case,
calm, requirements scoped + distinct, plan vs checklist mental-model language. Testing interplay: never write a
test that pins fabricated copy verbatim (tautological-test lesson). Rationalization table required (e.g. "the
date is probably right" → source it or cut it; "an encouraging stat improves conversion" → fabrication is a bug).
When NOT: visual tokens → #10; docs prose → #12.

## 12. merovisa-docs-and-writing

Scope: the docs-of-record system and how to write in it. Three layers with HARD boundaries: docs/kanban/board.json
(current work state, hand-edited; views generated) / docs/PROJECT_STATUS.md (write-once phase HISTORY — reading it
as current state has mis-steered work; cite the mv68 ground-truth audit) / docs/audits/ (dated evidence, linked
never copied). Dossier template (kanban README :102-136): goal, context links, acceptance criteria, test plan,
integration gate, dependencies, risk notes, agent resume notes (cold-start), decision log, done evidence.
Stale-prose discipline: card prose and status docs go stale while `col` is correct — before building from any
card, verify against code + git log ("trust col, not prose"). Rules for writing: convert relative dates to
absolute; evidence linked not duplicated; regenerate board views after board.json edits (mechanics in #1).
Templates: provide a skeleton dossier and a skeleton audit doc matching house patterns. When NOT: board state
transitions → #1; user-facing copy → #11.

## 13. merovisa-freshness-campaign (EXECUTABLE, decision-gated)

Scope: the campaign for the live hardest problem. CURRENT STATE (2026-07-04 — verify every number yourself):
tests/data/freshness.test.ts red; 16 records with reverifyBy 2026-07-01 across lib/data/policy/* (subclass-500
charge, 4 skilled-visa charges, 4 ATO tax figures, 6 wage records, 1 ART review fee — verify exact files/records
by running the test and reading its failure output); MV-80 card = founder-DEFERRED until after the design sprint;
PR #36 (mv-80-fy2026-27-reverify) exists with ~12/16 figures updated but is CONFLICTING vs master; the card's own
resume-prose is stale relative to branch content (verify with git show/diff of the branch if fetchable).
STRUCTURE REQUIRED: numbered phases with exact commands and EXPECTED observations at every gate ("run
`npx vitest run tests/data/freshness.test.ts` → expect 1 failed listing exactly these 16 records; if you see
MORE records → a new deadline fired, re-scope; if 0 → someone fixed it, verify how before proceeding").
Phase outline: 0 confirm state → 1 inventory overdue records + their `source` URLs → 2 re-verify each figure at
the live source (record value, URL, access date; figures changed vs unchanged both need evidence) → 3 decide
branch strategy (menu, ranked: A rebase/recreate off origin/master carrying verified figures; B fresh slice
re-verifying from scratch treating PR #36 as reference; C resolve PR #36 conflicts directly — state obligations
of each) → 4 apply updates (values + lastVerified + reverifyBy to next FY cycle; note: if any figure feeds
scoring CONFIG, check CONFIG_VERSION/golden implications per #9 — verify whether these records do) → 5 validate
(freshness green, scoring-freshness green, full suite, typecheck/lint) → 6 promote through change control (#1:
board.json, dossier evidence, PR, founder gate). FENCED WRONG PATHS: extending reverifyBy without source evidence
(falsifies provenance); editing the test predicate; touching harvested-dataset TTLs (different cadence, due
~2026-12-22); regenerating au-cricos-codes.ts with the harvest script; self-merging. RECURRENCE: this fires every
FY cycle (~1 July) + harvest TTL (~Dec) — the skill must work NEXT time, not just for MV-80; keep current-state
facts date-stamped and re-derivable. Success is MEASURABLE: the named tests green with provenance evidence
recorded, never "looks fresh".

## 14. merovisa-research-methodology

Scope: how a hunch becomes an accepted result HERE. The pipeline: research briefs → findings ledger
(docs/research-briefs/findings/*.jsonl) → finding-traced code via findingRefs → machine reconciliation
(flip-status; status/used_by derived from code) → kanban card → TDD slice → adversarial pre-merge review →
founder gate. The evidence bar: one mechanism must explain ALL observations including negatives; claims survive
assigned adversarial refutation (the repo's own history: multi-agent audits in docs/audits/, pre-merge reviews
that HOLD on trust bugs); hypothesis-predicts-numbers-before-running (characterization/golden pattern; the
freshness guard as falsifiable-by-date design). Idea lifecycle incl. documented retirement (find in-repo examples:
retired vanity metric, journey-rail pivot, refusal-reasons keep-out decision — cite docs/audits entries).
Where good ideas historically came from (audits genre, incident lessons, founder playbooks — evidence from docs/).
Ground-truth reconciliation ritual: periodically re-verify docs/cards against code (mv68 audit as the worked
example). When NOT: executing a validated slice → #1; the frontier list → #15.

## 15. merovisa-research-frontier

Scope: the four founder-selected SOTA directions, each as: why current SOTA (consultancies/competitors/generic
AI) fails → this repo's specific asset (verify it exists, file refs) → first THREE concrete steps IN THIS REPO →
falsifiable "you have a result when ..." milestone. (1) Outcome-calibrated accuracy: assets = outcomes
state-machine/funnel/capture routes + events schema (verify lib/outcomes/*, /api/outcomes/*); steps toward a
calibration report comparing verdict bands vs real outcomes; blocked-path honesty: verification path is
legal-gated (MV-08). (2) Self-maintaining sourced data: assets = provenance machine + harvest script + freshness
guards; steps toward machine-drafted re-verification PRs (fetch source → diff figure → draft change with evidence),
founder still gates. (3) Trust/provenance UX: assets = SourceLines/source-map/drift-guard patterns (verify in
components/lib); steps toward user-inspectable provenance. (4) Consultancy-grade guide: assets = grounded DeepSeek
chat, corridor datasets, anti-injection hardening (verify lib/guide/*); steps toward an eval harness (refusal
safety, citation coverage, corridor accuracy). EVERYTHING labeled open/candidate — nothing here is shipped truth;
each item ends with its milestone criterion. When NOT: methodology/evidence bar → #14; current live problem → #13.
