# MV-164 — Host guard on the §A2 capture driver: refuse production by construction, not by comment

**Priority:** P1 · **Owner:** agent
**Goal:** Make "this script is rehearsal-only" a thing the code enforces rather than a thing three documents assert, so a full-population export of real students' personal data from production is impossible-by-construction rather than merely discouraged.

**Not an incident.** Nothing has run against production, and the script does **not** auto-load `.env.local` (it imports no dotenv), so reaching production requires someone to deliberately export the credentials first. This is a make-it-safe-by-construction fix on a rehearsal driver that a runbook invites you to copy-paste, not a response to a breach.

## The problem

`scripts/stage2/capture-read-path-snapshot.mjs` is MV-160 §A2's rehearsal driver. It:

1. holds `SUPABASE_SERVICE_ROLE_KEY`,
2. enumerates **every** Auth user via `admin.auth.admin.listUsers`,
3. reads all nine student read paths for each one, and
4. writes the lot to a JSON file.

That payload is, in the equivalence report's own words (§5), real students' "profile sections, names, emails, financial and academic detail."

The script is documented as run "BY HAND by the integrator **on the rehearsal host**, against a restored copy of production" (`docs/migrations/stage2/equivalence-report.md` §3), and its `lib/supabase/service-role-exceptions.ts` entry calls it "NOT AN APPLICATION PATH". **Every one of those statements was prose.** Nothing in the code refused a production URL, and §3 hands you the exact command to run. Point it at the production project ref `obfvrxixtautamflzxzq` and it cheerfully performs a whole-population personal-data extraction — contradicting `docs/legal/2026-07-29-stage0-decision-record.md` D-A and report §5.

## Context links

- **The script:** `scripts/stage2/capture-read-path-snapshot.mjs` (the §A2 CLI at the bottom; §A1's shared serializer/hash/exclusion list is the top of the same file and is **not touched by this card**).
- **The runbook that invites the mistake:** `docs/migrations/stage2/equivalence-report.md` §3 (copy-pasteable commands) and §5 (what the payload is).
- **The registry entry:** `lib/supabase/service-role-exceptions.ts` → `scripts/stage2/capture-read-path-snapshot.mjs`.
- **The legal boundary:** `docs/legal/2026-07-29-stage0-decision-record.md` D-A (layered controller model).
- **Why the comparison code is untouchable:** MV-160 §A — §A1 in CI and §A2 on the rehearsal host must run the *same* comparison, so editing the serializer/hash/exclusion list would invalidate the §A1 green record.

## What shipped

**`scripts/stage2/capture-host-guard.mjs`** — a new, **import-free** module (so it is unit-testable with no database, no env, no client, and so §A1's code is left alone):

| Target | Result |
| --- | --- |
| production ref `obfvrxixtautamflzxzq` | **Refused. No override** — `--rehearsal-host` does not unlock it. |
| `localhost`, `127.0.0.1`, `::1` | Allowed, no flag. The ordinary path. |
| any other host | **Refused unless `--rehearsal-host`** is passed. |
| unparseable | Refused. The guard will not guess. |

- `checkCaptureHost(url, { rehearsalHostAcknowledged })` → `{ allowed, code, host, reason }`. `code` is one of `production` / `local` / `acknowledged-remote` / `unacknowledged-remote` / `unparseable`, so a test can assert **which** rule fired, not merely that one did.
- `assertCaptureHostAllowed(url, options)` → the same, but throws on refusal. A verdict object nobody acts on is not a guard.
- `PRODUCTION_PROJECT_REF` is a named exported constant with a comment explaining why it is hardcoded: an env-var-driven "which project is production" setting is settable by the very person the guard exists to stop, and the ref is not a secret (it is the public API subdomain, and it already appears throughout `docs/kanban/cards/`).

**Host matching is a parse, not a substring test.** `new URL(...).hostname`, lowercased, then the ref must equal a **whole DNS label**. Whole-label rather than prefix, because `obfvrxixtautamflzxzq-copy.supabase.co` is a *different project* and must not be reported as production; any label rather than the first, because Supabase's direct-connection host is `db.<ref>.supabase.co` and a first-label-only match waves it through.

**Wired into `runCli` before anything else happens** — before `createClient`, before `listUsers`, before the other `requireEnv` calls. Reads the flag with `args.has("rehearsal-host")`, **not** `args.get`: the script's existing arg parser stores `undefined` for a flag in trailing position, so `get` would read a correctly-typed `… --snapshot <path> --rehearsal-host` as absent (fails closed, but for a reason nobody could see). The usage text now advertises the flag.

**Registry + runbook trued up.** The `requiredCaseCheck` on the script's `SERVICE_ROLE_EXCEPTIONS` entry now describes the guard instead of saying "n/a"; a new `tests/supabase/service-role-exceptions.test.ts` group-D test asserts the prose and the source agree (the D group exists precisely because two entries in that registry once lied). `equivalence-report.md` §3 gains a guard subsection with the hosted-rehearsal command (`--rehearsal-host`), and §4 gains the G1–G9 mutation table.

## Acceptance criteria

- [x] Production ref refused, with no override path.
- [x] Production ref refused **even with `--rehearsal-host` present** — the flag is an acknowledgement about remote hosts, never a bypass.
- [x] `localhost` / `127.0.0.1` allowed with no flag.
- [x] Any other remote host refused without the flag, allowed with it (a restored copy may legitimately live on its own hosted project).
- [x] URL-shape edge cases: trailing slash, uppercase, port, path, surrounding whitespace, ref-in-path, ref-in-query-string, look-alike longer ref, `db.<ref>.…`.
- [x] Unparseable / non-string input fails **closed**.
- [x] Refusals are actionable: they name the rejected host, why it was rejected, and what to do instead.
- [x] The guard is enforced **before** any client is constructed and **before** any user is enumerated — asserted on call ORDER, not merely on presence.
- [x] Mutation evidence recorded (below): the tests were shown to bite.
- [x] §A1's serializer / hash / exclusion list untouched — `git diff` on the capture script is +16/−1, all of it the import, the guard call and the usage line.
- [x] Registry entry and runbook updated so code and docs agree.
- [x] `npm run typecheck` · `npm run lint` · `npm test` green.

## Test plan

`tests/scripts/stage2-capture-host-guard.test.ts` — **34 tests**, seven groups:

| Group | What it pins |
| --- | --- |
| A | production refused; refused with the flag; the refusal is actionable; the ref is a named constant |
| B | `localhost`, `127.0.0.1`, trailing slash, `[::1]` all allowed with no flag |
| C | remote refused by default, allowed once acknowledged; refusal names the host **and** the flag |
| D | host-not-substring: ref in path, ref in query string, look-alike longer ref, `db.<ref>.…`, trailing slash, uppercase, port+path, whitespace |
| E | unparseable/empty/no-scheme/non-string all fail closed, and say what a valid value looks like |
| F | `assertCaptureHostAllowed` actually **throws** (a verdict object stops nothing) |
| G | the guard is **wired up**, ahead of both `createClient` and `listUsers`, and the opt-in is read with `has()` |

Plus one new case in `tests/supabase/service-role-exceptions.test.ts` group D (registry prose vs. source).

**Live CLI smoke** (not just unit tests) — real `node scripts/stage2/capture-read-path-snapshot.mjs` invocations:

| Command | Observed |
| --- | --- |
| `SUPABASE_URL=<prod> … --capture --out …` | refused, exit **1**, production message |
| same **+ `--rehearsal-host`** | refused, exit **1**, identical message |
| `SUPABASE_URL=<remote> …` (no flag) | refused, exit **1**, names the host + the flag |
| `SUPABASE_URL=http://127.0.0.1:54321 …` | **passes the guard**, then fails on `SUPABASE_ANON_KEY is required` |
| `SUPABASE_URL=<remote> … --rehearsal-host` (trailing) | **passes the guard** — proves `args.has` beats the parser quirk |

## Mutation evidence — the tests were shown to bite

Each mutation applied to the guard or its call site, run, reverted. Baseline **34 green** before and after the whole run. G6's first attempt produced a mutant that did not parse (`Tests no tests`), which proves nothing — it was re-run with `node --check` confirming `syntax OK` first, and the result below is that second run.

| # | Mutation | Result | Test(s) that went red |
| --- | --- | --- | --- |
| G1 | delete the guard call from `runCli` | **RED (3)** | `it calls the guard BEFORE it constructs any Supabase client`; `… BEFORE it enumerates Auth users`; `the CLI reads the opt-in with has()` |
| G2 | keep the call, move it *after* the client and `listUsers` | **RED (2)** | both `BEFORE …` ordering tests |
| G3 | neuter production detection (`return false`) | **RED (10)** | all of group A's refusal tests, six group-D production cases, both group-F throws |
| G4 | whole-label match → `hostname.startsWith(ref)` | **RED (2)** | `a DIFFERENT project whose ref merely starts with the production ref is not production`; `the production ref as ANY whole host label is production` |
| G5 | host parse → naive `rawUrl.includes(ref)` | **RED (5)** | ref-in-PATH; ref-in-QUERY-STRING; look-alike ref; the no-scheme fail-closed case; the actionable-message test |
| G6 | make `--rehearsal-host` a production override | **RED (2)** | `the opt-in flag does NOT unlock production`; `it throws on production even when the host is acknowledged` |
| G7 | default `rehearsalHostAcknowledged` to `true` | **RED (3)** | `a remote host is refused by default`; `it throws on an unacknowledged remote host`; look-alike ref |
| G8 | unparseable URL fails **open** | **RED (3)** | all three group-E cases |
| G9 | `assertCaptureHostAllowed` never throws | **RED (3)** | all three group-F throws |

**G1/G2 and G6 are the ones worth reading twice.** G1/G2 are the inert-guard shape this repo has already been bitten by — a denial-only RLS suite passes identically against a *missing* policy. Every behavioural assertion in groups A–F stays green while the guard is exported and never called, so group G's **ordering** assertion is the only thing between "the guard exists" and "the guard runs". G6 decides whether the production refusal is a refusal or a speed bump.

## Gate

Run on the branch, 2026-08-06, in the `merovisa-mv164` worktree.

| Check | Result |
| --- | --- |
| `npm run typecheck` | **clean**, exit 0 |
| `npm run lint` | **clean**, exit 0 |
| `npm test` | **2674 passed / 2674**, 333 files, exit 0 |
| `npm run board` | **165 cards**, generated clean (it fails closed on a lying board) |

`npm run test:integration` was **not** run: it needs a local Supabase stack, and nothing in this card
touches the database, a migration, a policy or a grant. The one integration file that imports the
capture script (`stage2-data-equivalence.itest.ts`) imports only the §A1 serializer/hash/exclusion
list, none of which changed — `git diff` on that file is the import line, the guard call and the
usage string.

**One typecheck fix worth recording:** the group-E non-string test originally carried a
`@ts-expect-error`, which failed as *unused*. The guard is a plain `.mjs` module, so TypeScript is
not standing between a missing `SUPABASE_URL` and the function at all — which is precisely why that
test needs to exist at runtime. The directive was removed and the reason written into the test.

## Risk notes / honest limits

- **The guard classifies the host in `SUPABASE_URL`.** It cannot see through a custom domain or a proxy that fronts production under another name, and it does not authenticate the target. It is a fence against the realistic mistake — exporting production credentials and running the runbook's copy-pasteable command — not a proof of where the bytes came from.
- **`--rehearsal-host` is an honesty flag.** It confirms the operator *meant* a remote target; it cannot confirm the target is offline or restored. That remains the integrator's judgement, which is why the allow message says so out loud.
- **Hardcoding the ref is deliberate.** Reading "which project is production" from the environment would let the person the guard exists to stop unset it. If the production project ever moves, `PRODUCTION_PROJECT_REF` moves with it and the test that pins its value goes red first — which is the intended order.
- **`node_modules` was a directory junction** into a sibling worktree for this build (never `npm ci` into OneDrive). Removed after the gate.

## Resume notes for a cold agent

- Branch `mv-164-stage2-capture-host-guard`, cut from `origin/master` at `e4dab3c`. Worktree `C:\Users\thapa\OneDrive\Desktop\work\merovisa-mv164`.
- Files: **new** `scripts/stage2/capture-host-guard.mjs`, **new** `tests/scripts/stage2-capture-host-guard.test.ts`; **edited** `scripts/stage2/capture-read-path-snapshot.mjs` (import + guard call + usage line only), `lib/supabase/service-role-exceptions.ts` (one `requiredCaseCheck`), `tests/supabase/service-role-exceptions.test.ts` (one group-D test), `docs/migrations/stage2/equivalence-report.md` (§3 subsection, §4 G-table).
- **Do not touch** the capture script's serializer, hash, exclusion list, `rowKey`, `normalizeRow`, `captureSnapshot`, `diffSnapshots` or `formatDiff`. §A1 (CI) and §A2 (rehearsal) must run the *same* comparison; changing it invalidates MV-160's §A1 green record.
- **Why the guard lives in its own file and the test declares no environment:** importing `capture-read-path-snapshot.mjs` from a jsdom test fails to parse. Vite's SSR transform rewrites its `node:crypto` / `node:fs` imports into CJS interop shims and hoists them above line 1, pushing the `#!/usr/bin/env node` shebang into the middle of the file. §A1's `.itest.ts` gets away with it only because the integration config runs `environment: "node"`. The import-free guard module has neither a shebang nor a node-builtin import, so it transforms cleanly in the default lane — which is also why the guard is testable in `npm test` at all.
- The mutation harness is disposable and lives in the session scratchpad, not the repo. To re-run it, back up both script files, apply one edit, run `npx vitest run tests/scripts/stage2-capture-host-guard.test.ts --reporter=verbose`, restore. **Run `node --check` on the mutant first** — a mutant that does not parse reports `Tests no tests`, which looks like evidence and is not.
