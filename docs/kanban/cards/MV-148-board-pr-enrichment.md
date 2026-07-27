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
- [ ] `npm run board` enriches cards with live PR data joined by MV-ID found in the PR head branch name or title: PR number + URL, draft flag, state (open/merged/closed), CI rollup (from statusCheckRollup), review decision, and a files-touched summary rolled up to top-level dirs.
- [ ] Enrichment is DERIVED AND EPHEMERAL: nothing is ever written into board.json (same class as ageDays). validate.mjs still passes untouched on the state model.
- [ ] Fail-soft: if `gh` is missing, unauthenticated, offline, or slow, the board still generates completely with a visible "PR data unavailable" note — a GitHub outage must never block `npm run board`.
- [ ] board.html renders per-card chips (PR link, CI state color, review state) and an "in-flight PRs" summary strip; board.md gets a compact text equivalent.
- [ ] Reconciliation warnings (extends the guard's spirit, not its state checks): a card in inreview with no matching open PR, and a merged PR whose card is not done, are flagged in the generator output (warning, not refusal — PR data is ephemeral so it must not make generation fail).
- [ ] A card with multiple matching PRs shows all of them (parallel-session reality).

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

## Done evidence
- (pending)
