# MV-02 — Surface swallowed errors (no `ok:true` on failed mutations)

**Priority:** P2   **Owner:** agent
**Goal:** A failed re-score / plan / profile mutation never reports success — the user
sees the failure and the server logs it. (In a trust-first product, a silent write
failure is itself a trust bug.)

## Context links
- Round-1 audit Q16 (`ok:true` on failure): `docs/audits/2026-06-18-full-app-evaluation.md`
- Forward plan §3.4 (observability / silent failures) + §4 (no silent failures): `.claude/plans/tender-bouncing-locket.md`
- Service-role write paths: `app/api/**/route.ts` (profile, plan, documents), `lib/**` repos they call.

## Acceptance criteria
- [ ] Every mutation route returns a real error status/body when the underlying write fails (no unconditional `{ ok: true }`).
- [ ] Failures are logged with structured context (error code, affected id, correlation id where available).
- [ ] The client surfaces the failure to the user (not a false success toast).

## Test plan
- For each affected route: a test where the repo/DB call rejects → assert the route returns an error (not `ok:true`) and logs it.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None.

## Risk notes
- Touches multiple API routes — keep changes surgical and consistent; don't over-engineer a logging framework (use what's already wired: Sentry).

## Agent resume notes (cold start)
1. Grep the API routes for `ok: true` / `return NextResponse.json({ ok` and trace which ones swallow a thrown/failed write.
2. Start with re-score, plan, profile (named in the audit). Add the failing-path test first.

## Decision log
- 2026-06-18 — Created from round-1 audit Q16.

## Done evidence
_pending_
