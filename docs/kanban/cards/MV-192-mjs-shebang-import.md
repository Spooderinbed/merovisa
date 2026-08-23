# MV-192 — A shebanged `scripts/*.mjs` breaks its importing test file on Windows

**Priority:** P2   **Owner:** agent
**Goal:** A Windows developer can run `npm run test:integration` and get the same 20 files / 1014 tests CI gets, instead of one file that dies with an unactionable `SyntaxError`.

## What this is — and what it is NOT

`tests/integration/stage2-data-equivalence.itest.ts` fails to **parse** on Windows:

```
FAIL  tests/integration/stage2-data-equivalence.itest.ts
SyntaxError: Invalid or unexpected token
```

Its line 79 imports `../../scripts/stage2/capture-read-path-snapshot.mjs`, which opens with
`#!/usr/bin/env node`. Vitest's SSR transform does not strip a `#!` line **terminated by CRLF**,
and the module then fails to parse, taking its importer down with it. This is the rule already
recorded in [MISTAKES.md](../../../MISTAKES.md) — *"put testable logic in an import-free sibling
module"* — whose scoping this card corrected on two counts (see the Decision log).

**This is a WINDOWS-ONLY, LOCAL-ENVIRONMENT defect. It is not a coverage hole and master is not red.**

- CI (Linux) runs the suite and passes it: PR #157's `integration` job reports
  `Test Files 20 passed (20)` / `Tests 1014 passed (1014)`, with every
  `stage2-data-equivalence.itest.ts` test individually ticked.
- Those 19 tests are exactly the margin by which CI's 1014 exceeds the local Windows 995.
- **CI's summary-shape guard is sound — do not go hunting for a gap in it.** An earlier
  write-up of this issue claimed the suite was dead and that CI might have a gap. Both were
  wrong and were corrected on [MV-191's dossier](MV-191-stage4-exit-gate.md).

The cost is exactly this: a Windows developer cannot run that suite, and gets a red file with
no actionable message.

## Ruled out already — do not redo

- **Not control bytes.** 36,395 bytes, byte-scanned, ZERO control bytes.
- **Not a TypeScript syntax error.** `npx tsc --noEmit` on the file alone reports nothing.
- **Not caused by any recent branch.** The itest and the `.mjs` are byte-identical to `origin/master`.

## Context links
- [MISTAKES.md](../../../MISTAKES.md) — the "import-free sibling" rule this card applies
- `scripts/stage2/capture-read-path-snapshot.mjs` — the shebanged module (MV-160 §A)
- `scripts/stage2/capture-host-guard.mjs` — MV-164's guard; already an import-free sibling, and the precedent for this split
- `tests/integration/stage2-data-equivalence.itest.ts` — the importer that dies
- [MV-191 dossier](MV-191-stage4-exit-gate.md) — where this was found in passing, and where the earlier misdiagnosis was corrected
- `tests/supabase/service-role-exceptions.test.ts` + `tests/scripts/stage2-capture-host-guard.test.ts` — two source-text guards that pin `capture-read-path-snapshot.mjs` by path

## Acceptance criteria
- [ ] `tests/integration/stage2-data-equivalence.itest.ts` **runs** on Windows — the count is read, not merely the absence of a failure: `Test Files 1 passed (1)` / `Tests 19 passed (19)` for the file alone.
- [ ] The whole local integration lane runs green with **no file failed and none skipped**. Read the count, and mind two things: (a) this branch is cut from master `c1acec3` and carries **19** `.itest.ts` files — the "20 files / 1014 tests" quoted from CI is PR #157's branch, which adds MV-191's own tests, so 20/1014 is not this branch's target; (b) the lane needs `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` and `SUPABASE_TEST_DB_CONTAINER` set, or 18 of the 19 files **skip** and the lane reports a green that proves nothing.
- [ ] The importable logic (`READ_PATHS`, `MIGRATED_TABLES`, `EXCLUDED_FIELDS`, `isExcluded`, `rowKey`, `normalizeRow`, `stableStringify`, `hashPayload`, `captureSnapshot`, `diffSnapshots`, `formatDiff`) lives in a sibling module with **no shebang**.
- [ ] `capture-read-path-snapshot.mjs` keeps the shebang and stays the CLI entrypoint: `npm run stage2:equivalence` still works standalone, including its usage text and its host-guard refusal.
- [ ] **One serializer, one hash, one exclusion list.** The §A1 (CI) and §A2 (rehearsal) halves must still import the same code — that is the whole point of MV-160 §A and must not be split by this refactor.
- [ ] A regression guard fails if any shebanged `scripts/**/*.mjs` is imported from the test lane again. It must be **platform-independent** — the itest's own failure is Windows-only, so it is not a durable guard.
- [ ] The two existing source-text guards still pass unchanged: `service-role-exceptions.test.ts` expects `["scripts/stage2/capture-read-path-snapshot.mjs"]` for the "for exactly two things" phrase, and requires `assertCaptureHostAllowed(url` to appear **before** `auth.admin.listUsers` in that file.

## Test plan
- **New, and the real deliverable:** a guard that scans every `tests/**` import of `scripts/**/*.mjs`, resolves each target, and asserts none begins with `#!`. Runs in the default (`npm test`) lane so it bites on every platform and every CI run. Must fail before the fix and pass after.
- **CRLF trap:** the tree is CRLF. Split on `/\r?\n/`, never `"\n"` — a `split("\n")` guard matches zero lines here and goes **vacuously green**.
- **Regression, run on Windows:** `stage2-data-equivalence.itest.ts` alone → 19 tests; then the full integration lane → 20 files / 1014 tests.
- **CLI smoke, four steps.** Note the arg order: `runCli` calls `requireEnv("SUPABASE_URL")` and the host guard *before* it ever reaches the usage branch, and the usage branch itself sits after a full capture — so "no args prints usage" is **not** what this CLI does.
  1. No env → exits 1 naming `SUPABASE_URL`. Proves the wrapper still loads and runs.
  2. `SUPABASE_URL` = the production ref, even with `--rehearsal-host` → refused by `assertCaptureHostAllowed`. Proves the guard import survived the split.
  3. Full env against the local stack, `--capture --out <tmp>` → real capture, whole-snapshot hash printed. Proves `captureSnapshot` still reaches the CLI across the module boundary.
  4. `--snapshot <that file>` → `EQUIVALENT — zero differences`, exit 0. Proves `diffSnapshots` + `formatDiff` do too. Destroy the temp snapshot afterwards.

## Integration gate
```
npm run typecheck
npm run lint
npm test
npm run test:integration      # local Docker stack; expect 20 files / 1014 tests
npm run stage2:equivalence    # expect usage text, exit 2
```

## Dependencies / blocked-by
- None. No migration, no schema change, no Supabase grant.
- Local Supabase Docker stack must be up for the integration lane (`npx supabase` is broken on this Windows host — the stack is started out-of-band; `SUPABASE_TEST_URL=http://127.0.0.1:54321`, demo JWT secret `super-secret-jwt-token-with-at-least-32-characters-long`, issuer `supabase-demo`).

## Risk notes
- **The one real risk is splitting the proof.** MV-160 §A's guarantee is that the synthetic (CI) half and the live rehearsal half run *the same* serializer, hash and exclusion list. Moving that code must move it **wholesale into one module both halves import** — never duplicate it, never leave half behind.
- Two tests read `capture-read-path-snapshot.mjs` as **source text** and pin strings in it. Both anchors (`assertCaptureHostAllowed(url`, `auth.admin.listUsers`) are CLI-only and stay in the wrapper, so the split is safe — but re-check them, do not assume.
- The service-role exception registry is keyed by path. The service-role client is constructed only in the CLI half, so the registry entry stays correct and pointed at the same file.
- Not a trust, scoring, auth or legal surface. No RULE_VERSION implication.

## Agent resume notes (for a cold start)
The diagnosis is finished and the fix is mechanical. `capture-read-path-snapshot.mjs` already
carries the seam as a comment banner: *"Everything below this line is CLI-only and is not
imported by §A1."*

1. Move everything **above** that banner (the shared model: `READ_PATHS` → `formatDiff`) into a
   new, shebang-free `scripts/stage2/read-path-snapshot.mjs`. It needs only `createHash` from
   `node:crypto`.
2. Leave the shebang, `mintAccessToken`, `requireEnv`, `runCli` and the `import.meta.url` entry
   check in `capture-read-path-snapshot.mjs`; it imports what it needs from the sibling. It keeps
   `createHmac`, `readFileSync`/`writeFileSync` and `assertCaptureHostAllowed`.
3. Repoint the itest's import at the sibling. Do **not** re-export the shared symbols from the
   CLI file — importing the shebanged file is the exact thing that breaks.

## Decision log
- 2026-08-23 — Carved from MV-191. Found while taking the Stage 4 exit gate (PR #157); deliberately not fixed there, to keep two stages' concerns out of one review.
- 2026-08-23 — Cause confirmed by experiment, not inference: stripping the shebang alone turned `SyntaxError` / 0 tests into `Test Files 1 passed (1)` / `Tests 19 passed (19)`, and the file was then restored byte-identical.
- 2026-08-23 — Chose the sibling name `read-path-snapshot.mjs`: the CLI keeps the verb (`capture-`), the library keeps the noun. Both files get a banner pointing at the other so the split is not silently folded back.

- 2026-08-23 — **The MISTAKES entry was wrong twice, and this card corrected it.** A three-way probe on this Windows host (a minimal module imported by a minimal test) measured: **CRLF-terminated shebang → `SyntaxError`; the SAME shebang with an LF ending → parses; no shebang → parses.** So (a) the trigger is the CRLF-terminated shebang, not the shebang alone — which is exactly why it is Windows-only and why Linux CI never saw it; and (b) it is not jsdom-only and not about node-builtin imports, since this failure was in the `node` integration lane. [MV-165's dossier](MV-165-stage2-a2-real-data.md) had named CRLF correctly; the MISTAKES entry had not. Entry rewritten around the measurement.
- 2026-08-23 — The regression guard deliberately refuses **any** shebang on an imported `.mjs`, not just a CRLF one. A shebang that happens to be LF today is a trap the next Windows checkout springs, and the guard has to fail on the machine that gates merges.
- 2026-08-23 — This defect had been recorded as "pre-existing, not mine" on **five** cards (MV-165, MV-168, MV-185, MV-186, MV-190) without anyone owning it. Worth a founder note: the local integration lane has been one file short for months, and each of those cards was right to decline it in scope.

## Done evidence

Branch `mv-192-mjs-shebang-import`, off master `c1acec3`. All runs on Windows, against the local Supabase Docker stack.

| Check | Result |
|---|---|
| **The bug, reproduced** | `stage2-data-equivalence.itest.ts` → `SyntaxError: Invalid or unexpected token`, **0 tests**, exit 1 |
| **Cause confirmed, not inferred** | Stripping only the shebang turned that into **19 passed**; file then restored byte-identical (`git status` clean) |
| **Root cause isolated** | Three-way probe: CRLF shebang → `SyntaxError`; LF shebang → passes; no shebang → passes |
| **New guard, before the fix** | RED, naming the exact edge: `tests/integration/stage2-data-equivalence.itest.ts:79 -> ../../scripts/stage2/capture-read-path-snapshot.mjs` |
| **New guard, after the fix** | `Test Files 1 passed (1)` · `Tests 3 passed (3)` — the two anti-vacuity tests pass too, so the scan is live |
| **The formerly-dead suite** | `Test Files 1 passed (1)` · **`Tests 19 passed (19)`** |
| **Full integration lane** | **`Test Files 19 passed (19)` · `Tests 964 passed (964)`**, 0 skipped, exit 0 — the whole lane green locally |
| `npm test` | `Test Files 387 passed (387)` · `Tests 3889 passed (3889)` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| **Logic unchanged** | Both moved bodies **byte-identical to HEAD** (EOL-normalised): shared 11,548 B, CLI 5,470 B. Exports split 11 + `mintAccessToken` = the original 12 |
| **CLI smoke 1** — no env | exit 1, names `SUPABASE_URL` |
| **CLI smoke 2** — production URL + `--rehearsal-host` | refused by `assertCaptureHostAllowed`; "THERE IS NO OVERRIDE" |
| **CLI smoke 3** — local stack, `--capture --out` | real capture: 1 user, 0 anonymous, whole-snapshot hash `799b2be6…` |
| **CLI smoke 4** — `--snapshot` replay | `EQUIVALENT — zero differences`, exit 0. Temp snapshot destroyed |

**Counts read rather than assumed.** The lane is **19** files / 964 tests on this branch, not the
20 / 1014 quoted from CI. Verified, not inferred: `git ls-tree` counts 19 `.itest.ts` on `master`
and on this branch, and 20 on `mv-191-stage4-exit-gate-build` — PR #157 adds
`tests/integration/stage4-exit-gate.itest.ts`. So 20 / 1014 is that branch's shape and cannot be
this one's. Also
worth knowing: without `SUPABASE_TEST_URL` / `_ANON_KEY` / `_SERVICE_ROLE_KEY` / `_DB_CONTAINER`
set, 18 of the 19 files **skip** and the lane reports a green that proves nothing. The 19/964
above was run with all four set.

**Not done here:** not merged. Merges to master are founder-gated.
