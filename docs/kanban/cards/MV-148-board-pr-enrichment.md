# MV-148 — Board PR enrichment: live PR/CI/review state per card, zero drift

**Priority:** P2   **Owner:** agent
**Goal:** The founder runs multiple parallel Claude sessions, each owning one card/branch/PR; the board must show which PR belongs to which card, its CI and review state, and what part of the codebase it touches — at a glance, without creating a second source of truth.

## Context links
- Operating manual + anti-drift rules: docs/kanban/README.md (rule 1: card state lives ONLY in board.json)
- Generator: docs/kanban/build.mjs (~265 lines; already computes derived fields ageDays/inColDays/stale at build time — PR data follows the same pattern)
- Integrity guard: docs/kanban/validate.mjs
- Motivating evaluation: mission-control (builderz-labs) was assessed 2026-07-27 and declined — it fetches no CI/review/files data and demands a SQLite SOT; this card delivers the wanted feature natively. Visual vocabulary (PR/CI chips, priority stripes, summary strip) may be borrowed from its UI.
- Join-key guarantee: card IDs are permanent in branch/commit/PR names (README, formerId note)

## Acceptance criteria
- [x] `npm run board` enriches cards with live PR data joined by MV-ID found in the PR head branch name or title: PR number + URL, draft flag, state (open/merged/closed), CI rollup (from statusCheckRollup), review decision, and a files-touched summary rolled up to top-level dirs.
- [x] Enrichment is DERIVED AND EPHEMERAL: nothing is ever written into board.json (same class as ageDays). validate.mjs still passes untouched on the state model.
- [x] Fail-soft: if `gh` is missing, unauthenticated, offline, or slow, the board still generates completely with a visible "PR data unavailable" note — a GitHub outage must never block `npm run board`.
- [x] board.html renders per-card chips (PR link, CI state color, review state) and an "in-flight PRs" summary strip; board.md gets a compact text equivalent.
- [x] Reconciliation warnings (extends the guard's spirit, not its state checks): a card in inreview with no matching open PR, and a merged PR whose card is not done, are flagged in the generator output (warning, not refusal — PR data is ephemeral so it must not make generation fail).
- [x] A card with multiple matching PRs shows all of them (parallel-session reality).

## Test plan
- Unit-style: extract the PR→card join + rollup summarizer into a pure function in build.mjs (or a small module beside it) and cover: ID-in-branch match, ID-in-title fallback, formerId match, multiple PRs per card, no match, malformed gh output.
- Manual: `npm run board` with gh authenticated (live PRs render), with gh unauthenticated (fail-soft path), and with a card in inreview + no PR (reconciliation warning fires).

## Integration gate
- `npm run board` (guard green, generation succeeds in both gh-available and gh-unavailable modes) · `npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- gh CLI authenticated (already used by the integrator session). No new packages, no server, no tokens stored in the repo.

## Risk notes
- Drift: the whole design constraint is zero drift — PR fields must never be persisted to board.json. Reject any implementation that writes them.
- Guard: validate.mjs's refusal semantics stay reserved for real state corruption; PR reconciliation is warn-only.
- Rate limits: one `gh pr list --json ...` call per generation is fine; do not per-card fetch.

## Agent resume notes (for a cold start)
- Read docs/kanban/README.md fully, then build.mjs top to bottom (it is small).
- Start with the pure join function + its tests, then wire the `gh pr list --state all --json number,title,url,headRefName,isDraft,state,reviewDecision,statusCheckRollup,files,additions,deletions` call (single invocation, --limit 50), then the render chips.
- Match key: /MV-\d+/ in headRefName first, PR title second; also honor formerId from board.json rows.

## Decision log
- 2026-07-27 — Card created after evaluating and declining mission-control; scope = gh enrichment + visual chips + warn-only reconciliation (integrator session).
- 2026-07-28 — **Pure logic split into `docs/kanban/pr-enrich.mjs`**, mirroring validate.mjs's shape: no I/O in the module, so the join, the CI rollup, the area summarizer and the reconciliation rules are all testable with plain objects. The single `gh` call lives in build.mjs.
- 2026-07-28 — **Branch wins outright over title.** The card said "branch first, title second"; implemented as *fallback*, not union — if the branch names any card, the title is never consulted. Otherwise a title like "MV-148 supersedes MV-130" staples this PR onto a parallel session's row, which is the exact failure the join exists to prevent. Id bodies match greedily so `MV-1` can never claim `mv-12-*`.
- 2026-07-28 — **Malformed gh output is an error, not an empty list.** A truncated or error-prefixed stdout parsed as `[]` renders identically to a genuinely quiet board — every chip silently blanks and nothing says why. `parsePrList` returns `{prs, error}` so the "unavailable" note fires instead.
- 2026-07-28 — **Reconciliation runs only when PR data was actually fetched.** Offline, `prsByCard` is empty, so every In Review card would warn "no open PR" — the board lying about the repo. Warnings are gated on `!prError`. Also one warning per card: a merged PR on an In Review card satisfies both rules, and reporting it twice trains the reader to skim past warnings.
- 2026-07-28 — **Added one line for open PRs that match no card** (beyond the card's criteria). The join failing silently would make the board lie by omission, which is the ethos the guard exists to defend. It immediately caught a real one: #100 (`fix-upstash-kv-env-fallback`) carries no MV-id in branch or title and was invisible to the board.
- 2026-07-28 — **`board.md` is committed, so the PR section is stamped `Read from gh at <UTC>`.** Without a time, a week-old PR table reads exactly like a live one. Accepted cost: board.md now churns on every regeneration.
- 2026-07-28 — **PR titles/branches are external input**, so they are HTML-escaped at render and `<` is escaped in the embedded JSON payload — board.html is a local file the founder opens, and a hostile PR title should not be able to inject into it.
- 2026-07-28 — **Considered and rejected:** suppressing CI colour on merged PRs to quiet the board. Measured first: only 7 of the last 50 PRs carry a failing check, always `integration` (the known empty-Supabase-secrets gap), and 43 are all-green — not enough noise to justify hiding a real bypass signal.

## Done evidence
- **Branch** `mv-148-board-pr-enrichment` · **PR** https://github.com/Spooderinbed/merovisa/pull/101 (open, not merged — integrator gates) · code commit `c41c344`.
- **Files:** `docs/kanban/pr-enrich.mjs` (new, pure) · `docs/kanban/build.mjs` (+186/−5) · `tests/kanban/board-pr-enrich.test.ts` (new, 29 tests) · regenerated `board.md` + `board.html`. **`validate.mjs` untouched; `board.json` byte-identical to master** (`git diff origin/master -- docs/kanban/board.json` empty) — no card's `col`/`entered` was changed by this slice.
- **TDD:** tests written first and watched fail (module unresolved) before `pr-enrich.mjs` existed; 29/29 green after. Covers ID-in-branch, ID-in-title fallback, branch-beats-title, formerId, MV-1-vs-MV-12 boundary, multiple PRs per card, no match, missing optional fields, malformed/non-array gh output, CI rollup precedence (fail > pending > pass, skipped/neutral = pass), area rollup incl. repo-root files, and all six reconciliation cases.
- **Gate green:** `npm run typecheck` 0 · `npm run lint` 0 · `npm test` **315 files / 2186 tests passed**.
- **`npm run board`, gh available:** `149 cards · 3 stale` + `50 PRs read from gh · 48 joined to cards · 1 in flight`.
- **`npm run board`, fail-soft — both modes exit 0 with the board fully generated:**
  - unauthenticated (`GH_TOKEN=bogus`) → `⚠ PR data unavailable (gh is not authenticated (HTTP 401: Bad credentials …))`
  - binary absent (`PATH` without gh) → `⚠ PR data unavailable (gh CLI not found on PATH)`
- **Reconciliation verified end-to-end** by temporarily flipping MV-130 and MV-147 to `inreview`, running, then restoring board.json from git (confirmed clean afterwards). Both fired, exit 0, one warning each:
  - `⚠ MV-130 is in In Review with no open PR — it is waiting at a gate with nothing to gate.`
  - `⚠ MV-147 is in "inreview" but its PR #98 is already merged — the board is behind the repo.`
- **Live browser pass on board.html** (jsdom is blind to layout): no console errors, no horizontal overflow, 41 cards render PR chips, in-flight strip shows `#101 MV-148 · ci pending · docs · tests`, detail line `#101 mv-148-board-pr-enrichment · +766 −49 · 5 files · docs · tests`. Multi-PR case renders live on MV-97 (`#58 merged` + `#52 closed`).
- **Unrelated pre-existing bug noticed, NOT fixed here** (out of scope): cards whose `pri` is outside P1/P2/P3 render `· undefined ·` in board.md — `priLabel` in build.mjs has no entry for `P0` (e.g. MV-27, MV-147).
