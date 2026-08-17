# Mistakes log

Running log of mistakes made while building MeroVisa — each one cost real time or nearly shipped a defect. **Check the relevant section before starting matching work; do not repeat these.** Add an entry whenever a mistake costs more than ~15 minutes or slips past a green suite. Keep entries to: what happened → the rule.

Format per entry: **bold rule first**, then the incident in one or two lines. Newest entries go at the top of their section.

## Process & kanban

- **Trust a card's `col`, never its stale prose — verify with `git log` + grep before building anything.** Backlog prose described MV-44 as unbuilt; it was already merged. Nearly rebuilt a shipped feature.
- **`board.json` edits are in-place field edits or append-only — NEVER a dedup-union.** A "clean up duplicates" union deleted a merged card outright (MV-100) because the board legitimately holds two-distinct-cards-per-id collisions. The integrity guard (`npm run board` fails on a lying board) exists because of this.
- **Merging stacked PRs: retarget the dependent PRs to `master` FIRST, then merge upward.** `gh pr merge --delete-branch` on a chained-base PR closed its dependent PR. Also: `--delete-branch` can drop you onto a stale, diverged local master.
- **Regenerate + commit the board before any checkpoint/compaction.** A stale board is the top cold-resume failure mode: the next session acts on wrong state.
- **A Ready card must have a dossier a cold agent can build from.** MV-172 sat in Ready with `"file": null` — un-actionable after any compaction.

## Testing

- **A green jsdom suite proves nothing about layout, CSS, or timing — do a live browser pass after any CSS-heavy change.** jsdom has no layout engine; two production hotfixes (MV-113, MV-114) shipped days after a "green" landing redesign.
- **Split on `/\r?\n/`, never `"\n"` — and never verify a JS regex claim in PowerShell/.NET.** The Windows working tree is CRLF (`autocrlf=true`, no `.gitattributes`): `split("\n")` + `(.*)$` matched zero lines and the assertions went vacuously green — red only on Windows, green on Linux CI.
- **A denial-only RLS test suite passes identically against a MISSING policy — mutation-test every policy and read the failing test names.** Negative probes ("role X cannot read Y") are inert as evidence; only drop-the-policy-and-watch-it-fail proves the test bites.
- **Beware vacuous "both sides" checks: when two keys are 1:1, "denied under both" can be true with no policy at all.** (MV-157: owner↔case is 1:1, so the check never discriminated.)
- **A green suite is not a trust check — run an adversarial review before merging any trust-bearing surface.** Pre-merge review caught a fabricated CoE date and a dangling fund-release reference (MV-57), and a rebuilt honesty meter that stayed dishonest for existing users (MV-144) — all behind green suites.
- **Never import a `scripts/*.mjs` with a shebang + node-builtin imports from the jsdom test lane — put testable logic in an import-free sibling module.** The SSR transform hoists CJS shims above `#!` and the file fails to parse.
- **Baseline flaky Windows tests against clean `origin/master` before blaming your change.** `no-actor-equals-student > M4b` times out under full-suite load here; on the day it was investigated, master was worse than the branch.
- **Never pipe the test run (`npm test | tail`) — the pipe eats the exit code and hides hangs.** Redirect to a file if output must be captured.

## Silent failures

- **Destructure and check `error` on every Supabase call that matters — a PostgREST `42501` RESOLVES rather than rejects.** Three service-role legs fail silently today if flipped carelessly; `lib/assessments/re-score.ts` never destructures `error`, so a permissions regression would silently stop re-scoring profiles, suite green. `throwOnError` is used nowhere — do not assume it.
- **Abstention must be explicit state, never an emptied list.** MV-143's abstain gate first "abstained" by returning no items — a downstream auto-close read the empty list as completion and marked a todo Done.
- **Stored payloads replay on read: normalize at every read/replay site, not just the write path.** MV-144 fixed dishonest copy at write time; every existing user kept seeing the old dishonesty because their stored rows replayed unnormalized.

## Windows / OneDrive environment

- **Never `npm ci` into a OneDrive-synced path — junction `node_modules` from outside OneDrive instead.**
- **Delete the junction BEFORE `git worktree remove --force`.** Measured: removal followed the junction and emptied the target install (374 entries → 0).
- **Byte-scan authored source after writing escape sequences.** Backslash-escapes written via Write/Edit can land as literal control bytes — tests stay green, the diff looks invisible. Build control characters with `String.fromCharCode`.
- **Phantom `TS2307` errors: clear stale `.next` before trusting typecheck output.**

## Supabase / Postgres

- **An upsert needs UPDATE granted on EVERY payload column including the conflict target** (42501 on the first call otherwise), **and the ON CONFLICT arbiter index must be full, never partial** (42P10). Measured on MV-155.
- **Apply production migrations with `execute_sql` + a hand-stamped ledger row — never `apply_migration`.** The MCP stamps its own version and the migration ledger drifts from the repo.
- **Table-level grant reads understate the write surface once columns are scoped; check `pg_trigger` before filing an access-control finding.** Two canonical divergences are enforced by a trigger, not RLS — an RLS-only audit reports them as holes.
- **An INSERT grant cannot serve an `.upsert()` call site.** Found while speccing Stage 3 — the verb the code calls is the verb that needs granting.

## Tooling & agents

- **`codex exec` blocks forever reading stdin unless stdin is closed — and redirect output to a FILE, never a pipe.** A pipe makes hung and working look identical; cost 30 minutes. (Piping the prompt IN via `codex exec -` is fine — stdin then closes at EOF.)
- **A tool/classifier denial is nondeterministic — retry the identical command once before escalating; never work around it by switching transport.** Retrying verbatim has succeeded repeatedly.
- **Probe a capability with one cheap read-only call before declaring it absent.** The Supabase MCP was declared unauthorized off a stale system notice; it works and applies production migrations.
- **Read the page/file before asserting facts about it.** "The workspace has no information hierarchy" was inferred from line counts and was false — the real defect was different (no queue/next-action view).
- **Verify a reviewer's PRESCRIPTION, not just its premise — and scope-fence external reviewers.** A Codex "over-gate bands-only" fix was wrong while its diagnosis was right; unfenced, it scope-crept into unrelated bugs. A DO-NOT-MERGE can also be a sandbox artifact — read the justification, re-verify the gate yourself.
- **A partial review workflow reports unreviewed ground as CLEAN.** Dead refuter agents made findings land as "refuted"; cross-reference the failure list against each verdict's lens before trusting a clean report.
